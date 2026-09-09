"use client";

/**
 * HeroTextParticles — the particle-text brand intro ("Sersan AI").
 *
 * ENTRY (automatic, time-driven — ICS-media particle-text choreography): the
 * moment the preloader lifts, "Sersan AI" assembles ITSELF out of a noisy
 * scattered particle field — left→right staggered wave (delay = normalized
 * glyph x), per-particle alpha fade-in, spring + transit turbulence shaping
 * each flight. No scroll input is needed or counted during the entrance
 * (the gate locks the page and only shakes the camera).
 *
 * SCROLL (gate-driven, ONE beat — client decision 2026-07-23: the old
 * three-stage chain "Sersan AI" → headline → "see what we build" was too
 * long; only the brand keeps the particle treatment, bigger and in the
 * foreground): once assembled, wheel/touch accumulates
 * textMorphStore.gateProgress. The brand HOLDS briefly, then UN-ASSEMBLES —
 * uAssemble is driven back toward 0, which plays the entry wave in reverse
 * (right→left, per-particle alpha out, spring flights back to the scatter
 * field) — while the crisp DOM hero (H1 + eyebrow + sub + CTAs) cascades in
 * underneath via domReveal. When the cascade lands the gate releases and
 * normal scroll takes over. Fully reversible: scrolling back up to the very
 * top re-engages the gate and re-forms the brand.
 *
 * TOUCH (compact anchor, `data-hero-brand-compact` — mobile-parity plan
 * Phase 4b): the CompactSpine on a capable phone (fxBudget.level ≥ 2 +
 * WebGPU backend) renders the SAME `[data-hero-brand]` span with an extra
 * `data-hero-brand-compact` attribute and NO HeroIntroGate (no scroll hijack,
 * no `touchmove` preventDefault, no Lenis stop — native touch scroll stays
 * untouched). After the entry the brand HOLDS for AUTO_HOLD_S, then
 * gateProgress is ramped 0→1 over AUTO_RAMP_S on THIS loop's own clock — it
 * writes the very same store field a desktop wheel drives, so the dissolve,
 * morphDone/morph2Done, the DOM cascade (domReveal), HomeSingularity's melt,
 * HeroLogo's flight and the `resting` sleep all follow unchanged. Tap/Esc skip
 * comes from the DOM (CompactIntroSkip — the identical payload HeroIntroGate
 * writes); a real scroll (page moved > AUTO_SCROLL_ABORT_PX) aborts straight
 * to gateProgress 1 without marking the session skip. Whether the anchor is
 * the compact one is decided from the DOM truth at build time (autoRef);
 * every branch below that reads it is DEAD on desktop.
 *
 * The compute build keeps its 4-target signature; B/C/D are fed homeA and
 * uMorph/uMorph2/uMorph3 stay 0 forever — the legs never play.
 *
 * Mounts its sim ONLY when: true WebGPU compute backend + fonts ready + the
 * pinned H1 + brand elements exist (desktop spine, or the compact spine's
 * armed brand). Every other path leaves textMorphStore inactive → no scroll
 * gate, DOM hero exactly as before.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { WORLD_VIEW_HEIGHT } from "./constants";
import { sampleTextPoints, type TextSpec } from "./text/sampleTextPoints";
import { webgpuEnabled } from "./renderer/createRenderer";
import { useIntroStore, introCamShiftRef } from "./store/introStore";
import { useTextMorphStore } from "./store/textMorphStore";
import { useFxStore } from "./store/fxStore";
import { useTierStore, type SceneTier } from "./store/tierStore";
import { holeField } from "./HomeSingularity";

interface HeroTextParticlesProps {
  /**
   * Host contract (Scene.tsx passes it, like every island). The particle COUNT
   * no longer reads it — it reads the BUDGET axis (`fxBudget`, plan Phase 4b,
   * see `selectBrandCount`); the prop is kept so the host signature stays
   * untouched.
   */
  tier: Exclude<SceneTier, "off">;
}

// ENTRY clock (seconds): the automatic "Sersan AI" assemble on site entry —
// time-driven, NOT scroll-driven (user decision 2026-06-10). ~3.6s mirrors
// the ICS-media reference's 4s tween; the per-particle stagger + easing live
// in the sim (uAssemble + delay buffer).
const ENTRY_DURATION = 3.6;

/**
 * TOUCH BEAT clocks (mobile-parity plan Phase 4b — the compact anchor only,
 * `data-hero-brand-compact`; every read of these is dead on desktop). There
 * is NO gate on touch and NO scroll consumption: once the entry has formed
 * the brand it HOLDS for AUTO_HOLD_S at MINIMUM (≥ HomeSingularity's
 * IGNITE_DURATION 1.2s, so the eclipse has fully risen behind the formed
 * wordmark before the melt starts — the melt begins at domReveal 0.05 ≈ g
 * 0.44, i.e. ~0.66s into the ramp), then gateProgress is ramped 0→1 LINEARLY
 * over AUTO_RAMP_S. It drives the SAME store field a desktop wheel drives (g
 * still damps at λ 7, so the visible dissolve tail is ~+0.4s). Total from
 * lift ≈ 3.6 + 1.5 + 1.5 + 0.4 ≈ 7s — owner-tunable; a tap skips.
 *
 * HOLD GATED ON THE ECLIPSE (AUTO_HOLD_MAX_S): the eclipse island
 * (HomeSingularity) arms on the assembleDone edge and only THEN loads its
 * chunk, builds the march and compileAsync-warms it — on a slow phone that
 * can outlast the minimum hold, and a melt started over a not-yet-risen
 * eclipse reads as a broken beat. So the ramp starts on the first frame where
 *   elapsedSinceEntry >= AUTO_HOLD_S
 *   && (textMorphStore.eclipseReady || elapsedSinceEntry >= AUTO_HOLD_MAX_S)
 * i.e. the hold is AUTO_HOLD_S when the eclipse is ready in time, stretches
 * while it is not, and never exceeds AUTO_HOLD_MAX_S (a phone whose eclipse
 * never resolves — build failure, WebGL2 — still gets its hero back).
 * `eclipseReady` is set by HomeSingularity right after its build resolves,
 * reset on its dispose/rebuild and by the provider's nav-into-home reset; it
 * is read here via getState() in the loop (transient, no subscription).
 * AUTO_SCROLL_ABORT_PX mirrors HeroIntroGate's safety valve: if the page has
 * genuinely moved (the user is scrolling through), jump to gateProgress 1 —
 * WITHOUT marking the session skip (only an explicit tap/Esc does that).
 */
