/**
 * First-load intro coordination store.
 *
 * The preloader (src/components/fx/preloader.tsx) and the persistent WebGL
 * scene live in separate React trees (the canvas is lazy + ssr:false inside
 * CanvasHost), so they hand off through this tiny transient store rather than
 * props.
 *
 * Lifecycle on a HARD page load:
 *   1. `introComplete` starts false. The preloader covers the viewport while
 *      it counts real readiness up to 100%.
 *   2. When the counter reaches 100 the preloader sets `introComplete = true`
 *      AND lifts its curtain.
 *   3. SignatureLine subscribes to `introComplete`; on the false→true edge it
 *      re-kicks its own `uReveal` 0→1 draw-in so the line visibly "becomes"
 *      what the loader bar was — one shared beat with the curtain wipe.
 *
 * On a SOFT (client) route change the preloader never remounts (it lives in
 * the persistent layout and only shows once per hard load), so `introComplete`
 * simply stays true and the line keeps using its per-route re-curve beat.
 *
 * Read transiently via getState() inside useFrame, or subscribed to detect the
 * completion edge — never as a reactive hook in a hot render path.
 */
import { create } from "zustand";

/**
 * Live first-load counter fraction (0..1) — the eased value the preloader's
 * readout displays, published every rAF tick while the chrome overlay is up
 * (preloader v2, 2026-08-28: the loader has NO backdrop of its own — the
 * WebGL scene IS the stage, and HeroLogo scrubs the spore mark's
 * materialisation from this value so the mark literally grows with the
 * percentage). A MODULE-SCOPE REF, not store state: a per-frame zustand
 * setState would notify every listener 60×/s for a value nothing reads
 * reactively (the entryProgressRef / pointerStore precedent). Rests at 1:
 * soft entries and every post-intro frame read "fully materialised"; the
 * preloader writes 0 on arm and 1 again on its way out. This module stays
 * three-free so the preloader chunk can import it.
 */
export const introProgressRef: { current: number } = (globalThis.__sersanIntroProgressRef ??= {
  current: 1,
});

/**
 * Intro frame shift (fraction of WORLD_VIEW_HEIGHT, rests at 0) — the
 * "camera più in alto" of the close-up (owner 2026-08-28: at the 32%
 * dolly-in the lockup cropped at the top). The screen-anchored hero actors
 * (mark, wordmark) follow camera.y one-to-one, so a real camera-y move
 * cannot reframe them; instead SignatureLine publishes this shift — full at
 * the full close-up, riding the dolly's own fraction down to an exact 0 as
 * the exit lands — and HeroLogo / HeroTextParticles LOWER their anchored y
 * by it, which reads as the camera aiming higher. Module ref, no store
 * notify (per-frame value).
 */
export const introCamShiftRef: { current: number } = (globalThis.__sersanIntroCamShiftRef ??= {
  current: 0,
});

/**
 * Intro HEAD-RAISE (fraction of the eclipse's view height, rests at 0) —
 * owner 2026-08-28: "come se fosse da fuori una persona che alza la testa e
 * guarda più in alto". The brand (mark + wordmark) is screen-anchored, so
 * raising the aim must NOT move it — what sinks is the WORLD: this ref is
 * published by SignatureLine's gate walker and consumed by HomeSingularity,
 * which lowers the hole by it. Module ref, no store notify (per-frame).
 */
export const introHeadRaiseRef: { current: number } = (globalThis.__sersanIntroHeadRaiseRef ??= {
  current: 0,
});

/**
 * Staged EXIT PROGRESS for the black hole (1 = the load pose inside it,
 * 0.5 = the big low "gate 2" pose, 0 = the shipped hero rest). Separate
 * from introZoomRef on purpose (owner 2026-08-28: "lo zoom in verso il logo
 * non deve spostare il buco nero, deve rimanere fissato in basso fino al
 * terzo gate") — the camera's push-in during the logo gate must not drag
 * the hole back up, so its pose walks its own monotone staircase: it
 * travels during gate 2a, HOLDS through gate 2b, and only the final gate
 * takes it home. Module ref, no store notify (per-frame).
 */
