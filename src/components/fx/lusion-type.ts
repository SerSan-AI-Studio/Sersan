"use client";

/**
 * lusion-type — the round-5 TEXT v3 grammar shared by the two signal-stream
 * sections (problem + production-grade). Replaces use-type-scrub.ts: the
 * owner rejected the scroll-scrubbed fill-wipe ("non mi piace l'animazione
 * del testo, voglio qualcosa con gsap"); the Lusion text dossier
 * (research/2026-08-21-lusion-text-dossier.md) shows the real Lusion feel is
 *
 *   (a) VIEWPORT-ENTRY CHOREOGRAPHY THAT REPLAYS — real-time GSAP tweens
 *       fired when the block enters the viewport (either direction), reset to
 *       their FROM state only when the block is FULLY out, replayed on
 *       re-entry (Lusion `_needsReset`);
 *   (b) CONTINUOUS PER-FRAME PARALLAX DRIFT — every text block translates by
 *       its distance from viewport center with a differential factor k
 *       (title 0.5 / body 1.5 / secondary 1.25), recomputed each frame.
 *
 * FOUR HOOKS, one contract:
 *
 * `useChapterReveal(scope, language)` — chapter h2 + `[data-chapter-desc]`
 *   column. Recipe H3 (dossier): SplitText words in line masks
 *   (linesClass "split-line" so the globals.css descender-headroom masks
 *   apply; the margin-collapse flex fix is imposed inline while split),
 *   yPercent 115→0 over 1s on the lusion ease, 0.025s/word, plus x 200px→0
 *   delayed +0.4s (y leads, x trails — the Lusion goal-title signature).
 *   yPercent 115 (not the dossier's 100): parts must clear the split mask's
 *   0.12em extended clip window (globals.css) or tops peek at the hidden
 *   pose. The desc column follows in B3 spirit: whole-block autoAlpha 0→1 +
 *   y 30px→0, expo.out, cascaded at +0.5s.
 *
 * `useLedgerReveal(scope, language, onIgnite?, rollArmed?)` — one replayable
 *   entrance timeline PER `[data-ledger-row]`. `rollArmed` moves the PLAY edge
 *   from `top bottom` to the row's own reading-band threshold (ROUND 12 · D21,
 *   see `createReplayTrigger`); the reset edge never moves:
 *     t=0.00  `[data-roll-word]` columns — recipe R1 EXACTLY: per-char column
 *             through the 1em clip, yPercent −500→0, expo.inOut, 1.25s,
 *             center-out cosine stagger (rollDelay: center leads, edges trail
 *             by ~62ms — the real-time R1 numbers, no scrub remap).
 *     t=0.00  `[data-row-rise]` (mono index, arrow wrapper) — autoAlpha 0→1 +
 *             yPercent 60→0, 0.8s lusion.
 *     t=0.10  `[data-hairline]` — scaleX 0→1, origin left, 0.9s lusion.
 *     t=0.15  `[data-claim]` (production sentences) — recipe H3 (words in
 *             line masks, y then x+0.4s as above). Ghost stroke styling
 *             inherits through the split wrappers.
 *     t=0.30  `[data-row-body]` — recipe B1 word-wave: SplitText words,
 *             opacity 0.1→1 + yPercent 100→0, 1s expo.out, 0.01s/word —
 *             cascaded +0.3s after the display roll starts.
 *     t=1.10  onIgnite(row) — the "entrance landed" beat (production's
 *             bumpCluster ring flash). Fires ONCE per row per page life (the
 *             latch ref survives EN/IT rebuilds); a reload/SPA-nav landing
 *             PAST a row fires its latch immediately (the field must read
 *             "already landed") without playing the entrance.
 *
 * `useTextDrift(scope, language)` — the per-frame parallax (dossier §0/§4
 *   `showScreenOffset`). Every `[data-drift="<k>"]` wrapper translates
 *   dy = sat((1−k)·dCenter·DRIFT_SCALE) where dCenter = block center −
 *   viewport center (px): zero when the row is centered/readable, peaking
 *   subtly at the viewport edges — depth layering, never collision. ONE
 *   module-level gsap.ticker driver serves every registered block across both
 *   sections. Per frame: one window.scrollY read + pure arithmetic + a
 *   transform write per visible block — ZERO getBoundingClientRect in the
 *   loop (rects cached at register and re-measured on every ScrollTrigger
 *   refresh, drift-corrected so the applied transform never feeds back into
 *   the measurement). Blocks whose section is fully off-screen are skipped.
 *   The drift wrapper's transform is owned EXCLUSIVELY by this driver —
 *   entrances animate inner elements, and the problem heading's drift
 *   wrapper nests INSIDE `[data-emerge]` (the passage's transform target),
 *   never shares it.
 *
 *   ROUND 11 (2026-08-24) — THE COLLISION FIX. Two invariants now make text
 *   overlap structurally impossible; both are proved in the driver's own
 *   block comment below (§ Per-frame parallax drift), and every consumer
 *   must honour them:
 *     (1) SATURATION. `dy` is soft-clamped to ±DRIFT_MAX (tanh), so the
 *         separation two blocks can lose is bounded by DRIFT_MAX (same-sign
 *         (1−k)) or 2·DRIFT_MAX (opposite sign) — never by the section's
 *         height. Before this, dCenter was unbounded inside a tall section:
 *         a block 1,500px down a 2,400px section drifted ~90px, blowing
 *         straight through the 20px the layout puts between a headline and
 *         its own paragraph. That was the measured defect (−44px gaps).
 *     (2) PAIRING. A block and the block DIRECTLY BELOW it in the same flow
 *         may only carry different k if the layout gap between them can
 *         absorb the bound in (1). A row's display line and its own body
 *         cannot (20px desktop / 12px phone), so they share ONE k via
 *         `rowDriftK(i)` — identical k ⇒ the gap is monotone in the block
 *         center ⇒ it can only ever GROW. See `rowDriftK` below.
 *
 * `useIgnitionWave(scope)` — recipe Hv1 for rows with arrows (problem only):
 *   on ignition the EFFECT word's `[data-wave-word] [data-roll-col]` chars
 *   slide x 0→1.5em, 0.4s lusion, per-char delay (len−1−i)/100 (right-most
 *   first — the wave travels toward the arrow), while `[data-wave-arrow]`
 *   slides x 0→1.8em (its own 0.55em type ≈ one display-em) into the vacated
 *   space at +0.12s over 0.28s (Lusion's hoverRatio .3→1 window at 2.5/s).
 *   Un-ignition mirrors it back. The x channel never touches yPercent (GSAP
 *   composes them on the same [data-roll-col] elements); the word's clip
 *   must be `inset(0 -2em)` (RollLetters `clipInset`) so the x-shift escapes
 *   while the vertical roll clip survives. Returns a STABLE callback wired
 *   into useLedgerIgnition's resolved-index edge — same three entry points
 *   (fine-pointer hover / focus / touch centre-band), store link unchanged.
 *
 * GUARDS (binding, site discipline):
 *   - SSR / no-JS: none of this runs — rows, headings, bodies and hairlines
 *     render settled and visible. No hidden pose is ever baked into a
 *     className (D-10): FROM states are primed ONLY by GSAP at arm
 *     (immediateRender:true on every fromTo of the paused timelines).
 *   - Arm mid-viewport (reload restoring scroll / SPA nav): the trigger is
 *     created already-active and GSAP never fires onEnter for it — the
 *     creation-time isActive check plays the entrance (Lusion does the same).
 *   - Reduced motion: every hook early-returns before any priming — static
 *     settled content, zero timers, no drift, no wave, and onIgnite never
 *     fires from these hooks at all.
 *   - Splits happen only after document.fonts.ready (line boxes must be
 *     final); everything async-created is torn down manually (cancelled
 *     flag + kill/revert/clearProps) — the useGSAP context can't see it.
 *   - Split elements MUST be remounted on language change: the h2s carry
 *     key={language} already; claims/bodies carry it too (sections' JSX).
 *   - Constant-shape deps including `language`: an EN/IT toggle re-renders
 *     row text → full rebuild re-splits, re-primes, re-measures drift.
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { rollDelay } from "@/components/fx/roll-letters";
import { lusionEase } from "@/components/fx/lusion-ease";
import { readingBandArmPx } from "@/components/fx/scroll-ignition";
// three-free store (see its header) — no chunk weight added to this module.
import { useSeqStore } from "@/webgl/store/seqStore";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

// === Recipe constants (dossier numbers) ====================================

/** R1 letter-roll: per-char duration (s) and FROM offset (yPercent). */
const ROLL_DUR = 1.25;
const ROLL_FROM = -500;

