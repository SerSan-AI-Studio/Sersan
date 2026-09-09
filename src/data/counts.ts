/**
 * Derived project counts.
 *
 * SPLIT OUT OF `copy.ts` (2026-09-09). `copy.ts` value-imported `caseStudies`
 * for nothing but these two integers, and `layout.tsx` imports `POSITIONING`
 * from `copy.ts` — so the whole bilingual case-study dataset (~51 KB raw,
 * ~19.8 KB brotli, every `summary`/`summaryIt` pair) rode onto EVERY route,
 * including /trust, /contact, /audit, /consulting, /resources and /start, none
 * of which render a count. Keeping the counts here means `copy.ts` holds only
 * strings, and the dataset ships to the two pages that actually need it.
 *
 * The derivation is load-bearing and must STAY a derivation: the home page
 * once hardcoded "13" while the archive rendered 14 a few sections down.
 * Derive or don't state.
 */

import { caseStudies } from "@/data/case-studies";

/** Total named projects in the archive (SerSan builds + prior senior delivery). */
export const projectCount = (): number => caseStudies.length;

/** Projects SerSan was itself contracted to deliver. Derived from attribution. */
export const sersanBuildCount = (): number =>
  caseStudies.filter((c) => c.attribution === "sersan").length;
