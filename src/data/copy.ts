/**
 * SerSan copy system — the single source of truth for every claim, number,
 * CTA label and engagement term that appears on more than one surface.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The site is bilingual through ~437 inline `isEn ? "EN" : "IT"` ternaries
 * across 40 files (the src/data/translations dictionary is dead — t() is
 * called in two files for five keys). That is fine for prose that lives on
 * exactly one surface. It is NOT fine for facts and promises, which had
 * drifted badly before the 2026-08 repositioning:
 *
 *   - the Technical Audit was sold with FIVE different durations
 *   - the report was 20–30 pages on /audit and 12–20 pages in services.ts
 *   - the homepage said both "13" and "14" named engagements, one scroll apart
 *   - "No open-ended retainers" rendered one viewport above "03 · Retainer"
 *   - a "From £15K" floor was broadcast on the OG card while the intake form
 *     could not accept anything under £15K
 *
 * Anything a visitor could catch us contradicting belongs HERE, imported, not
 * retyped. If you find yourself typing a duration, a page count, an engagement
 * count or a CTA label into a component, stop and add it to this file instead.
 *
 * SHAPE
 * -----
 * Every entry is a `Bilingual` — { en, it }. Read it with `say(lang, entry)`
 * or, in a component that already computed `isEn`, `pick(isEn, entry)`.
 * Numbers that are derived (engagement count) are functions over live data so
 * they cannot go stale.
 *
 * POSITIONING (2026-08)
 * ---------------------
 * SerSan is a founder-led custom software, AI and automation studio that
 * solves valuable business problems — from a focused workflow fix to a
 * sophisticated production platform. AI is a capability, not a requirement.
 *
 *   Core message      Start with the problem. Build the smallest useful
 *                     solution. Scale what works.
 *   Secondary thesis  AI where it earns its place.
 *
 * See docs/STRATEGY.md for the full positioning charter.
 */

import type { Language } from "@/data/translations/types";

export interface Bilingual {
  en: string;
  it: string;
}

/** Read a bilingual entry with a Language value. */
export function say(language: Language, entry: Bilingual): string {
  return language === "en" ? entry.en : entry.it;
}

/** Read a bilingual entry in a component that already computed `isEn`. */
export function pick(isEn: boolean, entry: Bilingual): string {
  return isEn ? entry.en : entry.it;
}

/* ------------------------------------------------------------------ *
 * 1. THE FACTS
 *
 * One number, everywhere. These are the values that were contradicting
 * each other across five surfaces each. Import them; never retype them.
 * ------------------------------------------------------------------ */

export const FACTS = {
  /**
   * The audit is ONE engagement with a variable scope, not two products and
   * not five durations. "2–6 business days · fixed scope" covers both the
   * focused diagnostic (one workflow) and the full technical audit (the
   * whole business), and it replaces every one of: "one week",
   * "two to three weeks", "1–2 weeks", "1, 2, or 3 weeks", "Six days".
   */
  auditDuration: {
    en: "2–6 business days",
    it: "2–6 giorni lavorativi",
  } satisfies Bilingual,

  auditDurationScoped: {
    en: "2–6 business days · fixed scope",
    it: "2–6 giorni lavorativi · scope fisso",
  } satisfies Bilingual,

  /**
   * Deliverable size is SCOPE-DEPENDENT and deliberately not a page count.
   * We sell the decision, not the paper. Replaces "20–30 pages" and
   * "12–20 pages", and resolves the "No 80-slide deck" vs "executive deck"
   * contradiction: it is always a written document, never a deck.
   */
  auditDeliverable: {
    en: "A written document, as long as it needs to be — a concise decision brief for a focused diagnostic, a deeper report for a full audit. Never a slide deck.",
    it: "Un documento scritto, lungo quanto serve: una nota decisionale sintetica per una diagnosi mirata, un report più esteso per un audit completo. Mai una presentazione.",
  } satisfies Bilingual,

  /** Build engagements. Replaces the "2 to 8 weeks" vs "4–8 weeks" split. */
  sprintDuration: {
    en: "2–8 weeks, depending on scope",
    it: "2–8 settimane, in base allo scope",
  } satisfies Bilingual,

  /** Response promise. Used near every CTA. */
  replyTime: {
    en: "Reply within one business day",
    it: "Risposta entro un giorno lavorativo",
  } satisfies Bilingual,

  replyTimeShort: {
    en: "One business day",
    it: "Un giorno lavorativo",
  } satisfies Bilingual,

  /** Read by a founder — the accountability promise, not a team-size claim. */
  readByFounder: {
    en: "Read by a founder, not a queue",
    it: "Letto da un founder, non da una coda",
  } satisfies Bilingual,

  /** Lowers the barrier to a first message. Use sparingly, near primary CTAs. */
  briefIsEnough: {
    en: "Two or three sentences is enough",
    it: "Bastano due o tre frasi",
  } satisfies Bilingual,
} as const;

