"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LinkedinIcon } from "@/components/icons/brand";
import { Button, CTA_FLUID_SM } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/count-up";
import OurWhy from "@/components/sections/our-why";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { founders } from "@/data/founders";
import {
  CONTINUATION,
  CTA,
  FACTS,
  POSITIONING,
  pick,
} from "@/data/copy";
import { sersanBuildCount } from "@/data/counts";
import { useLanguage } from "@/components/language-provider";
import { START_HREF } from "@/lib/site";
import { useCentreFocus } from "@/lib/use-centre-focus";
import { RuleBeats } from "./rule-beats";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function AboutClient() {
  const { language } = useLanguage();
  const isEn = language === "en";

  // Founder portraits: 112%-bleed vertical counter-parallax (±5%), scrubbed
  // by one plain ScrollTrigger over the founders grid — no pin, no height
  // change, quickSetter writes only (no scrub tween: Lenis already smooths
  // the scroll the progress derives from). Rects are never read in the
  // update path; the drift is pure progress math.
  const foundersGridRef = useRef<HTMLDivElement | null>(null);
  const portraitDriftRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const grid = foundersGridRef.current;
    const targets = portraitDriftRefs.current.filter(
      (el): el is HTMLDivElement => Boolean(el),
    );
    if (!grid || targets.length === 0) return;

    const setters = targets.map(
      (el) => gsap.quickSetter(el, "yPercent") as (v: number) => void,
    );
    let last = Infinity;
    const st = ScrollTrigger.create({
      trigger: grid,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        // −1 entering at the bottom … +1 leaving at the top; counter-drift
        // is % of the 112% media layer (max 5% ≈ 5.6% of the frame ≤ the
        // 6% bleed). Early-return when the write would be a no-op.
        const t = self.progress * 2 - 1;
        const y = -t * 5;
        if (Math.abs(y - last) < 0.01) return;
        last = y;
        for (const s of setters) s(y);
      },
    });

    return () => {
      st.kill();
      targets.forEach((el) => gsap.set(el, { yPercent: 0 }));
    };
  }, []);

  // D-1: on touch there is no pointer to hover the portrait with, so the card
  // scrolled to the viewport centre carries the reveal instead. Inert on a fine
  // pointer (desktop :hover unchanged); under reduced motion every portrait is
  // revealed at once, with no transition. Same contract as the home founders
  // rail — see lib/use-centre-focus.
  const portraitFocusRef = useCentreFocus();

  // One rect read per pointer ENTRY (event-driven — never per frame):
  // anchors the duotone→color clip-path circle at the cursor's entry point.
  // Same treatment as the home founders rail (founders-rail.tsx). MOUSE ONLY —
  // the touch reveal must not depend on it, and doesn't: with no --fr-mx/--fr-my
  // written the clip circle expands from the portrait's centre (50%/50%).
  const onPortraitEnter = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    el.style.setProperty(
      "--fr-mx",
      `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`,
    );
    el.style.setProperty(
      "--fr-my",
      `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`,
    );
  };

  const pillars = [
    {
      num: "01",
      title: isEn ? "Accountability stays senior" : "La responsabilità resta senior",
      body: isEn
        ? "The people who scope the work stay accountable for it: a named commercial owner and a named technical owner, the same two from proposal to launch."
        : "Chi definisce il lavoro ne resta responsabile: un referente commerciale e uno tecnico, con nome e cognome, gli stessi dalla proposta al lancio.",
    },
    {
      num: "02",
      title: isEn ? "Scope with an end" : "Uno scope con una fine",
      body: `${pick(isEn, CONTINUATION)} ${
        isEn
          ? "Start focused, expand when the value is proven."
          : "Si parte mirati, si amplia quando il valore è dimostrato."
      }`,
    },
    {
      num: "03",
      title: isEn ? "Accountable through launch" : "Responsabili fino al lancio",
      body: isEn
        ? "We don't hand over a document and disappear. We stay accountable through launch, and we can keep supporting or running the system afterwards when that's agreed."
        : "Non consegniamo un documento e spariamo. Restiamo responsabili fino al lancio, e possiamo continuare a supportare o gestire il sistema quando è concordato.",
    },
  ];

  return (
    <div className="min-h-[100svh] text-foreground">
      <div className="pt-20 pb-20 relative">
        {/* Hero */}
        <section data-line-anchor="hero" className="relative overflow-hidden mb-20 sm:mb-24 py-20 md:py-28">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            <div
              className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[45vw] max-w-[1200px] max-h-[700px] blur-3xl opacity-30"
              style={{ background: "radial-gradient(closest-side, hsl(var(--accent) / 0.22), transparent 70%)" }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[55vw] h-[30vw] max-w-[800px] max-h-[480px] blur-2xl opacity-25"
              style={{ background: "radial-gradient(closest-side, hsl(var(--accent) / 0.18), transparent 70%)" }}
            />
          </div>

          <div className="container-px relative z-10">
            {/* H1 lives OUTSIDE the Reveal: HeadingChoreographer owns its
                line-mask reveal (data-split-reveal) — wrapping it in the block
                fade would double-animate. Eyebrow entrance = LabelScrambler
                decode; sub + CTAs keep the Reveal fade, slightly delayed so
                they sequence under the rising lines. */}
            <div className="max-w-4xl mx-auto text-center">
              <p className="eyebrow mb-6 inline-flex items-center justify-center gap-2">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: "hsl(var(--accent))" }}
                  aria-hidden="true"
                />
                {isEn ? "The team" : "Il team"}
              </p>
              {/* key={language}: SplitText owns this subtree once split; a
                  language swap must remount it or React reconciles against
                  orphaned nodes (same contract as SectionHeading's h2). */}
              <h1 key={language} data-split-reveal className="font-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[1.15] tracking-[-0.025em] text-ink text-balance mb-8 pb-1">
                {isEn ? (
                  <>
                    Four operators.{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      One thesis.
                    </span>
                  </>
                ) : (
                  <>
                    Quattro operatori.{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      Una sola tesi.
                    </span>
                  </>
                )}
              </h1>
              <Reveal delay={150}>
                <p className="text-lg sm:text-xl text-ink-mute max-w-2xl mx-auto leading-[1.5]">
                  {isEn
                    ? "Business context and engineering judgment in the same room. "
                    : "Contesto di business e giudizio ingegneristico nella stessa stanza. "}
                  {pick(isEn, POSITIONING.accountabilityLong)}
                </p>
                {/* CTA_FLUID_SM: the nowrap label is wider than the 256px
                    column at 320px (see button.tsx). Inert at sm and up. */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mt-10">
                  <Button asChild size="lg" className={cn("group", CTA_FLUID_SM)}>
                    <Link href={START_HREF}>
                      {pick(isEn, CTA.primary)}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className={CTA_FLUID_SM}>
                    <Link href="/consulting">
                      {pick(isEn, CTA.seeHowWeWork)}
                    </Link>
                  </Button>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <div data-line-anchor="why">
          <OurWhy />
        </div>

        {/* The team — the two co-founders plus the two engineers. */}
        <section data-line-anchor="founders" className="container-px mb-24">
          <div className="text-center mb-12 max-w-3xl mx-auto">
            <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-4">
              {isEn
                ? "Two founders, two engineers. Named owners on every project."
                : "Due fondatori, due ingegneri. Referenti con nome su ogni progetto."}
            </p>
          </div>

          {/* `md` deliberately STAYS a 2-column grid, so the first two cards are
              byte-identical to the shipped md design. A third card would
              otherwise sit alone in the left column of row 2 and read as a
              broken grid, so an odd LAST card spans both columns and is centred
              at exactly one column's width (50% − half the 2rem gap). Every one
              of those classes resets at `lg`, where it becomes a normal grid
              item. `lg:max-w-6xl` (72rem) restores ~21.3rem per card —
              max-w-5xl across three columns gives ~19rem, too narrow for the bio
              paragraph.

              N=4 (2026-08-27): three columns at `lg` would strand card 4 alone
              on row 2, so when the count is ≡ 1 (mod 3) the grid STAYS two
              columns at every width (a clean 2×2 at N=4, ~30rem per card at
              max-w-5xl). Four columns were rejected: ~17rem per card is
              narrower than the 19rem already judged too tight for the bio.
              The odd-last-card branch below is inert at even N and
              self-computes, so N=3 and N=5 keep their shipped shape. */}
          <div
            ref={foundersGridRef}
            className={cn(
              "grid md:grid-cols-2 gap-8 mx-auto",
              founders.length % 3 === 1
                ? "lg:grid-cols-2 max-w-5xl"
                : "lg:grid-cols-3 max-w-5xl lg:max-w-6xl",
            )}
          >
            {founders.map((f, i) => (
              <Reveal
                key={f.name}
                delay={i * 100}
                className={
                  i === founders.length - 1 && founders.length % 2 === 1
                    ? "h-full md:col-span-2 md:justify-self-center md:w-[calc(50%-1rem)] lg:col-span-1 lg:w-auto"
                    : "h-full"
                }
              >
              {/* Centre-focus registers the CARD, not the 80px portrait: the
                  band is ~10vh tall, which a circle that small would cross in
                  a beat, flashing colour and losing it again while the reader
                  is still on the bio. The card holds the band for as long as
                  it is being read. */}
              <div
                ref={portraitFocusRef}
                id={f.anchor}
                className="card-steel rounded-2xl p-8 h-full scroll-mt-32"
              >
                {/* Stacks below `sm`. MEASURED at a 16px root: the row's
                    min-content is portrait 80 + gap 24 + name/role block 140
                    = 244, and `p-8` adds 64 → a 308px card inside a 256px
                    column at 320px, which is 22px of document overflow (the
                    block is a flex item, so `min-width: auto` refuses to
                    compress it). Stacking drops min-content to max(80, 140) +
                    64 = 204 with room to spare, and `sm:flex-row sm:gap-6`
                    restores the original row byte-for-byte from 640px up. */}
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6 mb-6">
                  <div
                    className="founder-portrait relative w-20 h-20 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/30"
                    onPointerEnter={onPortraitEnter}
                  >
                    {/* 112%-bleed drift target — the whole media stack
                        (duotone base, tint, ring, color layer) counter-slides
                        together so hover stays registered. */}
                    <div
                      ref={(el) => {
                        portraitDriftRefs.current[i] = el;
                      }}
                      className="absolute inset-x-0 top-[-6%] h-[112%] will-change-transform"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.image}
                        alt={f.name}
                        className="founder-portrait__base absolute inset-0 w-full h-full object-cover object-[50%_20%]"
                        loading="lazy"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-[#0B1422]/35"
                      />
                      <div
                        aria-hidden="true"
                        className="founder-portrait__ring absolute inset-0"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.image}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="founder-portrait__color absolute inset-0 w-full h-full object-cover object-[50%_20%]"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  {/* max-sm:basis-auto: once the header stacks, `flex-1`'s
                      `flex-basis: 0%` would apply to the COLUMN's main axis
                      (height) instead of the width. Auto basis keeps the
                      block at its content height while stacked; from `sm` up
                      the untouched `flex-1` governs the row as before. */}
                  <div className="flex-1 max-sm:basis-auto w-full sm:w-auto">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold">{f.name}</h3>
                      <a
                        href={f.linkedIn}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        aria-label={`${f.name} LinkedIn`}
                      >
                        <LinkedinIcon className="w-5 h-5" />
                      </a>
                    </div>
                    <p className="text-primary font-medium text-sm">{isEn ? f.roleEn : f.roleIt}</p>
                  </div>
                </div>
                <p className="text-muted-foreground leading-relaxed">{isEn ? f.bioEn : f.bioIt}</p>
              </div>
              </Reveal>
            ))}
          </div>

          <p className="text-center italic font-serif text-muted-foreground/80 max-w-2xl mx-auto mt-12 text-lg leading-relaxed">
            {isEn
              ? "The founding thesis: business context and engineering judgment in the same room. It is what lets us scope honestly and build only what earns its place."
              : "La tesi fondante: contesto di business e giudizio ingegneristico nella stessa stanza. È ciò che ci permette di definire lo scope con onestà e costruire solo ciò che se lo merita."}
          </p>
        </section>

        {/* Mission, quiet, single statement */}
        <section className="mb-24">
          <div className="container-px">
            <div className="max-w-3xl mx-auto text-center">
              <p className="eyebrow mb-6">{isEn ? "The job" : "Il mestiere"}</p>
              <Reveal>
              <blockquote
                className="font-display text-2xl sm:text-[2rem] leading-[1.2] text-ink text-balance italic"
                style={{ borderLeft: "2px solid hsl(var(--accent))" }}
              >
                <span className="block pl-6 text-left">
                  {isEn
                    ? "“Strategy without execution is a slideshow. We start with the problem, build the smallest useful solution, and scale what works.”"
                    : "“La strategia senza esecuzione è una presentazione. Si parte dal problema, si costruisce la soluzione utile più piccola, e si scala ciò che funziona.”"}
                </span>
              </blockquote>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Three pillars */}
        <section data-line-anchor="rules" className="container-px mb-24">
          <SectionHeading
            align="center"
            className="mx-auto mb-12 max-w-3xl"
            eyebrow={isEn ? "How we work" : "Come lavoriamo"}
            title={
              isEn ? (
                <>
                  Three rules.{" "}
                  <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                    Every project.
                  </span>
                </>
              ) : (
                <>
                  Tre regole.{" "}
                  <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                    Su ogni progetto.
                  </span>
                </>
              )
            }
          />

          {/* Three sequential full-width typographic beats (./rule-beats.tsx)
              — the audit door-beats grammar with one inflection: these are
              RULES, so the "01/02/03" numeral is the hero (large display
              serif, accent-dimmed). Replaced the md:grid-cols-3 card-steel
              grid — the page's lone card offender; num/title/body carried
              over byte-identical, only the card chrome retired. */}
          <RuleBeats rules={pillars} />
        </section>

        {/* Verifiable proof strip */}
        <section className="mb-24">
          <div className="container-px">
            <div className="max-w-4xl mx-auto">
              <p className="text-center eyebrow mb-8" style={{ color: "hsl(var(--accent))" }}>
                {isEn ? "Verifiable, not vibes" : "Verificabile, non a sensazione"}
              </p>
              {/* Bare small ints carry their unit in the sibling span, so the
                  CountUps need `force` (no metric token to satisfy the global
                  parser) and a shorter run (1.2s on a single digit reads
                  glitchy, 0.8s reads like a settle). */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8 text-center">
                <Reveal delay={0}>
                  <div className="font-display text-4xl md:text-5xl text-ink leading-none mb-2">
                    <CountUp value="8" duration={0.8} force />
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      {" "}
                      {isEn ? "yrs" : "anni"}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-mute">
                    {isEn ? "Senior delivery, pre-SerSan" : "Delivery senior, pre-SerSan"}
                  </p>
                </Reveal>
                <Reveal delay={80}>
                  <div className="font-display text-4xl md:text-5xl text-ink leading-none mb-2">
                    {/* Derived, never a literal: the tile must not drift from
                        the archive. Counts only entries Sersan itself was
                        contracted to deliver — prior-employer work is credited
                        separately, in the strip below. */}
                    <CountUp value={String(sersanBuildCount())} duration={0.8} force />
                  </div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-mute">
                    {isEn ? "Systems built as SerSan" : "Sistemi costruiti come SerSan"}
                  </p>
                </Reveal>
                <Reveal delay={160} className="col-span-2 md:col-span-1">
                  <div className="font-display text-4xl md:text-5xl text-ink leading-none mb-2">
                    <CountUp value="1" duration={0.8} force />
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      {" "}
                      PhD
                    </span>
                  </div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-mute">
                    {isEn ? "Applied Mathematics, LSE" : "Matematica Applicata, LSE"}
                  </p>
                </Reveal>
              </div>
              <p className="eyebrow text-center text-[10px] tracking-[0.18em] mt-10">
                {isEn ? "Prior senior delivery" : "Delivery senior precedente"} · Revolut · J.P. Morgan · Deloitte · Brevan Howard · Accenture
              </p>
            </div>
          </div>
        </section>

        {/* Ritual gap — transparent negative space so the persistent canvas
            (z-0) shows through; the route's 3D ritual object world-anchors
            here and the signature line threads it before the CTA. */}
        <div data-line-anchor="ritual" aria-hidden="true" className="py-28 sm:py-40" />

        {/* Final beat */}
        <section data-line-anchor="final-cta" className="container-px">
          <div className="max-w-3xl mx-auto text-center py-12">
            <SectionHeading
              align="center"
              className="mx-auto mb-8 max-w-3xl"
              eyebrow={pick(isEn, FACTS.auditDurationScoped)}
              title={
                isEn ? (
                  <>
                    Start with one problem.{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      Get a written answer.
                    </span>
                  </>
                ) : (
                  <>
                    Si parte da un problema.{" "}
                    <span className="italic" style={{ color: "hsl(var(--accent))" }}>
                      Arriva una risposta scritta.
                    </span>
                  </>
                )
              }
            />
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Button asChild size="lg" className={cn("group", CTA_FLUID_SM)}>
                <Link href={START_HREF}>
                  {pick(isEn, CTA.primary)}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className={CTA_FLUID_SM}>
                <Link href="/contact">
                  {isEn ? "Or just say hello" : "O semplicemente salutateci"}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Duotone→color reveal for the founder portraits — same visual
          contract as the home founders rail (founders-rail.tsx carries the
          identical block; keep them in sync). `--fr-hr` is a registered
          custom property so the color layer's clip circle and its +1.5px
          cyan annulus interpolate from one CSS transition; without
          @property support the reveal snaps, which is acceptable.

          TWO TRIGGERS, one per input class (D-1): `:hover` on a fine pointer,
          and `[data-focus="true"]` on touch — written by lib/use-centre-focus
          on the card nearest the viewport centre. Without the second one
          `--fr-hr` stayed at 0px forever on a phone: the full-colour <img> was
          downloaded and never painted, so every founder read as a permanently
          grey photograph. The touch selector hangs off the CARD (that is what
          the hook registers) and reaches down to the portrait. */}
      <style>{`
        @property --fr-hr {
          syntax: "<length-percentage>";
          inherits: true;
          initial-value: 0px;
        }
        .founder-portrait {
          --fr-hr: 0px;
          transition: --fr-hr 0.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .founder-portrait__base {
          filter: grayscale(1) brightness(0.85);
        }
        .founder-portrait__color {
          clip-path: circle(var(--fr-hr) at var(--fr-mx, 50%) var(--fr-my, 50%));
        }
        .founder-portrait__ring {
          background: #3BE1FF;
          opacity: 0;
          transition: opacity 0.25s ease;
          clip-path: circle(calc(var(--fr-hr) + 1.5px) at var(--fr-mx, 50%) var(--fr-my, 50%));
        }
        @media (hover: hover) and (pointer: fine) {
          .founder-portrait:hover { --fr-hr: 150%; }
          .founder-portrait:hover .founder-portrait__ring { opacity: 0.9; }
        }
        .card-steel[data-focus="true"] .founder-portrait { --fr-hr: 150%; }
        .card-steel[data-focus="true"] .founder-portrait__ring { opacity: 0.9; }
        @media (prefers-reduced-motion: reduce) {
          .founder-portrait,
          .founder-portrait__ring { transition: none; }
        }
      `}</style>
    </div>
  );
}