/** H3 word rise: duration, per-word stagger, x trail delay + FROM px. */
const H3_DUR = 1;
const H3_STAGGER = 0.025;
const H3_X_DELAY = 0.4;
const H3_X_FROM = 200;
/** 115 not 100: clears the split-line mask's 0.12em extended clip window. */
const H3_Y_FROM = 115;

/** B1 word-wave: duration, per-word stagger, FROM opacity. */
const B1_DUR = 1;
const B1_STAGGER = 0.01;
const B1_ALPHA_FROM = 0.1;

/** Body cascade after the display roll starts (s). */
const BODY_AT = 0.3;

/** Row timeline beat at which the entrance reads as "landed" (onIgnite). */
const IGNITE_BEAT = 1.1;

/** Hv1: char shift (display em), char duration, arrow shift/delay/duration.
 * Arrow em is local to its 0.55em mono type → 1.8em ≈ one display-em. */
const WAVE_SHIFT_EM = 1.5;
const WAVE_DUR = 0.4;
const ARROW_SHIFT_EM = 1.8;
const ARROW_DELAY = 0.12;
const ARROW_DUR = 0.28;

/** Differential drift: dy = (1−k)·dCenter·DRIFT_SCALE, then saturated. */
const DRIFT_SCALE = 0.12;

/** Saturation ceiling for |dy| (px). THE number the collision proof rests on:
 * a stacked pair loses at most DRIFT_MAX of its layout gap (both (1−k) the
 * same sign) or 2·DRIFT_MAX (opposite sign — the k=1.25 chapter description
 * counter-drifting against a k<1 neighbour). Two tiers, keyed to the ledger
 * sections' OWN whitespace budget, which is itself breakpoint-dependent:
 *   ≥1024 (lg): rows are py-10 (40px each side), the chapter is two side-by-
 *     side columns 48px above the ledger (+40px row padding = 88px of air).
 *     Binding pairs: body↔its own hairline 39px (the 40px pad less the
 *     hairline's own h-px, loss ≤ 24 → 15px left; measured 15.1),
 *     chapter desc↔row 1 88px (loss ≤ 48 → 40px left; measured 41.7).
 *   <1024: rows are py-8/py-4 and the chapter columns STACK with gap-6 (24px)
 *     — the tightest opposite-sign pair on the page. Binding: 2·8 = 16 < 24
 *     (8px left; measured 8.1) and body↔hairline 15px at max-sm (loss ≤ 8 →
 *     7px left; measured 7.0).
 * Re-tiered on the raw `resize` event (see syncDriftViewport), never in the
 * tick. */
const DRIFT_MAX_WIDE = 24;
const DRIFT_MAX_COMPACT = 8;
/** Tailwind's `lg` — where both ledger sections change their spacing scale. */
const DRIFT_WIDE_MIN_W = 1024;

