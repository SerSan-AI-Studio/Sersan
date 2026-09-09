"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { caseStudies, type CaseStudy } from "@/data/case-studies";
import { useFlipSource } from "@/lib/use-flip-source";
import { useFeaturedStore } from "@/webgl/store/featuredStore";
import { cn } from "@/lib/utils";
import { lusionEase } from "@/components/fx/lusion-ease";
import { attributionLine } from "@/components/work/attribution";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, CustomEase);

/**
 * WorkCard — THE Lusion-grammar project card (ANALISI_LUSION_WORK.md §2),
 * shared verbatim between the home Featured Work grid and the /case-studies
 * archive — exactly as lusion.co's home "Featured Work" and /projects render
 * one `.project-item`. Extracted from featured-work.tsx when the archive
 * adopted the grammar (2026-08-20 round 2).
 *
 * Anatomy: media box (65% aspect, r15; depth-parallax plane target via
 * data-featured-media) → mono category eyebrow (LabelScrambler decodes any
 * `.eyebrow`) → RollingTitle (4-copy letter columns in a 1em clip).
 *
 * MOTION (armed only without prefers-reduced-motion; the SSR resting state
 * is the complete reduced-motion experience):
 *  - ENTRANCE (once, mount-keyed + idempotent): title columns roll
 *    yPercent −400 → 0 (expo.inOut 1.25s, center-out cosine stagger); on
 *    the DOM-fallback path the INNER media slides in from the card's own
 *    column side (±8vw, ±3.5°, expo.out) — plane-owned cards leave the
 *    slide to the WebGL plane, and the media BOX never transforms (it is
 *    the plane's sync rect and the flip flight's media rect).
 *  - HOVER (fine pointer): UNIDIRECTIONAL — pointer events only write
 *    featuredStore.hoverId; the 1.5em letter shift + arrow slide-in play
 *    from a store subscription (so the section's stale-hover validator can
 *    clear a claim and the leave still animates). Ease: CustomEase "lusion"
 *    (--ease-lusion). The site-wide AudioTriggers hover tick covers the
 *    card via its [data-cursor] opt-in — Lusion's "focus" sample analogue.
 *  - CLICK: useFlipSource arms the zoom flight (data-flip-source +
 *    data-rail-media contracts).
 */

