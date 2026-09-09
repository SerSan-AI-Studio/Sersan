"use client";

/**
 * beat-choreographer — the DOM/GSAP half of the hero beat engine
 * (kill-switch: SPINE_BEATS in src/lib/spine.ts; the pure law lives in
 * src/lib/spine-beats.ts).
 *
 * WHAT IT REPLACES. Until 2026-08-27 the spine's text panels (01..04) and the
 * passage's panel 05 were SCRUBBED: a per-frame `panelOpacity(progress)` wrote
 * whole-panel opacity + a 16px translate. The owner rejected that look
 * ("non devono essere più stile slide-scroll le scritte, ma animazioni
 * professionali GSAP stile Lusion"). This module keeps the scroll geometry,
 * the single scrubbed ScrollTrigger, `progressRef`, the snap stations and
 * every store contract untouched, and turns the SAME progress into DISCRETE
 * beat transitions (spine-beats.resolveActiveBeat) that play TRIGGERED
 * per-beat timelines:
 *
 *   ENTER (paused, house ease)           EXIT (power3.in, ≤ 0.45s)
 *   ─────────────────────────────────    ─────────────────────────────────
 *   rule       scaleX 0→1 (0.8s)         title words  yPercent 0→−110 (down)
 *   index cols yPercent −500→0 (R1)                   or 0→+115 (scroll-back)
 *   eyebrow    x −8→0 + decode event     title        blur 0→6px (level 3 only)
 *   title      words rise 115→0 in       body         autoAlpha→0, y ∓14
 *              line masks + x trail      eyebrow      autoAlpha→0, x −12
 *   body       B1 word-wave              rule         scaleX 1→0 (origin right)
 *   companion block plays 0.15s AHEAD of the lead (01 lands before 02).
 *
 * Exits are clean cuts, never fades: on complete the panel root goes
 * autoAlpha 0 + inert + aria-hidden + pointer-events none and the ENTER is
 * re-armed to its FROM pose (Lusion `_needsReset`), so the next entrance
 * replays. Entrances are always rise-from-below (owner decision); exits are
 * directional.
 *
 * TIERS. `compact` (CompactSpine / lite passage) scales every duration by
 * COMPACT_TIME_SCALE (ENTER ≈ 0.9s, EXIT ≈ 0.3s); `level ≤ 1` on compact
 * skips SplitText entirely (whole-block autoAlpha + y, the Lusion ≤812px
 * fallback); blur exists only at level 3 on desktop and is cleared with
 * clearProps on complete. Reduced motion mounts nothing (the hook early-
 * returns; the spine routes RM to StackedFallback anyway).
 *
 * THE HERO (beat 0) is special: while the WebGL text-particle intro owns it
 * (`textMorphStore.active`) its ENTER stays the domReveal-scrubbed cascade in
 * StagePanel's rAF (verbatim — the gate replays it in reverse, HomeSingularity
 * melts on the same value). This engine only plays a GSAP one-shot ENTER for
 * the hero when the intro is NOT active (fallback tiers, WebGL2, skipped
 * intro) — fired on `introStore.introComplete` so it never plays under the
 * preloader curtain — and owns the hero's EXIT + every re-entrance on scroll-
 * back. It never tweens the H1's own opacity (the morph rAF owns it) and never
 * transforms a panel root.
 *
 * FAST-SCROLL HARDENING (dossier §10.6): a running ENTER is progress(1)'d
 * before its EXIT; a running EXIT is progress(1)'d before the next ENTER;
 * beats skipped in one frame (End key, scrollbar jump) are set to their
 * rest-hidden pose with no timeline; at p ≥ PIN_END_FORCE the ship beat's
 * exit is forced complete so the sticky stage is EMPTY when the pin releases
 * onto the already-pinned passage (owner round 4).
 *
 * MARKUP CONTRACT (StagePanel / passage panel 05):
 *   [data-beat="<index>"]        panel root (the engine sets autoAlpha/inert)
 *   [data-beat-of="<blockId>"]   on every part; parts are grouped per block
 *   [data-beat-rule]             1px hairline (drawn scaleX)
 *   [data-beat-eyebrow]          the .eyebrow label (data-scramble-done="1"
 *                                so the global LabelScrambler leaves it to
 *                                the ENTER's "sersan:scramble" event)
 *   [data-roll-col]              RollLetters columns of the "0N" index
 *   [data-beat-title]            H1/H2 — SplitText lines,words + line masks
 *   [data-beat-body]             body paragraph — SplitText words
 *   [data-beat-tail]             trailing blocks (proof chips, CTA row):
 *                                whole-block autoAlpha + y after the body
 *   [data-hero-stagger]          hero cluster (eyebrow · sub · CTA pair)
 * Split targets MUST carry key={language} (rebuild via revertOnUpdate).
 */