// === Shared plumbing =======================================================

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One-shot late refresh once webfonts land: the display-serif swap reflows
 * the big type → trigger start/end and drift rects computed pre-swap go
 * stale. Module-latched — fonts.ready resolves once per page; the refresh
 * also re-measures every registered drift block (refresh listener below). */
let fontsRefreshQueued = false;
function refreshOnFontsReady() {
  if (fontsRefreshQueued || typeof document === "undefined") return;
  fontsRefreshQueued = true;
  document.fonts?.ready
    .then(() => {
      ScrollTrigger.refresh();
    })
    .catch(() => {});
}

/**
 * The REPLAY contract (Lusion `_needsReset`): play on entry from either
 * direction, reset to FROM only when the trigger element is FULLY out of the
 * viewport. start "top bottom" / end "bottom top" spans the whole visible
 * transit, so onLeave/onLeaveBack are exactly the fully-out edges. A trigger
 * created already inside the range never fires onEnter (GSAP only fires on an
 * active-state CHANGE), so the creation-time isActive check plays it.
 *
 * ── ROUND 12 · D21 — THE ARM POINT MOVES INTO THE READING BAND ────────────
 * `armOffsetPx` (px above the viewport bottom) delays the PLAY edge to the
 * moment the row's own reading-band window value crosses `ROLL_ARM_C` — the
 * same window that writes the row's opacity. It closes the transparent-roll
 * defect: on the traversed act the row is held at opacity 0 for the first
 * ~150 px of its transit, so a slow scroll (< ~110 px/s) played the entire
 * 1.25 s R1 INVISIBLY and the reader met the row already settled.
 *
 * Because `y = docTop − scrollY` is affine in scroll, that threshold crossing
 * is a FIXED offset (`readingBandArmPx`), so it needs no per-frame source —
 * just a start offset, recomputed on refresh. When no offset is passed the
 * trigger is byte-for-byte the one that shipped.
 *
 * ⚠ TWO TRIGGERS, NOT ONE MOVED TRIGGER. Moving `start` down would move the
 * `onLeaveBack` edge with it, and the row would visibly snap back to its
 * hidden pose while still occupying the bottom ~180 px of the frame. So the
 * RESET keeps the fully-out edges and only the PLAY moves in. The `needsPlay`
 * latch is then load-bearing rather than decorative: with two different ranges
 * `onEnter` can fire again without a `reset` in between (scroll down a little,
 * back up past the inner start, down again), and without the latch the
 * entrance would replay mid-viewport.
 *
 * ⚠ `armOffsetPx` IS A GETTER, NOT A FLAG, AND THAT IS DELIBERATE. It is read
 * inside the `start` function — at build time and again on every
 * `ScrollTrigger.refresh()` (`invalidateOnRefresh`) — so the arm point can
 * start at `top bottom` and move into the reading band once the client has
 * resolved its tier, WITHOUT the caller adding a dependency. That matters:
 * `useGSAP` DEFERS its cleanup whenever a dependency array is present and
 * `revertOnUpdate` is not set (@gsap/react 2.1.2, `deferCleanup`), so a
 * dependency that flips right after hydration would add a SECOND set of
 * timelines and triggers on top of the first instead of replacing them.
 * Returning 0 reproduces the shipped `top bottom` exactly.
 *
 * Returns both triggers — `[0]` is the outer (full-transit) one, whose
 * `progress` describes the row's position.
 */
function createReplayTrigger(
  triggerEl: HTMLElement,
  tl: gsap.core.Timeline,
  armOffsetPx?: () => number,
): ScrollTrigger[] {
  let needsPlay = true;
  const play = () => {
    if (!needsPlay) return;
    needsPlay = false;
    tl.play(0);
  };
  const reset = () => {
    needsPlay = true;
    tl.pause(0);
  };
  const outer = ScrollTrigger.create({
    trigger: triggerEl,
    start: "top bottom",
    end: "bottom top",
    onLeave: reset,
    onLeaveBack: reset,
  });
  const inner = ScrollTrigger.create({
    trigger: triggerEl,
    start: () => {
      const px = armOffsetPx ? armOffsetPx() : 0;
      return px > 0 ? `top bottom-=${px}` : "top bottom";
    },
    end: "bottom top",
    invalidateOnRefresh: true,
    onEnter: play,
    onEnterBack: play,
  });
  if (inner.isActive) play();
  return [outer, inner];
}

// === Chapter reveal ========================================================