export const INDUSTRY_COLOR: Record<CaseStudy["industry"], string> = {
  FinTech: "text-[hsl(var(--accent))]",
  Healthcare: "text-[hsl(160_60%_60%)]",
  Aerospace: "text-[hsl(260_60%_70%)]",
  "Public Sector": "text-[hsl(200_30%_70%)]",
  Industrial: "text-[hsl(30_70%_65%)]",
  Energy: "text-[hsl(140_50%_60%)]",
  Agritech: "text-[hsl(100_45%_60%)]",
  "Real Estate": "text-[hsl(350_55%_68%)]",
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Lusion roll: center-out cosine stagger (§2.4). Seconds of delay for
 *  column i of n — center columns lead, edges trail by ~62ms. */
function rollDelay(i: number, n: number): number {
  if (n <= 1) return 0;
  const phase = Math.PI / 2 + (i / (n - 1)) * Math.PI; // π/2 → 3π/2
  return (Math.cos(phase) + 1) * 0.0625;
}

/** The house ease — re-exported from the shared guarded module
 * (fx/lusion-ease.ts, the ONE registration point) for existing importers
 * (case-studies-client.tsx). */
export { lusionEase };

/**
 * RollingTitle — the 4-copy letter-column title. Pure markup; WorkCard's
 * effects drive the transforms via [data-fw-col] queries. Columns are
 * aria-hidden; the h3 aria-label carries the clean client name.
 */
function RollingTitle({ text }: { text: string }) {
  const cols = useMemo(() => text.split(""), [text]);
  return (
    <h3 aria-label={text} className="fw-title font-display text-ink">
      {/* Arrow parked outside the clip; the hover tween slides it in. */}
      <svg
        className="fw-title-icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-fw-icon=""
      >
        <path
          d="M4 12h14m0 0-6-6m6 6-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="fw-title-inner" aria-hidden="true">
        {cols.map((ch, i) =>
          ch === " " ? (
            <span key={i} className="fw-col fw-col-space" />
          ) : (
            <span key={i} className="fw-col" data-fw-col="">
              <span>{ch}</span>
              <span>{ch}</span>
              <span>{ch}</span>
              <span>{ch}</span>
            </span>
          ),
        )}
      </span>
    </h3>
  );
}

export function WorkCard({
  study,
  index,
  isEn,
  planeOwned,
  className,
  eagerFirst = false,
}: {
  study: CaseStudy;
  index: number;
  isEn: boolean;
  /** True when the WebGL depth-parallax plane owns this card's media box. */
  planeOwned: boolean;
  className?: string;
  /**
   * Let the first two stills load eagerly. React 19 hoists an eager <img>
   * into the head as <link rel="preload" as="image">, so this is only correct
   * where the grid IS the page — the /case-studies archive. On home the grid
   * is section 05 of 10, held at opacity 0 by `sersan-intro-hold`, and the two
   * preloads (~123 KB) only compete with the first fetch wave.
   * Defaults to false so the expensive behaviour has to be asked for.
   */
  eagerFirst?: boolean;
}) {
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const onFlip = useFlipSource(study.id, study.previewImage);
  const engagement = isEn ? study.engagement : study.engagementIt;
  const domain = isEn ? study.domain : study.domainIt;
  /* PROVENANCE, in the slot that already exists. The eyebrow leads with who
     delivered the work ("SerSan delivery" / "Prior experience — Michele
     Sanna at Revolut") and keeps the sector line after it, so a wall of
     tier-1 marks can never read as a wall of SerSan clients. ONE template
     literal on purpose: the entrance types this element via textContent, so
     it must resolve to a single text node (see components/work/attribution). */
  const metaLine = `${attributionLine(study, isEn)} · ${domain}`;
  const side = index % 2 ? 1 : -1; // right column enters from the right

  /* Live plane-ownership for the ENTRANCE-FIRE moment (the flag can flip
     between mount and the card scrolling into view). */
  const planeOwnedRef = useRef(planeOwned);
  planeOwnedRef.current = planeOwned;

  /* Ownership handover: when the plane claims the box AFTER a DOM slide
     already started (planesLive resolves async — an in-view card at mount
     fires its entrance on the DOM path), the in-flight tween would strand
     the still mid-pose with inline opacity/transform that beat the CSS
     hide (measured live: stills frozen at 0.625 ghosting over the plane).
     Kill and clear — CSS then owns the fade to 0. */
  useEffect(() => {
    if (!planeOwned) return;
    const inner = cardRef.current?.querySelector<HTMLElement>(
      ".fw-media > img.fw-still",
    );
    if (!inner) return;
    gsap.killTweensOf(inner);
    gsap.set(inner, { clearProps: "transform,opacity,visibility" });
  }, [planeOwned]);

  /* Entrance — mount-keyed and idempotent (see header). */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;
    const cols = Array.from(card.querySelectorAll<HTMLElement>("[data-fw-col]"));
    const inner = card.querySelector<HTMLElement>(
      ".fw-media > img.fw-still, .fw-media > .fw-logo-panel",
    );
    const line1 = card.querySelector<HTMLElement>(".fw-line-1");
    const n = cols.length;
    let line1Timer = 0;

    const ctx = gsap.context(() => {
      /* −500%: the port source parks columns at −400% but its first update
         frame writes −500% (fit(0,0,1,500,0)) — five slots above the clip,
         so the roll streams ALL four copies through plus one empty slot of
         lead-in. Verified against the bundle (ProjectItemList builder +
         ProjectItem.update). */
      gsap.set(cols, { yPercent: -500 });
      const play = () => {
        if (inner && !planeOwnedRef.current)
          gsap.fromTo(
            inner,
            { x: side * window.innerWidth * 0.08, rotation: side * 3.5, autoAlpha: 0 },
            {
              x: 0,
              rotation: 0,
              autoAlpha: 1,
              duration: 1.5,
              ease: "expo.out",
              clearProps: "transform,opacity,visibility",
            },
          );
        cols.forEach((col, i) => {
          gsap.fromTo(
            col,
            { yPercent: -500 },
            {
              yPercent: 0,
              duration: 1.25,
              ease: "expo.inOut",
              delay: 0.15 + rollDelay(i, n),
              overwrite: "auto",
            },
          );
        });
        /* line-1 TYPE-ON (exact port, ProjectItem.update): the categories
           line types at LETTER_PER_SECOND=40 with the trailing
           MAX_RAND_LETTER_COUNT=5 chars cycling random printable ASCII
           (charCode 33+⌊rand·93⌋) — text GROWS, unlike the house
           scrambler's full-width settle, so the card opts out of that
           (data-scramble-done). Aborts if React swaps the text under it
           (language toggle mid-decode). */
        if (line1) {
          const final = line1.textContent ?? "";
          /* Reserve the FINAL height before the first character is typed: a
             long eyebrow wraps to two lines at card width, and the partially
             typed text sits on one — that 16–17 px collapse per card row moved
             every section below by ~66 px while the grid left the viewport
             (measured by the section-cuts probe as a ±0.055·ih seam pop).
             One layout read per card, once per entrance. */
          line1.style.minHeight = `${line1.offsetHeight}px`;
          const startedAt = performance.now();
          let written: string | null = null;
          line1Timer = window.setInterval(() => {
            if (written !== null && line1.textContent !== written) {
              window.clearInterval(line1Timer);
              return;
            }
            /* Wall-clock, not per-tick accumulation: background tabs clamp
               timers to ≥1s — an accumulator would crawl; elapsed time
               catches up on the first visible tick. */
            const t = (performance.now() - startedAt) / 1000;
            const shown = Math.min(final.length, Math.floor(40 * t));
            const settled = Math.max(
              0,
              Math.min(final.length, Math.floor(40 * t) - 5),
            );
            let out = final.slice(0, settled);
            for (let k = 0; k < shown - settled; k++)
              out += String.fromCharCode(33 + ~~(Math.random() * 93));
            if (settled >= final.length) {
              out = final;
              window.clearInterval(line1Timer);
            }
            line1.textContent = out;
            written = out;
          }, 33);
        }
      };
      const st = ScrollTrigger.create({
        trigger: card,
        start: "top 88%",
        once: true,
        onEnter: play,
      });
      /* Already past the start at mount (page-top cards, deep landings):
         on this site a freshly created trigger does not evaluate until the
         first real scroll (measured live on the archive header), so fire
         the entrance directly and retire the trigger. */
      if (card.getBoundingClientRect().top < window.innerHeight * 0.88) {
        st.kill();
        play();
      }
    }, card);
    return () => {
      window.clearInterval(line1Timer);
      ctx.revert();
    };
  }, [side, study.id]);

  /* Hover — TWO surfaces, exactly as the port source splits them:
       - MEDIA box (`.project-item-main` there, `.fw-media` here) enter/leave
         drives the WebGL zoom + parallax via featuredStore (ProjectItem's
         `isHover`; also where Lusion fires its "focus" audio sample — our
         delegated AudioTriggers tick covers the card link).
       - The whole CARD (`isHoverDom` there) drives the DOM text shift:
         letters 1.5em over 0.4s (2.5/s ratio integrator), 4ms/letter
         staggered from the END; the arrow maps the [0.3 → 1] band of the
         same ratio — in 0.12s late, 0.28s long; on leave it returns first.
     Sweeping the title must NOT zoom the image — that separation is a big
     part of the Lusion feel (fidelity pass, bundle ~734k). */
  useEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;
    const media = card.querySelector<HTMLElement>(".fw-media");
    const cols = Array.from(card.querySelectorAll<HTMLElement>("[data-fw-col]"));
    const icon = card.querySelector<HTMLElement>("[data-fw-icon]");
    const lusion = lusionEase();
    const fine = window.matchMedia("(pointer: fine)");
    const em = () =>
      parseFloat(getComputedStyle(card.querySelector(".fw-title")!).fontSize);
    const play = (on: boolean) => {
      gsap.to(cols, {
        x: on ? () => em() * 1.5 : 0,
        duration: 0.4,
        ease: lusion,
        stagger: { each: 0.004, from: "end" },
        overwrite: "auto",
      });
      if (icon)
        gsap.to(icon, {
          x: on ? () => em() : 0,
          duration: 0.28,
          delay: on ? 0.12 : 0,
          ease: lusion,
          overwrite: "auto",
        });
    };
    const cardEnter = () => {
      if (fine.matches) play(true);
    };
    const cardLeave = () => play(false);
    const mediaEnter = () => {
      if (fine.matches) useFeaturedStore.getState().setHover(study.id);
    };
    const mediaLeave = () => useFeaturedStore.getState().clearHover(study.id);
    card.addEventListener("pointerenter", cardEnter);
    card.addEventListener("pointerleave", cardLeave);
    media?.addEventListener("pointerenter", mediaEnter);
    media?.addEventListener("pointerleave", mediaLeave);
    return () => {
      card.removeEventListener("pointerenter", cardEnter);
      card.removeEventListener("pointerleave", cardLeave);
      media?.removeEventListener("pointerenter", mediaEnter);
      media?.removeEventListener("pointerleave", mediaLeave);
      useFeaturedStore.getState().clearHover(study.id);
      gsap.killTweensOf(cols);
      if (icon) gsap.killTweensOf(icon);
      gsap.set(cols, { x: 0 });
      if (icon) gsap.set(icon, { x: 0 });
    };
  }, [study.id]);

  const hasStill = Boolean(study.previewImage);

  return (
    <Link
      ref={cardRef}
      href={`/case-studies/${study.id}`}
      className={cn("fw-card group", className)}
      aria-label={`${study.client}, ${engagement} — ${attributionLine(study, isEn)}`}
      data-cursor="view"
      data-flip-source={study.id}
      onClick={onFlip}
    >
      {/* Media box — the WebGL plane's sync target AND the flip flight's
          media rect (data-rail-media, the overlay's generic contract).
          data-plane-owned fades the DOM still under the live plane
          (globals.css) — per-card, so logo cards keep their DOM panel. */}
      <div
        className="fw-media"
        data-featured-media={study.id}
        data-plane-owned={planeOwned ? "true" : undefined}
        data-rail-media=""
      >
        {hasStill ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={study.previewImage}
            alt=""
            className="fw-still"
            loading={eagerFirst && index < 2 ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          study.logoImage && (
            <span className="fw-logo-panel" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={study.logoImage} alt="" loading="lazy" decoding="async" />
            </span>
          )
        )}
      </div>

      {/* line-1: mono categories line. data-scramble-done opts OUT of the
          house LabelScrambler — the entrance runs Lusion's exact type-on
          instead (40 chars/s + 5-glyph random head, fidelity pass). */}
      <p
        className={cn("eyebrow fw-line-1", INDUSTRY_COLOR[study.industry])}
        data-scramble-done="1"
      >
        {metaLine}
      </p>

      {/* line-2: the rolling title. */}
      <RollingTitle text={study.client} />
    </Link>
  );
}