export const introHoleRef: { current: number } = (globalThis.__sersanIntroHoleRef ??= {
  current: 0,
});

/**
 * Intro zoom fraction (1 = camera fully INSIDE the black hole at the load
 * hold, 0 = landed in the hero frame; rests at 0) — published per frame by
 * SignatureLine's intro camera rig as `current dolly / INTRO_CAM_IN`.
 * Consumed by HomeSingularity to slide the eclipse between its
 * inside-the-hole distance (the disk swallowing the whole frame — "siamo
 * dentro il buco nero") and its tuned hero rest, riding the very same
 * zoom-out. Module ref, no store notify (per-frame value).
 */
export const introZoomRef: { current: number } = (globalThis.__sersanIntroZoomRef ??= {
  current: 0,
});

interface IntroState {
  /** False until the first-load preloader hands off; true forever after. */
  introComplete: boolean;
  complete: () => void;
  /**
   * True once the hero mark's STAGE ACTOR is genuinely ready to perform the
   * materialisation (preloader v2): the spore compute build has landed AND
   * its hidden PRIME kill has finished (HeroLogo), or the static-fallback
   * build is live. The preloader requires it (home route only, bounded) to
   * complete the counter — Oddity's principle: the loader gates on exactly
   * what the hero will play, so the reveal can never land before the mark
   * exists. Never reset (per hard load, like introComplete).
   */
  heroStageReady: boolean;
  setHeroStageReady: () => void;
  /**
   * True once the SERSAN wordmark's 3.6s assemble wave has fully formed
   * (published by HeroTextParticles the frame its entry clock reaches 1 —
   * the skip pin and replay seed count too). The preloader holds its
   * completion on it (owner 2026-08-28: "fai durare il preloader fino a
   * quando non ha finito di comporsi la scritta Sersan"), bounded like the
   * stage gate so builds that never mount a wordmark (WebGL2, phones without
   * the brand anchor, interior routes) degrade to the plain reveal.
   */
  wordmarkFormed: boolean;
  setWordmarkFormed: () => void;
  /**
   * True once it is KNOWN that this load will NEVER play the brand beat —
   * the SERSAN wordmark assemble and, with it, the eclipse that rises behind
   * it (Scene.tsx: "the eclipse exists only for the brand beat", so one
   * verdict answers for both). It is the ISLAND'S OWN "I am not coming"
   * signal, published from the places that actually decide:
   *
   *   · CinematicSystemScroll — the DOM authority over the brand ANCHOR:
   *     `stacked` mode renders none (landscape phone), and `compact` mode
   *     renders one only while `brandBeatArmed()` (src/lib/spine.ts). A phone
   *     that resolves to fxBudget level 1 therefore never mounts a wordmark
   *     and never mounts the eclipse island.
   *   · HeroTextParticles — the build's own dead ends: the WebGL2 fallback
   *     backend (compute storage indexing no-ops, three #31221) and a failed
   *     dynamic import of the webgpu/tsl/gpgpu chunks.
   *
   * WHY IT EXISTS: without it the preloader's only exit from those paths was
   * the WORDMARK_MAX_MS / ECLIPSE_MAX_MS insurance timers — so a phone that
   * was never going to play the beat sat at the 90% cap for ~23 SECONDS
   * before revealing (reported live on an iPhone, 2026-09-09). The timers
   * stay as insurance for a beat that IS armed and then stalls; this flag is
   * the fast, truthful exit for a beat that was never armed at all.
   *
   * Set-once per hard load, exactly like `heroStageReady` / `wordmarkFormed`.
   */
  brandBeatSkipped: boolean;
  setBrandBeatSkipped: () => void;
  /**
   * True once the WebGL scene is actually RENDERING SMOOTHLY — i.e. the WebGPU
   * pipelines/compute kernels have finished compiling (the heavy one-time cost
   * that otherwise stalls the first frames). Set by PipelineWarmup (in-Canvas)
   * once it has seen a run of smooth frames; READ by the preloader as its 4th
   * readiness signal so the counter only reaches 100% when the shaders are
   * genuinely warm (truthful loading), not on a fixed timer.
   */
  warmReady: boolean;
  setWarmReady: () => void;
  /**
   * Fractional warm-up progress, 0..1, MONOTONIC (never lowers). Published by
   * PipelineWarmup in two steps — 0.5 once `gl.compileAsync(scene, camera)`
   * has resolved (the scene's render objects are compiled), 1 once the
   * smooth-frame heuristic declares the scene warm (`setWarmReady`, which
   * also writes 1 here). READ by the preloader as the `warm` slice of its
   * counter (mobile-parity plan Phase 3.2: assets 0.70 + warm 0.30) so the
   * readout breathes through the last stretch instead of parking at one
   * value while the pipelines compile. `warmReady` stays the boolean truth
   * gate — `warmProgress === 1` alone is never read as "warm".
   */
  warmProgress: number;
  setWarmProgress: (p: number) => void;
}

