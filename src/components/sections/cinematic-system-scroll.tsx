"use client";

/**
 * CinematicSystemScroll — pinned 315vh cinematic spine of the homepage.
 *
 * One ScrollTrigger scrubs the CSS-sticky pin across 3 GROUPED panels
 * (hero · map · ship — the 5 canonical STAGE_CONTENT copy blocks compressed
 * via DESKTOP_GROUPS, restyle step 4 / merge option A). Scroll progress
 * (0..1) is written into progressRef on every ScrollTrigger update. The 3D
 * scene reads from progressRef each frame; no React state churn.
 *
 * STAGE 05 ("handover") IS NOT HERE (owner 2026-08-07: "hai duplicato la
 * sezione 05" — it rendered twice, spine + passage echo). Its full copy
 * block (eyebrow · title · body · proof chips · CTA cluster) now lives ONCE
 * as panel 1 of the singularity passage's horizontal track
 * (singularity-passage.tsx), which directly follows this section. The spine
 * runs 01→04 and hands the visitor to the passage at the pin end — and that
 * handoff is PINNED on both sides (owner round 4, 2026-08-09): the passage
 * pulls itself up one viewport (marginTop −100vh, armed desktop path only)
 * so its sticky stage is already stuck at top:0 when this pin releases, and
 * this stage's final 100vh of travel happens over a motionless frame. Which
 * means everything still visible HERE at progress 1 would read as motion:
 * the panels already fade to 0 across their final band, and the StageRail
 * fades on that same band (see its exit-fade note below).
 *
 * Text panels are absolutely positioned over the scene and fade in/out
 * across their group range, with a small lead-in/lead-out. The site-wide
 * snap engine (lib/scroll-snap) settles wheel flicks onto each grouped
 * panel's MIDPOINT (plus progress 0), never 1 — a barrier at the pin end
 * vetoes settles crossing into the handoff, so leaving the spine is always
 * the visitor's own scroll (owner 2026-08-09: no scripted camera descent,
 * no page lock at the pin end — the passage owns the only camera move).
 *
 * THREE RENDER PATHS (MOBILE_HOME_SPEC §6 Chunk D, 2026-08-11 — was two):
 *
 *   "desktop"  fine pointer, >768px, motion OK → the 315vh pinned spine above.
 *   "compact"  coarse pointer OR ≤768px, motion OK → CompactSpine: the SAME
 *              three DESKTOP_GROUPS panels, the SAME panelOpacity engine and
 *              the SAME inert grammar, crossfading on ONE sticky 100svh stage
 *              under a 180svh runway. 4.00 viewports of phone document height
 *              become 1.80. No new vocabulary: StagePanel just takes `compact`,
 *              which swaps the type scale for the mobile clamps this file
 *              already ships and makes the panel its own overflow guard.
 *   "stacked"  prefers-reduced-motion, ON ANY VIEWPORT → StackedFallback (the
 *              former MobileFallback, body untouched): the UNGROUPED 5 copy
 *              blocks, no pin, no scrub. Also the landscape PHONE
 *              (LANDSCAPE_PHONE_MQ: coarse + landscape + ≤500px tall, mobile-
 *              parity Phase 5) — a sticky 100svh stage has no room there.
 *
 * THE SPLIT MATTERS (MOBILE_HOME_SPEC §0): the old gate was
 * `isMobile || reduceMotion` → one fallback, so routing the compact spine off
 * `isMobile` alone would have shipped a scrubbed pin to a reduced-motion user
 * on a 27" monitor. `reduceMotion` is now the ONLY thing that reaches
 * StackedFallback, and `(pointer: coarse)` joins `(max-width: 768px)` in the
 * compact query — which also closes D-11 (a coarse 1024px tablet used to get
 * the desktop HeroIntroGate and its `touchmove` preventDefault: a full scroll
 * hijack with no touch escape).
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Button,
  CTA_FLUID_SM,
  CTA_WRAP_SM,
  CTA_WRAPPER_SM,
} from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { HeroHoverLayer } from "@/components/hero-hover-layer";
import { HeroIntroGate } from "@/components/fx/hero-intro-gate";
import { SPINE_GUTTER_STYLE } from "@/components/fx/spine-gutter";
import { useLanguage } from "@/components/language-provider";
import { useTextMorphStore } from "@/webgl/store/textMorphStore";
import { useTierStore } from "@/webgl/store/tierStore";
import { useIntroStore } from "@/webgl/store/introStore";
import { isIntroSkipped, markIntroSkipped } from "@/lib/intro-skip";
import { snapPoint, snapBarrier } from "@/lib/scroll-snap";
import type { Language } from "@/data/translations/types";
import { START_HREF } from "@/lib/site";
import { CTA } from "@/data/copy";
import {
  SPINE_HEIGHT_VH,
  COMPACT_SPINE_SVH,
  brandBeatArmed,
  SPINE_BEATS,
} from "@/lib/spine";
import { RollLetters } from "@/components/fx/roll-letters";
import { useSpineBeats } from "@/components/fx/beat-choreographer";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

// === Path media queries ===================================================
// ONE source for the React render branch AND the compact spine's
// gsap.matchMedia block, so the two can never disagree about which path is
// live. `(pointer: coarse)` is OR-ed into the width query (MOBILE_HOME_SPEC
// §6 Chunk D): a coarse 1024px tablet is a touch device whatever its width,
// and it must not receive the desktop HeroIntroGate's touchmove hijack (D-11).
const COMPACT_MQ = "(max-width: 768px), (pointer: coarse)";
const MOTION_OK_MQ = "(prefers-reduced-motion: no-preference)";
// Landscape PHONE (mobile-parity Phase 5, plans/2026-08-17-mobile-parity.md):
// a coarse device turned sideways with ≤500px of height has no room for a
// pinned 100svh stage — the sticky compact spine would be a scrub across a
// stage shorter than its own copy. ERA refuses landscape outright
// (`.landscape-cover`); we do NOT block: the hero simply resolves to the
// existing StackedFallback (no pin, no scrub) for as long as the query holds
// and returns to the compact spine on rotate-back. Coarse-only by
// construction, so no desktop window (fine pointer) can ever match it.
const LANDSCAPE_PHONE_MQ =
  "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";

// === Stage definitions ====================================================
// Each stage carries both EN and IT copy. `localizeStages(language)` resolves
// them into a flat `Stage[]` for the active language; the default/SSR render
// is always English (the language provider starts at "en" on the server).
// Stages are pure COPY BLOCKS — the desktop scroll ranges live in
// DESKTOP_GROUPS below (a block can share a panel with a sibling).
type Stage = {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  // Optional extra content rendered under the body. (Currently unused: the
  // handover stage that carried the proof-chip extras moved into the
  // singularity passage. The plumbing stays — it is generic panel
  // machinery any future block can use.)
  extras?: React.ReactNode;
};

type LocalizedStage = {
  id: string;
  eyebrow: { en: string; it: string };
  title: { en: React.ReactNode; it: React.ReactNode };
  body: { en: React.ReactNode; it: React.ReactNode };
  extras?: { en: React.ReactNode; it: React.ReactNode };
};

const STAGE_CONTENT: LocalizedStage[] = [
  {
    id: "dormant",
    eyebrow: {
      en: "Custom software, automation & AI studio · London",
      it: "Studio di software su misura, automazione e AI · Londra",
    },
    title: {
      en: (
        <>
          We build the software your business is{" "}
          <span className="text-[hsl(var(--accent))] font-display font-medium">
            missing.
          </span>
        </>
      ),
      it: (
        <>
          Costruiamo il software che alla vostra azienda{" "}
          <span className="text-[hsl(var(--accent))] font-display font-medium">
            manca.
          </span>
        </>
      ),
    },
    body: {
      en: "SerSan builds custom software, workflow automation and AI for growing businesses — from one manual process to a full production platform.",
      it: "SerSan costruisce software su misura, automazione dei processi e AI per aziende in crescita: da un singolo processo manuale a una piattaforma completa in produzione.",
    },
  },
  {
    id: "signals",
    eyebrow: { en: "01 / Problem", it: "01 / Problema" },
    title: {
      en: <>It starts with one problem worth solving.</>,
      it: <>Si parte da un problema che vale la pena risolvere.</>,
    },
    body: {
      en: "The manual work, the spreadsheet nobody trusts, the thing that keeps breaking. We map what you actually have, not what the org chart says.",
      it: "Il lavoro manuale, il file Excel di cui nessuno si fida, la cosa che si rompe. Mappiamo ciò che avete davvero, non ciò che dice l'organigramma.",
    },
  },
  {
    id: "audit",
    eyebrow: { en: "02 / Scope", it: "02 / Scope" },
    title: {
      en: (
        <>
          We find what{" "}
          <span className="text-[hsl(var(--accent))] font-display font-medium">
            should not
          </span>{" "}
          be built before code becomes debt.
        </>
      ),
      it: (
        <>
          Individuiamo cosa{" "}
          <span className="text-[hsl(var(--accent))] font-display font-medium">
            non va
          </span>{" "}
          costruito prima che il codice diventi debito.
        </>
      ),
    },
    body: {
      en: "We scope it before anyone writes code: cost, risk, effort, and what it actually saves. Sometimes the honest answer is to build less, or nothing.",
      it: "Definiamo lo scope prima che qualcuno scriva codice: costi, rischi, effort e quanto vi fa risparmiare davvero. A volte la risposta onesta è costruire meno.",
    },
  },
  {
    id: "build",
    eyebrow: { en: "03 / Build", it: "03 / Sviluppo" },
    title: {
      en: <>Then we design and build the system.</>,
      it: <>Poi progettiamo e costruiamo il sistema.</>,
    },
    body: {
      en: "Internal tools, integrations, automations, web and mobile apps, and AI where it earns its place. Production-grade when it is actually required.",
      it: "Strumenti interni, integrazioni, automazioni, app web e mobile, e AI dove se lo merita. Production-grade quando serve davvero, non per abitudine.",
    },
  },
  {
    id: "operate",
    eyebrow: { en: "04 / Proof", it: "04 / Prova" },
    title: {
      en: <>Working software is the only proof.</>,
      it: <>L'unica prova è il software che funziona.</>,
    },
    body: {
      en: "We measure whether it saved the time or the money it was meant to. Monitoring, human review and rollback paths are wired in from day one, not bolted on later.",
      it: "Misuriamo se ha davvero fatto risparmiare il tempo o il denaro promessi. Monitoraggio, revisione umana e rollback sono integrati dal primo giorno, non aggiunti dopo.",
    },
  },
  // NOTE: the 6th canonical block ("handover", 05) moved WHOLESALE into
  // singularity-passage.tsx (HANDOVER_STAGE there) — panel 1 of the
  // horizontal track. One source, one render (owner 2026-08-07).
];

function localizeStages(language: Language): Stage[] {
  return STAGE_CONTENT.map((s) => ({
    id: s.id,
    eyebrow: s.eyebrow[language],
    title: s.title[language],
    body: s.body[language],
    extras: s.extras ? s.extras[language] : undefined,
  }));
}

// === Desktop grouping layer (restyle step 4 — merge option A) =============
// STAGE_CONTENT stays the canonical, byte-identical 5 copy blocks (the
// mobile fallback and the IT localisation iterate it UNGROUPED). The desktop
// pin renders them as 3 grouped panels: hero · map (signals+audit) · ship
// (build+operate). Ranges are fractions of the spine's own ScrollTrigger
// progress; the scrub travel is SPINE_HEIGHT_VH − 100vh = 215vh, so: hero
// 58vh (the 2026-06-10 hero-widening decision set a ~60vh readability floor
// — after the intro gate releases, "We build..." must survive real
// scrolling), map 81.7vh, ship 75.3vh — each group's REAL scroll length is
// unchanged from the 4-group layout; only the handover share was removed
// with its panel. The ship group gets NO end-of-pin special case (owner
// 2026-08-09: "da 04 a 05... la stessa animazione che c'è tra 02 e 03"):
// panelOpacity fades stage 04 out across its final band exactly like the map
// group's own exit — the 02→03 grammar — so the sticky stage scrolls away
// EMPTY (black space on black space, the section seam invisible) and section
// 05 materializes in place a short breath later, inside the passage's own
// stage, which the round-4 overlap has ALREADY pinned at top:0 (its
// PANEL_ENTER band mirrors this crossfade at the same 6.5vh rate). The 04→05
// handoff must never read as a scroll — and now nothing moves during it.
type StageGroup = {
  id: string;
  /** Spine-ScrollTrigger progress where this panel's lit window starts. */
  start: number;
  /** Progress where the lit window ends. Groups stay contiguous 0 → 1. */
  end: number;
  /** STAGE_CONTENT block ids rendered inside this panel (1-2, stage order). */
  blockIds: string[];
};