export function useChapterReveal(
  scope: RefObject<HTMLElement | null>,
  language: string,
  rollArmed = false,
): void {
  // Read through a REF, never a dependency (the same discipline as
  // `createReplayTrigger`'s `armOffsetPx` note): `rollArmed` flips false→true
  // right after hydration, and `useGSAP` DEFERS cleanup when a dependency
  // array is present, so a dependency would ADD a second set of timelines and
  // triggers on top of the first instead of replacing them.
  const rollArmedRef = useRef(rollArmed);
  useEffect(() => {
    rollArmedRef.current = rollArmed;
  });
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const scopeEl = scope.current;
      if (!scopeEl) return;
      const h2 = scopeEl.querySelector<HTMLElement>("[data-chapter-h2]");
      if (!h2) return;
      const desc = scopeEl.querySelector<HTMLElement>("[data-chapter-desc]");

      let cancelled = false;
      let split: SplitText | null = null;
      let tl: gsap.core.Timeline | null = null;
      let sts: ScrollTrigger[] = [];
      let offPlunge: (() => void) | null = null;

      // Fonts must be settled or line boxes split wrong mid-swap (the
      // HeadingChoreographer discipline). Everything created inside this
      // async callback escapes the useGSAP context → manual teardown below.
      document.fonts?.ready.then(() => {
        if (cancelled) return;
        split = new SplitText(h2, {
          type: "lines,words",
          mask: "lines",
          linesClass: "split-line",
        });
        // globals.css hangs the mask margin-collapse fix off
        // [data-split-reveal]; this h2 deliberately doesn't carry that
        // attribute (the shared HeadingChoreographer must skip it), so the
        // flex column is imposed inline for the split's lifetime.
        gsap.set(h2, { display: "flex", flexDirection: "column" });

        const words = split.words;
        tl = gsap.timeline({ paused: true });
        // H3: y leads…
        tl.fromTo(
          words,
          { yPercent: H3_Y_FROM },
          {
            yPercent: 0,
            duration: H3_DUR,
            ease: lusionEase(),
            stagger: H3_STAGGER,
            // Prime the FROM pose at arm (paused timeline renders nothing on
            // its own; fromTo at any position defaults immediateRender:false
            // → the settled CSS pose would flash on first entry).
            immediateRender: true,
          },
          0,
        );
        // …x trails by 0.4s (the goal-title signature).
        tl.fromTo(
          words,
          { x: H3_X_FROM },
          {
            x: 0,
            duration: H3_DUR,
            ease: lusionEase(),
            stagger: H3_STAGGER,
            immediateRender: true,
          },
          H3_X_DELAY,
        );
        // Chapter description column — B3 spirit: whole-block fade+rise,
        // cascaded after the title.
        if (desc) {
          tl.fromTo(
            desc,
            { autoAlpha: 0, y: 30 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 1,
              ease: "expo.out",
              immediateRender: true,
            },
            0.5,
          );
        }
        // ── ARM INSIDE THE READING BAND ───────────────────────────────
        // (owner 2026-09-04: "non si vede l'animazione… forse perché si entra
        // quando è già troppo in basso".) The chapter arms exactly where the
        // ledger rows do, and for the same reason: the diagonal traverse holds
        // `[data-traverse-alpha]` at opacity 0 until the unit has climbed
        // 0.12·ih above the viewport bottom — `windowAt` returns a HARD 0
        // above that — so a plain `top bottom` play burnt the whole entrance
        // at opacity ≈ 0 and the reader met a settled headline. Off that tier
        // the getter returns 0 and the arm point stays byte-for-byte where it
        // shipped.
        sts = createReplayTrigger(scopeEl, tl, () =>
          rollArmedRef.current ? readingBandArmPx(scopeEl.offsetHeight) : 0,
        );

        // ── THE COVERT JUMP MUST NOT CONSUME THE ENTRANCE ─────────────────
        // (the other half of the same note: "forse perché avviene prima che
        // l'animazione del salto finisce".) `singularity-passage` teleports
        // the reader to #problem's document top from INSIDE the plunge, under
        // a fully closed #000 veil — and Lenis's own scroll event runs
        // ScrollTrigger.update(), so this trigger's `onEnter` fired THERE,
        // not where the reader was. On the house ease the whole entrance was
        // spent before EMERGE had even begun opening the frame: the headline
        // was always already settled by the time it became visible. So replay
        // it on the shot's FALLING edge — `finishPlunge` writes plungeT 0 on
        // the natural completion AND on every skip path, which is the first
        // genuinely clear frame. `sts[0]` is the full-transit trigger, so
        // `isActive` is the honest "this block is on frame" test (it also
        // keeps the production twin, several viewports below the landing,
        // from replaying). Inert wherever the shot never runs (touch, reduced
        // motion, every inner route): plungeT rests at 0 for the page's whole
        // life and the edge never arrives.
        offPlunge = useSeqStore.subscribe((st, prev) => {
          if (prev.plungeT > 0 && st.plungeT === 0 && sts[0]?.isActive) {
            tl?.play(0);
          }
        });
      });

      refreshOnFontsReady();

      return () => {
        cancelled = true;
        offPlunge?.();
        sts.forEach((t) => t.kill());
        tl?.kill();
        if (desc) {
          gsap.killTweensOf(desc);
          gsap.set(desc, { clearProps: "opacity,visibility,transform" });
        }
        if (split) split.revert();
        gsap.set(h2, { clearProps: "display,flexDirection" });
      };
    },
    { scope, dependencies: [language] },
  );
}

// === Ledger rows ===========================================================