const AUTO_HOLD_S = 1.5;
const AUTO_HOLD_MAX_S = 3.0;
const AUTO_RAMP_S = 1.5;
const AUTO_SCROLL_ABORT_PX = 24;

/**
 * ENTRY-CLOCK SHARED REF (P0 hotfix 2026-08-07) — the wordmark entry's
 * normalized progress 0..1, published as a module-scope mutable ref (the
 * pointerStore / holeField pattern: ONE writer — this component's useFrame —
 * and plain property reads inside consumers' useFrame; no React, no zustand).
 * Deliberately NOT a textMorphStore field: the value changes EVERY frame for
 * the whole 3.6s entry, and each zustand setState notifies every store
 * listener unconditionally (smooth-scroll-provider's gate-hold sync +
 * HomeSingularity's arm subscription) — for a value nothing reads reactively.
 * 1 after the entry completes (and pinned 1 by a skip); reset to 0 when a
 * fresh intro replays. Reader: HeroLogo's ANTICIPATED crust AUTO-BURST
 * (fires when this crosses fx.sporeAutoBurstAt). Both writer and reader live
 * in the same lazy WebGL island chunk, so the module instance is single by
 * construction — the textMorphStore globalThis pin exists for the
 * route↔island bundle split, which this ref never crosses.
 */
export const entryProgressRef = { value: 0 };

// Gate-progress timeline (g = textMorphStore.gateProgress, smoothed locally).
// gateProgress only advances AFTER the entry assemble completes (the gate
// checks assembleDone), so g=0 always means "brand fully formed".
//
// Unlike the old morph legs (one-shot clocks), the dissolve is SCRUBBED — a
// pure function of g, so it tracks the wheel directly and reverses for free.
// The spring integrator underneath gives every particle its organic lag, so
// the scrub still reads as flight, not as a linear wipe.
/** Gate fraction where the brand starts un-assembling. Before this the brand
 * holds fully formed against scroll — the deliberate "look at it" beat. */
const DISSOLVE_START = 0.2;
/** Gate fraction where the un-assemble completes (uAssemble back at 0; the
 * last left-edge particles release and fade). */
const DISSOLVE_END = 0.75;
/** DOM hero cascade window (H1 crossfade + eyebrow → sub → CTAs stagger,
 * consumed by StagePanel). Overlaps the dissolve so the brand hands the
 * stage to the real hero in one crossed beat instead of two serial ones. */
const REVEAL_START = 0.42;
const REVEAL_END = 0.88;

// The brand now samples MUCH larger (~16vw Switzer semibold vs the old 9vw
// serif — client 2026-07-23: bigger, foreground): the ink area roughly
// tripled, so the particle budget grows with it to keep the strokes reading
// as solid light instead of a sparse dust. The kernel is a simple
// spring+turb integration — 48k instances is routine for the full tier.
// Budget mapping (plan Phase 4b, see selectBrandCount): fxBudget level 3
// (⇔ desktop tier "full") = 48000 exactly as today; level 2 (capable phone)
// = round(48000 × particleScale 0.5) = 24000; level ≤ 1 = the frozen 20000
// (unreachable in practice: level 1 never mounts a brand anchor).
const COUNT_BY_TIER: Record<"full" | "lite", number> = {
  full: 48000,
  lite: 20000,
};

/**
 * Budget → particle count (mobile-parity plan Phase 4b; the DriftParticles
 * `selectBudgetCount` pattern). ONE store selector returning a PRIMITIVE, so
 * the island re-renders only when the resulting count actually changes
 * (resolve() before mount, or the one-shot stepDownBudget() 2 → 1) — never
 * per frame, never a setState from useFrame.
 *   level 3 (⇔ desktop tier "full") → 48000, byte-identical to COUNT_BY_TIER.full
 *   level 2 (capable phone)          → round(48000 × particleScale) = 24000
 *   level ≤ 1 (today's lite)         → 20000, the frozen lite constant
 */
function selectBrandCount(s: {
  fxBudget: { level: number; particleScale: number };
}): number {
  const { level, particleScale } = s.fxBudget;
  if (level >= 3) return COUNT_BY_TIER.full;
  if (level === 2) return Math.round(COUNT_BY_TIER.full * particleScale);
  return COUNT_BY_TIER.lite;
}

interface MorphBuild {
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.Material;
  uMorph: { value: number };
  uMorph2: { value: number };
  uMorph3: { value: number };
  uFade: { value: number };
  uSpread: { value: number };
  uAssemble: { value: number };
  uSizeComp: { value: number };
  uSizeComp2: { value: number };
  uSizeComp3: { value: number };
  uPointSize: { value: number };
  uPixelRatio: { value: number };
  uViewport: { value: THREE.Vector2 };
  /** Flyby attractor (owner 2026-08-07): LOCAL-space center, world-unit
   * displacement amplitude, world-unit falloff radius. Displacement only —
   * see the vertex-stage note in gpgpuNodeSim.createTextMorphComputeBuild. */
  uHole: { value: THREE.Vector3 };
  uHoleStrength: { value: number };
  uHoleRadius: { value: number };
  tick: (p: { dt: number; time: number }) => void;
  dispose: () => void;
}

