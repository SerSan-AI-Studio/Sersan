"use client";

/**
 * HeadingChoreographer — editorial line-mask reveals (award sprint, Phase B).
 *
 * Every element marked `data-split-reveal` gets a GSAP SplitText line
 * reveal: lines rise out of a mask, staggered, on scroll-enter. Splits are
 * rebuilt whenever the language or route changes (the EN/IT swap replaces
 * text in place — re-splitting by construction kills the recon's stale-
 * splits risk). Reduced-motion: no split, headings just exist.
 *
 * CONTRACT for subscribers: a heading whose text depends on the language MUST
 * also carry `key={language}`. SplitText owns the heading's subtree once
 * split (revert() restores an innerHTML snapshot), so React's child fibers
 * are orphaned — an in-place EN/IT text update would write to detached nodes
 * and the visible heading would stay stuck in the old language. key={language}
 * remounts a fresh React-owned subtree each toggle; this effect's cleanup
 * reverts the old (now detached) split harmlessly and re-splits the new node.
 * Same rule SectionHeading documents for its own h2.
 *
 * SplitText is free since GSAP joined Webflow; `mask: "lines"` wraps each
 * line in an overflow clip so no CSS is needed.
 */
import { useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { useLanguage } from "@/components/language-provider";
import { useScrollStore } from "@/webgl/store/scrollStore";
import type { HeadingReveal } from "@/components/ui/section-heading";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

// Base reveal feel (the design tokens — these stay fixed; only stagger/offset/
// duration are modulated by scroll velocity within tight, clamped bounds).
const BASE_Y_PERCENT = 115;
const BASE_DURATION = 0.85;
const BASE_STAGGER = 0.09;

/**
 * Velocity → motion-factor mapping. Lenis velocity is roughly px/frame; at a
 * gentle scroll it sits near 0–10, a brisk flick reaches the tens. We normalise
 * |velocity| into a 0..1 band and lerp the reveal between a "calm" and a
 * "snappy" feel. The factor is computed ONCE, at the moment the heading enters
 * (in the ScrollTrigger onEnter), so there is no per-frame work and the reveal
 * stays a single, self-contained tween.
 */
const VELOCITY_FULL = 45; // |velocity| at/above which the snappy end is reached
function velocityFactor(velocity: number): number {
  return gsap.utils.clamp(0, 1, Math.abs(velocity) / VELOCITY_FULL);
}

/**
 * 'chars' splits every glyph — too heavy on long copy — so it is perf-scoped to
 * short headings; anything longer silently degrades to the 'lines' rise.
 */
const CHARS_MAX_LEN = 40;

/** Resolve a heading's variant: its own `data-reveal`, else the mount default. */
function resolveReveal(el: HTMLElement, fallback: HeadingReveal): HeadingReveal {
  const attr = el.dataset.reveal;
  if (
    attr === "lines" ||
    attr === "chars" ||
    attr === "words" ||
    attr === "skew" ||
    attr === "blur"
  ) {
    return attr;
  }
  return fallback;
}

export function HeadingChoreographer({
  reveal = "lines",
}: {
  /**
   * Default reveal for every `[data-split-reveal]` that does NOT carry its own
   * `data-reveal="…"` attribute. Individual headings override per-instance via
   * `data-reveal`. Default 'lines' keeps the historical line-mask rise for the
   * whole site. See SectionHeading's `reveal` prop for the vocabulary.
   */
  reveal?: HeadingReveal;
} = {}) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const targets = Array.from(
        document.querySelectorAll<HTMLElement>("[data-split-reveal]"),
      );
      if (targets.length === 0) return;

      const splits: SplitText[] = [];
      const triggers: ScrollTrigger[] = [];
      const tweens: gsap.core.Tween[] = [];
      // The split + trigger creation happens inside an async fonts.ready
      // callback — after useGSAP has already snapshotted its context — so these
      // are NOT auto-collected by gsap.context. Track and tear them down by hand
      // in the returned cleanup (mirrors SectionHeading's manual revert/kill).
      let cancelled = false;
      // Fonts must be settled or line boxes split wrong mid-swap.
      document.fonts?.ready.then(() => {
        if (cancelled) return;
        targets.forEach((el) => {
          // Per-heading variant (data-reveal) over the mount default. 'chars'
          // degrades to 'lines' on long copy so we never split hundreds of
          // glyphs on a paragraph-length heading.
          let variant = resolveReveal(el, reveal);
          if (
            variant === "chars" &&
            (el.textContent?.length ?? 0) > CHARS_MAX_LEN
          ) {
            variant = "lines";
          }

          // Split granularity + mask follow the variant. 'blur' is deliberately
          // UNmasked: the CSS blur must bleed past each line box, so a clip
          // would eat the focus-in halo.
          // SplitText's default `aria:"auto"` writes an `aria-label` onto the
          // split element and `aria-hidden` onto its parts. On a heading the
          // label is valid and useful. On a <p> it is a PROHIBITED attribute
          // (role `paragraph` does not support naming) and fails axe's
          // `aria-prohibited-attr` — at least one `[data-split-reveal]` in the
          // tree is a paragraph, and it was the last thing holding the
          // Lighthouse accessibility category below 100.
          //
          // Dropping it is safe for the word/line variants: each part still
          // carries real text, so removing BOTH the label and the parts'
          // aria-hidden leaves the element read normally. The 'chars' variant
          // always keeps "auto" — a character split genuinely needs the label,
          // or assistive tech spells the string out letter by letter.
          const ariaMode =
            variant === "chars" || /^H[1-6]$/.test(el.tagName)
              ? "auto"
              : "none";
          let split: SplitText;
          let parts: Element[];
          if (variant === "chars") {
            split = new SplitText(el, {
              type: "chars",
              mask: "chars",
              charsClass: "split-char",
              aria: "auto",
            });
            parts = split.chars;
          } else if (variant === "words") {
            split = new SplitText(el, {
              type: "words",
              mask: "words",
              wordsClass: "split-word",
              aria: ariaMode,
            });
            parts = split.words;
          } else if (variant === "blur") {
            split = new SplitText(el, {
              type: "lines",
              linesClass: "split-line",
              aria: ariaMode,
            });
            parts = split.lines;
          } else {
            // 'lines' and 'skew' both rise out of a per-line clip.
            split = new SplitText(el, {
              type: "lines",
              mask: "lines",
              linesClass: "split-line",
              aria: ariaMode,
            });
            parts = split.lines;
          }
          splits.push(split);
          // Hide the parts deterministically before reveal. The reveal tween
          // itself is built lazily inside fire(): the velocity sample is taken
          // the instant the heading reveals (onEnter) — not at split-build time.
          // Faster scroll → a snappier, slightly larger stagger + offset + a
          // hair quicker duration; slow/idle → the gentle baseline. The clamp
          // keeps fast scroll premium, never chaotic. Easing token (expo.out)
          // is untouched.
          //
          // NOTE: a paused gsap.from + invalidate().restart() is a trap here —
          // invalidate() makes the from-tween re-capture the CURRENT value as
          // its destination, and by fire-time the parts already sit hidden, so
          // the tween becomes a no-op and the heading stays masked forever.
          // gsap.fromTo with explicit endpoints is immune to that capture.
          if (variant === "blur") {
            gsap.set(parts, {
              autoAlpha: 0,
              filter: "blur(12px)",
              scale: 1.03,
              transformOrigin: "left center",
            });
          } else if (variant === "skew") {
            gsap.set(parts, {
              yPercent: BASE_Y_PERCENT,
              rotationX: -38,
              skewY: 4,
              transformOrigin: "left top",
              transformPerspective: 700,
            });
          } else {
            gsap.set(parts, { yPercent: BASE_Y_PERCENT });
          }
          // Velocity-modulated reveal body, shared by the scroll trigger AND the
          // creation-time in-view check below. fired-guard: the creation-time
          // in-view check and a later onEnter can BOTH call fire().
          let fired = false;
          const fire = () => {
            if (fired) return;
            fired = true;
            const f = velocityFactor(useScrollStore.getState().velocity);
            let tween: gsap.core.Tween;
            if (variant === "blur") {
              // Pure CSS filter focus-in (GPU-composited, no WebGL). Staggered
              // so at most a line or two blurs concurrently.
              tween = gsap.fromTo(
                parts,
                { autoAlpha: 0, filter: "blur(12px)", scale: 1.03 },
                {
                  autoAlpha: 1,
                  filter: "blur(0px)",
                  scale: 1,
                  duration: BASE_DURATION * (1 - 0.1 * f),
                  stagger: 0.12 * (1 + 0.4 * f),
                  ease: "expo.out",
                },
              );
            } else if (variant === "skew") {
              // Line-mask rise + a 3D tilt-in easing to flat.
              tween = gsap.fromTo(
                parts,
                { yPercent: BASE_Y_PERCENT * (1 + 0.18 * f), rotationX: -38, skewY: 4 },
                {
                  yPercent: 0,
                  rotationX: 0,
                  skewY: 0,
                  duration: BASE_DURATION * (1 - 0.12 * f),
                  stagger: BASE_STAGGER * (1 + 0.55 * f),
                  ease: "expo.out",
                },
              );
            } else if (variant === "words") {
              tween = gsap.fromTo(
                parts,
                { yPercent: BASE_Y_PERCENT * (1 + 0.18 * f) },
                {
                  yPercent: 0,
                  duration: BASE_DURATION * (1 - 0.12 * f),
                  stagger: 0.05 * (1 + 0.5 * f), // tighter than lines
                  ease: "expo.out",
                },
              );
            } else if (variant === "chars") {
              tween = gsap.fromTo(
                parts,
                { yPercent: BASE_Y_PERCENT * (1 + 0.18 * f) },
                {
                  yPercent: 0,
                  duration: BASE_DURATION * 0.82 * (1 - 0.12 * f),
                  stagger: 0.02 * (1 + 0.5 * f), // tightest stagger
                  ease: "expo.out",
                },
              );
            } else {
              // 'lines' — byte-identical to the historical reveal.
              tween = gsap.fromTo(
                parts,
                { yPercent: BASE_Y_PERCENT * (1 + 0.18 * f) }, // 115 → ~136
                {
                  yPercent: 0,
                  duration: BASE_DURATION * (1 - 0.12 * f), // 0.85 → ~0.75
                  stagger: BASE_STAGGER * (1 + 0.55 * f), // 0.09 → ~0.14
                  ease: "expo.out",
                },
              );
            }
            tweens.push(tween);
          };
          const st = ScrollTrigger.create({
            trigger: el,
            start: "top 88%",
            once: true,
            onEnter: fire,
          });
          triggers.push(st);
          // On client-side navigation the heading mounts already in view, so the
          // once-trigger is created already-active and never fires onEnter (GSAP
          // only fires on an active-state CHANGE; refresh() can't rescue it).
          // Fire at creation if already past the start so the split reveal plays
          // on SPA nav (matches the IntersectionObserver fix in Reveal /
          // SectionHeading). Below-the-fold headings still wait for scroll-in.
          if (st.isActive || st.progress > 0) fire();
        });
      });

      return () => {
        cancelled = true;
        triggers.forEach((t) => t.kill());
        tweens.forEach((t) => t.kill());
        splits.forEach((s) => s.revert());
      };
    },
    { scope: scopeRef, dependencies: [language, pathname, reveal] },
  );

  return <div ref={scopeRef} className="hidden" aria-hidden />;
}