export function useLedgerReveal(
  scope: RefObject<HTMLElement | null>,
  language: string,
  onIgnite?: (row: number) => void,
  rollArmed = false,
): void {
  // Once-per-page-life ignition latch — survives EN/IT rebuilds on purpose
  // (round-3 contract: the ring flash rides the FIRST landing only).
  const ignitedRef = useRef<boolean[]>([]);
  // ROUND 12 · D21 — read through a REF, never a dependency: see
  // `createReplayTrigger`. `rollArmed` flips false→true right after hydration
  // on every load, and `useGSAP` would add a second context instead of
  // replacing the first. Written in an effect on every render; the arm point
  // is a `start` function, so the next `ScrollTrigger.refresh()` (the traverse
  // dispatches one as it arms) picks the flip up.
  const rollArmedRef = useRef(rollArmed);
  useEffect(() => {
    rollArmedRef.current = rollArmed;
  });

  useGSAP(
    () => {
      if (reducedMotion()) return;
      const scopeEl = scope.current;
      if (!scopeEl) return;
      const rows = Array.from(
        scopeEl.querySelectorAll<HTMLElement>("[data-ledger-row]"),
      );
      if (!rows.length) return;

      let cancelled = false;
      const splits: SplitText[] = [];
      const flexHosts: HTMLElement[] = [];
      const timelines: gsap.core.Timeline[] = [];
      const triggers: ScrollTrigger[] = [];

      document.fonts?.ready.then(() => {
        if (cancelled) return;
        rows.forEach((row, i) => {
          const rollWords = Array.from(
            row.querySelectorAll<HTMLElement>("[data-roll-word]"),
          );
          const rises = row.querySelectorAll<HTMLElement>("[data-row-rise]");
          const claim = row.querySelector<HTMLElement>("[data-claim]");
          const body = row.querySelector<HTMLElement>("[data-row-body]");
          const hairline = row.querySelector<HTMLElement>("[data-hairline]");

          let claimSplit: SplitText | null = null;
          if (claim) {
            claimSplit = new SplitText(claim, {
              type: "lines,words",
              mask: "lines",
              linesClass: "split-line",
            });
            gsap.set(claim, { display: "flex", flexDirection: "column" });
            splits.push(claimSplit);
            flexHosts.push(claim);
          }
          let bodySplit: SplitText | null = null;
          if (body) {
            // aria:"none" — see beat-choreographer's body split. `[data-row-body]`
            // is a <p>, and SplitText's default writes an `aria-label` there,
            // which role `paragraph` prohibits. A word split needs no label:
            // each span still carries a real word.
            bodySplit = new SplitText(body, {
              type: "words",
              wordsClass: "split-word",
              aria: "none",
            });
            splits.push(bodySplit);
          }

          const tl = gsap.timeline({ paused: true });

          // R1 letter-roll, real-time numbers: each word blooms center-out.
          rollWords.forEach((word) => {
            const cols = word.querySelectorAll<HTMLElement>("[data-roll-col]");
            const n = cols.length;
            cols.forEach((col, ci) => {
              tl.fromTo(
                col,
                { yPercent: ROLL_FROM },
                {
                  yPercent: 0,
                  duration: ROLL_DUR,
                  ease: "expo.inOut",
                  immediateRender: true,
                },
                rollDelay(ci, n),
              );
            });
          });
          // Index / arrow wrapper settle.
          if (rises.length) {
            tl.fromTo(
              rises,
              { autoAlpha: 0, yPercent: 60 },
              {
                autoAlpha: 1,
                yPercent: 0,
                duration: 0.8,
                ease: lusionEase(),
                stagger: 0.06,
                immediateRender: true,
              },
              0,
            );
          }
          // Hairline draw.
          if (hairline) {
            tl.fromTo(
              hairline,
              { scaleX: 0, transformOrigin: "0% 50%" },
              {
                scaleX: 1,
                duration: 0.9,
                ease: lusionEase(),
                immediateRender: true,
              },
              0.1,
            );
          }
          // Production claim — H3, IN THREE INFLECTIONS (owner, 2026-08-26:
          // "varia l'animazione gsap tra le 3, non usare la stessa").
          //
          // ONE recipe, three readings — not three unrelated animations. All
          // three keep H3's materials exactly: SplitText words inside line
          // masks, `lusionEase()`, `H3_DUR`, `H3_STAGGER`, and a y rise the
          // mask clips. Only the STAGGER ORIGIN and the lateral differ, so the
          // ledger still reads as one grammar down the stack:
          //
          //   row 0  ARRIVE   left→right, x trailing in from the right (the
          //                   shipped H3, byte for byte — the act's baseline)
          //   row 1  RETURN   right→left, x entering from the LEFT and landing
          //                   with the rise instead of trailing it
          //   row 2  CLAMP    centre-out, the halves converging inward — the
          //                   two sides close on the line
          //
          // `immediateRender: true` on every FROM keeps the D-10 rule (no
          // primed pose in a className; SSR/no-JS/RM paint the rest pose).
          if (claimSplit) {
            const inflection = i % 3;
            const staggerFrom =
              inflection === 1 ? "end" : inflection === 2 ? "center" : "start";
            tl.fromTo(
              claimSplit.words,
              { yPercent: H3_Y_FROM },
              {
                yPercent: 0,
                duration: H3_DUR,
                ease: lusionEase(),
                stagger: { each: H3_STAGGER, from: staggerFrom },
                immediateRender: true,
              },
              0.15,
            );
            // ROW 2 converges instead of sliding: each word enters from the
            // side it sits on, so the line closes on itself. Half the travel
            // of a full slide — it is a clamp, not an entrance from off-frame.
            const xFrom =
              inflection === 2
                ? (idx: number, _t: unknown, targets: unknown[]) =>
                    (idx < targets.length / 2 ? -1 : 1) * H3_X_FROM * 0.5
                : inflection === 1
                  ? -H3_X_FROM
                  : H3_X_FROM;
            tl.fromTo(
              claimSplit.words,
              { x: xFrom },
              {
                x: 0,
                duration: H3_DUR,
                ease: lusionEase(),
                stagger: { each: H3_STAGGER, from: staggerFrom },
                immediateRender: true,
              },
              // ARRIVE trails its lateral; the other two land it WITH the
              // rise, which is what makes them read as different beats.
              inflection === 0 ? 0.15 + H3_X_DELAY : 0.15,
            );
          }
          // Body — recipe B1 word-wave, cascaded after the display roll.
          if (bodySplit) {
            tl.fromTo(
              bodySplit.words,
              { opacity: B1_ALPHA_FROM, yPercent: 100 },
              {
                opacity: 1,
                yPercent: 0,
                duration: B1_DUR,
                ease: "expo.out",
                stagger: B1_STAGGER,
                immediateRender: true,
              },
              BODY_AT,
            );
          }
          // Landing beat: ring i ignites as the entrance lands, once per
          // page life. Seeks (play(0)/pause(0)) suppress events — the call
          // fires only when forward playback crosses the beat.
          if (onIgnite) {
            tl.call(
              () => {
                if (!ignitedRef.current[i]) {
                  ignitedRef.current[i] = true;
                  onIgnite(i);
                }
              },
              [],
              IGNITE_BEAT,
            );
          }

          // ROUND 12 · D21 — the roll arms inside the reading band, not at
          // `top bottom`, wherever the traverse's opacity window is live. Off
          // that tier the window does not exist, the getter returns 0, and the
          // arm point stays exactly where it shipped — the fallback the spec
          // asks for, and the reason this is a getter and not a rewrite.
          //
          // `offsetHeight`, not a rect: this runs at trigger-build time and on
          // every refresh, and the row's border box is what the window law is
          // written on. It is an integer-px round of the same number.
          const sts = createReplayTrigger(row, tl, () =>
            rollArmedRef.current ? readingBandArmPx(row.offsetHeight) : 0,
          );
          // A reload / SPA nav landing PAST the row: the entrance stays
          // reset (it replays on scroll-back), but the WebGL ring must read
          // "already landed" — fire the latch without playing. `sts[0]` is
          // the full-transit trigger, so this stays the row's real position.
          if (onIgnite && sts[0].progress >= 1 && !ignitedRef.current[i]) {
            ignitedRef.current[i] = true;
            onIgnite(i);
          }
          timelines.push(tl);
          sts.forEach((t) => triggers.push(t));
        });
      });

      refreshOnFontsReady();

      return () => {
        cancelled = true;
        triggers.forEach((t) => t.kill());
        timelines.forEach((t) => t.kill());
        // Roll cols / rises / hairlines are NOT split-managed — their GSAP
        // inline styles survive the kill on React-reused nodes. Clear them
        // so a language rebuild re-primes from clean markup. (An EN/IT
        // toggle reuses the same spans; stale transforms would stick.)
        rows.forEach((row) => {
          const leftovers = row.querySelectorAll<HTMLElement>(
            "[data-roll-col],[data-row-rise],[data-hairline]",
          );
          gsap.killTweensOf(leftovers);
          gsap.set(leftovers, { clearProps: "transform,opacity,visibility" });
        });
        splits.forEach((s) => s.revert());
        flexHosts.forEach((el) =>
          gsap.set(el, { clearProps: "display,flexDirection" }),
        );
      };
    },
    { scope, dependencies: [language, onIgnite] },
  );
}