/**
 * WorkGrid — the shared two-column grid + stale-hover validator wiring.
 * `studies` picks the population (home: featured order; archive: all).
 * Row rhythm: rows 2+ get extra top air (Lusion's nth-child(n+3) 10em, at
 * our scale). The validator + ScrollTrigger-refresh measure bump live here
 * so BOTH grids carry them without duplication.
 */
export function WorkGrid({
  studies,
  isEn,
  planesLive,
  eagerFirst = false,
}: {
  studies: CaseStudy[];
  isEn: boolean;
  planesLive: boolean;
  /** See WorkCard: only the archive, where the grid is the page. */
  eagerFirst?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  /* STALE-HOVER VALIDATOR + MEASURE EPOCH (see fix commit b9b3318):
     pointerleave never fires when a card scrolls out from under a
     stationary pointer — re-test the claim each scroll frame; and bump the
     planes' measure epoch on every ScrollTrigger refresh (pin spacers
     above the grid re-resolve after plain resize events). */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let px = -1;
    let py = -1;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const validate = () => {
      raf = 0;
      const { hoverId, clearHover } = useFeaturedStore.getState();
      if (!hoverId || px < 0) return;
      /* The claim is a MEDIA-box hover (fidelity pass: the WebGL zoom keys
         on `.fw-media`, not the card) — validate against the media rect. */
      const media = gridRef.current?.querySelector<HTMLElement>(
        `[data-featured-media="${hoverId}"]`,
      );
      if (!media) return clearHover(hoverId);
      const r = media.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top || py > r.bottom)
        clearHover(hoverId);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(validate);
    };
    const bump = () => useFeaturedStore.getState().bumpMeasure();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    ScrollTrigger.addEventListener("refresh", bump);
    /* Route-change coverage: FeaturedWorkPlanes stays MOUNTED across the
       home ↔ archive swap (both routes render it at the same JSX position),
       so no island-side remount re-measures — the GRID announces its own
       mount (this effect runs after the cards commit, rects are live) and
       its teardown. */
    bump();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      ScrollTrigger.removeEventListener("refresh", bump);
      bump();
    };
  }, []);

  return (
    <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 gap-x-[2vw]">
      {studies.map((study, i) => (
        <WorkCard
          key={study.id}
          study={study}
          index={i}
          isEn={isEn}
          planeOwned={planesLive && Boolean(study.depthImage)}
          eagerFirst={eagerFirst}
          className={i >= 2 ? "mt-16 md:mt-24" : i > 0 ? "mt-16 md:mt-0" : ""}
        />
      ))}
    </div>
  );
}

/** Reactive planesLive mirror — shared by both grid hosts. */
export function usePlanesLive() {
  const planesLive = useFeaturedStore((s) => s.planesLive);
  return planesLive;
}

/** All studies in archive order (data order = the curated sequence). */
export function archiveStudies(): CaseStudy[] {
  return caseStudies;
}

/** Home selection: `featured` order. */
export function featuredStudies(): CaseStudy[] {
  return caseStudies
    .filter((s) => typeof s.featured === "number")
    .sort((a, b) => (a.featured ?? 0) - (b.featured ?? 0));
}