import { useRef, type RefObject } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { rollDelay } from "@/components/fx/roll-letters";
import { lusionEase } from "@/components/fx/lusion-ease";
import { SPINE_BEATS } from "@/lib/spine";
import { resolveActiveBeat, type BeatWindow } from "@/lib/spine-beats";
import { useTextMorphStore } from "@/webgl/store/textMorphStore";
import { useIntroStore } from "@/webgl/store/introStore";
import { useTierStore } from "@/webgl/store/tierStore";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, SplitText);
}

// === Knobs ==================================================================

/** Compact (phone) timing scale: ENTER ~0.9s / EXIT ~0.3s. */
const COMPACT_TIME_SCALE = 0.68;
/** Spine progress at/after which the last beat's exit is forced complete. */
export const PIN_END_FORCE = 0.984;
/** Companion → lead cascade offset inside a merged panel (s). */
const BLOCK_CASCADE = 0.15;
/** Exit blur ceiling (px), desktop level 3 only. */
const EXIT_BLUR_PX = 6;
/**
 * Hero one-shot arming (review R1 major): on a WebGPU backend the particle
 * intro publishes `textMorphStore.active` ASYNCHRONOUSLY (after its sim
 * build resolves — the preloader deliberately does not wait for it, and on
 * an SPA nav into `/` the store is `false` at the first tick by
 * construction). `!morph.active` at introComplete is therefore NOT proof
 * that the intro is absent. While the backend can still arm the morph
 * (`webgpu`, or unresolved with the scene not `off`) the GSAP one-shot waits
 * up to this many ms after introComplete for `active` to flip; if it never
 * does (sim refused, anchor missing, WebGL2) the one-shot plays. 0 = never
 * wait (the pre-review behaviour).
 */
const HERO_MORPH_GRACE_MS = 2500;
/** domReveal cascade pose for [data-hero-stagger] kid `i` (StagePanel's
 * formula, verbatim — re-applied here wherever the engine must yield the
 * cluster back to the morph rAF, which only rewrites on reveal CHANGES). */
const heroKidPose = (reveal: number, i: number) => {
  const t = Math.min(1, Math.max(0, (reveal - i * 0.14) / 0.55));
  const e = t * t * (3 - 2 * t);
  return { opacity: e, y: (1 - e) * 26 };
};

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// === Types ==================================================================

export type BeatState = "hidden" | "entering" | "lit" | "exiting";

export type BeatBuildOpts = {
  compact: boolean;
  level: number;
  isHero: boolean;
  /** When false the caller owns the root's opacity + inert (the passage:
   * compose()/apply(t) write them as pure functions of progress). Default
   * true. */
  ownsRoot?: boolean;
  /** Fired when the beat reaches its hidden rest pose (exit complete or
   * hide()) — the caller's hook for its own interactivity cache. */
  onHidden?: () => void;
};

export type BeatHandle = {
  el: HTMLElement;
  /** Current state (read-only from outside). */
  readonly state: BeatState;
  /** Play the entrance (rise from below). Finishes a running exit first.
   * `force` replays even from the lit rest pose (the hero's one-shot intro
   * on the SSR-visible panel). */
  enter: (force?: boolean) => void;
  /** Play the exit; dir 1 = scrolling forward (out-up), −1 = back (out-down).
   * `instant` jumps to the end pose (pin-end guarantee / flicks). */
  exit: (dir: 1 | -1, instant?: boolean) => void;
  /** Jump to the lit rest pose (no motion): rebuilds mid-spine, plunge. */
  settle: () => void;
  /** Jump to the hidden rest pose and re-arm the entrance. */
  hide: () => void;
  /** Complete a running entrance instantly (keeps state lit). */
  finishEnter: () => void;
  /** Hero only: stop any running ENTER and hand the [data-hero-stagger]
   * cluster to the domReveal cascade at `reveal` (StagePanel's rAF pose,
   * re-applied because that rAF only rewrites on reveal changes). State
   * becomes lit; the H1 is never touched. */
  yieldToReveal: (reveal: number) => void;
  dispose: () => void;
};