/* ------------------------------------------------------------------ *
 * 2. COUNTS — derived, never literal
 *
 * The homepage used to hardcode "13" while the same page rendered
 * caseStudies.length = 14 a few sections down. Derive or don't state.
 * ------------------------------------------------------------------ */

/**
 * MOVED to `@/data/counts` (2026-09-09). They live there, not here, because
 * this module is imported by `layout.tsx` and therefore by every route —
 * value-importing `caseStudies` for two integers shipped the whole bilingual
 * dataset (~19.8 KB brotli) to /trust, /contact, /audit, /consulting,
 * /resources and /start, none of which render a count. Keep this file
 * strings-only.
 */

/**
 * Aggregate proof line that does NOT depend on a count staying true, and does
 * not silently blend SerSan work with a founder's prior employment.
 */
export const PROOF_LINE = {
  en: "Selected SerSan work and prior senior delivery experience.",
  it: "Una selezione di lavori SerSan e di precedenti consegne senior.",
} satisfies Bilingual;

/* ------------------------------------------------------------------ *
 * 3. CTA HIERARCHY
 *
 * PRIMARY is "Send a project brief" everywhere.
 *
 * "Book a call" is FORBIDDEN unless the visitor can actually schedule a time.
 * They cannot: CAL_ENABLED is false in src/lib/site.ts and the Cal.com slug
 * is a placeholder that 404s. Twenty-one booking-flavoured CTAs used to
 * promise a booking and deliver a written form. Do not reintroduce one.
 * ------------------------------------------------------------------ */

export const CTA = {
  /** The primary action, site-wide. Destination: START_HREF (/start). */
  primary: {
    en: "Send a project brief",
    it: "Invia un brief di progetto",
  } satisfies Bilingual,

  /**
   * Short primary, for the navbar pill only. navbar.tsx:1038 sits in a flex
   * row that already clipped at exactly 1280px once; the full 20-char primary
   * label re-opens that clip. Keep the pill short.
   */
  primaryShort: {
    en: "Start a project",
    it: "Inizia un progetto",
  } satisfies Bilingual,

  /* Contextual variants — use the one that matches the surface's subject. */
  showWorkflow: {
    en: "Show us the workflow",
    it: "Mostraci il processo",
  } satisfies Bilingual,

  tellUsBuilding: {
    en: "Tell us what you're building",
    it: "Raccontaci cosa state costruendo",
  } satisfies Bilingual,

  discussProject: {
    en: "Discuss the project",
    it: "Parliamo del progetto",
  } satisfies Bilingual,

  startWithProblem: {
    en: "Start with the problem",
    it: "Si parte dal problema",
  } satisfies Bilingual,

  discussDiagnostic: {
    en: "Discuss a diagnostic",
    it: "Parliamo di una diagnosi",
  } satisfies Bilingual,

  /* Secondary — never the only action on a surface. */
  seeWork: {
    en: "See our work",
    it: "I nostri lavori",
  } satisfies Bilingual,

  seeHowWeWork: {
    en: "See how we work",
    it: "Come lavoriamo",
  } satisfies Bilingual,

  /** Email fallback. Pair with CONTACT_EMAIL from @/lib/site. */
  emailUs: {
    en: "Or email us directly",
    it: "Oppure scriveteci direttamente",
  } satisfies Bilingual,
} as const;

/* ------------------------------------------------------------------ *
 * 4. ENGAGEMENT TERMINOLOGY
 *
 * The ladder must have a genuinely small bottom rung. Before the
 * repositioning the smallest buyable thing was a 1–2 week audit and the
 * published floor was "From £15K", so a client with one painful €5k
 * workflow problem had no door to walk through.
 * ------------------------------------------------------------------ */

