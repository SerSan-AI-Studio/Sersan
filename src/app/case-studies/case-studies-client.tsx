"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button, CTA_FLUID_SM } from "@/components/ui/button";
import { caseStudies } from "@/data/case-studies";
import { useLanguage } from "@/components/language-provider";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  WorkGrid,
  archiveStudies,
  usePlanesLive,
  lusionEase,
  prefersReducedMotion,
} from "@/components/work/work-card";
import { cn } from "@/lib/utils";
import { CTA, FACTS, PROOF_LINE, pick } from "@/data/copy";
import { CONTACT_EMAIL, START_HREF } from "@/lib/site";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * /case-studies — the work archive on the Lusion /projects grammar
 * (ANALISI_LUSION_WORK.md round 2, boss directive 2026-08-20): a massive
 * display wordmark with the project count as a mono superscript and a
 * diagonal arrow, then the SAME two-column card grid the home Featured Work
 * renders (shared components/work/work-card.tsx) over the FULL population.
 * The sector filter rail, FLIP re-sort machinery and the in-progress block
 * of the previous archive are retired with the layout — lusion.co/projects
 * is title + grid, nothing else (disclaimer + closing CTA stay: legal +
 * business requirements, not layout).
 *
 * HEADER ENTRANCE (port of ProjectsMainSection, bundle ~1102k): each title
 * char rises from 100% below its clip while untwisting from 30°, staggered
 * i/30s on ease.lusion; the count chars follow ~0.33s later (no twist); the
 * arrow pops in with elastic.out. Fired once by a ScrollTrigger at mount
 * (the header is above the fold — it plays on load, after the curtain).
 *
 * Line anchors (hero/grid/disclaimer/ritual/final-cta) keep their names —
 * webgl/curves/routeCurves.ts glues the signature line to them.
 *
 * WebGL: Scene mounts FeaturedWorkPlanes on this route too — the archive's
 * media boxes carry the same [data-featured-media] contract, so the three
 * depth-mapped studies get the raymarched hover here as well.
 */
