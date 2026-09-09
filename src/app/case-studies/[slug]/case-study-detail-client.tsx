"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Button, CTA_FLUID_SM } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/count-up";
import { useLanguage } from "@/components/language-provider";
import {
  type CaseStudy,
  type CaseStudyRailItem,
} from "@/data/case-studies";
import { isFlipArmedFor } from "@/lib/flip-handoff-store";
import { useReturnFlipSource } from "@/lib/use-flip-source";
import { attributionLine, statusLabel } from "@/components/work/attribution";
import { CTA, pick } from "@/data/copy";
import { START_HREF } from "@/lib/site";
import { track, EVENTS } from "@/lib/analytics";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * Case-study detail — the Lusion project-page grammar
 * (ANALISI_LUSION_WORK.md §3), brand-tempered: the navy base stays and only
 * the per-project highlight re-tints (--cs-highlight from study.palette).
 *
 * DESKTOP (lg+, fine scroll, no reduced motion): a pinned 100svh frame —
 * the meta column (title, summary, stack, launch CTA) sits fixed left,
 * vertically centred, while the MEDIA RAIL scrubs horizontally under
 * vertical scroll (GSAP pin + scrub; ScrollTrigger's pin spacer provides
 * the runway). Rail items: the lead media (demo video / product still —
 * also the flip-handoff hero), further shots, TYPOGRAPHIC PANELS derived
 * from study.metrics (Lusion's type:"text" items — every study gets the
 * layout, imagery or not), and the closing NEXT PROJECT panel with a
 * progress bar tied to the scrub.
 *
 * Per-item parallax: each media's inner img/video is oversized 12% and
 * counter-slides via a containerAnimation trigger (the DOM twin of the
 * shader's u_parallax). Videos are muted playsinline loops that PLAY ONLY
 * IN VIEW (IntersectionObserver — rects account for the track transform).
 *
 * MOBILE / REDUCED MOTION / NO-JS: the identical markup reads top-to-bottom
 * as a vertical page (globals.css `.cs-*` rules key on [data-rail-armed]) —
 * the pin is pure enhancement.
 */

interface CaseStudyDetailClientProps {
  study: CaseStudy;
  prevStudy: CaseStudy;
  nextStudy: CaseStudy;
}

/** Rail = declared items, else the lead still, then metric text panels. */
function deriveRail(study: CaseStudy): CaseStudyRailItem[] {
  const declared = study.railItems ?? [];
  const items: CaseStudyRailItem[] = [...declared];
  if (declared.length === 0 && study.previewImage) {
    items.push({ type: "image", src: study.previewImage });
  }
  for (const m of study.metrics) {
    items.push({
      type: "text",
      value: m.value,
      label: m.label,
      labelIt: m.labelIt,
    });
  }
  return items;
}

/** Muted loop that plays only while on screen (rail or stack). */
function RailVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // WCAG 2.2.2 (Pause, Stop, Hide): a muted clip that LOOPS and auto-starts
    // is moving content running longer than five seconds with no way to stop
    // it. The rest of the site disarms under prefers-reduced-motion — the whole
    // WebGL layer never mounts, and a global CSS block neutralises the DOM
    // animation — but that CSS cannot reach a <video>, so these clips were the
    // one thing still moving for a visitor who asked for stillness.
    // Under reduced motion we never arm the observer: the `poster` frame stays
    // up and carries the same information.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let io: IntersectionObserver | null = null;
    const arm = () => {
      if (io || mq.matches) return;
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) void el.play().catch(() => {});
          else el.pause();
        },
        { threshold: 0.15 },
      );
      io.observe(el);
    };
    const disarm = () => {
      io?.disconnect();
      io = null;
      el.pause();
    };
    // Honour a LIVE change of the preference, not only its value at mount —
    // the OS toggle should take effect without a reload.
    const onChange = () => (mq.matches ? disarm() : arm());
    arm();
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      io?.disconnect();
    };
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
    />
  );
}

