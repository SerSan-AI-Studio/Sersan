"use client";

/**
 * AdaptiveResolution — keeps EVERY effect identical and only adapts the render
 * device-pixel-ratio to the machine.
 *
 * The full WebGPU scene is fill-bound: nearly every cost (scenePass, the ~11
 * bloom blur passes, additive particle overdraw) scales with DPR². On a weak/ARM
 * GPU at a hi-DPI resolution (e.g. 2880×1920 @ dpr 2 ≈ 22 Mpx/frame) that is what
 * makes it lag. Lowering the render resolution cuts that cost super-linearly with
 * NO change to the effects — the slight softening lands on already-bloomed,
 * tonemapped output and is largely invisible. Strong desktops start at their
 * device DPR and never drop.
 *
 * drei's PerformanceMonitor watches the frame rate and fires onDecline/onIncline
 * when it sustains below/above the fps band; we step `setDpr` within [min, max].
 * Changes are STEPPED + bounded (not a per-frame multiply) because each setDpr
 * reallocates the WebGPU swapchain + the PostFX render targets — a brief hitch,
 * fine occasionally. Oscillation is bounded by the [min, max] clamp plus the
 * climb-slowly/drop-instantly hysteresis in apply() — deliberately NOT by drei's
 * `flipflops`, which permanently latches the monitor off (see the JSX comment).
 *
 * NOTE: PerformanceMonitor was written for the WebGL path; its fps read is
 * backend-agnostic (it only reads R3F's clock) so it runs under WebGPU too, but
 * if a backend quirk ever stops the callbacks the GPU-aware INITIAL dpr (set on
 * the Canvas from tierStore) still stands as the floor — the scene stays usable.
 */
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useIntroStore } from "./store/introStore";
import { useTierStore } from "./store/tierStore";

/**
 * Consecutive at-floor decline windows required before the budget cliff. drei
 * evaluates on ~2.5s windows, so 3 is roughly seven seconds of sustained
 * trouble with the DPR already at its floor — long enough that a GC pause or
 * a scroll burst cannot cost a phone its eclipse and its neural lattice for
 * the rest of the session, short enough that a device which genuinely cannot
 * hold the band still gets relief.
 */
const DECLINE_STREAK = 3;