// === Per-frame parallax drift =============================================
// ONE module-level driver for every [data-drift] block across both sections.
// Registered entries cache their untransformed doc-space center (and their
// section's doc-space band for the off-screen skip); the tick is pure
// arithmetic + a quickSetter write. Rects re-measure on every ScrollTrigger
// refresh (resize, fonts, layout changes) — never in the loop.
//
// THE COLLISION ALGEBRA (round 11 — read this before changing any k).
// Write a = 1−k, S = DRIFT_SCALE, M = DRIFT_MAX, u = center − viewCenter:
//
//     dy(a, u) = M · tanh(a·u·S / M)
//
// For an upper block i and the block j directly below it, the rendered gap is
//     gap = G0 + dy_j − dy_i          (G0 = the authored layout gap)
// and the three facts that matter are:
//
//   (1) |dy| < M  for every block, at every scroll position, always.
//   (2) a_i = a_j > 0  ⇒  gap ≥ G0. dy is strictly increasing in the block
//       center (a > 0 and tanh is strictly increasing), and both blocks read
//       the same viewCenter, so center_j > center_i ⇒ dy_j > dy_i. The gap
//       can only GROW — and note this holds even if the cached centers are
//       stale, since only their ORDER matters. This is why a row's display
//       line and its own body must share one k (`rowDriftK`, all values < 1)
//       — it makes the defect impossible rather than merely small.
//       Exactly: gap ≥ G0 − 2·0.05px. The tick's 0.05px write dead-band
//       below means each block's APPLIED dy trails its ideal dy by < 0.05px,
//       and the two blocks can be on opposite sides of their dead-bands.
//       Measured worst case at 390px: 11.99 against an authored 12. That is
//       the entire error budget of (2) — it is sub-pixel by construction and
//       cannot accumulate, because the dead-band is absolute, not relative.
//   (3) a_i ≠ a_j ⇒ gap ≥ G0 − M when a_i, a_j have the SAME sign (both dy
//       then share u's sign, so the loss is one-sided), and ≥ G0 − 2M when
//       the signs differ (k>1 counter-drift). So a differential k between two
//       stacked blocks is only legal when their layout gap exceeds that
//       bound — see DRIFT_MAX for the per-breakpoint budget.
//
// The pre-round-11 driver had no (1): u ran to the whole section height, so
// dy reached ±90px inside a 20px gap and the paragraph climbed into its own
// headline. tanh rather than a hard Math.min/max clamp: both are monotone
// (so both would satisfy (2)), but a clamp freezes the block dead once it
// saturates — it then scrolls glued to the page while its neighbours keep
// moving, and the derivative jump reads as a snap. tanh is C¹, compresses
// only the far field (−8% at half the ceiling, where the reading happens) and
// approaches M without ever reaching it.
//
// WHAT (2) IS IMMUNE TO — verified live in Chrome, not just argued, because
// the first cut of this proof was quoted against samples it could not explain:
//   - STALE CENTERS of any size. `#trust` was shoved down 700px with a style
//     write (a reflow that fires no resize and therefore no refresh, so the
//     cache stayed 700px behind); every display↔body gap in the section
//     still measured ≥ 20.02px. (2) reads the cached centers only through
//     their order, and no layout ever puts a row's body above its own
//     display line, so the order survives arbitrary staleness. The unbounded
//     bounds in (1)/(3) never depended on the centers at all.
//   - A LAGGING SCROLL READ. Both blocks are evaluated against the same
//     viewCenter in the same tick, so a transform computed one frame (or one
//     720px jump) behind the rects is just (2) evaluated at a different
//     viewCenter — still monotone. Measured: a 697px jump read in the same
//     frame moved the row-0 transform by 31px and the GAP by +2.05px, i.e.
//     it grew. This is also the explanation for the "unexplained −33.7 vs
//     +50 measured" sample in the round-11 handoff: under the OLD opposite-
//     sign law the same one-frame lag lands as (a_disp − a_body)·S·step =
//     0.12 × 697 = 83.6px of gap error — the exact size of the anomaly. It
//     was never a stale centre; it was a harness reading rects before the
//     tick caught up. Same-k makes that whole failure class second-order.
// What (2) is NOT immune to is two blocks of one pair being measured in
// DIFFERENT layout snapshots. They are not: useTextDrift registers a whole
// scope in one synchronous loop and measureAllDrift re-measures every entry
// in one, with no DOM writes in between. Any future partial re-registration
// would have to preserve that.