export function CaseStudyDetailClient({
  study,
  nextStudy,
}: CaseStudyDetailClientProps) {
  const { language } = useLanguage();
  const isEn = language === "en";
  const router = useRouter();
  /** One navigation per full overscroll charge (unmounts on route change). */
  const navigatedRef = useRef(false);

  const engagement = isEn ? study.engagement : study.engagementIt;
  const role = isEn ? study.role : study.roleIt;
  const domain = isEn ? study.domain : study.domainIt;
  const summary = isEn ? study.summary : study.summaryIt;

  const highlight = study.palette?.highlight ?? "hsl(var(--accent))";
  const [firstWord, ...rest] = study.client.split(" ");
  const rail = useMemo(() => deriveRail(study), [study]);

  const stageRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  /* Desktop rail arming — reactive to viewport + motion preference (a
     resize across the lg boundary or an OS toggle must rebuild). */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 1024px)"),
      window.matchMedia("(prefers-reduced-motion: reduce)"),
    ];
    const sync = () => setArmed(queries[0].matches && !queries[1].matches);
    sync();
    queries.forEach((q) => q.addEventListener("change", sync));
    return () => queries.forEach((q) => q.removeEventListener("change", sync));
  }, []);

  /* The pin + scrub + OVERSCROLL AUTO-NAV. Rebuilt whenever `armed` flips;
     media loads refresh the measurement (invalidateOnRefresh re-reads
     scrollWidth). */
  useGSAP(
    () => {
      if (!armed) return;
      const stage = stageRef.current;
      const frame = frameRef.current;
      const track = trackRef.current;
      if (!stage || !frame || !track) return;

      const distance = () =>
        Math.max(1, track.scrollWidth - window.innerWidth);
      /* Overscroll charge runway in scroll px (port source: overScrollSize
         = 25vw of rail + a charge integrator; ours is scrub-positional —
         keep wheeling past the end and the bar fills, back off and it
         drains, full charge navigates. Reversible until the last pixel). */
      const OVERSCROLL = 420;

      /* Text panels live in a viewport band (the port source's u_textRatio
         gate): they resolve in entering from the right and dissolve BEFORE
         crossing the pinned meta column (gutter + min(30rem,36vw) ≈ 45% of
         the viewport) — which is how the rail can pass over the meta
         without two texts superimposing. Computed ANALYTICALLY per scrub
         frame from live rects (a first cut with paired scrubbed tweens
         raced each other across HMR/refresh ordering; one writer is
         deterministic, and ~7 rect reads per scrubbed frame is nothing). */
      const panels = Array.from(
        track.querySelectorAll<HTMLElement>(".cs-item-text, .cs-next"),
      );
      const nextPanel = track.querySelector<HTMLElement>(".cs-next");
      const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
      const applyPanelFades = () => {
        const vw = window.innerWidth;
        for (const panel of panels) {
          const r = panel.getBoundingClientRect();
          const fadeIn = clamp01((vw * 0.85 - r.left) / (vw * 0.23));
          /* Keyed on the LEFT edge (the first part to invade the meta
             column at ≈45% vw): fully dissolved by 50%, regardless of the
             panel's width — a right-edge key let wide panels overlap the
             meta while still opaque (measured live). */
          const fadeOut = panel.classList.contains("cs-next")
            ? 0 // the closing NEXT panel never crosses the meta
            : clamp01((vw * 0.62 - r.left) / (vw * 0.12));
          gsap.set(panel, { autoAlpha: Math.min(fadeIn, 1 - fadeOut) });
        }
      };

      /* The rail tween is PAUSED and progressed manually from the trigger
         below — the scroll range covers rail + overscroll, and the
         containerAnimation parallax triggers keep a real tween to key off. */
      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        duration: 1,
        paused: true,
      });

      let dist = distance();
      const apply = (self: ScrollTrigger) => {
        const px = self.progress * (dist + OVERSCROLL);
        tween.progress(Math.min(1, px / dist));
        /* Overscroll charge (port source: bar scaleX = overScrollRatio;
           ratio 1 → routeManager.setPath(next)). */
        const charge = clamp01((px - dist) / OVERSCROLL);
        if (barRef.current)
          barRef.current.style.transform = `scaleX(${charge})`;
        /* The NEXT panel leans in as the charge builds (the preview slide
           of the port source, scaled to our composition). */
        if (nextPanel)
          gsap.set(nextPanel, { x: -28 * charge });
        applyPanelFades();
        if (charge >= 1 && !navigatedRef.current) {
          navigatedRef.current = true;
          router.push(`/case-studies/${nextStudy.id}`);
        }
      };

      ScrollTrigger.create({
        trigger: stage,
        pin: frame,
        start: "top top",
        end: () => "+=" + (distance() + OVERSCROLL),
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          dist = distance();
          tween.invalidate();
          apply(self);
        },
        onUpdate: apply,
      });

      /* Interior parallax — media counter-slides inside its frame as the
         item crosses the viewport (containerAnimation = the rail tween).
         Fullscreen items skip it (their media fills edge-to-edge). */
      const parallaxed = Array.from(
        track.querySelectorAll<HTMLElement>(
          ".cs-item:not([data-fullscreen]) .cs-item-media > img, .cs-item:not([data-fullscreen]) .cs-item-media > video",
        ),
      );
      for (const media of parallaxed) {
        gsap.fromTo(
          media,
          { xPercent: -5, scale: 1.12 },
          {
            xPercent: 5,
            scale: 1.12,
            ease: "none",
            scrollTrigger: {
              containerAnimation: tween,
              trigger: media.closest(".cs-item") as HTMLElement,
              start: "left right",
              end: "right left",
              scrub: true,
            },
          },
        );
      }

      /* Media loads move scrollWidth — refresh so the runway stays true. */
      const media = Array.from(
        track.querySelectorAll<HTMLElement>("img, video"),
      );
      const onLoad = () => ScrollTrigger.refresh();
      media.forEach((el) => {
        el.addEventListener("load", onLoad);
        el.addEventListener("loadedmetadata", onLoad);
      });
      return () => {
        media.forEach((el) => {
          el.removeEventListener("load", onLoad);
          el.removeEventListener("loadedmetadata", onLoad);
        });
      };
    },
    { scope: stageRef, dependencies: [armed, rail.length] },
  );

  /* Breadcrumb = the explicit way back; arms the REVERSE flight (deflate
     onto the matching card) on a plain left click — see use-flip-source. */
  const onReturnFlip = useReturnFlipSource(study.id, study.previewImage);

  /* Lead-media entrance — flip-flight aware (the flying clone IS the
     entrance when a card→detail Flip is incoming), otherwise a clip reveal
     echoing the route curtain's beat. Same contract as the old hero. */
  useGSAP(
    () => {
      const el = heroRef.current;
      if (!el) return;
      if (isFlipArmedFor(study.id)) {
        gsap.set(el, { autoAlpha: 0 });
        const safety = gsap.delayedCall(1.3, () =>
          gsap.to(el, { autoAlpha: 1, duration: 0.3 }),
        );
        return () => safety.kill();
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(el, { clipPath: "inset(0 0 0 0)", autoAlpha: 1 });
        return;
      }
      gsap.fromTo(
        el,
        { clipPath: "inset(0 0 100% 0)", autoAlpha: 0, scale: 1.03 },
        {
          clipPath: "inset(0 0 0% 0)",
          autoAlpha: 1,
          scale: 1,
          duration: 0.62,
          ease: "expo.out",
          delay: 0.05,
          clearProps: "clipPath,scale",
        },
      );
    },
    { scope: heroRef },
  );

  let mediaIndex = -1;

  return (
    <div
      className="min-h-[100svh] pt-24 relative"
      style={{ ["--cs-highlight" as string]: highlight }}
    >
      <section ref={stageRef} className="cs-stage">
        <div
          ref={frameRef}
          className="cs-frame container-px"
          data-rail-armed={armed ? "true" : "false"}
        >
          {/* ------------------------------------------------ meta column */}
          <div className="cs-meta flex flex-col gap-6">
            <nav aria-label="Breadcrumb">
              <Link
                href="/case-studies"
                onClick={onReturnFlip}
                className="relative inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-ink-mute hover:text-[var(--cs-highlight)] transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {isEn ? "All work" : "Tutti i lavori"}
              </Link>
            </nav>

            <p className="eyebrow inline-flex items-center gap-2">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--cs-highlight)" }}
                aria-hidden="true"
              />
              {study.industry} · {engagement}
            </p>

            {/* Logo studies show the mark; the rest the split wordmark. */}
            {study.logoImage ? (
              <h1 key={language} className="my-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={study.logoImage}
                  alt={study.client}
                  draggable={false}
                  className="block h-auto w-auto max-h-[clamp(2.5rem,6vw,4rem)] max-w-full object-contain object-left"
                />
              </h1>
            ) : (
              <h1
                key={language}
                className="font-display text-[clamp(2.1rem,4.5vw,3.6rem)] leading-[1.08] tracking-[-0.025em] text-ink text-balance"
              >
                {firstWord}
                {rest.length > 0 ? (
                  <>
                    {" "}
                    <span
                      className="italic"
                      style={{ color: "var(--cs-highlight)" }}
                    >
                      {rest.join(" ")}.
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--cs-highlight)" }}>.</span>
                )}
              </h1>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-mute">
              <span>
                <span className="text-ink/70">{isEn ? "Role:" : "Ruolo:"}</span>{" "}
                <span className="text-ink">{role}</span>
              </span>
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-rule"
              />
              <span>{domain}</span>
              {/* PROVENANCE — the single highest-value line on this page. A
                  deep link used to show an institution mark, a role and no
                  attribution at all; the flex-wrap row already existed, so
                  this repairs every detail page with no layout change. */}
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-rule"
              />
              <span className="text-ink">{attributionLine(study, isEn)}</span>
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-rule"
              />
              <span>
                <span className="text-ink/70">
                  {isEn ? "Status:" : "Stato:"}
                </span>{" "}
                <span className="text-ink">
                  {statusLabel(study.status, isEn)}
                </span>
              </span>
            </div>

            <p className="text-[15px] text-ink-mute leading-[1.6] max-w-prose">
              {summary}
            </p>

            {/* Stack — the Lusion "Services" side list, as chips. */}
            {study.techStack.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
                {study.techStack.slice(0, 10).map((tech) => (
                  <li
                    key={tech}
                    className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.1em] rounded-full border border-rule/70 text-ink-mute"
                  >
                    {tech}
                  </li>
                ))}
              </ul>
            )}

            {study.liveUrl && (
              <a
                href={study.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="view"
                className="cs-launch w-fit"
              >
                <span className="cs-launch-dot" aria-hidden="true" />
                <span className="cs-launch-text">
                  {isEn ? "Launch project" : "Apri il progetto"}
                </span>
                <span className="cs-launch-arrow" aria-hidden="true">
                  <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(216_30%_8%)]" />
                </span>
              </a>
            )}

            <p className="hidden lg:block text-[10px] font-mono uppercase tracking-[0.16em] text-ink-mute/70">
              {isEn ? "Scroll to explore" : "Scorri per esplorare"} →
            </p>
          </div>

          {/* ------------------------------------------------ media rail */}
          <div ref={trackRef} className="cs-track">
            {rail.map((item, i) => {
              if (item.type === "text") {
                return (
                  <div key={i} className="cs-item cs-item-text">
                    <span
                      className="cs-item-value font-display"
                      style={
                        i % 3 === 1
                          ? { color: "var(--cs-highlight)" }
                          : undefined
                      }
                    >
                      <CountUp value={item.value ?? ""} />
                    </span>
                    <span className="cs-item-label">
                      {isEn ? item.label : item.labelIt ?? item.label}
                    </span>
                  </div>
                );
              }
              mediaIndex++;
              const isLead = mediaIndex === 0;
              return (
                <div
                  key={i}
                  className="cs-item"
                  data-fullscreen={item.fullscreen ? "" : undefined}
                >
                  <div
                    ref={isLead ? heroRef : undefined}
                    data-flip-id={isLead ? study.id : undefined}
                    data-flip-hero={isLead ? "" : undefined}
                    className="cs-item-media"
                    style={
                      item.width && item.height
                        ? { aspectRatio: `${item.width} / ${item.height}` }
                        : undefined
                    }
                  >
                    {item.type === "video" ? (
                      <RailVideo src={item.src ?? ""} poster={item.poster} />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.src} alt="" draggable={false} />
                    )}
                  </div>
                </div>
              );
            })}

            {/* NEXT PROJECT — the rail's closing beat (§3.2). */}
            <div className="cs-item cs-next">
              <p className="eyebrow">
                {isEn ? "Next project" : "Prossimo progetto"}
              </p>
              <Link
                href={`/case-studies/${nextStudy.id}`}
                data-cursor="view"
                className="font-display text-[clamp(2rem,3.5vw,3.2rem)] leading-[1.08] text-ink hover:text-[var(--cs-highlight)] transition-colors"
              >
                {nextStudy.client}
              </Link>
              <div className="cs-next-bar" aria-hidden="true">
                <div ref={barRef} className="cs-next-bar-inner" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- closing CTA */}
      <section className="container-px max-w-5xl relative z-10 py-20">
        <div className="rounded-xl border border-rule/70 bg-surface/40 backdrop-blur-sm p-8 sm:p-10">
          <p className="eyebrow mb-4" style={{ color: "var(--cs-highlight)" }}>
            {isEn ? "Next" : "Prossimo"}
          </p>
          <h3 className="font-display text-2xl sm:text-[1.75rem] text-ink mb-4 leading-tight max-w-2xl">
            {isEn ? (
              <>
                Want this kind of work in{" "}
                <span className="italic" style={{ color: "var(--cs-highlight)" }}>
                  your business?
                </span>
              </>
            ) : (
              <>
                Volete questo tipo di lavoro nel{" "}
                <span className="italic" style={{ color: "var(--cs-highlight)" }}>
                  vostro business?
                </span>
              </>
            )}
          </h3>
          <p className="text-sm text-ink-mute mb-6 max-w-2xl">
            {isEn ? (
              <>
                Start with the problem, not the platform. Tell us what&apos;s
                slow, manual or breaking.
              </>
            ) : (
              <>
                Si parte dal problema, non dalla piattaforma. Raccontateci cosa
                è lento, manuale o si rompe.
              </>
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" className={cn("group", CTA_FLUID_SM)}>
              <Link
                href={START_HREF}
                // Two events on one click (PROMPT 17): CASE_STUDY_CTA_CLICKED
                // attributes the enquiry to this specific project, while
                // CTA_PROJECT_BRIEF keeps it in the site-wide brief count.
                onClick={() => {
                  track(EVENTS.CASE_STUDY_CTA_CLICKED, {
                    case_study: study.id,
                    source_section: "case_study_cta",
                  });
                  track(EVENTS.CTA_PROJECT_BRIEF, {
                    source_section: "case_study_cta",
                    case_study: study.id,
                    lang: language,
                  });
                }}
              >
                {pick(isEn, CTA.primary)}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className={CTA_FLUID_SM}
            >
              <Link href="/contact">
                {isEn ? "Or just say hello" : "Oppure scriveteci e basta"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