const DESKTOP_GROUPS: StageGroup[] = [
  { id: "hero", start: 0, end: 0.27, blockIds: ["dormant"] },
  { id: "map", start: 0.27, end: 0.65, blockIds: ["signals", "audit"] },
  { id: "ship", start: 0.65, end: 1, blockIds: ["build", "operate"] },
];

// Snap stations (2026-07-23 hardening — client: every scroll must come to
// rest ON a beat): the MIDPOINT of every grouped panel's range — maximal
// margin from both crossfade edges, so a settle always rests on a fully-lit
// panel. Never 1 (the pin end is the handoff into the singularity passage;
// a station there would park the visitor astride the seam — a barrier below
// vetoes any settle crossing it, so leaving the spine is always a deliberate
// user scroll). Progress 0 is registered separately as the "back to hero"
// station: a park at the very top is stable (the intro gate only re-engages
// on a further UP-wheel at y≈0, never on the settle itself).
const SNAP_STATION_PROGRESS = DESKTOP_GROUPS.map((g) => (g.start + g.end) / 2);

// Outer height of the COMPACT spine, in svh (MOBILE_HOME_SPEC §2 row 1:
// 3376px / 4.00vh → 1519px / 1.80vh at 390×844). The sticky stage owns 100 of
// it, so the scrub travel is 80svh ≈ 675px — ~27svh per grouped panel, which
// sits just above seqStore's documented ~23svh scrubbability floor.
//
// svh, never vh: `vh` is the LARGE viewport (mobile address bar hidden), so a
// vh runway over a sticky stage is taller than what the user can actually see
// while the bar is up and the frame jumps the moment the bar collapses. `svh`
// is defined against the bar-VISIBLE viewport and is frozen against that
// resize for free — no listener, no px capture at mount.
//
// The constant itself lives in src/lib/spine.ts (COMPACT_SPINE_SVH, imported
// above) since mobile-parity Phase 4b: navbar.tsx derives the compact hero
// header-hide reveal band from the same number, so the two can never drift.
//
// The Phase 4b kill-switch HERO_BRAND_COMPACT (owner Decision 2: "brand intro
// 'Sersan AI' anche su telefono capace, tap = skip") lives in src/lib/spine.ts
// too, imported above: CompactSpine's `brandArmed` reads it here (the compact
// anchor + tap/Esc skip), and Scene.tsx AND-s the same constant into its
// `homeSingularityLite` gate, so flipping it off removes BOTH the anchor and
// the lite eclipse island in one place. Desktop never consults it.

// CTA + hint labels used in the desktop spine, the mobile fallback, AND the
// singularity passage's panel 05 (exported: the passage renders the same
// ctaPrimary / seeSelectedWork strings on section 05's CTA cluster — one
// source, zero copy drift).
export const SPINE_COPY = {
  en: {
    ctaPrimary: CTA.primary.en,
    seeSelectedWork: "See selected work",
    // Hero cluster — the DOM payoff the intro gate releases onto (the
    // [data-hero-stagger] cascade in StagePanel's isHero branch). Eyebrow is
    // the brand's canonical positioning line (same string as the OG image).
    heroEyebrow: "Custom software, automation & AI · For founders & SMEs · London",
    heroSub:
      "From one manual workflow to a full production platform. You don't need a CTO to start.",
    // Intro-gate skip affordance (HeroIntroGate's bottom-right mono label).
    skipIntro: "Skip intro",
  },
  it: {
    ctaPrimary: CTA.primary.it,
    seeSelectedWork: "Guarda i nostri lavori",
    heroEyebrow: "Software su misura, automazione e AI · Per founder e PMI · Londra",
    heroSub:
      "Da un processo manuale a una piattaforma in produzione. Non serve un CTO per iniziare.",
    skipIntro: "Salta l'intro",
  },
} as const;

// Opacity for a panel given current progress + its stage range. The fade-in
// and fade-out happen STRICTLY INSIDE [start, end] so adjacent headlines never
// overlap — exactly one headline owns the screen at a time. The hero (start 0)
// stays lit at the very top (it must be visible at progress 0 for SSR); EVERY
// panel — the ship group included — fades out across its final band, so
// stage 04 dissolves in place just before the pin releases and the stage
// scrolls away empty (owner 2026-08-09: the 04→05 handoff reads like 02→03,
// never like a scroll).
function panelOpacity(
  progress: number,
  start: number,
  end: number,
  isHero = false,
): number {
  const fade = Math.min(0.03, (end - start) * 0.3);
  if (progress <= start) return isHero ? 1 : 0;
  if (progress >= end) return 0;
  let o = 1;
  if (!isHero && progress < start + fade) o = (progress - start) / fade;
  if (progress > end - fade) o = Math.min(o, (end - progress) / fade);
  return Math.max(0, o);
}

// === Beat markup helpers (SPINE_BEATS) ====================================
// Data hooks the beat engine (fx/beat-choreographer.ts) queries. All of them
// collapse to nothing when the kill-switch is off, so the legacy path renders
// byte-identical markup. Exported: the singularity passage's panel 05 uses
// the same grammar (one vocabulary for 01..05).

/** Attributes for a beat part (title/body): grouped per block by `of`. */
export function beatPartAttrs(
  part: "title" | "body",
  of: string,
): Record<string, string> | undefined {
  if (!SPINE_BEATS) return undefined;
  return { [`data-beat-${part}`]: "", "data-beat-of": of };
}

/** Attributes for a trailing block (proof chips, CTA row): whole-block
 * autoAlpha + y after the body. */
export function beatTailAttrs(of: string): Record<string, string> | undefined {
  if (!SPINE_BEATS) return undefined;
  return { "data-beat-tail": "", "data-beat-of": of };
}

/** Attributes for a beat eyebrow. `data-scramble-done="1"` keeps the global
 * LabelScrambler from decoding it at first paint (its panel is invisible
 * then — IO ignores opacity); the ENTER re-triggers the decode on arrival
 * via the "sersan:scramble" event. */
export function beatEyebrowAttrs(of: string): Record<string, string> | undefined {
  if (!SPINE_BEATS) return undefined;
  return { "data-beat-eyebrow": "", "data-beat-of": of, "data-scramble-done": "1" };
}

/** The 1px hairline drawn (scaleX) at the head of every numbered block —
 * door-beats grammar. Nothing on the legacy path. */
export function BeatRule({ id }: { id: string }) {
  if (!SPINE_BEATS) return null;
  return (
    <span
      data-beat-rule=""
      data-beat-of={id}
      aria-hidden="true"
      className="block h-px w-full bg-rule/70 mb-3"
    />
  );
}

/** Eyebrow text with the leading "0N" index as RollLetters columns (the R1
 * "counter that rolls"); the rest of the string is untouched text. The
 * rendered string concatenates to `text` verbatim (RollLetters' sr-only
 * node + the in-flow glyphs). Plain text on the legacy path. */
export function BeatEyebrowText({ text }: { text: string }) {
  const m = SPINE_BEATS ? /^(\d{2})([\s\S]*)$/.exec(text) : null;
  if (!m) return <>{text}</>;
  return (
    <>
      <RollLetters text={m[1]!} decoys="self" />
      {m[2]}
    </>
  );
}