export function AdaptiveResolution({
  initial,
  min,
  max,
  step = 0.25,
}: {
  initial: number;
  min: number;
  max: number;
  step?: number;
}) {
  const setDpr = useThree((s) => s.setDpr);
  const dpr = useRef(initial);
  const lastChange = useRef(0);
  /** Consecutive at-floor declines — see the onDecline comment below. */
  const declineStreak = useRef(0);

  // Temporary hard cap (tierStore.dprCap) — the singularity passage clamps
  // the plunge phase to ≤1.5 while the raymarch approaches fullscreen
  // coverage. Effective ceiling = min(max, cap); restored (cap → null) on
  // leave, after which the monitor may climb back under its own hysteresis.
  const cap = useTierStore((s) => s.dprCap);
  // Pixel cap (plan Phase 1.3 — Lusion `_onResize`: DPR ≤ sqrt(MAX_PIXEL_COUNT
  // / (w·h)), 2560×1440 = 3.69 MP), CLAMPED to `min` so a tiny range can never
  // invert (apply() clamps [min, effMax]). Applied ONLY while
  // `fxBudget.level === 2` (the capable-phone budget that mounts the new
  // effects): level 1 is today's lite frozen as-is and has no cap, and desktop
  // `tier full` (level 3) has no pixel cap today either — both keep today's
  // `min(max, cap ?? max)` byte-for-byte (tierStore's `maxPixels` is
  // informative there). `size` is R3F's CSS-pixel canvas size, so effMax
  // recomputes on resize (drops apply at once via the effect below; climbs
  // keep apply()'s 8 s hysteresis).
  const level = useTierStore((s) => s.fxBudget.level);
  const maxPixels = useTierStore((s) => s.fxBudget.maxPixels);
  const size = useThree((s) => s.size);
  const area = size.width * size.height;
  const pixelCeil = area > 0 ? Math.sqrt(maxPixels / area) : Infinity;
  const effMax =
    level === 2
      ? Math.max(min, Math.min(max, cap ?? max, pixelCeil))
      : Math.min(max, cap ?? max);

  // A newly-set cap below the current DPR drops it IMMEDIATELY (drops are
  // always allowed — the plunge is about to be fill-bound NOW); the swapchain
  // realloc hitch lands during a calm beat by construction (the passage sets
  // the cap at p≈0.70, well before ignition). The same effect covers a pixel
  // cap that tightens on resize (level 2).
  useEffect(() => {
    if (dpr.current > effMax) {
      const clamped = Math.max(min, effMax);
      lastChange.current = performance.now();
      dpr.current = clamped;
      setDpr(clamped);
    }
  }, [effMax, min, setDpr]);

  const apply = (next: number) => {
    const clamped = Math.min(
      effMax,
      Math.max(min, Math.round(next * 100) / 100),
    );
    if (clamped === dpr.current) return;
    // Asymmetric hysteresis — drop instantly, climb slowly. Each real setDpr
    // reallocates the WebGPU swapchain + the PostFX render targets, so two
    // adjacent steps trading places every evaluation window would hitch
    // continuously. Dropping is always allowed (the visitor is dropping frames
    // NOW); climbing back needs sustained headroom since the last change.
    const now = performance.now();
    if (clamped > dpr.current && now - lastChange.current < 8000) return;
    lastChange.current = now;
    dpr.current = clamped;
    setDpr(clamped);
  };

  return (
    <PerformanceMonitor
      // Target fps band (refresh-rate relative). Below 48 → drop resolution;
      // sustained above 58 → climb back toward the device dpr.
      bounds={() => [48, 58]}
      // NO `flipflops`: drei's counter increments on EVERY onIncline/onDecline —
      // it counts total callback events, not direction changes — and once it
      // exceeds the limit the monitor latches into its fallback state and stops
      // sampling for the rest of the session. Crucially it increments even when
      // apply() is a no-op, so a healthy machine idling at 60fps (which passes
      // the incline test on nearly every ~2.5s window while already pinned at
      // dprMax) latched within ~10-15s of load — permanently disabling the #1
      // lever for the weak/ARM GPUs this exists for. Default is Infinity.
      //
      // Runaway oscillation is already prevented by apply() itself: it clamps to
      // [min, max] and skips setDpr when the value is unchanged, so at either end
      // of the range the callbacks are free no-ops with no swapchain realloc.
      // Genuine mid-range hunting is bounded by the asymmetric hysteresis in
      // apply() (drop instantly, climb only after sustained headroom).
      //
      // Budget step-down (plan Phase 1.2): once the DPR floor is reached and
      // the band is still not held, the next lever is the fx budget itself —
      // level 2 → 1 only (postFx off, today's lite counts); a guarded no-op at
      // any other level, and never `degrade()` (lite → off would unmount the
      // Canvas). Wired through THIS onDecline prop on purpose: drei's
      // subscription hook called in this component's body would run outside
      // the provider it renders (`api` null → throws).
      //
      // Gated on `warmReady`: pre-warm declines — the pipeline compile under
      // the preloader, and coarse devices START at dprMin so they hit the
      // floor branch on the very first decline — must not demote level 2,
      // otherwise the Phase 2/4 effects would be killed before they ever
      // mount. Only a decline on a WARM scene is evidence the budget is too
      // rich.
      // SUSTAINED EVIDENCE BEFORE THE CLIFF (2026-09-09). stepDownBudget() is
      // ONE-WAY and session-permanent — nothing ever climbs back — and it
      // takes the whole capable-phone experience with it in a single call:
      // `raymarchLite` false unmounts the hero eclipse, `level < 2` unmounts
      // the NeuralLattice island (so the DOM SVG fallback appears in its
      // place) and disarms the compact brand anchor. Firing that on ONE
      // decline window made the phone's experience a coin toss decided by a
      // single GC pause or scroll burst: the owner reported the eclipse
      // missing and the neural section on its fallback "ogni tanto — tipo ora
      // ho riavviato e si vede la rete neurale giusta". Intermittent, because
      // the trigger was a transient.
      //
      // Now it takes DECLINE_STREAK consecutive at-floor declines, and any
      // incline resets the count — so the lever still exists for a phone that
      // genuinely cannot hold the band, but a dip it recovers from costs
      // nothing. drei evaluates on ~2.5s windows, so this is roughly seven
      // seconds of sustained trouble AFTER the DPR floor has been reached.
      onDecline={() => {
        if (dpr.current <= min) {
          // Pre-warm declines never counted and still do not: coarse devices
          // used to START at the floor, and the pipeline compile under the
          // preloader is not evidence of anything.
          if (useIntroStore.getState().warmReady) {
            declineStreak.current += 1;
            if (declineStreak.current >= DECLINE_STREAK) {
              declineStreak.current = 0;
              useTierStore.getState().stepDownBudget();
            }
          }
        } else {
          declineStreak.current = 0;
          apply(dpr.current - step);
        }
      }}
      onIncline={() => {
        // Evidence of recovery — the streak must be CONSECUTIVE or a phone
        // that alternates dip/recover for a minute would still fall off the
        // cliff on accumulated unrelated windows.
        declineStreak.current = 0;
        apply(dpr.current + step);
      }}
    />
  );
}