type BlockParts = {
  rule: HTMLElement | null;
  eyebrow: HTMLElement | null;
  cols: HTMLElement[];
  title: HTMLElement | null;
  titleWords: Element[] | null;
  body: HTMLElement | null;
  bodyWords: Element[] | null;
  tails: HTMLElement[];
};

/** pointer-events + inert + aria-hidden flipped together (StagePanel's lit
 * discipline, verbatim). */
export function setBeatLit(el: HTMLElement, on: boolean): void {
  el.style.pointerEvents = on ? "auto" : "none";
  (el as HTMLElement & { inert: boolean }).inert = !on;
  if (on) el.removeAttribute("aria-hidden");
  else el.setAttribute("aria-hidden", "true");
}

// === Builder ================================================================

export function createBeat(el: HTMLElement, opts: BeatBuildOpts): BeatHandle {
  const ownsRoot = opts.ownsRoot !== false;
  // Dossier §10.7: fxBudget.level <= 1 ⇒ no SplitText on EITHER tier (whole-
  // block autoAlpha + y), so a stepped-down desktop never animates ~200 spans.
  const words = opts.level >= 2;
  const blur = !opts.compact && opts.level >= 3;
  const s = opts.compact ? COMPACT_TIME_SCALE : 1;

  // ── Parts, grouped per block in DOM order ────────────────────────────────
  const order: string[] = [];
  const byId = new Map<string, BlockParts>();
  el.querySelectorAll<HTMLElement>("[data-beat-of]").forEach((part) => {
    const id = part.dataset.beatOf ?? "";
    let b = byId.get(id);
    if (!b) {
      b = {
        rule: null,
        eyebrow: null,
        cols: [],
        title: null,
        titleWords: null,
        body: null,
        bodyWords: null,
        tails: [],
      };
      byId.set(id, b);
      order.push(id);
    }
    if (part.hasAttribute("data-beat-rule")) b.rule = part;
    else if (part.hasAttribute("data-beat-eyebrow")) {
      b.eyebrow = part;
      b.cols = Array.from(part.querySelectorAll<HTMLElement>("[data-roll-col]"));
    } else if (part.hasAttribute("data-beat-title")) b.title = part;
    else if (part.hasAttribute("data-beat-body")) b.body = part;
    else if (part.hasAttribute("data-beat-tail")) b.tails.push(part);
  });
  const blocks = order.map((id) => byId.get(id)!);
  const heroKids = opts.isHero
    ? Array.from(el.querySelectorAll<HTMLElement>("[data-hero-stagger]"))
    : [];

  // ── Splits (fonts are settled — the caller gates on fonts.ready) ─────────
  const splits: SplitText[] = [];
  const flexed: HTMLElement[] = [];
  if (words) {
    for (const b of blocks) {
      if (b.title) {
        const sp = new SplitText(b.title, {
          type: "lines,words",
          mask: "lines",
          linesClass: "split-line",
        });
        splits.push(sp);
        b.titleWords = sp.words;
        // globals.css only flexes [data-split-reveal] parents; impose the
        // column inline for the split's lifetime (lusion-type discipline) so
        // the masks' negative block margins never collapse.
        gsap.set(b.title, { display: "flex", flexDirection: "column" });
        flexed.push(b.title);
      }
      if (b.body) {
        // aria:"none" — SplitText's default ("auto") writes an `aria-label`
        // onto the split element and `aria-hidden` onto the parts. On a <p>
        // that label is a PROHIBITED attribute (role `paragraph` does not
        // support naming), and it is the only thing keeping the Lighthouse
        // accessibility category off 100. Safe here because the split is
        // `type: "words"`: every span still holds a real word, so the
        // paragraph reads normally — the label only exists to repair a
        // CHARACTER split, which this is not. Do NOT copy this to the title
        // split above: on <h1>/<h2> the label is valid and useful.
        const sp = new SplitText(b.body, { type: "words", aria: "none" });
        splits.push(sp);
        b.bodyWords = sp.words;
      }
    }
  }

  const allParts: HTMLElement[] = [];
  for (const b of blocks) {
    if (b.rule) allParts.push(b.rule);
    if (b.eyebrow) allParts.push(b.eyebrow);
    if (b.title) allParts.push(b.title);
    if (b.body) allParts.push(b.body);
    allParts.push(...b.cols);
    allParts.push(...b.tails);
  }
  allParts.push(...heroKids);

  let state: BeatState = "lit";
  let enterTl: gsap.core.Timeline | null = null;
  let exitDownTl: gsap.core.Timeline | null = null;
  let exitUpTl: gsap.core.Timeline | null = null;

  // ENTER is created LAZILY: every fromTo primes its FROM pose at creation
  // (immediateRender), which is exactly right for a hidden panel but must
  // NOT happen to the hero while the particle intro owns its cluster.
  const makeEnter = () => {
    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: lusionEase() },
      onComplete: () => {
        if (state === "entering") state = "lit";
      },
    });
    blocks.forEach((b, bi) => {
      const at = bi * BLOCK_CASCADE * s;
      if (b.rule) {
        tl.fromTo(
          b.rule,
          { scaleX: 0, transformOrigin: "0% 50%" },
          { scaleX: 1, duration: 0.8 * s, immediateRender: true },
          at,
        );
      }
      if (b.eyebrow) {
        const label = b.eyebrow;
        tl.fromTo(
          label,
          { autoAlpha: 0, x: -8 },
          { autoAlpha: 1, x: 0, duration: 0.5 * s, ease: "expo.out", immediateRender: true },
          at,
        );
        // LabelScrambler re-trigger (label-scrambler.tsx): the eyebrow ships
        // data-scramble-done="1" so the global IO never decodes it while its
        // panel is invisible; each ENTER decodes it on arrival.
        tl.call(
          () => {
            label.dispatchEvent(new CustomEvent("sersan:scramble", { bubbles: true }));
          },
          undefined,
          at + 0.02,
        );
      }
      const n = b.cols.length;
      b.cols.forEach((col, i) => {
        tl.fromTo(
          col,
          { yPercent: -500 },
          { yPercent: 0, duration: 1.0 * s, ease: "expo.inOut", immediateRender: true },
          at + rollDelay(i, n),
        );
      });
      if (b.title) {
        if (b.titleWords) {
          tl.fromTo(
            b.titleWords,
            { yPercent: 115 },
            { yPercent: 0, duration: 0.85 * s, stagger: 0.022 * s, immediateRender: true },
            at + 0.08 * s,
          );
          tl.fromTo(
            b.titleWords,
            { x: 70 },
            { x: 0, duration: 0.85 * s, stagger: 0.022 * s, immediateRender: true },
            at + 0.28 * s,
          );
        } else {
          tl.fromTo(
            b.title,
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: 0.7 * s, ease: "expo.out", immediateRender: true },
            at + 0.08 * s,
          );
        }
      }
      if (b.body) {
        if (b.bodyWords) {
          // The EXIT writes the body ELEMENT (autoAlpha/y); undo that at 0
          // so the word-wave below plays on a visible paragraph.
          tl.set(b.body, { autoAlpha: 1, y: 0 }, 0);
          tl.fromTo(
            b.bodyWords,
            { autoAlpha: 0.1, yPercent: 100 },
            {
              autoAlpha: 1,
              yPercent: 0,
              duration: 0.8 * s,
              ease: "expo.out",
              stagger: 0.006 * s,
              immediateRender: true,
            },
            at + 0.3 * s,
          );
        } else {
          tl.fromTo(
            b.body,
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.6 * s, ease: "expo.out", immediateRender: true },
            at + 0.3 * s,
          );
        }
      }
      if (b.tails.length) {
        tl.fromTo(
          b.tails,
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7 * s,
            ease: "expo.out",
            stagger: 0.08 * s,
            immediateRender: true,
          },
          at + 0.45 * s,
        );
      }
    });
    if (heroKids.length) {
      tl.fromTo(
        heroKids,
        { autoAlpha: 0, y: 26 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9 * s,
          ease: "expo.out",
          stagger: 0.1 * s,
          immediateRender: true,
        },
        0.3 * s,
      );
    }
    return tl;
  };
  const getEnter = () => (enterTl ??= makeEnter());

  const onExitDone = () => {
    if (state === "hidden") return;
    state = "hidden";
    if (ownsRoot) {
      gsap.set(el, { autoAlpha: 0 });
      setBeatLit(el, false);
    }
    // Re-arm: the ENTER's FROM poses (Lusion `_needsReset`).
    enterTl?.pause(0);
    opts.onHidden?.();
  };

  const makeExit = (dir: 1 | -1) => {
    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: "power3.in" },
      onComplete: onExitDone,
    });
    for (const b of blocks) {
      if (b.title) {
        if (b.titleWords) {
          tl.to(
            b.titleWords,
            {
              yPercent: dir > 0 ? -110 : 115,
              duration: 0.4 * s,
              stagger: { each: 0.008 * s, from: dir > 0 ? "end" : "start" },
            },
            0,
          );
        } else {
          tl.to(b.title, { autoAlpha: 0, y: dir > 0 ? -16 : 16, duration: 0.3 * s }, 0);
        }
        if (blur) {
          tl.fromTo(
            b.title,
            { filter: "blur(0px)" },
            { filter: `blur(${EXIT_BLUR_PX}px)`, duration: 0.4 * s, immediateRender: false },
            0,
          );
          tl.set(b.title, { clearProps: "filter" });
        }
      }
      if (b.body) {
        tl.to(b.body, { autoAlpha: 0, y: dir > 0 ? -14 : 14, duration: 0.3 * s }, 0);
      }
      if (b.eyebrow) {
        tl.to(b.eyebrow, { autoAlpha: 0, x: -12, duration: 0.28 * s }, 0.05 * s);
      }
      if (b.rule) {
        tl.to(
          b.rule,
          { scaleX: 0, transformOrigin: "100% 50%", duration: 0.3 * s },
          0.08 * s,
        );
      }
      if (b.tails.length) {
        tl.to(b.tails, { autoAlpha: 0, y: dir > 0 ? -12 : 12, duration: 0.3 * s }, 0.04 * s);
      }
    }
    if (heroKids.length) {
      tl.to(
        heroKids,
        { autoAlpha: 0, y: dir > 0 ? -14 : 14, duration: 0.3 * s, stagger: 0.03 * s },
        0,
      );
    }
    return tl;
  };
  const getExit = (dir: 1 | -1) =>
    dir > 0 ? (exitDownTl ??= makeExit(1)) : (exitUpTl ??= makeExit(-1));

  const finishExit = () => {
    if (state !== "exiting") return;
    if (exitDownTl?.isActive()) exitDownTl.progress(1);
    if (exitUpTl?.isActive()) exitUpTl.progress(1);
    if ((state as BeatState) === "exiting") onExitDone();
  };

  // Seeks pass suppressEvents=true: the eyebrow decode `.call` must fire only
  // when an ENTER actually PLAYS across it, never on a settle/finish jump.
  const finishEnter = () => {
    if (state !== "entering") return;
    enterTl?.progress(1, true);
    state = "lit";
  };

  const yieldToReveal = (reveal: number) => {
    if (!heroKids.length) return;
    enterTl?.pause();
    gsap.killTweensOf(heroKids);
    state = "lit";
    heroKids.forEach((k, i) => {
      const pose = heroKidPose(reveal, i);
      gsap.set(k, { opacity: pose.opacity, visibility: "inherit", y: pose.y });
    });
  };

  const enter = (force = false) => {
    finishExit();
    if (!force && (state === "entering" || state === "lit")) return;
    state = "entering";
    if (ownsRoot) {
      gsap.set(el, { autoAlpha: 1 });
      setBeatLit(el, true);
    }
    const tl = getEnter();
    tl.pause(0);
    tl.play(0);
  };

  const exit = (dir: 1 | -1, instant = false) => {
    if (state === "hidden") return;
    if (state === "exiting") {
      if (instant) finishExit();
      return;
    }
    finishEnter();
    state = "exiting";
    const tl = getExit(dir);
    // `.to` tweens record start values on first render — always re-record
    // from the current (rest) pose so a previous run can never leak.
    tl.invalidate();
    if (instant) {
      tl.pause(0);
      tl.progress(1);
      if (state === "exiting") onExitDone();
    } else {
      tl.play(0);
    }
  };

  const settle = () => {
    exitDownTl?.pause(0);
    exitUpTl?.pause(0);
    const tl = getEnter();
    tl.pause();
    tl.progress(1, true);
    state = "lit";
    if (ownsRoot) {
      gsap.set(el, { autoAlpha: 1 });
      setBeatLit(el, true);
    }
  };

  const hide = () => {
    exitDownTl?.pause(0);
    exitUpTl?.pause(0);
    // Build the ENTER if needed: its fromTo FROM poses ARE the hidden rest
    // pose of the parts, which `ownsRoot:false` callers (passage panel 05,
    // the phone plate) rely on since nobody else hides their root.
    getEnter().pause(0);
    state = "hidden";
    if (ownsRoot) {
      gsap.set(el, { autoAlpha: 0 });
      setBeatLit(el, false);
    }
    opts.onHidden?.();
  };

  const dispose = () => {
    enterTl?.kill();
    exitDownTl?.kill();
    exitUpTl?.kill();
    enterTl = exitDownTl = exitUpTl = null;
    gsap.killTweensOf(allParts);
    for (const sp of splits) sp.revert();
    // A rebuild under a live, un-revealed morph (EN/IT toggle mid-gate) must
    // not blink the cluster visible: leave the kids' cascade pose in place.
    const m = useTextMorphStore.getState();
    const keepKids = heroKids.length > 0 && m.active && m.domReveal < 1;
    const toClear = keepKids ? allParts.filter((p) => !heroKids.includes(p)) : allParts;
    gsap.set(toClear, { clearProps: "opacity,visibility,transform,filter" });
    if (flexed.length) gsap.set(flexed, { clearProps: "display,flexDirection" });
    if (ownsRoot) gsap.set(el, { clearProps: "visibility" });
  };

  const handle: BeatHandle = {
    el,
    get state() {
      return state;
    },
    enter,
    exit,
    settle,
    hide,
    finishEnter,
    yieldToReveal,
    dispose,
  };
  if (process.env.NODE_ENV !== "production") {
    // Dev-only introspection for the Playwright harness (scratchpad pw/beats.mjs).
    (handle as BeatHandle & { debug?: () => Record<string, unknown> }).debug = () => ({
      state,
      enter: enterTl ? { p: enterTl.progress(), active: enterTl.isActive(), paused: enterTl.paused(), dur: enterTl.duration() } : null,
      exitDown: exitDownTl ? { p: exitDownTl.progress(), active: exitDownTl.isActive(), paused: exitDownTl.paused() } : null,
      exitUp: exitUpTl ? { p: exitUpTl.progress(), active: exitUpTl.isActive(), paused: exitUpTl.paused() } : null,
    });
  }
  return handle;
}