/**
 * Pinned on globalThis, for the reason textMorphStore records verbatim: this
 * module is imported from BOTH the route bundle (the preloader, the hero
 * panel, the intro gate) and the lazy `ssr:false` WebGL island (HeroLogo,
 * HeroTextParticles, HomeSingularity, SignatureLine, PipelineWarmup,
 * PostFXNodes, AdaptiveResolution). A bundler that inlines a copy of this
 * small module into each chunk gives the two sides two live stores — the
 * preloader's `complete()` then never reaches the island's `introComplete`
 * read, the wordmark's HOLD never lifts and the page stays black. The pin
 * makes every bundled copy resolve to the single real store. Dev shares one
 * module graph, so this class of failure only ever shows in production.
 *
 * The module REFS above are pinned for the same reason and are the same
 * hazard: `introProgressRef` is written by the preloader (route bundle) and
 * read by HeroLogo (island) every frame — two copies means the spore mark
 * never scrubs with the counter.
 */
const createIntroStore = () =>
  create<IntroState>((set, get) => ({
    introComplete: false,
    complete: () => set({ introComplete: true }),
    heroStageReady: false,
    setHeroStageReady: () => {
      if (!get().heroStageReady) set({ heroStageReady: true });
    },
    wordmarkFormed: false,
    setWordmarkFormed: () => {
      if (!get().wordmarkFormed) set({ wordmarkFormed: true });
    },
    brandBeatSkipped: false,
    setBrandBeatSkipped: () => {
      if (!get().brandBeatSkipped) set({ brandBeatSkipped: true });
    },
    warmReady: false,
    // Ready ⇒ progress is 1 by definition (monotonic: never lowered after).
    setWarmReady: () => set({ warmReady: true, warmProgress: 1 }),
    warmProgress: 0,
    // Clamped to [0,1] and monotonic: a late compileAsync resolution (0.5)
    // after the heuristic already set 1 must not pull the counter back.
    setWarmProgress: (p) => {
      const next = Math.min(1, Math.max(0, p));
      if (Number.isNaN(next) || next <= get().warmProgress) return;
      set({ warmProgress: next });
    },
  }));

declare global {
  /* eslint-disable no-var */
  var __sersanIntroStore: ReturnType<typeof createIntroStore> | undefined;
  var __sersanIntroProgressRef: { current: number } | undefined;
  var __sersanIntroCamShiftRef: { current: number } | undefined;
  var __sersanIntroHeadRaiseRef: { current: number } | undefined;
  var __sersanIntroHoleRef: { current: number } | undefined;
  var __sersanIntroZoomRef: { current: number } | undefined;
  /* eslint-enable no-var */
}

export const useIntroStore = (globalThis.__sersanIntroStore ??=
  createIntroStore());