export const ENGAGEMENT = {
  diagnostic: {
    name: { en: "Focused Diagnostic", it: "Diagnosi mirata" } satisfies Bilingual,
    scope: {
      en: "One workflow, product problem, automation opportunity or system.",
      it: "Un processo, un problema di prodotto, un'opportunità di automazione o un singolo sistema.",
    } satisfies Bilingual,
  },
  audit: {
    name: { en: "Technical Audit", it: "Audit tecnico" } satisfies Bilingual,
    scope: {
      en: "The broader architecture, workflows, data, tooling and delivery environment.",
      it: "Architettura, processi, dati, strumenti e ambiente di delivery nel loro insieme.",
    } satisfies Bilingual,
  },
  sprint: {
    name: { en: "Delivery Sprint", it: "Sprint di delivery" } satisfies Bilingual,
    scope: {
      en: "Design and build, shipped in visible increments against agreed acceptance criteria.",
      it: "Progettazione e sviluppo, rilasciati in incrementi visibili su criteri di accettazione concordati.",
    } satisfies Bilingual,
  },
  partnership: {
    name: {
      en: "Technical Partnership",
      it: "Partnership tecnica",
    } satisfies Bilingual,
    scope: {
      en: "Continued development, support or fractional technical leadership — scoped separately, renewed on merit.",
      it: "Sviluppo continuativo, supporto o direzione tecnica frazionale: con scope separato, rinnovata sui risultati.",
    } satisfies Bilingual,
  },
} as const;

/**
 * Replaces the rigid anti-retainer messaging ("No open-ended retainers",
 * "No retainer creep") that used to contradict the Fractional CTO offering
 * sold on the same page.
 */
export const CONTINUATION = {
  en: "Continuation is earned, not assumed. Every phase has its own scope, its own price and its own end.",
  it: "La continuità si guadagna, non si dà per scontata. Ogni fase ha il suo scope, il suo prezzo e la sua fine.",
} satisfies Bilingual;

/** Process philosophy. A two-week automation must not inherit platform ceremony. */
export const PROPORTIONALITY = {
  en: "Process proportional to risk. Small projects stay small.",
  it: "Processo proporzionato al rischio. I progetti piccoli restano piccoli.",
} satisfies Bilingual;

/* ------------------------------------------------------------------ *
 * 5. POSITIONING — the claims that must not drift between pages
 * ------------------------------------------------------------------ */

export const POSITIONING = {
  /** The core message. */
  core: {
    en: "Start with the problem. Build the smallest useful solution. Scale what works.",
    it: "Si parte dal problema. Si costruisce la soluzione utile più piccola. Si scala ciò che funziona.",
  } satisfies Bilingual,

  /** The secondary thesis. A named brand asset — do not reword. */
  thesis: {
    en: "AI where it earns its place.",
    it: "L'AI dove se lo merita.",
  } satisfies Bilingual,

  /** One-line company description. Used in metadata and any "what we do" slot. */
  oneLiner: {
    en: "Founder-led studio building custom software, workflow automation and AI for growing businesses.",
    it: "Studio guidato dai founder: software su misura, automazione dei processi e AI per aziende in crescita.",
  } satisfies Bilingual,

  /** Audience. Replaces "For SaaS, fintech & regulated teams". */
  audience: {
    en: "For founders, SMEs & growing teams",
    it: "Per founder, PMI e team in crescita",
  } satisfies Bilingual,

  /** The range promise — small AND large, stated together. */
  range: {
    en: "From one manual workflow to a full production platform.",
    it: "Da un singolo processo manuale a una piattaforma completa in produzione.",
  } satisfies Bilingual,

  /** Removes the internal-engineering-team prerequisite, explicitly. */
  noTeamNeeded: {
    en: "You don't need an internal engineering team. We can own technical delivery and leave you with a system you understand and control.",
    it: "Non serve un team tecnico interno. Possiamo occuparci noi della delivery e lasciarvi un sistema che capite e controllate.",
  } satisfies Bilingual,

  /** Right-tool honesty. The operational form of the thesis. */
  rightTool: {
    en: "Sometimes it's AI. Sometimes automation. Sometimes a straightforward piece of software. Sometimes the right answer is not to build anything.",
    it: "A volte è AI. A volte automazione. A volte un software semplice. A volte la risposta giusta è non costruire nulla.",
  } satisfies Bilingual,

  /** Ownership. A named brand asset. */
  ownership: {
    en: "You own the code and the system. No licensing, no lock-in, no source held back.",
    it: "Il codice e il sistema sono vostri. Nessuna licenza, nessun lock-in, nessun sorgente trattenuto.",
  } satisfies Bilingual,

  /**
   * Accountability. REPLACES the old "Both founders staffed on every
   * engagement" / "no junior bench" claims, which were unsellable at the
   * small-project tier and were contradicted by the third team card.
   */
  accountability: {
    en: "Founder-led. Technically owned.",
    it: "Guidato dai founder. Con una proprietà tecnica chiara.",
  } satisfies Bilingual,

  accountabilityLong: {
    en: "Every engagement has a named commercial owner and a named technical owner. Accountability stays senior, whoever else contributes.",
    it: "Ogni progetto ha un responsabile commerciale e un responsabile tecnico, entrambi con nome e cognome. La responsabilità resta senior, chiunque altro contribuisca.",
  } satisfies Bilingual,

  /** Production-grade, proportional. Preserves the brand line's real meaning. */
  productionGrade: {
    en: "Production-grade when production-grade is actually required.",
    it: "Production-grade quando serve davvero.",
  } satisfies Bilingual,

  /** The tagline lockup. Untouchable. */
  tagline: {
    en: "The intelligence is artificial. The judgement stays human.",
    it: "L'intelligenza è artificiale. Il giudizio resta umano.",
  } satisfies Bilingual,
} as const;