interface DriftEntry {
  el: HTMLElement;
  k: number;
  section: HTMLElement;
  /** Untransformed doc-space Y center of the block (drift-corrected). */
  center: number;
  secTop: number;
  secBottom: number;
  /** Last applied dy (also the measurement correction). */
  dy: number;
  set: (value: number) => void;
}

// Plain array + indexed loops: the tick runs every frame — Set/forEach would
// allocate an iterator/closure per frame (zero-per-frame-allocation rule).
// Mutations (register/unregister/measure) are rare and event-driven.
const driftEntries: DriftEntry[] = [];
let driftArmed = false;
let driftWinH = 0;
/** Saturation ceiling in force (px) — re-tiered on refresh, read in the tick.
 * Seeded with the tighter tier so a pre-measure frame can never overshoot. */
let driftMax = DRIFT_MAX_COMPACT;

/** Viewport-derived constants. Event-driven (register + the raw `resize`
 * event + ScrollTrigger refresh) — never called from the tick.
 *
 * It is bound to raw `resize` and NOT only to ScrollTrigger's refresh, which
 * is what the first cut of this did: smooth-scroll-provider debounces that
 * refresh 150ms and RESTARTS the timer on every resize event (and gsap's own
 * internal `_onResize` does the same), so during a continuous window drag
 * neither one fires until the drag STOPS. A drag from ≥1024 down to phone
 * width would then run the WIDE ceiling (24px) against the COMPACT layout's
 * budget for the whole drag — the 24px stacked chapter pair (needs 2M ≤ 24)
 * and the 15px body↔hairline (needs M ≤ 15) both go negative, i.e. the bounds
 * in THE COLLISION ALGEBRA get quoted against a budget that no longer exists.
 * Re-tiering here is two viewport reads and zero rect reads, so the ceiling
 * tracks the live breakpoint with no debounce. The cached CENTERS stay stale
 * until the refresh lands — which fact (2) proves harmless for a same-k pair,
 * since it depends on their ORDER and not on their value (verified live: a
 * 700px injected reflow with no refresh left every display↔body gap ≥ 20px).
 *
 * This does NOT re-open D-9. That contract gates `ScrollTrigger.refresh()` on
 * a phone because re-measuring every trigger under the user's thumb makes
 * pins jump; it says nothing about reading two viewport numbers. A URL-bar
 * collapse now moves viewCenter by Δh/2 immediately instead of holding a
 * stale innerHeight until some unrelated refresh — worth ≤2.5px of dy, in the
 * correct direction, during a frame where the viewport is already resizing. */
function syncDriftViewport(): void {
  driftWinH = window.innerHeight;
  driftMax =
    window.innerWidth >= DRIFT_WIDE_MIN_W ? DRIFT_MAX_WIDE : DRIFT_MAX_COMPACT;
}

function measureDriftEntry(en: DriftEntry, scrollY: number): void {
  const r = en.el.getBoundingClientRect();
  // Subtract the currently applied drift so the transform never feeds back
  // into the cached center.
  en.center = r.top + scrollY + r.height / 2 - en.dy;
  const sr = en.section.getBoundingClientRect();
  en.secTop = sr.top + scrollY;
  en.secBottom = sr.bottom + scrollY;
}

function measureAllDrift(): void {
  if (typeof window === "undefined") return;
  syncDriftViewport();
  const sy = window.scrollY;
  for (let i = 0; i < driftEntries.length; i++) {
    measureDriftEntry(driftEntries[i], sy);
  }
}

function driftTick(): void {
  const sy = window.scrollY;
  const viewBottom = sy + driftWinH;
  const viewCenter = sy + driftWinH / 2;
  for (let i = 0; i < driftEntries.length; i++) {
    const en = driftEntries[i];
    // Skip writes while the block's section is fully off-screen.
    if (en.secBottom < sy || en.secTop > viewBottom) continue;
    // Saturated at ±driftMax — see THE COLLISION ALGEBRA above. Math.tanh is
    // a plain numeric intrinsic: no allocation, ~a dozen calls per frame.
    const raw = (1 - en.k) * (en.center - viewCenter) * DRIFT_SCALE;
    const dy = driftMax * Math.tanh(raw / driftMax);
    if (Math.abs(dy - en.dy) < 0.05) continue;
    en.dy = dy;
    en.set(dy);
  }
}

function armDriftDriver(): void {
  if (driftArmed) return;
  driftArmed = true;
  measureAllDrift();
  gsap.ticker.add(driftTick);
  ScrollTrigger.addEventListener("refresh", measureAllDrift);
  // Ceiling re-tier only — no rect reads, no refresh, no debounce. See
  // syncDriftViewport for why the refresh listener above is not enough.
  window.addEventListener("resize", syncDriftViewport, { passive: true });
}

function disarmDriftDriverIfEmpty(): void {
  if (!driftArmed || driftEntries.length > 0) return;
  driftArmed = false;
  gsap.ticker.remove(driftTick);
  ScrollTrigger.removeEventListener("refresh", measureAllDrift);
  window.removeEventListener("resize", syncDriftViewport);
}