export function CaseStudiesClient() {
  const { language } = useLanguage();
  const isEn = language === "en";
  const planesLive = usePlanesLive();
  const headerRef = useRef<HTMLDivElement | null>(null);

  const word = isEn ? "Work" : "Lavori";
  const count = String(caseStudies.length).padStart(2, "0");

  /* Header entrance — keyed on language (remount replays for the new word). */
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || prefersReducedMotion()) return;
    const titleChars = Array.from(
      header.querySelectorAll<HTMLElement>(".cs-archive-title .cs-archive-char"),
    );
    const countChars = Array.from(
      header.querySelectorAll<HTMLElement>(".cs-archive-count .cs-archive-char"),
    );
    const arrow = header.querySelector<HTMLElement>(".cs-archive-arrow");
    const lusion = lusionEase();

    const ctx = gsap.context(() => {
      gsap.set(titleChars, { yPercent: 100, rotation: 30 });
      gsap.set(countChars, { yPercent: 100 });
      if (arrow) gsap.set(arrow, { scale: 0 });
      /* Exact port timings (ProjectsMainSection, fidelity pass):
         title runs on a 1.5× clock → per-char start (i/20 + 0.2)/1.5,
         duration 1/1.5 s; the count runs on the real clock → 0.5 + i/20,
         1 s; the arrow is elasticOut (amplitude 1, period 0.4) over 1 s
         from t = 0.6. */
      const play = () => {
        titleChars.forEach((ch, i) => {
          gsap.to(ch, {
            yPercent: 0,
            rotation: 0,
            duration: 0.667,
            ease: lusion,
            delay: 0.133 + i / 30,
          });
        });
        countChars.forEach((ch, i) => {
          gsap.to(ch, {
            yPercent: 0,
            duration: 1,
            ease: lusion,
            delay: 0.5 + i / 20,
          });
        });
        if (arrow)
          gsap.to(arrow, {
            scale: 1,
            duration: 1,
            ease: "elastic.out(1, 0.4)",
            delay: 0.6,
          });
      };
      const st = ScrollTrigger.create({
        trigger: header,
        start: "top 95%",
        once: true,
        onEnter: play,
      });
      /* The header is at the page top on every normal landing — and a
         freshly created trigger on this site does not evaluate until the
         first real scroll (measured live). Fire directly when in view. */
      if (header.getBoundingClientRect().top < window.innerHeight * 0.95) {
        st.kill();
        play();
      }
    }, header);
    return () => ctx.revert();
  }, [language]);

  return (
    <div className="min-h-[100svh] pt-24 relative">
      {/* Header — the /projects wordmark. */}
      <section data-line-anchor="hero" className="pt-16 pb-10 sm:pt-24 sm:pb-14">
        <div className="container-px">
          <div ref={headerRef} key={language} className="cs-archive-title-wrap">
            <h1
              className="cs-archive-title font-display text-ink"
              aria-label={
                isEn
                  ? "Work — SerSan projects and prior senior delivery"
                  : "Lavori — progetti SerSan e consegne senior precedenti"
              }
            >
              <span aria-hidden="true">
                {word.split("").map((ch, i) => (
                  <span key={i} className="cs-archive-char">
                    {ch}
                  </span>
                ))}
              </span>
            </h1>
            <span className="cs-archive-count" aria-hidden="true">
              {count.split("").map((ch, i) => (
                <span key={i} className="cs-archive-char">
                  {ch}
                </span>
              ))}
            </span>
            {/* Diagonal arrow (↘) — Lusion's projects-title mark. */}
            <svg
              className="cs-archive-arrow"
              viewBox="0 0 38 38"
              fill="none"
              aria-hidden="true"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="m2 2 34 34m0 0V6.046M36 36H6.046"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Grid — the shared Lusion-grammar cards, full population. */}
      <section data-line-anchor="grid" className="pb-16 sm:pb-24">
        <div className="container-px">
          <h2 className="sr-only">{pick(isEn, PROOF_LINE)}</h2>
          {/* eagerFirst: on the archive the grid IS the page, so the first two
              stills are genuinely above the fold and worth the head preload.
              Home passes nothing — see WorkCard's prop doc. */}
          <WorkGrid
            studies={archiveStudies()}
            isEn={isEn}
            planesLive={planesLive}
            eagerFirst
          />
        </div>
      </section>

      {/* Disclaimer */}
      <section data-line-anchor="disclaimer" className="pb-12">
        <div className="container-px">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs text-muted-foreground leading-relaxed text-center italic">
              {isEn
                ? "Figures reflect measured impact in production or in validated simulation environments. Every entry names its own delivery context: SerSan engagements, and prior senior delivery at previous employers or as a freelancer. Client data and proprietary methods are abstracted where confidentiality requires."
                : "I numeri riflettono l'impatto misurato in produzione o in ambienti di simulazione validati. Ogni voce indica il proprio contesto di delivery: progetti SerSan ed esperienze senior precedenti, presso datori di lavoro o come freelance. Dati dei clienti e metodi proprietari sono astratti dove la riservatezza lo richiede."}
            </p>
          </div>
        </div>
      </section>

      {/* Ritual gap — transparent negative space so the persistent canvas
          (z-0) shows through; the route's 3D ritual object world-anchors
          here and the signature line threads it before the CTA. */}
      <div data-line-anchor="ritual" aria-hidden="true" className="py-28 sm:py-40" />

      {/* Closing CTA — overflow-x-clip: the decorative 700px glow hangs past
          the right edge on narrow viewports and would drag the document
          (measured 190px at 320w); clip the horizontal escape only. */}
      <section data-line-anchor="final-cta" className="section-lg relative overflow-x-clip">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] opacity-20 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--accent))_0%,transparent_60%)] blur-[140px]" />
        </div>
        <div className="container-px relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <SectionHeading
              align="center"
              className="mx-auto mb-10 max-w-2xl"
              title={
                isEn ? (
                  <>
                    Want this kind of work in{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      your business?
                    </span>
                  </>
                ) : (
                  <>
                    Volete questo tipo di lavoro nella{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      vostra azienda?
                    </span>
                  </>
                )
              }
              description={
                isEn
                  ? `Tell us the problem you would start with. ${FACTS.briefIsEnough.en}, and a founder reads it.`
                  : `Raccontateci il problema da cui partireste. ${FACTS.briefIsEnough.it}, e a leggere è un founder.`
              }
            />
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                asChild
                size="lg"
                className={cn(
                  "px-10 py-7 text-base font-semibold rounded-full",
                  CTA_FLUID_SM,
                )}
              >
                <Link href={START_HREF}>
                  {pick(isEn, CTA.primary)}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isEn ? (
                  <>
                    Or email{" "}
                    <span className="underline decoration-dotted underline-offset-4">{CONTACT_EMAIL}</span>
                  </>
                ) : (
                  <>
                    Oppure scrivete a{" "}
                    <span className="underline decoration-dotted underline-offset-4">{CONTACT_EMAIL}</span>
                  </>
                )}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