/* ------------------------------------------------------------------ *
 * 6. COMPLIANCE WORDING
 *
 * Safe public phrasing for regulatory posture. SerSan holds NO
 * certification. Never render a bare status like "Compliant" or "Ready",
 * and never imply a held attestation.
 * ------------------------------------------------------------------ */

export const COMPLIANCE = {
  /** The general posture line. Use instead of any per-standard status badge. */
  posture: {
    en: "Systems can be designed to support applicable DORA, EU AI Act and security requirements. Regulatory obligations and certification remain scope-specific.",
    it: "I sistemi possono essere progettati per supportare i requisiti applicabili di DORA, EU AI Act e sicurezza. Gli obblighi normativi e le certificazioni restano specifici per ogni progetto.",
  } satisfies Bilingual,

  /** The honesty asset. Keep both clauses and the break. */
  noClaims: {
    en: "We do not claim compliance certifications we don't hold. We do build systems that pass them.",
    it: "Non rivendichiamo certificazioni che non abbiamo. Costruiamo sistemi che le superano.",
  } satisfies Bilingual,

  /** Controls scale with the build. A €5k automation has no model router. */
  proportional: {
    en: "Controls are scaled to the system: a workflow automation and a regulated production platform do not carry the same overhead.",
    it: "I controlli sono proporzionati al sistema: un'automazione di processo e una piattaforma regolamentata in produzione non hanno lo stesso overhead.",
  } satisfies Bilingual,

  /**
   * Hosting. The old copy claimed "EU-only data residency" on the same page
   * as "Infrastructure is hosted in London (UK)". The UK is not in the EU.
   */
  hosting: {
    en: "Infrastructure is hosted in the UK and EU. Data residency is agreed per engagement.",
    it: "L'infrastruttura è ospitata nel Regno Unito e nell'UE. La residenza dei dati è concordata per ogni progetto.",
  } satisfies Bilingual,
} as const;

/* ------------------------------------------------------------------ *
 * 7. BUDGET BANDS
 *
 * Shared by /start and the /consulting multi-step intake so the two forms
 * cannot diverge again. Values MUST stay in sync with the zod enum in
 * src/app/api/intake/route.ts.
 *
 * No sub-£2.5k band: SerSan takes focused work, not £500 jobs.
 * ------------------------------------------------------------------ */

export const BUDGET_BANDS = [
  { value: "under-5k", en: "£2.5k–£5k", it: "£2.5k–£5k" },
  { value: "5-10k", en: "£5k–£10k", it: "£5k–£10k" },
  { value: "10-25k", en: "£10k–£25k", it: "£10k–£25k" },
  { value: "25-50k", en: "£25k–£50k", it: "£25k–£50k" },
  { value: "50k-plus", en: "£50k+", it: "£50k+" },
  { value: "not-sure", en: "Not sure yet", it: "Non ancora chiaro" },
] as const;

export type BudgetValue = (typeof BUDGET_BANDS)[number]["value"];

/** Reassurance shown under the budget question. */
export const BUDGET_REASSURANCE = {
  en: "Not sure about budget or technology? That's fine — describe the problem.",
  it: "Non avete ancora chiaro budget o tecnologia? Va benissimo: descriveteci il problema.",
} satisfies Bilingual;