function registerDrift(
  el: HTMLElement,
  k: number,
  section: HTMLElement,
): () => void {
  const en: DriftEntry = {
    el,
    k,
    section,
    center: 0,
    secTop: 0,
    secBottom: 0,
    dy: 0,
    set: gsap.quickSetter(el, "y", "px") as (value: number) => void,
  };
  if (!driftWinH) syncDriftViewport();
  measureDriftEntry(en, window.scrollY);
  driftEntries.push(en);
  armDriftDriver();
  return () => {
    const idx = driftEntries.indexOf(en);
    if (idx !== -1) driftEntries.splice(idx, 1);
    gsap.set(el, { clearProps: "transform" });
    disarmDriftDriverIfEmpty();
  };
}

/** Per-ROW drift depth for a ledger stack (a = 1−k → 0.50 / 0.34 / 0.18: the
 * top row is the nearest plane, each row below it sits further back). All
 * three are < 1, so no row ever counter-drifts against its neighbour — fact
 * (3) above then bounds an inter-row loss at DRIFT_MAX (24px desktop) against
 * the 80px py-10 gutter between rows. */
const ROW_DRIFT_K = [0.5, 0.66, 0.82];

/**
 * THE PAIRING RULE, in one function. Both blocks of ledger row `i` — the
 * display line and the paragraph under it — must call this and get the SAME
 * number, which is what makes `bodyTop − claimBottom` monotone (fact (2)
 * above) and therefore never smaller than the authored gap. Do NOT hand the
 * body a different k "for depth": the intra-row gap is 20px on desktop and
 * 12px on a phone, and the drift budget that fits inside it is not worth
 * having. The depth lives BETWEEN rows instead, which is where there are 80px
 * to spend.
 */
export function rowDriftK(index: number): number {
  return ROW_DRIFT_K[index % ROW_DRIFT_K.length];
}

/**
 * Registers every `[data-drift="<k>"]` wrapper inside `scope` with the shared
 * driver. The scope element doubles as the "section" for the off-screen skip
 * (pass the section ref). Drift owns each wrapper's transform exclusively.
 */
export function useTextDrift(
  scope: RefObject<HTMLElement | null>,
  language: string,
): void {
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const scopeEl = scope.current;
      if (!scopeEl) return;
      const blocks = scopeEl.querySelectorAll<HTMLElement>("[data-drift]");
      if (!blocks.length) return;
      const cleanups: (() => void)[] = [];
      blocks.forEach((el) => {
        const k = parseFloat(el.dataset.drift ?? "");
        if (!Number.isFinite(k) || k === 1) return;
        cleanups.push(registerDrift(el, k, scopeEl));
      });
      return () => {
        cleanups.forEach((fn) => fn());
      };
    },
    { scope, dependencies: [language] },
  );
}

// === Hv1 — the hover letter-shift + arrow slide ===========================

function waveTargets(row: HTMLElement) {
  return {
    cols: Array.from(
      row.querySelectorAll<HTMLElement>("[data-wave-word] [data-roll-col]"),
    ),
    arrow: row.querySelector<HTMLElement>("[data-wave-arrow]"),
  };
}

function waveIn(row: HTMLElement): void {
  const { cols, arrow } = waveTargets(row);
  const n = cols.length;
  if (n) {
    gsap.killTweensOf(cols, "x");
    cols.forEach((col, i) => {
      gsap.to(col, {
        x: `${WAVE_SHIFT_EM}em`,
        duration: WAVE_DUR,
        ease: lusionEase(),
        // Right-most chars move first — the wave travels toward the arrow.
        delay: (n - 1 - i) / 100,
      });
    });
  }
  if (arrow) {
    gsap.killTweensOf(arrow, "x");
    gsap.to(arrow, {
      x: `${ARROW_SHIFT_EM}em`,
      duration: ARROW_DUR,
      ease: lusionEase(),
      delay: ARROW_DELAY,
    });
  }
}

function waveOut(row: HTMLElement): void {
  const { cols, arrow } = waveTargets(row);
  if (cols.length) {
    gsap.killTweensOf(cols, "x");
    cols.forEach((col, i) => {
      gsap.to(col, {
        x: 0,
        duration: WAVE_DUR,
        ease: lusionEase(),
        // Mirror: left-most returns first as the ratio ramps down.
        delay: i / 100,
      });
    });
  }
  if (arrow) {
    gsap.killTweensOf(arrow, "x");
    gsap.to(arrow, { x: 0, duration: ARROW_DUR, ease: lusionEase() });
  }
}

/**
 * Returns a STABLE `(index | null) => void` callback for useLedgerIgnition's
 * `onResolvedChange`: waves the newly ignited row in and the previous one
 * out. Queries lazily per edge (event-driven, never per-frame) so EN/IT
 * rebuilds are picked up automatically. Inert under reduced motion.
 */
export function useIgnitionWave(
  scope: RefObject<HTMLElement | null>,
): (index: number | null) => void {
  const litRef = useRef<number | null>(null);
  return useCallback(
    (index: number | null) => {
      if (typeof window === "undefined" || reducedMotion()) return;
      const prev = litRef.current;
      if (prev === index) return;
      litRef.current = index;
      const scopeEl = scope.current;
      if (!scopeEl) return;
      const rowEl = (i: number) =>
        scopeEl.querySelector<HTMLElement>(`[data-ledger-row="${i}"]`);
      if (prev !== null) {
        const row = rowEl(prev);
        if (row) waveOut(row);
      }
      if (index !== null) {
        const row = rowEl(index);
        if (row) waveIn(row);
      }
    },
    [scope],
  );
}