// === The spine hook =========================================================

export function useSpineBeats({
  scope,
  progressRef,
  windows,
  language,
  enabled,
  compact,
}: {
  scope: RefObject<HTMLElement | null>;
  progressRef: React.MutableRefObject<number>;
  windows: BeatWindow[];
  language: string;
  /** false ⇒ mounts nothing (the legacy crossfade path stays in charge). */
  enabled: boolean;
  compact: boolean;
}): void {
  const level = useTierStore((s) => s.fxBudget.level);
  // Survives language rebuilds: the hero's one-shot intro fires once per page.
  const heroDoneRef = useRef(false);

  useGSAP(
    () => {
      if (!enabled || !SPINE_BEATS) return;
      if (reducedMotion()) return;
      const root = scope.current;
      if (!root) return;
      const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-beat]")).sort(
        (a, b) => Number(a.dataset.beat) - Number(b.dataset.beat),
      );
      if (panels.length === 0) return;

      let cancelled = false;
      let raf = 0;
      let beats: BeatHandle[] = [];

      document.fonts?.ready
        .then(() => {
          if (cancelled) return;
          beats = panels.map((el, i) =>
            createBeat(el, { compact, level, isHero: i === 0 }),
          );
          if (process.env.NODE_ENV !== "production") {
            const w = window as Window & { __spineBeats?: BeatHandle[]; __gsap?: typeof gsap };
            w.__spineBeats = beats;
            // The harness disables ticker lag smoothing under software GL
            // (frames > 500ms would otherwise slow every timeline ~30x).
            w.__gsap = gsap;
          }
          const count = Math.min(beats.length, windows.length);
          const wins = windows.slice(0, count);

          // Prime against the current progress (SPA nav / scroll restoration /
          // language rebuild can land mid-spine): the active beat at rest, the
          // rest hidden + armed. The hero at p≈0 before its intro has fired is
          // left on its SSR pose (the morph rAF or the one-shot below owns it).
          let active = resolveActiveBeat(progressRef.current, null, wins);
          const morph0 = useTextMorphStore.getState();
          beats.forEach((b, i) => {
            if (i >= count) return;
            if (i === active) {
              if (i === 0 && morph0.active && morph0.domReveal < 1) {
                // Rebuild under the un-revealed intro (EN/IT toggle mid-gate):
                // the cluster stays the domReveal writer's; re-apply its pose
                // (the previous handle's dispose left it, the rAF only writes
                // on change) instead of forcing the ENTER's lit rest pose.
                heroDoneRef.current = true;
                b.yieldToReveal(morph0.domReveal);
              } else if (!(i === 0 && !heroDoneRef.current)) {
                b.settle();
              }
            } else {
              b.hide();
            }
          });

          let lastP = progressRef.current;
          let dir: 1 | -1 = 1;
          let heroLit: boolean | null = null;
          // performance.now() at which introComplete was first observed.
          let introSeenAt = -1;

          const tick = () => {
            const p = progressRef.current;
            if (p !== lastP) {
              dir = p > lastP ? 1 : -1;
              lastP = p;
            }
            const morph = useTextMorphStore.getState();
            const hero = beats[0];

            // The hero's first entrance: domReveal-scrubbed while the particle
            // intro is active (StagePanel's rAF), else a GSAP one-shot fired
            // when the preloader hands the page over. `active` is published
            // asynchronously by the WebGPU sim, so a false read is only
            // conclusive once the backend cannot arm it, or after
            // HERO_MORPH_GRACE_MS (see the knob).
            if (!heroDoneRef.current && useIntroStore.getState().introComplete) {
              if (morph.active) {
                heroDoneRef.current = true;
              } else {
                const now = performance.now();
                if (introSeenAt < 0) introSeenAt = now;
                const tier = useTierStore.getState();
                const mayMorph =
                  tier.backend === "webgpu" || (tier.backend === null && tier.tier !== "off");
                if (!mayMorph || now - introSeenAt >= HERO_MORPH_GRACE_MS) {
                  heroDoneRef.current = true;
                  if (active === 0 && hero) hero.enter(true);
                }
              }
            }
            // The gate replay (and a late sim build) writes the cluster from
            // domReveal — never fight it with a running tween: stop the ENTER
            // and hand the kids over at the current reveal.
            if (hero && morph.active && morph.domReveal < 1 && hero.state === "entering") {
              hero.yieldToReveal(morph.domReveal);
            }

            const next = resolveActiveBeat(p, active, wins);
            if (next !== active) {
              if (active !== null) beats[active]?.exit(dir, p >= PIN_END_FORCE);
              if (next !== null && active !== null && Math.abs(next - active) > 1) {
                const lo = Math.min(next, active);
                const hi = Math.max(next, active);
                for (let k = lo + 1; k < hi; k++) beats[k]?.hide();
              }
              if (next !== null) beats[next]?.enter();
              active = next;
            } else if (active === count - 1 && p >= PIN_END_FORCE) {
              // Pin-end guarantee: the stage must be empty when it unpins.
              beats[active]?.exit(1, true);
              active = null;
            }

            // Hero interactivity under the intro: the cluster only counts as
            // visible once the cascade is actually in (hidden CTAs must never
            // be clickable) — StagePanel's `reveal > 0.5` rule, verbatim.
            if (hero) {
              const lit = hero.state !== "hidden" && (!morph.active || morph.domReveal > 0.5);
              if (lit !== heroLit) {
                heroLit = lit;
                setBeatLit(hero.el, lit);
              }
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        })
        .catch(() => {});

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        beats.forEach((b) => b.dispose());
        beats = [];
      };
    },
    { scope, dependencies: [language, enabled, compact, level], revertOnUpdate: true },
  );
}