export function HeroTextParticles(_props: HeroTextParticlesProps) {
  const { camera, size, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const brandRef = useRef<HTMLElement | null>(null);
  const timeRef = useRef(0);
  const gSmoothRef = useRef(0);
  // TOUCH BEAT state (plan Phase 4b) — decided from the DOM truth at build
  // time: autoRef is true ONLY when the sampled `[data-hero-brand]` carries
  // `data-hero-brand-compact` (the CompactSpine's anchor). On desktop it is
  // false forever and every branch keyed on it is dead. autoClockRef is the
  // hold+ramp clock (seconds since the entry completed); autoRampAtRef is
  // the clock value at which the ramp STARTED (−1 = not yet — the hold is
  // gated on the eclipse, see AUTO_HOLD_MAX_S, so the start is decided per
  // frame, not fixed at AUTO_HOLD_S); autoDoneRef latches once the ramp
  // reached 1 (or a scroll aborted it) so an in-place REBUILD after the beat
  // (URL-bar collapse tripping sizeEpoch) preserves the dissolved end state
  // instead of replaying the entry.
  const autoRef = useRef(false);
  const autoClockRef = useRef(0);
  const autoRampAtRef = useRef(-1);
  const autoDoneRef = useRef(false);
  // Damped flyby envelope (0..1) — follows holeField.strength (clamped-dt
  // damp) so the eclipse's activation/retirement edges never step the text:
  // unlike the crust's spring-integrated force, the text displacement is
  // ANALYTIC in the vertex stage — an un-damped strength step would pop it.
  const holeAmpRef = useRef(0);
  // Entry-assemble clock 0..1. Persists across rebuilds (resize re-runs the
  // build effect but never unmounts the component), and is pre-completed when
  // a previous mount already played the entrance (store.assembleDone is
  // page-lifetime) — the entry plays ONCE per load.
  const entryRef = useRef(0);
  const [build, setBuild] = useState<MorphBuild | null>(null);

  // Budget-derived particle count (plan Phase 4b) — see selectBrandCount.
  // Read inside the island through a single primitive selector (the store is
  // module-stable; the same pattern DriftParticles / AdaptiveResolution use
  // inside the Canvas). Level 3 resolves to exactly the old COUNT_BY_TIER.full.
  const count = useTierStore(selectBrandCount);
  // DOM→island anchor signal (plan Phase 4b): the CompactSpine bumps this when
  // its `[data-hero-brand-compact]` anchor mounts/unmounts. It is a build dep
  // below because the compact anchor mounts AFTER tierStore.backend resolves —
  // i.e. after this island's first build attempt may already have run and
  // bailed on a missing anchor. Desktop: stays 0 forever (one build as today).
  const brandEpoch = useTextMorphStore((s) => s.brandAnchorEpoch);

  // World units per CSS pixel at the z=0 content plane (camera at CAMERA_Z).
  // Held in a REF, not a build dep: R3F publishes `size` on every
  // ResizeObserver tick (Scene passes no `resize` prop → debounce 0), so
  // depending on it directly rebuilt the whole 26k sim on every pixel of a
  // window drag. The build reads the ref, so it always samples at the CURRENT
  // metrics whenever a rebuild actually is warranted (see sizeEpoch below).
  const worldPerPx = WORLD_VIEW_HEIGHT / size.height;
  const worldPerPxRef = useRef(worldPerPx);
  worldPerPxRef.current = worldPerPx;

  // Quantized resize signal: only a MEANINGFUL viewport change (>5% on either
  // axis) bumps the epoch and re-samples the text. Sub-threshold ticks — a slow
  // window-edge drag, the mobile URL bar collapsing — leave the sim alone. The
  // bump is also debounced ~200ms so a drag rebuilds once at the end rather
  // than at each 5% step.
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const [sizeEpoch, setSizeEpoch] = useState(0);
  useEffect(() => {
    const { w, h } = lastSizeRef.current;
    // First observation: seed the baseline WITHOUT bumping — the build effect
    // already runs at mount with these exact metrics, so a bump here would only
    // buy a redundant 26k rebuild 200ms into the intro.
    if (!w || !h) {
      lastSizeRef.current = { w: size.width, h: size.height };
      return;
    }
    if (
      Math.abs(size.width - w) / w < 0.05 &&
      Math.abs(size.height - h) / h < 0.05
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      lastSizeRef.current = { w: size.width, h: size.height };
      setSizeEpoch((e) => e + 1);
    }, 200);
    return () => window.clearTimeout(id);
  }, [size.width, size.height]);

  // === Build: sample the brand from the live DOM, spin up the sim ===========
  useEffect(() => {
    // BUILD-FLAG dead end: with WebGPU compiled out there is no brand beat on
    // any device, so tell the preloader now instead of leaving it to hold the
    // counter at 90% until its insurance timers fire (see brandBeatSkipped).
    if (!webgpuEnabled()) {
      useIntroStore.getState().setBrandBeatSkipped();
      return;
    }
    let cancelled = false;
    let built: MorphBuild | null = null;

    void Promise.all([
      import("three/webgpu"),
      import("three/tsl"),
      import("./gpgpu/gpgpuNodeSim"),
      document.fonts?.ready ?? Promise.resolve(),
    ]).then(([webgpu, tslNs, mod]) => {
      if (cancelled) return;
      // True-WebGPU compute only (storage indexing no-ops on WebGL2, #31221).
      const bk = (gl as unknown as { backend?: { isWebGLBackend?: boolean } })
        .backend;
      const isWebGPUBackend =
        !!bk &&
        bk.isWebGLBackend !== true &&
        typeof (gl as unknown as { compute?: unknown }).compute === "function";
      // WebGL2-fallback dead end (three #31221). Same reasoning as the build
      // flag above: this session will never form a wordmark, so publish the
      // verdict rather than let the preloader wait out its 17s/22s timers.
      if (!isWebGPUBackend) {
        useIntroStore.getState().setBrandBeatSkipped();
        return;
      }

      // DETACHED-ANCHOR guard (plan Phase 4b hardening): if the anchor this
      // instance last sampled is no longer in the document (the compact
      // anchor unmounted — compact→stacked rotate, stepDownBudget 2→1 —
      // and this effect re-ran, or a mode switch swapped the stage under a
      // desktop resize), drop the stale ref and, if the system still owns the
      // hero, hand it back to the DOM NOW: a compact H1 must never stay hidden
      // behind a stale `active` while the fresh query below decides. On
      // desktop the SSR span is connected for the page lifetime → dead.
      {
        const el = brandRef.current;
        if (el && !el.isConnected) {
          brandRef.current = null;
          if (useTextMorphStore.getState().active) {
            useTextMorphStore.setState({ active: false, domReveal: 1 });
          }
        }
      }

      // The H1 is no longer sampled (the headline is pure DOM now), but its
      // presence still gates the mount: it marks the pinned hero layout
      // (desktop spine, or the compact spine with an ARMED brand anchor) —
      // interior routes / unarmed compact / stacked render neither → inactive.
      const h1 = document.querySelector<HTMLElement>("[data-hero-headline]");
      const brand = document.querySelector<HTMLElement>("[data-hero-brand]");
      if (!h1 || !brand) {
        // Anchor GONE while the system owned the hero (plan Phase 4b): the
        // compact anchor unmounted under us — compact→stacked rotate, or
        // stepDownBudget() 2→1 disarming the brand — and the epoch bump
        // re-ran this effect. Hand the hero back to the DOM (the crisp H1 +
        // cluster restore, HeroLogo flies to rest); the sim itself was
        // already disposed by this effect's cleanup. On desktop this branch
        // is reachable only when the elements are absent, where the store
        // used to be left stale — publishing the inactive state is the
        // correct handoff there too. Nothing to re-run: on compact the anchor
        // mounts AFTER backend resolves and its bump re-enters here; the
        // desktop span is SSR truth (epoch 0 forever, one build as today).
        if (useTextMorphStore.getState().active) {
          useTextMorphStore.setState({ active: false, domReveal: 1 });
        }
        return;
      }
      brandRef.current = brand;
      // TOUCH BEAT flag from the DOM truth (plan Phase 4b): only the
      // CompactSpine's anchor carries `data-hero-brand-compact`. Desktop →
      // false, and every autoRef branch downstream is dead. A fresh compact
      // build restarts the hold clock only if the beat has not already been
      // played by this instance (autoDoneRef — see replayDone below).
      autoRef.current = brand.hasAttribute("data-hero-brand-compact");
      if (!autoRef.current) {
        autoClockRef.current = 0;
        autoRampAtRef.current = -1;
      }

      // --- BRAND sample, with the big [data-hero-brand]'s own typography ----
      const bcs = getComputedStyle(brand);
      const brandSizePx = parseFloat(bcs.fontSize) || 120;
      const bls = parseFloat(bcs.letterSpacing);
      const brandSpec: TextSpec = {
        fontFamily: bcs.fontFamily,
        fontWeight: bcs.fontWeight || "600",
        fontSizePx: brandSizePx,
        lineHeightPx: brandSizePx,
        letterSpacingPx: Number.isFinite(bls) ? bls : 0,
        lines: [(brand.textContent ?? "SERSAN").trim()],
      };
      const a = sampleTextPoints(brandSpec, count);

      // Metrics from the ref, not the closure — the build must sample at the
      // CURRENT viewport whenever a (quantized) rebuild fires, while raw
      // resize ticks never re-run this effect (see sizeEpoch above).
      const wpp = worldPerPxRef.current;
      const toWorld = (xy: Float32Array) => {
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          out[i * 3] = xy[i * 2] * wpp;
          out[i * 3 + 1] = xy[i * 2 + 1] * wpp;
          out[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
        }
        return out;
      };
      const homeAWorld = toWorld(a.xy);

      // Entry seed (ICS-media style): each particle starts at a noisy offset
      // from its glyph home, spread WIDER toward the left of the block
      // (ICS: `spread = (1 - nx) * 100 + 100`) so the left edge billows out
      // and forms first while the right tail streams in — combined with the
      // sim's left→right stagger this reads as the reference's travelling
      // assemble wave. The same field is the DISSOLVE destination: driving
      // uAssemble back down sends every particle back out to this cloud.
      // FIX 3a: decide replay vs preserve from THIS instance's lifecycle, not
      // the cross-bundle store flag (which raced the provider's nav-into-home
      // reset and left the intro frozen on a route return). A fresh MOUNT
      // (first load / route-return) still has entryRef at its initial 0 →
      // replay the whole intro; an in-place REBUILD (resize) kept entryRef at
      // 1 → preserve the finished state. A session skip also preserves.
      const isRebuild = entryRef.current >= 1;
      // autoDoneRef (touch beat, plan Phase 4b): a rebuild after the timed
      // beat has played (URL-bar collapse moving the fixed canvas' height >5%
      // trips sizeEpoch) must not replay the entry — the brand would pop back
      // over the already-revealed hero. Always false on desktop.
      const replayDone =
        isRebuild ||
        useTextMorphStore.getState().introSkipped ||
        autoDoneRef.current;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < count; i++) {
        const x = homeAWorld[i * 3];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      const spanX = Math.max(maxX - minX, 1e-4);
      // The scatter cloud is built UNCONDITIONALLY: it is not just the entry
      // seed anymore but the LIVE dissolve field the scrubbed uAssemble
      // interpolates the anchor toward. A rebuild that seeded it at the glyph
      // homes (the old three-leg-era rule) would pin the anchor and silently
      // degrade every later dissolve/re-form to a flat alpha wipe.
      const scatter = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const nx = (homeAWorld[i * 3] - minX) / spanX;
        // Random unit-ish direction with damped z; magnitude leftward-biased.
        const ang = Math.random() * Math.PI * 2;
        const mag = ((1 - nx) * 2.6 + 1.3) * (0.4 + Math.random() * 0.9);
        scatter[i * 3] = homeAWorld[i * 3] + Math.cos(ang) * mag;
        scatter[i * 3 + 1] =
          homeAWorld[i * 3 + 1] + Math.sin(ang) * mag * 0.75;
        scatter[i * 3 + 2] =
          homeAWorld[i * 3 + 2] + (Math.random() - 0.5) * 1.6;
      }

      const bm = mod.createTextMorphComputeBuild(
        gl as never,
        webgpu as never,
        tslNs as never,
        homeAWorld,
        // B/C/D targets are dead legs — fed the brand field so the buffers
        // are valid, with their morph uniforms parked at 0 forever.
        homeAWorld,
        homeAWorld,
        homeAWorld,
        count,
        // ICS-media-reference look (user 2026-06-10): bright glowing sprites,
        // dense enough to read as solid strokes — hot emissive, near-white ink.
        //
        // POINT_SIZE 9 — the owner's own value, settled against the live
        // render (2026-08-18) one notch above the calibrated 8 that had been
        // RESTORED earlier the same day, after a one-day detour to 4 that was
        // made on a false premise.
        //
        // WHAT THE NUMBER IS IN SCREEN TERMS: it is NOT CSS px, and it is not
        // in the same units as the stroke width. The render stage computes
        //   quadExtentDevicePx = POINT_SIZE × dpr × (0.7 + 0.7·hash) / dist
        // (gpgpuNodeSim `sizeNode`; the quad corners are ±0.5, so that extent
        // IS the diameter, and uViewport is in device px), where `dist` is the
        // view-space distance to the wordmark plane — CAMERA_Z = 12 at the hero
        // station. Dividing the dpr back out, the on-screen MOTE DIAMETER is
        //   POINT_SIZE × (0.7…1.4) / 12 CSS px,   mean ≈ POINT_SIZE / 11.4
        //   ⇒ 9 → 0.79 CSS px mean        8 → 0.70        4 → 0.35
        // Every mote is therefore deeply SUB-PIXEL. The lockup's stem at 1440
        // is ~7.0px (cap 71.8px × 9.71% at weight 340), i.e. ~9 motes wide: the
        // disc can never overhang the letterform, and no value in this knob's
        // range can. The earlier claim that it did — and the 8→4 drop that
        // followed from it — was wrong.
        //
        // WHAT IT ACTUALLY CONTROLS IS BRIGHTNESS. Additive coverage scales
        // with mote AREA, i.e. roughly POINT_SIZE², so 8→4 discarded ~75% of
        // the ink and made the wordmark read FAINTER — the exact opposite of
        // the owner's "too thin" report, while 8→9 deposits ~27% MORE ink per
        // particle ((9/8)² = 1.27). Raise it to deposit more light per
        // particle (paying in edge softness); lower it only to thin the ink on
        // purpose.
        {
          SPRING: 42,
          DAMPING: 6.5,
          MAX_SPEED: 9,
          TURB: 14,
          POINT_SIZE: 9,
          POINT_ALPHA: 1.0,
          EMISSIVE: 4,
          COL_COLD: [1, 1, 1.0], // bright white-lavender ink
          COL_HOT: [0.4, 1, 1.0], // cyan while travelling
        },
        // POSITION seed: a rebuild of an already-formed brand pops the
        // particles in place at their homes (no spurious re-flight); a fresh
        // intro starts them out in the cloud.
        replayDone ? homeAWorld : scatter,
        undefined,
        // START field: ALWAYS the scatter cloud (see the note above).
        scatter,
      );
      built = bm as unknown as MorphBuild;
      // COMPACT look knob (plan Phase 4b, measure-first; 6 since 2026-08-18,
      // moved in PROPORTION with the desktop 8→9 — round(9 × 5/8) = 6 — so the
      // phone keeps the same ~2/3-of-desktop disc it has had since the 5/8
      // pair. The 3 that briefly shipped alongside the 4 rested on the false
      // "disc wider than the stroke" premise.)
      // The argument here is DENSITY, not overhang: the 9.69vw wordmark on a
      // 390px viewport is a 37.8px font-size ⇒ 26.5px cap ⇒ a ~2.6px stem at
      // weight 340, and its ink area is ≈1/7 of desktop's while 24k particles
      // fill it — ≈3.7× more motes per unit of ink. At the desktop disc that
      // stacks into a blown-out slab with clogged counters, so the phone runs
      // a smaller mote: 6 ⇒ mean mote ≈0.53 CSS px, ≈44% of desktop's
      // coverage per mote ((6/9)²), which the higher density puts back. Still
      // far below the ~2.6px stem, so nothing overhangs on this anchor either.
      if (autoRef.current) built.uPointSize.value = 6;
      // Resume state: a rebuild mid/after entry must not restart the wave.
      // On a genuine full-intro replay (fresh mount) start from a clean
      // store, regardless of stale journey flags that survived on the
      // globalThis-pinned store across a soft route round-trip. (The provider
      // also resets these, but this makes the replay self-contained.)
      if (replayDone) {
        entryRef.current = 1;
        entryProgressRef.value = 1;
      } else {
        // A mid-entry rebuild (resize during the 3.6s assemble) lands here
        // too: the seed is a fresh scatter cloud, so the entry clock must
        // restart with it — a preserved half-elapsed clock would saturate the
        // left glyphs' stagger windows and snap them home as one unstaggered
        // clump. The gate holds the page either way, so a replayed entrance
        // costs nothing but its own choreography.
        entryRef.current = 0;
        entryProgressRef.value = 0;
        useTextMorphStore.setState({
          assembleDone: false,
          gateProgress: 0,
          morphDone: false,
          morph2Done: false,
        });
      }
      built.uAssemble.value = entryRef.current;
      setBuild(built);
      // THE CLAIM IS DELIBERATELY NOT PUBLISHED HERE (owner 2026-09-04:
      // "capita qualche volta che il preloader carica, ma non caricano gli
      // elementi, e continua la pagina vuota"). `active: true` used to be
      // written on this line, one statement after setBuild — but `build` is
      // REACT STATE and the frame loop early-returns for as long as it is
      // null. A wedged island commit (a pending Suspense anywhere in the
      // bridged Canvas tree stalls ALL of them — see Scene.tsx's commit-wedge
      // note; home still suspends on HeroLogo's useGLTF) therefore left the
      // store claiming the island owned the hero when it could neither draw
      // it nor release it: the DOM H1 and the whole [data-hero-stagger]
      // cluster pinned at opacity 0, the intro gate swallowing every wheel
      // event, nothing on screen, forever. Intermittent, because it is a
      // commit race.
      //
      // The claim now lives in the frame loop, on the first frame that
      // actually HAS a build (see "THE CLAIM" below), so `active` can never be
      // true without a live, drawing loop — a wedged island degrades to the
      // plain DOM hero exactly like every other fallback path.
    })
      // The chain had NO rejection handler: a failed dynamic import of the
      // three/webgpu · three/tsl · gpgpuNodeSim chunks (a flaky network on
      // the very device class this beat is for) produced an unhandled
      // rejection and, worse, silence — the preloader went on holding its
      // counter for a wordmark whose code never arrived. Publish the same
      // verdict the dead ends above use, then re-surface the error so it is
      // still visible in the console rather than swallowed.
      .catch((err) => {
        if (!cancelled) useIntroStore.getState().setBrandBeatSkipped();
        console.error("HeroTextParticles: brand build failed", err);
      });

    return () => {
      cancelled = true;
      built?.dispose();
      setBuild(null);
      if (brandRef.current) brandRef.current.style.opacity = "0";
      // NOTE: the visual-handoff reset (active/domReveal) deliberately does NOT
      // live here — see the unmount-only effect below. This cleanup also runs on
      // an IN-PLACE rebuild (meaningful resize), and publishing
      // `active:false, domReveal:1` there is observed by the DOM side
      // (cinematic-system-scroll.tsx restores the crisp hero + clears every
      // [data-hero-stagger] inline style) AND by HeroLogo's lockup flight, so
      // the particle brand blinked out and the mark snapped to hero-right for
      // the rebuild's duration. The gate/journey state (gateProgress,
      // morphDone, …) likewise SURVIVES a rebuild: the component refs
      // (entryRef, gSmoothRef) persist and re-prime the fresh sim's uniforms.
    };
    // Rebuild ONLY on a real change: renderer identity, particle count, a
    // quantized+debounced viewport change (sizeEpoch — NOT raw size, which
    // ticks per ResizeObserver observation), or the compact brand anchor
    // mounting/unmounting (brandEpoch — the DOM→island signal of plan Phase
    // 4b; 0 forever on desktop, so desktop still builds exactly once). No
    // language dep: the one-beat brand ("Sersan AI") is language-invariant.
    // Current metrics are read from worldPerPxRef inside the build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, count, sizeEpoch, brandEpoch]);

  // Unmount-only visual handoff. This is the ONLY correct discriminator between
  // "the island is going away, hand the hero back to the DOM" and "the sim is
  // being rebuilt in place, keep the DOM suppressed". (entryRef >= 1 is NOT a
  // usable discriminator: it is 0 during the entry, i.e. exactly the mid-intro
  // case this protects.)
  useEffect(
    () => () => {
      useTextMorphStore.setState({ active: false, domReveal: 1 });
    },
    [],
  );

  // === Per frame: gate-driven timeline ======================================
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;

    // DETACHED-ANCHOR guard, per frame (plan Phase 4b hardening; ONE
    // property read — `isConnected` — dead on desktop where the SSR span
    // stays connected for the page lifetime). The compact anchor can unmount
    // under a live sim (compact→stacked rotate, stepDownBudget 2→1); the
    // epoch bump re-runs the build effect, but the React commit → effect
    // round-trip is frames away, and any path that detaches the anchor
    // WITHOUT a bump would leave `active` stale forever. Either way the
    // compact H1 must never sit hidden behind a stale `active`: drop the ref
    // and hand the hero back to the DOM at once. Runs BEFORE the `!build`
    // early-out so it also covers the disposed-and-not-yet-rebuilt window.
    {
      const el = brandRef.current;
      if (el && !el.isConnected) {
        brandRef.current = null;
        if (useTextMorphStore.getState().active) {
          useTextMorphStore.setState({ active: false, domReveal: 1 });
        }
      }
    }

    if (!build) {
      group.visible = false;
      return;
    }

    // THE CLAIM (moved here from the build promise — see the note there).
    // Publishing `active` from inside the loop is what makes the flag mean
    // "a live loop owns the hero" instead of "a promise resolved". Idempotent
    // and one property read on the settled path. The reveal is republished
    // from the CURRENT gSmooth, not a flat 0: a rebuild after the gate
    // released (or mid-gate) must not blink the already-revealed hero
    // (H1/stagger cluster, scrims, HeroLogo all multiply by domReveal).
    // gSmoothRef persists across rebuilds, so this derivation is exact; on a
    // fresh intro it is 0, exactly as it was when the promise wrote it.
    if (!useTextMorphStore.getState().active) {
      useTextMorphStore.setState({
        active: true,
        domReveal: THREE.MathUtils.smoothstep(
          gSmoothRef.current,
          REVEAL_START,
          REVEAL_END,
        ),
      });
    }

    // SIMULATION delta — clamped hard at 1/30 s because it integrates the
    // spring/turbulence step: a big frame would overshoot and pop the field.
    const delta = Math.min(rawDelta, 1 / 30);
    // NARRATIVE-CLOCK delta. The entry assemble and the touch beat's
    // hold/ramp are pure animation ramps — nothing is integrated, so nothing
    // pops — and running them on the simulation clamp made their duration a
    // function of the FRAME COUNT, not of time: ENTRY_DURATION 3.6 s needs
    // ≥108 frames whatever the clock says, which is 3.6 s at 30 fps and
    // 10.8 s at 10. That stretch lands squarely on the preloader, which holds
    // its counter until `wordmarkFormed` — so the slower the phone, the
    // longer the 90% wait, compounding exactly where it hurts. Clamped at
    // 1/10 s so a single stalled frame (a tab resuming, a GC pause) still
    // cannot jump the assemble, but a genuinely slow phone now plays the
    // 3.6 s beat in 3.6 s.
    const clockDelta = Math.min(rawDelta, 1 / 10);

    // HOLD until the hero stage is live (preloader v2, owner 2026-08-28:
    // "aggiungi anche la scritta Sersan nel preloader"): on a hard load the
    // wordmark's assemble wave starts on the heroStageReady pre-beat — the
    // spore mark's build has landed and its hidden prime finished — so the
    // whole brand lockup materialises ON the loading stage, under the
    // counter, and is simply THERE when the chrome fades (Arago: the scene
    // performs beneath the loader). introComplete keeps releasing every path
    // that never sets the pre-beat (soft entries, watchdog).
    {
      const introState = useIntroStore.getState();
      if (!introState.heroStageReady && !introState.introComplete) {
        group.visible = false;
        return;
      }
    }

    // --- Intro skip (Esc / session flag): pin every driver at its end state.
    // gateProgress is held at 1 by the gate's own tick; pinning the smoothed
    // g and the entry clock here means the derivations below immediately
    // resolve to "dissolved, DOM revealed" — no partial brand can flash.
    if (useTextMorphStore.getState().introSkipped) {
      entryRef.current = 1;
      gSmoothRef.current = 1;
    }

    // --- ENTRY clock: the automatic assemble, time-driven ----------------
    // Advances once the curtain is up; flips the page-lifetime assembleDone
    // when complete so the gate starts counting scroll from a formed brand.
    if (entryRef.current < 1) {
      entryRef.current = Math.min(
        entryRef.current + clockDelta / ENTRY_DURATION,
        1,
      );
      if (entryRef.current >= 1 && !useTextMorphStore.getState().assembleDone) {
        useTextMorphStore.setState({ assembleDone: true });
      }
    }
    // Publish the entry clock through the SHARED REF, never the store (P0
    // hotfix — see entryProgressRef): a plain property write, zero listener
    // notifications. Unconditional so the skip pin (entryRef = 1 above) and
    // the completed state stay visible to HeroLogo's burst trigger.
    entryProgressRef.value = entryRef.current;
    // Wordmark-formed beat (preloader v2): the counter holds its completion
    // until the brand has fully assembled. Unconditional on the PUBLISHED
    // value, so the normal 3.6s completion, the skip pin and the replay seed
    // all count; the store setter is idempotent.
    if (entryRef.current >= 1) {
      const introDone = useIntroStore.getState();
      if (!introDone.wordmarkFormed) introDone.setWordmarkFormed();
    }

    // --- TOUCH BEAT auto-driver (plan Phase 4b; DEAD on desktop: autoRef is
    // only true for the compact `data-hero-brand-compact` anchor) -----------
    // Once the entry has formed the brand: hold AUTO_HOLD_S, then ramp the
    // SAME gateProgress a desktop wheel drives, linearly over AUTO_RAMP_S.
    // A genuine page scroll (> AUTO_SCROLL_ABORT_PX) aborts straight to 1 —
    // HeroIntroGate's safety valve, minus the session-skip mark. The value is
    // MERGED into the per-frame domReveal write below (pendingGate) so the
    // store notification count per frame is unchanged; on desktop pendingGate
    // stays null and the write is byte-identical. gTarget below may read the
    // previous frame's value — a one-frame lag under the λ7 damp, invisible.
    let pendingGate: number | null = null;
    if (autoRef.current) {
      const st0 = useTextMorphStore.getState();
      if (st0.introSkipped) {
        // Skip re-assert — the mirror of HeroIntroGate's per-tick re-pin,
        // which never runs on compact. The skip wins for the whole session:
        // whenever anything rewinds the gate (the session seed lands with
        // gateProgress still 0; the provider's nav-into-home reset zeroes
        // it and keeps introSkipped) re-pin the journey at its end state.
        // Without this, gSmooth is pinned 1 above but damps toward a 0
        // target every frame (g ≈ 0.8–0.9): the DOM would sit at a partial
        // domReveal on a 30fps phone, morphDone would flap, and `resting`
        // (gTarget ≥ 1) would never sleep the sim. One-shot by construction
        // (gateProgress is 1 from the next frame on), never per-frame.
        if (st0.gateProgress < 1) {
          autoDoneRef.current = true;
          useTextMorphStore.setState({
            gateProgress: 1,
            assembleDone: true,
            morphDone: true,
            morph2Done: true,
          });
        }
      } else if (st0.gateProgress < 1) {
        if (
          typeof window !== "undefined" &&
          window.scrollY > AUTO_SCROLL_ABORT_PX
        ) {
          // Page genuinely moved (native touch scroll is never blocked):
          // jump to the released state. Applies DURING the entry too — on
          // touch nothing holds the page, and a hidden H1 under a visitor
          // who is already scrolling away is a real defect (the desktop
          // gate makes this case unreachable there). Not a session skip.
          autoDoneRef.current = true;
          pendingGate = 1;
        } else if (entryRef.current >= 1) {
          autoClockRef.current += clockDelta;
          const t = autoClockRef.current;
          // HOLD GATED ON THE ECLIPSE (see the constants block): the ramp
          // starts on the FIRST frame the minimum hold has elapsed AND (the
          // eclipse island reports ready OR the maximum hold has elapsed).
          // `eclipseReady` is a transient getState() read (no subscription);
          // the start instant is latched in autoRampAtRef so the ramp is
          // measured from when it actually began, not from AUTO_HOLD_S.
          if (
            autoRampAtRef.current < 0 &&
            t >= AUTO_HOLD_S &&
            (st0.eclipseReady || t >= AUTO_HOLD_MAX_S)
          ) {
            autoRampAtRef.current = t;
          }
          if (autoRampAtRef.current >= 0) {
            const p = THREE.MathUtils.clamp(
              (t - autoRampAtRef.current) / AUTO_RAMP_S,
              0,
              1,
            );
            if (p >= 1) autoDoneRef.current = true;
            if (p !== st0.gateProgress) pendingGate = p;
          }
        }
      }
    }

    // The gate accumulates in discrete wheel ticks — smooth it here so the
    // whole transition glides (frame-rate independent damp).
    const gTarget = useTextMorphStore.getState().gateProgress;
    const g = THREE.MathUtils.damp(gSmoothRef.current, gTarget, 7, delta);
    gSmoothRef.current = g;

    // --- Dissolve: the single scroll beat, scrubbed & reversible ----------
    // uAssemble = entry × (1 − dissolve): during the entry it plays the
    // forming wave; once formed, scroll melts it back into the scatter field
    // (the reverse wave, right→left). Scrolling back re-forms it — the whole
    // journey is one pure function of (entry clock, smoothed g).
    const dissolve = THREE.MathUtils.smoothstep(g, DISSOLVE_START, DISSOLVE_END);
    const assembleEff = entryRef.current * (1 - dissolve);
    build.uAssemble.value = assembleEff;

    // The gate caps its progress just under 1 until morph2Done — with the
    // legs gone that flag now means "the payoff is in": the dissolve is
    // essentially complete and the DOM cascade has landed. Derived from the
    // smoothed g so a rushed flick parks at the cap for the ~0.2s the damp
    // needs to catch up, then the next notch releases the page — same feel
    // as before, one beat shorter. morphDone mirrors it for the provider's
    // reset + the skip path, which write both.
    const payoffDone = g >= 0.9;
    const st = useTextMorphStore.getState();
    if (payoffDone !== st.morphDone || payoffDone !== st.morph2Done) {
      useTextMorphStore.setState({
        morphDone: payoffDone,
        morph2Done: payoffDone,
      });
    }

    // DOM cascade: H1 crossfade + hero cluster ([data-hero-stagger]:
    // eyebrow → sub → CTAs) stagger in as the brand melts — StagePanel
    // consumes this. Pure in g, so the reverse replay mirrors it.
    // (The entry clock is deliberately NOT published here — it goes through
    // entryProgressRef, the module-scope shared ref, so the per-frame store
    // notification rate stays exactly what it was before the burst retiming.)
    const reveal = THREE.MathUtils.smoothstep(g, REVEAL_START, REVEAL_END);
    // pendingGate (touch beat) rides the SAME set() — one notification per
    // frame either way; null on desktop → the exact call it always was.
    useTextMorphStore.setState(
      pendingGate === null
        ? { domReveal: reveal }
        : { domReveal: reveal, gateProgress: pendingGate },
    );

    // After the gate releases, real scroll resumes: the particle block —
    // anchor frozen below — slides up out of the viewport with the world,
    // dissolving over the first ~70% of a screen of scroll. (Normally the
    // brand is already alpha-0 by then; this covers a rushed release.)
    const scrollPx = typeof window !== "undefined" ? window.scrollY : 0;
    const fade = 1 - Math.min(scrollPx / (size.height * 0.7), 1);
    build.uFade.value = fade;
    const dpr = Math.min(gl.getPixelRatio(), 2);
    build.uPixelRatio.value = dpr;
    build.uViewport.value.set(size.width * dpr, size.height * dpr);

    // Sleep when nothing can move: brand fully dissolved, gate released and
    // not re-engaged (raw gateProgress pinned at 1). A reverse re-engage
    // drops gateProgress below 1 → the loop wakes and re-forms the brand.
    const resting =
      assembleEff <= 0.002 && gTarget >= 1 && entryRef.current >= 1;
    group.visible = !resting && fade > 0.004;

    if (group.visible) {
      // Anchor the particle block to the live BRAND rect — but ONLY while
      // the page is parked at the very top (the gate). The moment real
      // scroll starts the position FREEZES in world space, so the camera's
      // descent carries the text up and out of the viewport in true 3D
      // (instead of it tracking the pinned hero forever).
      const el = brandRef.current;
      if (el && scrollPx <= 2) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const worldViewWidth = WORLD_VIEW_HEIGHT * (size.width / size.height);
        // + camDescend: hold the pre-descent station during the camera-dive
        // beat (SignatureLine publishes the applied offset) so the camera
        // genuinely leaves the text behind above the frame.
        scratch.set(
          (cx / size.width - 0.5) * worldViewWidth,
          camera.position.y +
            useTextMorphStore.getState().camDescend +
            // HEAD RAISE (introCamShiftRef, rests at 0): the SAME sink the
            // mark and the eclipse take, so the whole scene tilts as one.
            (0.5 - cy / size.height) * WORLD_VIEW_HEIGHT -
            WORLD_VIEW_HEIGHT * introCamShiftRef.current,
          0,
        );
        group.position.copy(scratch);
      }

      // --- GRAVITATIONAL FLYBY (owner 2026-08-07, v2 amplitude: "la
      // scritta non si distorce" → the warp must be UNMISTAKABLE): the
      // wordmark bends toward the eclipse's live APPARENT center (holeField
      // — the module-scope shared ref HomeSingularity publishes each frame)
      // by tens of px at near approach, the glyph edges nearest the hole
      // bending ~2× the far ones (per-particle falloff), breathing 0→peak
      // with the orbit's proximity envelope and relaxing to exactly 0 at
      // far phase. Displacement only, deliberately NO colour change. The
      // hole's true center floats ≈1.76 units from the camera — ~10 world
      // units in FRONT of this z=0 plane — so it is PROJECTED onto the
      // content plane along the camera ray first; the group is
      // translation-only, so world→local is a plain subtraction. Uniform
      // writes only (see the gpgpuNodeSim binding-budget note).
      const fxs = useFxStore.getState();
      holeAmpRef.current = THREE.MathUtils.damp(
        holeAmpRef.current,
        holeField.active ? holeField.strength : 0,
        6,
        delta,
      );
      if (holeField.active) {
        const camToHole = Math.max(camera.position.z - holeField.z, 1e-3);
        const sProj = camera.position.z / camToHole; // content plane z = 0
        build.uHole.value.set(
          camera.position.x +
            (holeField.x - camera.position.x) * sProj -
            group.position.x,
          camera.position.y +
            (holeField.y - camera.position.y) * sProj -
            group.position.y,
          0,
        );
      }
      build.uHoleRadius.value = fxs.holePullRadius;
      build.uHoleStrength.value = holeAmpRef.current * fxs.holePullText;

      timeRef.current += delta;
      build.tick({ dt: delta, time: timeRef.current });
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {build ? (
        <mesh
          geometry={build.geometry}
          material={build.material}
          frustumCulled={false}
        />
      ) : null}
    </group>
  );
}