// === Stage panel ==========================================================
// Renders one DESKTOP_GROUPS entry. Single-block groups (the hero)
// look exactly like the pre-compression panels; merged groups render BOTH
// copy blocks inside one lit window — the first block as a compact companion
// (its own eyebrow + smaller heading + body), the second as the lead with
// the display-size title (research: "audit title leads, signals as the
// upper companion"; same two-block layout for build/operate). Eyebrow
// numbering order (01 before 02, 03 before 04) is preserved in the DOM.
//
// `compact` (CompactSpine only — the desktop spine passes it UNDEFINED and
// this component renders byte-for-byte as before) changes three things and
// nothing else:
//   1. the type scale swaps to the mobile clamps this file already ships in
//      StackedFallback — H1 clamp(2.25rem,8vw,3.25rem), H2 clamp(2rem,7vw,3rem);
//   2. the panel becomes its own overflow guard (see the className note);
//   3. (mobile-parity Phase 4b) the WebGL text-particle intro IS consulted on
//      compact too — the same `textMorphStore.getState()` read as desktop, no
//      `!compact` bypass. On every phone that does NOT arm the compact brand
//      (HERO_BRAND_COMPACT off, fxBudget.level < 2, WebGL2 backend, build
//      failure) `active` is simply false by construction — nothing ever writes
//      it without a `[data-hero-brand]` anchor — so the H1 renders visible and
//      the cascade branch is inert exactly as before. Only when CompactSpine
//      arms the compact anchor does the H1 crossfade / [data-hero-stagger]
//      cascade run, driven by the time-based beat in HeroTextParticles.
function StagePanel({
  group,
  blocks,
  progressRef,
  isHero,
  compact,
  copy,
  index,
  language,
}: {
  group: StageGroup;
  blocks: Stage[];
  progressRef: React.MutableRefObject<number>;
  isHero?: boolean;
  compact?: boolean;
  copy: (typeof SPINE_COPY)[Language];
  /** DESKTOP_GROUPS index — the beat engine's [data-beat] key. */
  index: number;
  /** key={language} on every split target so an EN↔IT toggle remounts them
   * under the beat hook's revertOnUpdate rebuild (no orphaned masks). */
  language: Language;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Drive opacity via rAF (no React re-renders). Early-returns when the
  // computed opacity is unchanged so an idle (un-scrolled) spine stops
  // thrashing styles.
  //
  // SPINE_BEATS (2026-08-27): the per-panel opacity/translate/inert writes
  // below belong to the LEGACY crossfade path. With the beat engine on
  // (useSpineBeats, fx/beat-choreographer.ts) this effect keeps ONLY the
  // hero's morph branch — the domReveal-scrubbed H1 crossfade + cluster
  // cascade + wash whisper, which the intro gate replays in reverse — and
  // non-hero panels run no rAF at all (one engine loop drives every panel).
  useEffect(() => {
    if (SPINE_BEATS && !isHero) return;
    let raf = 0;
    let lastO = Number.NaN;
    let lastReveal = Number.NaN;
    let lastActive = false;
    // Last applied inert/aria state. Starts null so the FIRST tick always
    // syncs in BOTH directions: panels that start hidden get their inert/
    // pointer-events-none write as before, and the hero — which starts
    // VISIBLE but ships the class-level pointer-events-none every stacked
    // panel shares — gets its pointer-events:auto write too. (A `true` seed
    // here would skip that first flip and leave the hero's CTA cluster
    // click-dead on every path where the morph never activates.)
    let lit: boolean | null = null;
    let kids: HTMLElement[] | null = null;
    // The panel-scoped contrast wash (hero only — queried lazily like `kids`;
    // `undefined` = not yet looked up, `null` = absent, e.g. compact).
    let wash: HTMLElement | null | undefined;
    const tick = () => {
      const el = ref.current;
      const p = progressRef.current;
      // The WebGL text-particle intro (HeroTextParticles) owns the hero
      // headline visuals while active: the white H1 is SUPPRESSED for the
      // whole hero stay (the particle text IS the title — user decision
      // 2026-06-10), and the cluster below it ([data-hero-stagger]: eyebrow,
      // sub, CTA pair) cascades in as domReveal rises over the gate's final
      // stretch — the intro releases onto an actionable invitation, not an
      // empty frame. Inactive (any fallback) → everything renders visible
      // from first paint, no cascade. Read on compact too (Phase 4b): the
      // compact brand beat drives the same store, and `active` stays false
      // on every phone that does not arm it.
      const morph = isHero ? useTextMorphStore.getState() : null;
      const active = !!(morph && morph.active);
      const reveal = active && morph ? morph.domReveal : 1;
      // Beat engine on: the root's opacity is the engine's (a constant 1
      // here keeps the change-detection below keyed on the morph alone).
      const baseO = SPINE_BEATS ? 1 : panelOpacity(p, group.start, group.end, isHero);
      const o = baseO;
      if (el && (o !== lastO || (active && reveal !== lastReveal) || active !== lastActive)) {
        lastO = o;
        lastReveal = reveal;
        if (!SPINE_BEATS) {
          el.style.opacity = String(o);
          // Subtle Y offset for entry — anchored at the top of viewport. Uses
          // the BASE opacity so the H1 rect the particle system anchors to
          // never shifts while the morph hides it.
          const yOffset = (1 - baseO) * 16;
          el.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
        if (isHero) {
          const h1 = el.querySelector<HTMLElement>("[data-hero-headline]");
          if (active) {
            // The real H1 CROSSFADES IN as the particle title yields
            // (HeroTextParticles fades its whole block by 1-reveal): during
            // the journey the particles ARE the title; at rest the page hands
            // back to crisp DOM text — without this the released hero has no
            // headline at all. Opacity ONLY, never transform: the particle
            // system anchors to this element's live rect, so it must not
            // move. Reverse scrubbing mirrors automatically (pure in reveal).
            if (h1) {
              const hT = Math.min(1, Math.max(0, (reveal - 0.35) / 0.6));
              h1.style.opacity = String(hT * hT * (3 - 2 * hT));
            }
            if (!kids) {
              kids = Array.from(
                el.querySelectorAll<HTMLElement>("[data-hero-stagger]"),
              );
            }
            kids.forEach((k, i) => {
              const t = Math.min(
                1,
                Math.max(0, (reveal - i * 0.14) / 0.55),
              );
              const e = t * t * (3 - 2 * t); // smoothstep ease
              k.style.opacity = String(e);
              k.style.transform = `translate3d(0, ${(1 - e) * 26}px, 0)`;
            });
            // The panel wash inherits the dead ScrimDimmer's one live duty
            // (round 7-3): while the particle intro owns the hero every copy
            // node above is suppressed, so the wash protects nothing and
            // would only dim the GL wordmark (its box overlaps the mark's
            // left half — the exact "eating the left half of the particle
            // headline" failure class the old dimmer existed for). Same
            // formula: a whisper at reveal 0, full again as the DOM copy
            // cascades in. Reverse scrubbing mirrors (pure in reveal).
            if (wash === undefined)
              wash = el.querySelector<HTMLElement>("[data-panel-wash]");
            if (wash) wash.style.opacity = String(0.15 + 0.85 * reveal);
          } else if (lastActive) {
            // Morph torn down (unmount/fallback) → restore the plain hero.
            if (h1) h1.style.opacity = "";
            kids?.forEach((k) => {
              k.style.opacity = "";
              k.style.transform = "";
            });
            if (wash) wash.style.opacity = "";
          }
        }
        // Below this threshold the panel is visually hidden: disable pointer
        // events AND remove it from focus order + the a11y tree (inert).
        // With the intro active the panel only counts as visible once the
        // cascade is actually in (hidden CTAs must never be clickable).
        const visible = o > 0.6 && (!active || reveal > 0.5);
        // (Beat engine on: inert/aria/pointer-events follow the timelines —
        // enter-start / exit-complete — plus the same reveal rule for the
        // hero, all inside useSpineBeats. Never double-own them here.)
        if (!SPINE_BEATS && visible !== lit) {
          lit = visible;
          el.style.pointerEvents = visible ? "auto" : "none";
          // `inert` exists on HTMLElement in current TS lib; cast for safety.
          (el as HTMLElement & { inert: boolean }).inert = !visible;
          if (visible) el.removeAttribute("aria-hidden");
          else el.setAttribute("aria-hidden", "true");
          // (The proof-chip count-up moved with stage 05 into the
          // singularity passage — no chips render inside the spine now.)
        }
        lastActive = active;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressRef, group.start, group.end, isHero, compact]);

  // Initial opacity is computed from progress = 0 so the hero stage (which
  // begins at start=0) is fully visible in the server-rendered HTML. The
  // rAF loop in useEffect takes over once JS hydrates. This makes the H1
  // present and visible without waiting for client hydration.
  const initialOpacity = panelOpacity(0, group.start, group.end, isHero);
  const initialY = (1 - initialOpacity) * 16;
  const initiallyHidden = initialOpacity <= 0.6;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute inset-0 flex pointer-events-none",
        // COMPACT: the stage is a fixed 100svh box, so a panel that outgrows
        // it — a 390px-tall landscape phone, or IT copy at 360×640 — must stay
        // READABLE, never truncated (MOBILE_HOME_SPEC §3.3: "Never truncate").
        // The panel becomes its own scroll container and the block centres via
        // `my-auto`: auto margins centre a flex item WITHOUT the top-clipping
        // `items-center` causes once content overflows a scroll box. When the
        // copy fits — every portrait phone — the container is not scrollable at
        // all, so the swipe is the page's, exactly as before. `pt` clears the
        // fixed nav on BOTH branches here (the desktop non-hero panels can
        // rely on centring inside 100vh; a phone cannot).
        compact
          ? cn(
              "overflow-y-auto overscroll-contain pb-12 sm:pb-16",
              isHero
                ? "pt-[max(var(--header-h),6rem)]"
                : "pt-[max(var(--header-h),4.5rem)]",
            )
          : // Every stage is vertically centered so the copy sits on the orb's
            // eyeline — orb (right) + copy (left) read as one balanced scene
            // instead of the orb floating high while the text sinks to the
            // bottom (the old `items-end` opened a large diagonal void on wide
            // screens). The hero keeps top padding so the eyebrow + first
            // headline line never slide under the fixed nav on short/laptop
            // viewports (~600-720px).
            isHero
            ? "items-center pt-[max(var(--header-h),6rem)] pb-12 sm:pb-16"
            : "items-center pb-12 sm:pb-16",
      )}
      // The house overflow-guard pairing (see final-cta.tsx, and the
      // LITE_PANEL_SCROLL prescription in MOBILE_HOME_SPEC §3.3).
      //
      // Precisely what it does here: Lenis runs `smoothWheel` only —
      // `syncTouch` is deliberately OFF (lenis-singleton.ts) — so touch inside
      // an overflowing panel is native either way and this attribute is a
      // no-op on a phone. It matters for the one device that can reach the
      // overflow case with a WHEEL (a coarse tablet with a mouse): without it
      // Lenis would swallow the wheel and scroll the page while the panel's own
      // hidden copy stayed unreachable. The price is no wheel smoothing over
      // the compact hero on that same rare device — the correct side to err on.
      data-lenis-prevent={compact ? "" : undefined}
      // Panels that start hidden are inert + removed from the a11y tree from
      // first paint; the rAF tick toggles this as stages light/dim.
      inert={initiallyHidden}
      aria-hidden={initiallyHidden || undefined}
      // Beat engine key (fx/beat-choreographer.ts). The SSR pose stays the
      // same hidden/visible inline opacity; the engine never transforms a
      // panel root (the hero's rect must not move under the particle intro),
      // so the legacy translate + will-change are written only on the legacy
      // path.
      data-beat={SPINE_BEATS ? index : undefined}
      style={
        SPINE_BEATS
          ? { opacity: initialOpacity }
          : {
              opacity: initialOpacity,
              transform: `translate3d(0, ${initialY}px, 0)`,
              willChange: "opacity, transform",
            }
      }
    >
      {/* SPINE_GUTTER_STYLE (owner 2026-09-04): stages 01..04 hold the laptop
          composition at every width — .container-px centres its 1600px box and
          walks the labels toward the middle of a wide monitor. No-op below
          1600px; see fx/spine-gutter.ts for the whole argument, including why
          this is an inline style and not a class. Stage 05
          (singularity-passage) carries the same style so the pinned 04→05
          handoff cannot shift sideways. */}
      <div
        className={cn("container-px w-full", compact && "my-auto")}
        style={SPINE_GUTTER_STYLE}
      >
        {/* relative z-10 (hero only): the copy block must paint/hit ABOVE the
            HeroHoverLayer sense overlay (z-[5], right 46%, full height) — on
            ~1000-1300px viewports the CTA row crosses the 54% mark and the
            overlay would otherwise swallow clicks on the secondary button's
            right half. Lifting the block costs the mark's hover-erode only
            the pixels over the copy itself. */}
        {/* `relative` is gated exactly like the wash below (desktop always;
            compact only when the hero already carried it): it exists solely
            to contain the wash's absolute box, so the compact non-hero
            class set stays byte-identical to pre-round-7-3. */}
        <div
          className={cn(
            "max-w-[42rem]",
            (!compact || isHero) && "relative",
            isHero && "z-10",
          )}
        >
          {/* Panel-scoped contrast wash (round 7-3 — REPLACES the two
              stage-level hero scrims, continuous-space spec §A.5.2). An
              absolutely positioned child of the copy column with generous
              negative insets, so the existing panelOpacity engine fades it
              WITH the copy for free: it enters, crossfades and exits with
              each stage — including stage 04's 0.97→1 exit band — instead of
              sitting screen-fixed over the passage's panning world (the
              owner's "ombra blu tagliata": a screen-fixed left smudge cannot
              survive the rightward head-turn). `closest-side` radial reaches
              exactly 0 INSIDE its own box (quad-edge hygiene rule §A.6) — no
              gradient stop or stage clip can ever paint a cut edge. Far less
              alpha than the old scrims (0.88/0.85 stacked): it is always
              centred on the text it protects, never holding AA across the
              whole left third at every camera pose. Desktop only: the compact
              spine keeps its own centred full-frame wash for now (§B.3 —
              "compact wash until its own pass"); a second wash there would
              double-darken the phone hero. -z-10 sinks it behind the copy
              inside the panel's own stacking context (willChange above).
              data-panel-wash: the hero rAF above inherits the dead
              ScrimDimmer's one live duty through it — while the particle
              intro owns the hero this box overlaps the GL wordmark's left
              half, so it drops to a whisper (0.15 + 0.85·domReveal) and
              eases back exactly as the DOM copy cascades in. */}
          {!compact && (
            <div
              data-panel-wash
              aria-hidden="true"
              className="absolute -inset-x-16 -inset-y-10 -z-10 pointer-events-none"
              style={{
                background:
                  "radial-gradient(closest-side, hsl(var(--bg) / 0.55) 0%, hsl(var(--bg) / 0.28) 55%, transparent 100%)",
              }}
            />
          )}
          {isHero ? (
            <>
              {/* The page's H1 — typography source for the WebGL text-particle
                  intro (HeroTextParticles samples its computed style + width).
                  While the morph is active the rAF above drives it: opacity 0
                  through the journey (the particle text IS the title), then a
                  crossfade IN over the gate's last stretch as the particle
                  block yields — so the released hero rests on a real DOM
                  headline. On every fallback path it renders as a normal
                  visible H1. */}
              <h1
                data-hero-headline
                data-beat-title={SPINE_BEATS ? "" : undefined}
                data-beat-of={SPINE_BEATS ? "hero" : undefined}
                key={SPINE_BEATS ? language : undefined}
                className={cn(
                  "font-display text-ink mb-4 text-balance",
                  // Compact reuses StackedFallback's own H1 clamp verbatim —
                  // the mobile scale this file already ships, not a new one.
                  //
                  // ORDER IS LOAD-BEARING: tailwind-merge lists `leading` as a
                  // conflict of `font-size`, and an arbitrary `text-[<length>]`
                  // IS font-size — so a `leading-*` written BEFORE the clamp is
                  // silently deleted by cn(). Keep `leading` after `text-[…]`
                  // in both arms. (Verified: the desktop arm's class SET is
                  // identical to the pre-refactor literal, leading included.)
                  compact
                    ? "text-[clamp(2.25rem,8vw,3.25rem)] leading-[1.02] tracking-[-0.028em]"
                    : "text-[clamp(2.35rem,4.8vw,4.5rem)] leading-[0.98] tracking-[-0.03em]",
                )}
              >
                {blocks[0]?.title}
              </h1>
              {/* Hero cluster — the [data-hero-stagger] targets of the
                  domReveal cascade (eyebrow → sub → CTAs rise 26px on a
                  smoothstep as the gate's last stretch plays out, while the
                  particle cue composes below). The cluster sits BELOW the H1
                  so the headline's sampled rect/width never shifts. It ships
                  VISIBLE (no inline hiding): on paths where the morph never
                  activates (non-WebGPU, no-JS) the cascade engine never
                  touches these nodes, so inline opacity:0 would orphan them
                  hidden forever — instead they follow the H1's own
                  discipline: visible by default, suppressed by the rAF only
                  while the morph owns the hero, restored on teardown. On the
                  WebGPU path the preloader curtain still covers the page when
                  `active` flips, so they never flash before the cascade. */}
              <p
                data-hero-stagger
                className="eyebrow inline-flex items-center gap-2 text-ink/80 mb-3"
              >
                <span aria-hidden="true" className="status-dot" />
                <span>{copy.heroEyebrow}</span>
              </p>
              <p
                data-hero-stagger
                className="text-base sm:text-lg text-foreground/80 leading-[1.55] max-w-[40rem]"
              >
                {copy.heroSub}
              </p>
              {/* pointer-events-auto: the panel itself is pointer-events-none
                  (stacked full-viewport siblings must not swallow input), and
                  without JS the rAF never flips it — the CTAs must still be
                  clickable on the SSR-only path. Hidden panels stay inert
                  (attribute in the SSR HTML + re-asserted by the rAF), and
                  inert blocks child pointer events regardless, so this can
                  never make an invisible CTA clickable. */}
              {/* CTA_*_SM: below `sm` the pair fills the 256px content column
                  and the labels wrap — the nowrap min-content width of
                  the old "Book a 30-min scoping call" label is what pushed
                  the document past a 320px viewport (see button.tsx). Inert at
                  sm and up. */}
              <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center pointer-events-auto">
                {/* The stagger wrappers own the cascade transform; Magnetic
                    owns its own x/y chase on the node inside — separate
                    elements so the two transform writers never clobber each
                    other. */}
                <div data-hero-stagger className={CTA_WRAPPER_SM}>
                  <Magnetic className={CTA_WRAPPER_SM}>
                    <Link href={START_HREF} className="block">
                      <Button
                        variant="hero"
                        size="xl"
                        className={cn("group", CTA_FLUID_SM)}
                      >
                        {copy.ctaPrimary}
                        <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                      </Button>
                    </Link>
                  </Magnetic>
                </div>
                <div data-hero-stagger className={CTA_WRAPPER_SM}>
                  <Link href="#work" className="block">
                    <Button
                      variant="heroOutline"
                      size="xl"
                      className={CTA_FLUID_SM}
                    >
                      {copy.seeSelectedWork}
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          ) : (
            (() => {
              // Merged groups: every block but the last renders as a compact
              // companion ABOVE the lead — stage order (and the 01/02 eyebrow
              // numbering) preserved, while the second block's title carries
              // the display weight. Single-block groups have no companions
              // and render exactly the pre-compression panel.
              const lead = blocks[blocks.length - 1];
              const companions = blocks.slice(0, -1);
              if (!lead) return null;
              return (
                <>
                  {companions.map((block) => (
                    <div key={block.id} className="mb-7 sm:mb-9">
                      <BeatRule id={block.id} />
                      <p
                        className="eyebrow inline-flex items-center gap-2 text-ink/80 mb-3"
                        {...beatEyebrowAttrs(block.id)}
                      >
                        <span aria-hidden="true" className="status-dot" />
                        <span>
                          <BeatEyebrowText text={block.eyebrow} />
                        </span>
                      </p>
                      <h2
                        key={SPINE_BEATS ? language : undefined}
                        {...beatPartAttrs("title", block.id)}
                        className="font-display text-[clamp(1.35rem,2.3vw,1.9rem)] leading-[1.12] tracking-[-0.02em] text-ink mb-2.5 text-balance"
                      >
                        {block.title}
                      </h2>
                      <p
                        key={SPINE_BEATS ? `${language}-body` : undefined}
                        {...beatPartAttrs("body", block.id)}
                        className="text-sm sm:text-[15px] text-foreground/70 leading-[1.55] max-w-[36rem]"
                      >
                        {block.body}
                      </p>
                      {block.extras}
                    </div>
                  ))}
                  <BeatRule id={lead.id} />
                  <p
                    className="eyebrow inline-flex items-center gap-2 text-ink/80 mb-4"
                    {...beatEyebrowAttrs(lead.id)}
                  >
                    <span aria-hidden="true" className="status-dot" />
                    <span>
                      <BeatEyebrowText text={lead.eyebrow} />
                    </span>
                  </p>
                  {/* Subsequent stages are H2s because the cinematic spine
                      reads as one section to crawlers. The lead title drops
                      one step in scale when it shares the panel with a
                      companion block (two blocks must fit laptop heights). */}
                  <h2
                    key={SPINE_BEATS ? language : undefined}
                    {...beatPartAttrs("title", lead.id)}
                    className={cn(
                      "font-display text-ink mb-5 text-balance",
                      // Compact reuses StackedFallback's own H2 clamp verbatim.
                      // It does not branch on `companions.length`: on a phone
                      // BOTH merged groups carry a companion, and a second
                      // scale would be vocabulary this file does not have.
                      //
                      // The desktop arm keeps `leading-[0.98]` FIRST exactly as
                      // before — and, exactly as before, tailwind-merge drops it
                      // against the arbitrary `text-[<length>]` that follows
                      // (see the H1 note). Pre-existing; the rendered class set
                      // is byte-identical to the pre-refactor one, which is the
                      // property that had to hold. Do not "fix" it here — that
                      // would change the desktop line-height.
                      compact
                        ? "text-[clamp(2rem,7vw,3rem)] leading-[1.02] tracking-[-0.025em]"
                        : cn(
                            "leading-[0.98]",
                            companions.length > 0
                              ? "text-[clamp(2rem,3.6vw,3.25rem)] tracking-[-0.026em]"
                              : "text-[clamp(2.25rem,4.5vw,4rem)] tracking-[-0.028em]",
                          ),
                    )}
                  >
                    {lead.title}
                  </h2>
                  <p
                    key={SPINE_BEATS ? `${language}-body` : undefined}
                    {...beatPartAttrs("body", lead.id)}
                    className="text-base sm:text-lg text-foreground/80 leading-[1.55] max-w-[40rem]"
                  >
                    {lead.body}
                  </p>
                  {lead.extras}
                </>
              );
            })()
          )}
          {/* No closing CTA cluster here anymore: it belongs to stage 05,
              which renders once inside the singularity passage (panel 1 of
              the horizontal track) with the proof chips + both CTAs. */}
        </div>
      </div>
    </div>
  );
}

// === Stage progress indicator (left rail) =================================
// One tick per GROUPED panel (4 post-compression) — generated from
// DESKTOP_GROUPS so a range change renumbers it automatically.
//
// EXIT FADE (owner round 4, 2026-08-09 — "da 04 a 05 se scrollo la pagina
// scende giu"): the singularity passage is now pulled up one viewport so its
// sticky stage is already pinned when this one unpins (THE PINNED HANDOFF in
// singularity-passage.tsx), and the spine's stage then slides away OVER that
// pinned frame across its section's final 100vh. Everything still visible in
// this stage at pin end travels with it — and the rail is the one crisp,
// clearly-visible element left (the panels are all faded to 0 by then). So
// the whole rail fades out across the SAME final band the ship group uses
// (panelOpacity's fade, spine progress 0.97→1): by the time the pin releases
// the stage is genuinely empty and nothing reads as motion. The fade is
// written per-frame on the WRAPPER from the existing progressRef rAF (no
// React state) — the wrapper carries no CSS transition, so a continuous
// value lands frame-exact, while the per-tick colour/opacity writes below
// keep their 300ms transition for the discrete active-tick swap. Reverse
// scrubbing restores it (pure function of progress), and the effect's
// cleanup neutralises the inline write.
function StageRail({
  progressRef,
  groups,
}: {
  progressRef: React.MutableRefObject<number>;
  groups: StageGroup[];
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rail = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    let lastP = Number.NaN;
    // Start of the last group's exit band — computed with panelOpacity's own
    // expression so a DESKTOP_GROUPS range change can never desync the rail
    // from the stage-04 dissolve it has to match (today: 1 − 0.03 = 0.97).
    const last = groups[groups.length - 1];
    const exitStart = last
      ? last.end - Math.min(0.03, (last.end - last.start) * 0.3)
      : 1;
    const tick = () => {
      const p = progressRef.current;
      if (p !== lastP) {
        lastP = p;
        const wrap = wrapRef.current;
        if (wrap) {
          const t = Math.min(1, Math.max(0, (p - exitStart) / (1 - exitStart)));
          wrap.style.opacity = String(1 - t);
        }
        groups.forEach((group, i) => {
          const el = rail.current[i];
          if (!el) return;
          const active = p >= group.start - 0.02 && p <= group.end + 0.02;
          // Quiet secondary detail: only the active tick lights (in accent);
          // everything else is a faint uniform rule. No past/future contrast.
          el.style.background = active
            ? "hsl(var(--accent) / 0.8)"
            : "hsl(var(--rule) / 0.5)";
          el.style.opacity = active ? "1" : "0.5";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Drop the inline exit fade: the node outlives this effect on a
      // groups/ref identity change, and it must never be left dimmed.
      if (wrapRef.current) wrapRef.current.style.opacity = "";
    };
  }, [progressRef, groups]);

  return (
    <div
      ref={wrapRef}
      className="hidden lg:flex absolute left-8 top-1/2 -translate-y-1/2 flex-col gap-3.5 z-20"
    >
      {groups.map((s, i) => (
        <span
          key={s.id}
          ref={(el) => {
            rail.current[i] = el;
          }}
          className="block w-px h-7 rounded-full transition-[background-color,opacity] duration-300"
          style={{ background: "hsl(var(--rule) / 0.5)", opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

// === Stacked fallback (reduced motion, ANY viewport) ======================
// Was `MobileFallback` (renamed 2026-08-11, MOBILE_HOME_SPEC §6 Chunk D —
// BODY DELIBERATELY UNTOUCHED). It is no longer the mobile path: a phone with
// motion enabled now gets CompactSpine below. This is what
// `prefers-reduced-motion: reduce` renders, on a 390px phone AND on a 27"
// monitor, so its output must keep diffing clean against the pre-refactor
// desktop-with-RM screenshot — which is why not one class inside it moved
// (including the `min-h-[80svh]` floor: MOBILE_HOME_SPEC §2 lists dropping it
// on the same row that requires this body to stay byte-identical, and the
// height it was there to save is deleted by the compact spine replacing this
// path on mobile entirely, not by editing a reduced-motion layout).
//
// Stacked layout used when the desktop pinned cinematic is too heavy.
// The hero panel (i === 0) renders an H1 so the page heading hierarchy
// stays consistent across viewports.
function StackedFallback({
  stages,
  copy,
}: {
  stages: Stage[];
  copy: (typeof SPINE_COPY)[Language];
}) {
  // (The proof-chip IO trigger moved with stage 05 into the singularity
  // passage — no chips render in this stacked path anymore.)
  return (
    <section className="relative">
      {stages.map((stage, i) => {
        const isHero = i === 0;
        return (
          <div
            key={stage.id}
            className={cn(
              "min-h-[80svh] flex items-center container-px py-20 border-b border-[hsl(var(--rule))]",
              // Hero clears the fixed nav so the eyebrow/H1 never sit under it
              // on short mobile/landscape heights.
              isHero && "relative overflow-hidden pt-[max(var(--header-h),6rem)]",
            )}
          >
            {isHero ? (
              // Ambient brand wash behind the hero copy. The old orb poster
              // image was removed (the live WebGL Saturn is the only hero
              // visual); this subtle navy radial keeps depth in the upper-right
              // without reintroducing any image asset.
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(125% 115% at 100% 0%, hsl(var(--accent) / 0.06) 0%, hsl(var(--bg) / 0.6) 30%, hsl(var(--bg) / 0.92) 58%, hsl(var(--bg)) 100%)",
                }}
              />
            ) : null}
            <div className={cn("max-w-2xl", isHero && "relative z-10")}>
              {/* The hero mirrors the desktop cluster (eyebrow · H1 · sub ·
                  CTA pair) STATICALLY: this stacked path has no cascade
                  engine, so the cluster simply ships visible from first
                  paint — no gating, no entrance choreography (correct for
                  reduced motion, which also lands here). Eyebrow reads above
                  the title like every other stacked block. */}
              <p className="eyebrow mb-4 inline-flex items-center gap-2 text-ink-mute">
                <span aria-hidden="true" className="status-dot" />
                <span>{isHero ? copy.heroEyebrow : stage.eyebrow}</span>
              </p>
              {isHero ? (
                <h1 className="font-display text-[clamp(2.25rem,8vw,3.25rem)] leading-[1.02] tracking-[-0.028em] text-ink mb-4">
                  {stage.title}
                </h1>
              ) : (
                <h2 className="font-display text-[clamp(2rem,7vw,3rem)] leading-[1.02] tracking-[-0.025em] text-ink mb-4">
                  {stage.title}
                </h2>
              )}
              <p className="text-base text-ink-mute leading-relaxed">
                {isHero ? copy.heroSub : stage.body}
              </p>
              {!isHero && stage.extras}
              {isHero ? (
                <div className="mt-6 flex flex-col gap-3">
                  {/* Already full-width here, but `whitespace-nowrap` (cva
                      base) still made min-content the whole label: at 320px
                      that both blew the column out AND clipped the label
                      against the Button's own overflow-hidden. CTA_WRAP_SM
                      lets it wrap; the width is already owned locally. */}
                  <Link href={START_HREF}>
                    <Button
                      variant="hero"
                      size="xl"
                      className={cn("w-full", CTA_WRAP_SM)}
                    >
                      {copy.ctaPrimary}
                    </Button>
                  </Link>
                  <Link href="#work">
                    <Button
                      variant="heroOutline"
                      size="xl"
                      className={cn("w-full", CTA_WRAP_SM)}
                    >
                      {copy.seeSelectedWork}
                    </Button>
                  </Link>
                </div>
              ) : null}
              {/* The closing scoping CTA moved with stage 05 into the
                  singularity passage (fully readable vertical section on
                  this same viewport class, directly below). */}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// === Compact spine (coarse pointer / ≤768px, motion OK) ===================
// The single biggest win in MOBILE_HOME_SPEC: the hero was 4.00 of the phone
// home's 20.79 viewports for 1015 characters of copy. It is 1.80 here.
//
// This is NOT a new mechanic. It is the desktop spine's own grammar at phone
// scale: the same DESKTOP_GROUPS ranges, the same StagePanel, the same
// panelOpacity crossfade engine, the same inert/aria-hidden discipline, one
// ScrollTrigger writing the same progressRef the panels already consume by
// ref. What changes is the geometry — 180svh instead of 315vh, a 100svh
// sticky stage instead of 100vh — and the type scale, via `compact`.
//
// WHAT IT DELIBERATELY DOES NOT RENDER (each omission is load-bearing):
//   · [data-hero-brand] — rendered ONLY as the COMPACT anchor
//     (`[data-hero-brand][data-hero-brand-compact]`, CompactHeroBrand below)
//     when `brandArmed` (mobile-parity Phase 4b: HERO_BRAND_COMPACT &&
//     fxBudget.level ≥ 2 && backend === "webgpu"). On every other phone it is
//     still absent, for the original reasons: HomeSingularity's first-frame
//     gate is `!textMorphStore.active → invisible` and that store is only ever
//     written through this node, so an anchor a WebGL2/weak phone can never
//     drive would arm a black hole that never becomes visible. It is also
//     navbar.tsx's probe for "am I inside the pinned hero" — since Phase 4b
//     navbar reads the COMPACT travel (COMPACT_SPINE_TRAVEL_SVH, spine.ts)
//     when the anchor carries `data-hero-brand-compact`, and re-probes on the
//     store's `brandAnchorEpoch` bump because this anchor mounts AFTER the
//     navbar's mount-time probe.
//   · HeroIntroGate — its `touchmove` preventDefault is a full scroll hijack
//     with no touch escape (defect D-11). This is the fix for coarse tablets.
//     STILL not rendered with the compact brand: the touch beat is TIME-driven
//     inside HeroTextParticles (no scroll consumption, no Lenis stop), and
//     tap/Esc = skip is CompactHeroBrand's own listener.
//   · HeroHoverLayer — a pointer-hover sense overlay; meaningless on touch and
//     it would only eat taps.
//   · StageRail — `hidden lg:flex`, i.e. invisible on every phone, but its rAF
//     would still run every frame on the device class this whole spec exists
//     to unburden.
//   · The site-wide snap stations — the snap engine triggers on WHEEL input
//     only, so registering them here would be dead registration on touch.
//
// R3F island note: nothing here commits into the Canvas. progressRef is a ref
// and the WebGL side reads scroll through its own store, exactly as on desktop.

/**
 * CompactHeroBrand — the compact SERSAN particle ANCHOR (mobile-parity
 * Phase 4b). Rendered inside CompactSpine's sticky stage ONLY while
 * `brandArmed` (HERO_BRAND_COMPACT && fxBudget.level ≥ 2 && backend
 * "webgpu"); CompactSpine itself is client-only (never in the SSR HTML), so
 * there is no hydration concern for anything rendered here.
 *
 * SCOPE — this component provides exactly four things and nothing else:
 *   1. the anchor: the same decorative `[data-hero-brand]` span the desktop
 *      stage renders (same text "SERSAN", same Sersan Display 260 at 0.3em
 *      tracking, opacity 0 forever — HeroTextParticles samples its rect +
 *      computed style and the particles are the only visible render), plus
 *      `data-hero-brand-compact`
 *      so HeroTextParticles picks the AUTO-PLAY (time-driven) beat and navbar
 *      picks the compact travel;
 *   2. the session-skip seed (`isIntroSkipped()` → `introSkipped: true`),
 *      which HeroIntroGate does on desktop but nothing else does on compact —
 *      seeded BEFORE the epoch bump so the island's build reads it;
 *   3. the tap / Esc skip: a window `click` (capture) + `keydown Escape`
 *      listener landing EXACTLY HeroIntroGate's skip payload, guarded like
 *      its canEngage (morph active, preloader lifted, not yet skipped, ramp
 *      not yet complete). A swipe never produces a click, a tap does. NO
 *      preventDefault, NO touchmove/wheel listeners, NO getLenis() — scroll
 *      stays native throughout;
 *   4. the DOM→island signal: `textMorphStore.brandAnchorEpoch` bumped on
 *      mount AND unmount (anchor exists / anchor gone), the dep that re-runs
 *      HeroTextParticles' build (which queries the anchor once and otherwise
 *      never retries) and navbar's header-hide re-probe.
 *
 * The beat itself — entry assemble, 1.5 s minimum hold (stretched up to 3 s
 * until HomeSingularity reports `textMorphStore.eclipseReady`), timed
 * gateProgress 0→1 ramp, scroll-abort — is TIME-DRIVEN in HeroTextParticles'
 * frame loop; nothing here writes gateProgress except the skip.
 *
 * Optional affordance: the existing `copy.skipIntro` label ("Skip intro" /
 * "Salta l'intro" — no new string) as a bottom-right mono button, shown once
 * `active && assembleDone && !introSkipped && gateProgress < 1` has held
 * ≥ SKIP_LABEL_DELAY_MS, mirroring HeroIntroGate's syncLabel discipline (a
 * real control while shown, fully neutral while hidden). No "· Esc" suffix on
 * touch. "Tap anywhere" already works without it.
 */
const COMPACT_SKIP_LABEL_DELAY_MS = 1500;
const COMPACT_LABEL_SHOW_TRANSITION =
  "opacity 500ms var(--ease-entrance, cubic-bezier(0.16, 1, 0.3, 1)), color 200ms var(--ease-out, ease-out)";
const COMPACT_LABEL_HIDE_TRANSITION =
  "opacity 200ms cubic-bezier(0.32, 0, 0.67, 0), color 200ms var(--ease-out, ease-out)";

function CompactHeroBrand({ skipLabel }: { skipLabel: string }) {
  const labelRef = useRef<HTMLButtonElement | null>(null);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    // (a) Session seed FIRST — HeroIntroGate seeds this on desktop; on compact
    // nobody else does. Must land before the epoch bump so HeroTextParticles'
    // rebuild reads introSkipped when deciding replayDone.
    if (isIntroSkipped()) {
      useTextMorphStore.setState({ introSkipped: true });
    }
    // (b) Anchor exists → tell the island to (re)build against THIS span.
    useTextMorphStore.setState((s) => ({
      brandAnchorEpoch: s.brandAnchorEpoch + 1,
    }));

    // (c) The skip — HeroIntroGate's payload verbatim (minus release(): the
    // gate is never engaged on compact, so there is nothing to release).
    // Guarded on the live beat: inert before the build resolves, while the
    // preloader curtain is still up (introComplete — same clause as
    // HeroIntroGate.canEngage: a stray tap on the preloader must not burn
    // the session's intro), after a skip, and once the ramp has completed.
    const skip = () => {
      const m = useTextMorphStore.getState();
      if (!m.active || m.introSkipped || m.gateProgress >= 1) return;
      if (!useIntroStore.getState().introComplete) return;
      markIntroSkipped();
      useTextMorphStore.setState({
        introSkipped: true,
        gateProgress: 1,
        assembleDone: true,
        morphDone: true,
        morph2Done: true,
        gateKick: 0,
      });
    };
    skipRef.current = skip;
    // (d) Tap anywhere = skip. `click` (never touchstart/touchmove): a swipe
    // does not produce a click, a tap does; capture so a tap on an inert
    // panel or the canvas still lands here. Never preventDefault — the tap's
    // own default (if any) proceeds; scroll is untouched.
    const onClick = () => skip();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("keydown", onKeyDown);

    // (e) Skip-label state, polled from a rAF (the store is written per frame
    // by the island; no React subscription). Same discipline as
    // HeroIntroGate.syncLabel: shown = real control, hidden = neutral.
    let raf = 0;
    let armedAt = 0;
    let labelShown = false;
    const tick = () => {
      const m = useTextMorphStore.getState();
      const armed =
        m.active && m.assembleDone && !m.introSkipped && m.gateProgress < 1;
      if (!armed) armedAt = 0;
      else if (armedAt === 0) armedAt = performance.now();
      const shown =
        armed && performance.now() - armedAt >= COMPACT_SKIP_LABEL_DELAY_MS;
      if (shown !== labelShown) {
        labelShown = shown;
        const el = labelRef.current;
        if (el) {
          el.style.transition = shown
            ? COMPACT_LABEL_SHOW_TRANSITION
            : COMPACT_LABEL_HIDE_TRANSITION;
          el.style.opacity = shown ? "1" : "0";
          el.style.pointerEvents = shown ? "auto" : "none";
          el.tabIndex = shown ? 0 : -1;
          if (shown) {
            el.removeAttribute("aria-hidden");
          } else {
            el.setAttribute("aria-hidden", "true");
            if (document.activeElement === el) el.blur();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("keydown", onKeyDown);
      skipRef.current = () => {};
      // Anchor gone (compact→stacked rotate, stepDownBudget 2→1, route
      // change) → the island's rebuild bails on the missing anchor and hands
      // the hero back (`active: false, domReveal: 1`); navbar re-probes.
      useTextMorphStore.setState((s) => ({
        brandAnchorEpoch: s.brandAnchorEpoch + 1,
      }));
    };
  }, []);

  return (
    <>
      {/* The compact particle anchor — same content and typography source as
          the desktop [data-hero-brand] span (see the desktop stage): "SERSAN",
          Sersan Display at 0.3em tracking, decorative, opacity 0 forever.
          13vw → 10vw (2026-08-18 logotype restyle): the lockup's width per unit
          of font-size went 4.014em ("Sersan AI", Switzer 600, −0.045em) to
          5.187em ("SERSAN", Sersan Display 200, +0.3em — browser-measured, the
          trailing letter-spacing advance included, exactly as canvas
          measureText counts it), so the size scales by 4.014/5.187 = 0.774 to
          hold the SAME share of viewport width: 10vw ⇒ ≈51.9vw wide, matching
          the old 13vw ⇒ ≈52.2vw. 10vw → 9.8vw with the 200→300 weight move
          (same day): 300 is a separate Jost master and runs 5.296em wide
          (+2.10% over 200), so ×0.979 holds that ≈51.9vw share. 9.8vw → 9.88vw
          → 9.8vw with 300→260→300 (same day): the 260 detour assumed the
          wordmark read thin because the particle disc overhung the stroke,
          which is false (see the desktop span's WEIGHT note), and 300 is the
          answer to the owner's actual "too thin". 260 runs 5.253em and 300
          runs 5.296em (−0.812% / +0.818% — the desktop span's per-weight
          table, read off the patched faces' hmtx), so ×0.9919 returned the
          size to 9.8vw. 9.8vw → 9.69vw with 300→340 (the owner's own call,
          made against the live particle render — 300 was still short of the
          weight he wanted): 340 runs 5.355em (+1.11% over 300), so ×0.9890 and
          9.69 × 5.355 ⇒ ≈51.89vw wide — the same share every step of the
          chain has held. (At 390px: 37.79px font-size ⇒ 26.45px cap ⇒ a ≈2.57px stem at
          weight 340.) The weight is an INLINE style for the same reason as the
          desktop span (see there): it is calibrated in lockstep with the size
          above, so the two numbers live together — and BOTH anchors carry the
          same weight. translateY in svh (the stage's own unit): 16svh puts the
          wordmark centre ≈66svh — below the
          mark's lockup (spans ≈35–57vh on 390×844) and above the eclipse arc
          (≈76–85vh) — UNCHANGED by the restyle. Absolute → zero height
          contribution (home stays ≤14.5vp). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <span
          data-hero-brand
          data-hero-brand-compact
          className="font-brand text-[9.69vw] leading-none tracking-[0.3em] text-ink inline-block whitespace-nowrap"
          style={{
            fontWeight: 340,
            opacity: 0,
            transform: "translateY(16svh)",
            willChange: "opacity",
          }}
        >
          SERSAN
        </span>
      </div>
      {/* Skip affordance — bottom-right mono label, ships neutral (opacity 0,
          no pointer target, out of tab order, aria-hidden); the rAF above
          flips it live once the formed brand has held. Above the inert
          panels (z-30) so it stays reachable while they are hidden. */}
      <button
        ref={labelRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => skipRef.current()}
        className="absolute bottom-8 right-8 z-30 inline-flex items-center rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mute"
        style={{ opacity: 0, pointerEvents: "none", willChange: "opacity" }}
      >
        {skipLabel}
      </button>
    </>
  );
}

function CompactSpine({
  groups,
  stageById,
  copy,
  language,
}: {
  groups: StageGroup[];
  stageById: Map<string, Stage>;
  copy: (typeof SPINE_COPY)[Language];
  language: Language;
}) {
  const outerRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<number>(0);
  const scrimRef = useRef<HTMLDivElement | null>(null);

  // SPINE_BEATS: the same triggered beat engine as desktop, phone-scaled
  // (compact timings; whole-block fallback below fxBudget.level 2, no blur).
  // Reads the same progressRef the trigger below writes; no-op when the
  // kill-switch is off (StagePanel's legacy crossfade rAF takes over).
  useSpineBeats({
    scope: outerRef,
    progressRef,
    windows: groups,
    language,
    enabled: true,
    compact: true,
  });

  // Phase 4b gate. `backend` (not level alone): `[data-hero-brand]` presence
  // has side effects (navbar header-hide) and must never appear on a phone
  // whose renderer can't drive the beat (WebGL2 fallback). backend is written
  // in Scene onCreated — before HeroTextParticles' build could ever succeed —
  // and this component re-renders on the store flip. `level` is 0 until
  // tierStore.resolve() → false until then. HeroTextParticles keeps its own
  // WebGPU probe as the last line of defence; a WebGPU phone whose text build
  // fails (fonts/compute) leaves the H1 visible by construction (StagePanel
  // keys the crossfade on `morph.active`, which only the build sets).
  const level = useTierStore((s) => s.fxBudget.level);
  const backend = useTierStore((s) => s.backend);
  const brandArmed = brandBeatArmed({ level, backend });

  // Scrim dimmer (compact-only since round 7-3 — the desktop twin died with
  // the desktop scrims): the centred 0.82-alpha navy wash paints OVER the canvas and
  // would swallow the particle brand at the frame centre. While the morph
  // owns the hero it drops to a whisper and eases back exactly as domReveal
  // brings the DOM H1 in. Runs ONLY while brandArmed — every other phone
  // never starts this loop, and the inline opacity is cleared on teardown so
  // the scrim returns to its stylesheet state.
  useEffect(() => {
    if (!brandArmed) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const m = useTextMorphStore.getState();
      const o = m.active ? 0.15 + 0.85 * m.domReveal : 1;
      if (o !== last) {
        last = o;
        if (scrimRef.current) scrimRef.current.style.opacity = String(o);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (scrimRef.current) scrimRef.current.style.opacity = "";
    };
  }, [brandArmed]);

  useGSAP(
    () => {
      const outer = outerRef.current;
      if (!outer) return;

      const mm = gsap.matchMedia();
      mm.add({ compact: COMPACT_MQ, motionOk: MOTION_OK_MQ }, (ctx) => {
        const c = ctx.conditions as { compact: boolean; motionOk: boolean };
        // Reduced motion → no scrub at all. React never routes RM here (it
        // gets StackedFallback), so this is the second lock on the same door:
        // if the OS toggle flips mid-session the matchMedia teardown runs
        // before the re-render, and the runway height is released with it.
        if (!c.motionOk || !c.compact) return;

        // The runway, written in svh from JS (see COMPACT_SPINE_SVH) and
        // RE-ASSERTED on every refreshInit — the same idiom the passage uses
        // (singularity-passage.tsx). It is idempotent by construction, so it
        // is a guard against something else clobbering the height, never a
        // mid-scroll rewrite. Ordering matters: refreshInit fires BEFORE
        // ScrollTrigger measures, so the trigger never reads a stale runway.
        const size = () => {
          outer.style.height = `${COMPACT_SPINE_SVH}svh`;
        };
        size();
        ScrollTrigger.addEventListener("refreshInit", size);

        const st = ScrollTrigger.create({
          trigger: outer,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          invalidateOnRefresh: true,
          // No pin: the inner stage is CSS `position: sticky`, which already
          // pins it visually. Same reasoning as the desktop spine.
          onUpdate: (self) => {
            progressRef.current = self.progress;
          },
        });
        // Prime against the current scroll position — SPA nav and browser
        // scroll restoration can land mid-spine, and the panels read this ref
        // on their very next rAF tick.
        progressRef.current = st.progress;

        return () => {
          st.kill();
          ScrollTrigger.removeEventListener("refreshInit", size);
          outer.style.height = "";
          progressRef.current = 0;
        };
      });
    },
    { scope: outerRef },
  );

  return (
    <section
      ref={outerRef}
      id="top"
      className="relative"
      // minHeight is the first-paint floor and the no-JS floor; the GSAP block
      // above writes the authoritative `height` in the same unit, so the two
      // can never disagree and the section is never a 0-height collapse (the
      // panels inside are absolutely positioned and contribute nothing).
      style={{ minHeight: `${COMPACT_SPINE_SVH}svh` }}
    >
      {/* The pinned viewport. 100svh, never 100vh: the stage must match the
          runway's unit or the address bar collapsing mid-scrub shifts the
          frame under the reader. */}
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Contrast scrim. The desktop stage's two LEFT-anchored scrims were
            removed round 7-3 (they rode screen-fixed over the passage's
            camera pan — see StagePanel's panel-scoped wash, spec §A.5); this
            centred phone wash SURVIVES for now (§B.3: "compact wash until
            its own pass") because the compact beat has no camera pan (pan01
            is never written on coarse pointers, seqStore contract), so a
            screen-fixed wash violates nothing here. One centred wash of the
            old grammar (page-navy over the persistent canvas, aria-hidden,
            pointer-events-none). HeroLogo DOES mount at tier
            "lite" (Scene.tsx routes home → HeroLogo for every tier but "off"),
            so this is what holds the headline at AA over the spore mark. It
            fades to transparent at the edges so the filament and the mark's
            silhouette still read. Phase 4b: while the compact brand beat owns
            the hero the dimmer effect above drops it (0.15 + 0.85·domReveal)
            — otherwise the 0.82 wash paints over the particle brand. */}
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 50%, hsl(var(--bg) / 0.82) 0%, hsl(var(--bg) / 0.55) 55%, transparent 100%)",
          }}
        />

        {/* Phase 4b: the compact "Sersan AI" particle anchor + tap/Esc skip,
            capable phones only (brandArmed). Absent → this stage is exactly
            what it was before the phase. Rendered BEFORE the panels so the
            DOM order matches the desktop stage (anchor, then panels). */}
        {brandArmed && <CompactHeroBrand skipLabel={copy.skipIntro} />}

        {/* The same three grouped panels as desktop, absolutely stacked, each
            lit strictly inside its own DESKTOP_GROUPS range. Every panel's
            copy is in the DOM at every progress — the crossfade only changes
            opacity + inert, never presence. */}
        {groups.map((group, i) => (
          <StagePanel
            key={group.id}
            group={group}
            blocks={group.blockIds
              .map((id) => stageById.get(id))
              .filter((s): s is Stage => s !== undefined)}
            progressRef={progressRef}
            isHero={i === 0}
            compact
            copy={copy}
            index={i}
            language={language}
          />
        ))}
      </div>
    </section>
  );
}

// === Main component =======================================================
export default function CinematicSystemScroll() {
  const { language } = useLanguage();
  const stages = localizeStages(language);
  const copy = SPINE_COPY[language];
  const outerRef = useRef<HTMLDivElement | null>(null);
  // (Removed round 7-3: leftScrimRef / radialScrimRef — the two stage-level
  // contrast scrims are gone. See the panel-scoped wash in StagePanel.)
  const progressRef = useRef<number>(0);
  // Default to desktop layout on the server so the hero H1 + subhead are
  // present in the initial HTML (good for SEO, first paint, accessibility).
  // The client detects the compact path and switches after mount; the
  // resulting flash on a mobile cold-load is acceptable trade for an SSR'd
  // hero.
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [hasDetectedViewport, setHasDetectedViewport] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [landscapePhone, setLandscapePhone] = useState(false);
  const prevModeRef = useRef<string | null>(null);

  // Mode detection is a SUBSCRIPTION, not a one-shot sample: a window snapped
  // narrow, devtools docked, or an OS reduced-motion toggle must flip the path
  // live. Sampling once on mount kept the pinned spine alive with
  // measurements taken against a viewport that no longer exists.
  //
  // COMPACT_MQ (not a bare `max-width: 768px`) OR-s in `(pointer: coarse)`:
  // width alone left a coarse 1024px tablet — and a phone in landscape — on
  // the desktop path, complete with the HeroIntroGate touchmove hijack (D-11).
  // A `matchMedia` list fires `change` for either arm, so one listener covers
  // both a resize and a device-class change (a tablet docking a mouse).
  // LANDSCAPE_PHONE_MQ rides the same listener: a rotation flips it live.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compactQ = window.matchMedia(COMPACT_MQ);
    const reducedQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const landscapeQ = window.matchMedia(LANDSCAPE_PHONE_MQ);
    const queries = [compactQ, reducedQ, landscapeQ];
    const sync = () => {
      setIsCompact(compactQ.matches);
      setReduceMotion(reducedQ.matches);
      setLandscapePhone(landscapeQ.matches);
      setHasDetectedViewport(true);
    };
    sync();
    queries.forEach((q) => q.addEventListener("change", sync));
    return () => queries.forEach((q) => q.removeEventListener("change", sync));
  }, []);

  // THE PATH. Three now, not two (see the file header). Before detection
  // resolves we render "desktop", which is what the server emitted — so the
  // hero copy is in the initial HTML on every device.
  //
  // The reduced-motion arm is checked FIRST and on its own: it is the split
  // that MOBILE_HOME_SPEC §0 flags as the desktop-regression trap. Folding it
  // back into the compact test would scrub-pin a 27" monitor for a user who
  // asked the OS for no motion.
  //
  // The landscape-phone arm is the ONLY other road into "stacked" (Phase 5):
  // it is coarse-only by construction (LANDSCAPE_PHONE_MQ), so it can never
  // reach a fine-pointer window of any size — desktop stays "desktop", the
  // narrow fine window stays exactly what COMPACT_MQ made it before.
  const mode: "desktop" | "compact" | "stacked" = !hasDetectedViewport
    ? "desktop"
    : reduceMotion
      ? "stacked"
      : landscapePhone
        ? "stacked"
        : isCompact
          ? "compact"
          : "desktop";

  // The three paths have very different document heights (315vh / 180svh /
  // content-stacked), so a flip between ANY two of them must re-measure every
  // trigger on the page — and an OS reduced-motion toggle fires no resize
  // event, so nothing else would. Deferred so the refresh reads the committed
  // layout. Keyed on the mode STRING, not a boolean: desktop→compact is a
  // height change of the same order as either → stacked, and a boolean
  // `usesFallback` would have missed it entirely.
  //
  // `prev === null` is the FIRST detection. It is NOT a no-op: the server
  // renders `desktop` (315vh), so a phone landing on `compact` (180svh) or
  // `stacked` here is the collapse of ~1.35 viewports that every trigger
  // below the hero was armed against — and nothing else re-measures on this
  // path (the provider skips its cadence on "/", the desktop cadence below is
  // gated on `mode === "desktop"`, CompactSpine's trigger is pin-less). Only
  // landing on `desktop` changes nothing versus SSR, so only that case stays
  // quiet (and its own effect below runs the [60,250,700,1500] cadence).
  // Same form as audit-week-timeline / fit-section / the rails.
  useEffect(() => {
    if (!hasDetectedViewport) return;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (prev === mode) return;
    if (prev === null && mode === "desktop") return;
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(raf);
  }, [hasDetectedViewport, mode]);

  // === THE BRAND-BEAT VERDICT (2026-09-09) ==================================
  // This component is the DOM authority over the brand anchor, so it is the
  // only place that can say early and truthfully "no wordmark is coming on
  // this device" — `stacked` renders no anchor at all (landscape phone), and
  // `compact` renders one only while brandBeatArmed(). The preloader holds
  // its counter at the 90% cap until the wordmark has formed AND the eclipse
  // behind it has risen; with no verdict its only exit was the 17s/22s
  // insurance timers, so a phone at fxBudget level 1 (or on the WebGL2
  // fallback) sat at "90 %" for ~23 SECONDS before revealing. Reported live
  // on an iPhone 2026-09-09 — the loader looked frozen, because it was.
  //
  // A SUBSCRIPTION, not a hook: `resolved`/`backend`/`fxBudget` each land
  // once per load (resolve(), then Scene's onCreated) and a reactive read
  // would re-render this whole tree for them. The verdict is re-evaluated on
  // every tierStore write for as long as this component lives, so a runtime
  // stepDownBudget(2 → 1) — which unmounts the anchor and genuinely kills the
  // beat mid-intro — publishes it too.
  //
  // It is deliberately NOT published while `backend === null`: false there
  // means "the renderer does not exist yet", not "no beat". A load whose
  // Canvas never comes up publishes nothing and the timers still backstop it.
  useEffect(() => {
    if (!hasDetectedViewport) return;
    const evaluate = () => {
      if (useIntroStore.getState().brandBeatSkipped) return;
      const s = useTierStore.getState();
      if (!s.resolved || s.backend === null) return;
      if (mode === "stacked" || !brandBeatArmed({ level: s.fxBudget.level, backend: s.backend })) {
        useIntroStore.getState().setBrandBeatSkipped();
      }
    };
    evaluate();
    return useTierStore.subscribe(evaluate);
  }, [hasDetectedViewport, mode]);

  // (Removed: the orb-core poster image + its cross-fade machinery. The hero
  // visual is now owned entirely by the persistent WebGL Saturn; on a cold
  // load the hero is just the dark brand background + radial washes + the
  // SSR'd text until the canvas paints. Also previously removed: the JS
  // `new Image()` preloader that warmed orb-core + dead planet jpgs.)

  // (Removed: canvas-on-demand IntersectionObserver gate.) The spine is
  // the homepage hero — always in view from first paint, so the gate was
  // dead weight that could leave the canvas un-mounted if the observer's
  // first callback was deferred. The Canvas now mounts on first render.

  // (Removed: the mouse-smoothing rAF loop. Its only consumer was the live
  // WebGL scene, which was replaced by the static orb render — the smoothed
  // mouse position was no longer read anywhere, so the loop + its refs were
  // dead per-frame work.)

  // ScrollTrigger pin + scrub — THE DESKTOP SPINE ONLY. Only attach once the
  // viewport detection has settled — otherwise on a mobile cold load we'd
  // briefly pin to a section that's about to be replaced by the compact spine.
  // `mode` is a GUARD and a DEP, not just a render-branch input: both its
  // inputs are live-subscribed, so a mid-session viewport/OS toggle must tear
  // this down. Without it the trigger and the Lenis snap points survive on a
  // detached spine node (another path has replaced it) and keep pulling the
  // scroll position. The compact spine owns its own trigger (CompactSpine).
  useEffect(() => {
    if (!hasDetectedViewport || mode !== "desktop") return;
    if (typeof window === "undefined") return;

    const outer = outerRef.current;
    if (!outer) return;

    const st = ScrollTrigger.create({
      trigger: outer,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      // No pin here — the inner stage uses CSS `position: sticky` which
      // already pins it visually. Adding ScrollTrigger.pin on top would
      // double-pin and break layout.
      onUpdate: (self) => {
        progressRef.current = self.progress;
      },
    });

    // --- Snap stations (site-wide engine, lib/scroll-snap) ----------------
    // Value-based getters measured LIVE at snap time, so no re-registration
    // cadence is needed: one per grouped-panel midpoint + progress 0 (the
    // "back to hero" park). The engine triggers only on user wheel input, so
    // the intro gate — which consumes wheel at capture before Lenis —
    // keeps it naturally quiet while engaged (the provider also hard-suspends
    // it on gateEngaged). The barrier at the pin end vetoes any settle that
    // would auto-glide the page across the handoff into the singularity
    // passage un-asked — leaving the spine stays the visitor's own scroll.
    // Reduced motion never creates Lenis, so no snap exists on that path by
    // construction.
    const stationAt = (p: number) => () => {
      const ih = window.innerHeight;
      const base = outer.getBoundingClientRect().top + window.scrollY;
      const travel = outer.offsetHeight - ih;
      return travel > 0 ? base + p * travel : Number.NaN;
    };
    const clearSnapPoints: Array<() => void> = [
      snapPoint(stationAt(0)),
      ...SNAP_STATION_PROGRESS.map((p) => snapPoint(stationAt(p))),
      snapBarrier(stationAt(1)),
    ];

    // Force a refresh after layout settles. Multiple short timeouts catch
    // late-arriving font / texture / canvas layout shifts. The final
    // resize listener catches mobile rotation + browser-chrome reveal.
    const refresh = () => {
      ScrollTrigger.refresh();
    };
    const ids = [60, 250, 700, 1500].map((ms) => window.setTimeout(refresh, ms));
    // Debounced resize handler — coalesce the event burst from a resize /
    // orientation change into a single re-measure once it settles.
    let resizeId = 0;
    const onResize = () => {
      window.clearTimeout(resizeId);
      resizeId = window.setTimeout(refresh, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      st.kill();
      ids.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(resizeId);
      window.removeEventListener("resize", onResize);
      clearSnapPoints.forEach((off) => off());
    };
  }, [mode, hasDetectedViewport]);

  // SPINE_BEATS (2026-08-27): the triggered per-beat GSAP choreography for
  // the desktop spine's panels (fx/beat-choreographer.ts). ONE rAF reads the
  // progressRef the trigger above writes, resolves the active beat
  // (lib/spine-beats) and plays ENTER/EXIT timelines on transitions; the
  // trigger, the snap stations, the gate and every store contract above are
  // untouched. Enabled only on the live desktop path (the compact spine
  // mounts its own instance; stacked mounts nothing); a no-op when the
  // kill-switch is off.
  useSpineBeats({
    scope: outerRef,
    progressRef,
    windows: DESKTOP_GROUPS,
    language,
    enabled: hasDetectedViewport && mode === "desktop",
    compact: false,
  });

  // (Removed round 7-3: the desktop ScrimDimmer rAF. The two stage-level
  // scrims it drove are deleted — their opacity writer pinned them at 1 for
  // the spine's whole post-intro life, which left them frozen screen-fixed
  // over the passage's panning world during the one-shot's input lock (the
  // owner's "ombra blu tagliata", continuous-space spec §A.1). The contrast
  // job moved to a panel-scoped wash inside StagePanel's copy column, which
  // the panelOpacity engine already fades with the copy — no JS needed, and
  // one permanent rAF loop removed for free.)

  // ONLY prefers-reduced-motion reaches the stacked fallback now — on a
  // 390px phone AND on a 27" monitor. The pinned scrub is motion-heavy by
  // nature on either, so under reduced-motion we serve the static stacked
  // layout everywhere. On the server we always render the desktop layout, so
  // the hero copy is in the initial HTML regardless.
  if (mode === "stacked") {
    return <StackedFallback stages={stages} copy={copy} />;
  }

  // Blocks are looked up per group (the same localized array the stacked
  // fallback iterates ungrouped — one copy source, three layouts). Shared by
  // the compact and desktop spines: identical STAGE_CONTENT through identical
  // DESKTOP_GROUPS, so "Signals" and "Audit" share a panel on both.
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Coarse pointer (or ≤768px) with motion enabled → the compact spine: same
  // three panels, same crossfade engine, 180svh instead of 315vh.
  if (mode === "compact") {
    return (
      <CompactSpine
        groups={DESKTOP_GROUPS}
        stageById={stageById}
        copy={copy}
        language={language}
      />
    );
  }

  return (
    <section
      ref={outerRef}
      id="top"
      className="relative"
      // 315vh (2026-08-07: stage 05 moved into the singularity passage):
      // three grouped panels over a 215vh scrub. Each stage keeps 58-82vh of
      // scroll (above the ~60vh readability floor from the 2026-06-10
      // hero-widening decision); the pin releases straight into section 05 —
      // panel 1 of the passage's horizontal track.
      style={{ height: `${SPINE_HEIGHT_VH}vh` }}
    >
      {/* Pinned viewport. The text panels render immediately (so the H1 is in
          the initial paint). The hero visual is owned entirely by the
          persistent WebGL canvas (the procedural Saturn behind the DOM); no
          poster image is rendered here. During the brief cold-load gap before
          the canvas paints its first frame the hero is simply the dark brand
          background + the radial washes below + the SSR'd text. */}
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* (Removed round 7-3: the two stage-level contrast scrims — the
            left linear wash + the center-left radial lobe. They were
            screen-fixed at opacity 1 for the spine's whole post-intro life,
            so during the PINNED HANDOFF they rode frozen over the passage's
            rightward camera pan as a soft-edged navy block with two cut
            edges (the owner's "ombra blu tagliata"). Text contrast is now a
            panel-scoped wash inside StagePanel's copy column that fades with
            each panel via the panelOpacity engine — see StagePanel. EXIT
            RULE (spec §A.5.3, now enforced by construction): every VISIBLE
            stage-level child of this sticky stage must fade on the 0.97→1
            exit band — today that is the StagePanels (panelOpacity) and the
            StageRail (its own exit fade); the brand span is opacity-0
            forever and the hover/gate layers paint nothing. Any new
            decorative stage-level child must join that fade, so the
            handoff's "empty and transparent" premise stays true. */}

        {/* Brand intro headline — "SERSAN", the monumental opening beat.
            The WebGL text-particle intro (HeroTextParticles) assembles it out
            of a particle field on entry and melts it back out on the first
            scroll while the DOM hero cascades in. Restacked 2026-08-07
            (owner): the spore MARK now leads the lockup, parked centered
            ABOVE the viewport center (HeroLogo's LOCKUP_* constants, with the
            full derivation), and this wordmark sits BELOW it, smaller than
            before. The span is the PARTICLE ANCHOR + typography source
            (opacity 0 forever — the particles are the only visible render);
            hidden by default so every fallback path (no JS, mobile,
            non-WebGPU, reduced motion) never shows it — the H1 owns the hero
            as before. Decorative: the accessible heading stays the real H1. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span
            data-hero-brand
            // SIZE — recalibrated 2026-08-18 for the logotype restyle
            // ("Sersan AI" Switzer 600 / −0.045em → "SERSAN" Sersan Display 200
            // / +0.3em). The lockup's width per unit of font-size went 4.014em
            // to 5.187em (browser-measured on the live page, trailing
            // letter-spacing advance included — that is also how canvas
            // measureText counts it, so the DOM rect and the raster agree to
            // <0.01px). Holding the SAME share of viewport width therefore
            // scales every term of the clamp by 4.014/5.187 = 0.774:
            // 3.25rem→2.5rem, 9.5vw→7.35vw, 10rem→7.75rem. That keeps the
            // clamp's own breakpoints put (min below ≈544px vw, max above
            // ≈1687px vw — was 547/1684) and lands 549px wide at 1440×900,
            // i.e. 38.1% of the viewport, against the old 549px / 38.1%.
            // WEIGHT — 340 (2026-08-18, after 200→300→260→300→340; the last
            // step is the owner's own call, settled against the live particle
            // render). The 260 step was taken on the theory that the wordmark
            // read thin because the particle DISC overhung the stroke; it does
            // not — every mote is ~0.8 CSS px, ~9× narrower than the 7.0px stem
            // (the derivation lives on POINT_SIZE in
            // webgl/HeroTextParticles.tsx). With that premise gone the owner's
            // actual complaint — TOO THIN — is answered by weight, and 300 was
            // still short of it, so the ladder goes to its top step. 340 sits
            // WELL ABOVE the 5.0–6.5%-of-cap band the flat reference artwork
            // measures (340 = 9.71% vs 300 = 7.86%, 260 = 6.71%) ON PURPOSE:
            // the particle medium scatters light and reads lighter than solid
            // artwork, so matching the artwork's stem number matches the wrong
            // thing.
            // Jost's masters do NOT share advance widths, so every weight move
            // re-runs the same share-of-viewport calibration. "SERSAN" +0.3em
            // (the trailing letter-spacing advance included — that is how both
            // the DOM rect and canvas measureText count it) measures, straight
            // off the patched faces' hmtx tables in src/fonts (sum of the six
            // advances ÷ upem 1000, + 6 × 0.3em of tracking):
            //   200 → 5.187em   220 → 5.207em   240 → 5.230em   260 → 5.253em
            //   280 → 5.274em   300 → 5.296em   340 → 5.355em
            // (the 200 and 300 figures reproduce the earlier browser
            // measurements — 549.000px and 560.531px at font-size 105.84px —
            // exactly, which is what makes the table usable as the calibration
            // source). The chain, each step holding the same share of viewport
            // width:
            //   200→300 ×5.187/5.296 = 0.9794 → 2.5rem/7.35vw/7.75rem became
            //     2.45rem/7.2vw/7.59rem;
            //   300→260 ×5.296/5.253 = 1.0082 → 2.47rem/7.26vw/7.65rem;
            //   260→300 ×5.253/5.296 = 0.9919 → back to 2.45rem/7.2vw/7.59rem
            //     (the round trip reproduces the 300-era terms exactly, which
            //     is the arithmetic check on the table);
            //   300→340 ×5.296/5.355 = 0.9890 → 2.42rem/7.12vw/7.51rem.
            // SHIPPED CLAMP at weight 340: clamp(2.42rem, 7.12vw, 7.51rem).
            // Breakpoints stay put (the 7.12vw term is below the 2.42rem min
            // under ≈544px of viewport and above the 7.51rem max over
            // ≈1688px). At 1440×900 that is a 102.53px font-size ⇒ 102.53 ×
            // 5.355 = 549.0px wide = 38.13% of the viewport, matching 549.0px /
            // 38.13% at 200 and 549.1px / 38.13% at 300. Cap = 71.8px, stem =
            // 71.8 × 9.71% = 6.97px.
            // The weight itself is an INLINE style, not `font-light`/`font-[…]`:
            // it is calibrated in lockstep with the size clamp above (every
            // weight move re-runs that share-of-viewport arithmetic), so the
            // two numbers are kept together on the node they describe.
            // POSITION — unchanged by the restyle. The +18vh push below the
            // flex center puts the mark ABOVE this line (see HeroLogo's
            // LOCKUP_* block). The translate is calibrated against the LIVE
            // particle render, not rect math — the WebGL lockup renders ~19vh
            // above the DOM-center mapping on a 1440×810 desktop
            // (browser-verified 2026-08-07), so +13vh landed the observed text
            // center at ≈44vh from the frame top; 13→18vh is the owner's
            // 2026-08-07 5vh composition nudge (taller viewports left dead
            // space below) — center ≈49vh, top ≈40.5vh, bottom ≈57.5vh, moved
            // IN LOCKSTEP with HeroLogo's LOCKUP_OFFSET_Y (−0.09→−0.04) and the
            // eclipse yFrac (−0.42→−0.47) so the whole hero drops coherently.
            // HeroTextParticles samples this rect + computed style (transforms
            // included), so the size/translate here IS the particle wordmark's
            // frame; the wrapper keeps X flex-centered.
            className="font-brand text-[clamp(2.42rem,7.12vw,7.51rem)] leading-none tracking-[0.3em] text-ink inline-block whitespace-nowrap"
            style={{
              fontWeight: 340,
              opacity: 0,
              transform: "translateY(18vh)",
              willChange: "opacity",
            }}
          >
            SERSAN
          </span>
        </div>

        {/* Stage rail (left) — one tick per grouped panel; fades out across
            the ship group's final band so the stage is genuinely empty when
            the pin releases onto the already-pinned passage. */}
        <StageRail progressRef={progressRef} groups={DESKTOP_GROUPS} />

        {/* Grouped stage panels stacked, each fades in/out strictly inside
            its range. The hero group (index 0) is the page H1 (lit at
            progress 0 for SSR); the ship group dissolves in place across its
            final band, so the sticky stage scrolls away EMPTY over the
            passage's already-pinned stage and section 05 materializes there a
            breath later (the 02→03 crossfade grammar, owner 2026-08-09). */}
        {DESKTOP_GROUPS.map((group, i) => (
          <StagePanel
            key={group.id}
            group={group}
            blocks={group.blockIds
              .map((id) => stageById.get(id))
              .filter((s): s is Stage => s !== undefined)}
            progressRef={progressRef}
            isHero={i === 0}
            copy={copy}
            index={i}
            language={language}
          />
        ))}

        {/* No scroll hint here — the one-beat intro ends on the DOM hero
            cascade (domReveal), which hands straight into an actionable
            cluster (eyebrow · sub · CTAs), so a scroll label would be
            redundant chrome. */}

        {/* Hover-sense layer over the mark (right half) — gates the cursor
            erode/dissolve. Mounts only once the WebGL hero is live; wheel
            scrolling bubbles through. (The old drag-to-rotate capture was
            retired: nothing consumed the rotation, so the grab cursor
            promised an interaction that never happened.) */}
        <HeroHoverLayer />

        {/* Scroll hijack for the text intro: while the gate is engaged the
            page does NOT scroll — wheel/touch input only drives the
            "Sersan AI" → headline particle transition. Self-gates on the
            WebGL morph being active; inert on every fallback. Also renders
            the explicit skip affordance (Esc + the bottom-right mono label)
            — kept OUTSIDE the inert stage panels so it stays reachable while
            they are hidden. */}
        <HeroIntroGate skipLabel={copy.skipIntro} />

        {/* (Removed 2026-08-09, owner: the SpineExitGate camera-descent beat.
            It locked the page at the pin end and played a scripted one-viewport
            3D dive + DOM stage sweep-up into section 05, which read as a
            slide-up. Scrolling past the pin end is now plain scrolling; the
            SingularityPassage owns the only scripted camera move in the
            handoff — its rightward pan. The textMorphStore tilt fields
            (camTilt/tiltDone/tiltAnchorY/camDescend) stay: nothing drives them
            now, so their consumers degrade to no-ops at 0/false.) */}
      </div>
    </section>
  );
}

