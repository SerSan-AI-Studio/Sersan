/**
 * Shared geometry of the pinned home spine (cinematic-system-scroll).
 *
 * Lives in src/lib (pure data — no three/react deps) because BOTH bundles
 * need the same number: the route bundle renders the outer spine section at
 * this height, and the lazy WebGL island (HeroLogo) derives its no-span
 * fallback for the hero pin range from it. Constants only — no state, so no
 * globalThis pin is required (duplicated module copies stay identical).
 *
 * `Backend` is imported as a TYPE ONLY (fully erased at compile time), so the
 * three-free / DOM-free promise above still holds at runtime.
 */
import type { Backend } from "@/webgl/renderer/createRenderer";

/**
 * Outer height of the pinned spine section, in vh. 315vh is the 3-group
 * layout (2026-08-07: stage 05 "handover" moved OUT of the spine — it now
 * lives ONCE as panel 1 of the singularity passage's horizontal track, so
 * the spine runs 01→04: hero · signals∪audit · build∪operate. Was 390vh
 * with the 4th "handover" group; each surviving group keeps its exact
 * pre-move scroll length: 58vh · 81.7vh · 75.3vh over a 215vh scrub).
 */
export const SPINE_HEIGHT_VH = 315;

/**
 * Scrub travel of the spine's ScrollTrigger, in vh: the outer height minus
 * the 100vh sticky viewport. ScrollTrigger progress 0..1 (start "top top" →
 * end "bottom bottom") maps linearly onto this distance, so a stage range of
 * 0.2 means 0.2 × 290vh = 58vh of real scrolling.
 */
export const SPINE_TRAVEL_VH = SPINE_HEIGHT_VH - 100;

/**
 * Outer height of the COMPACT spine (CompactSpine in cinematic-system-scroll:
 * coarse pointer / ≤768px, motion OK), in svh — MOBILE_HOME_SPEC §2 row 1:
 * 3376px / 4.00vh → 1519px / 1.80vh at 390×844. svh, never vh: the sticky
 * stage inside is 100svh, and a runway in the same unit is frozen against the
 * mobile address-bar collapse for free. Readers: CompactSpine (writes the
 * runway height + minHeight from it) and navbar (mobile-parity Phase 4b — the
 * hero header-hide reveal band must use the COMPACT travel when the compact
 * brand anchor `[data-hero-brand-compact]` is the one on the page).
 */
export const COMPACT_SPINE_SVH = 180;

/**
 * Scrub travel of the compact spine, in svh: the outer height minus the
 * 100svh sticky stage (80svh ≈ 675px at 390×844 — ~27svh per grouped panel).
 */
export const COMPACT_SPINE_TRAVEL_SVH = COMPACT_SPINE_SVH - 100;

// === Phase 4b kill-switch =================================================
// HERO_BRAND_COMPACT (plans/2026-08-17-mobile-parity.md, Phase 4b — owner
// Decision 2: "brand intro 'Sersan AI' anche su telefono capace, tap = skip").
// When TRUE the CompactSpine renders the compact "Sersan AI" particle anchor
// (`[data-hero-brand][data-hero-brand-compact]`) on capable phones only —
// fxBudget.level ≥ 2 AND a resolved true-WebGPU backend — which arms the
// HeroTextParticles brand beat (auto-play, time-driven, no scroll consumption,
// tap/Esc = skip) and the HomeSingularity lite eclipse behind it. When FALSE
// every phone renders byte-identical to before this phase: no anchor, no
// store reads, DOM cascade exactly as today, AND the lite eclipse island does
// not mount either (Scene.tsx AND-s this flag into its `homeSingularityLite`
// selector) — one switch, both halves of the beat. Desktop (`mode ===
// "desktop"`, tier full ⇒ raymarchLite false) never consults this flag.
//
// Lives HERE (a DOM-free, three-free module) rather than in
// cinematic-system-scroll.tsx because BOTH bundles read it: the route bundle
// (CompactSpine's `brandArmed`) and the lazy WebGL host (Scene.tsx's lite
// gate). Constant only — no state, so the duplicated module copies stay
// identical (see the header note).
export const HERO_BRAND_COMPACT = true;

/**
 * THE single predicate for "will this load play the brand beat?" — the
 * SERSAN wordmark assemble plus the eclipse that rises behind it.
 *
 * It was written inline in CompactSpine (`brandArmed`), and the moment the
 * preloader learned to stop waiting for a beat that is never coming there
 * would have been a second copy — a predicate whose FALSE branch is a
 * 23-second stall does not get to drift between two files. It lives here
 * instead: beside the kill-switch it AND-s, in the module both the route
 * bundle and the lazy WebGL host already import.
 *
 * NOT the same predicate as Scene.tsx's `homeSingularityLite`, which keys on
 * `fxBudget.raymarchLite` (level 2 ONLY — level 3 is false, because desktop
 * reaches the eclipse through `tier === "full"` instead). That selector
 * answers "mount the LITE eclipse"; this one answers "is a beat coming at
 * all", and is true on desktop. Do not merge them.
 *
 * `level` is `fxBudget.level` (2 = capable phone, 3 = desktop) and `backend`
 * the RUNTIME backend from tierStore — never `webgpuEnabled()`, which is a
 * build-time flag that is true in production even on a browser that handed
 * us the WebGL2 fallback. `backend` is null until Scene's `onCreated` runs,
 * so this reads FALSE during the window before the renderer exists: callers
 * that treat false as a VERDICT (rather than as "not yet") must gate on
 * `tierStore.resolved && backend !== null` first.
 */
export function brandBeatArmed(input: {
  level: number;
  backend: Backend | null;
}): boolean {
  return HERO_BRAND_COMPACT && input.level >= 2 && input.backend === "webgpu";
}

// === Phase 4d kill-switch =================================================
// RAIL_ISLANDS_TOUCH (plans/2026-08-17-mobile-parity.md, Phase 4d — owner
// delegated the default). When TRUE, capable phones (fxBudget.level ≥ 2 AND a
// resolved true-WebGPU backend, tier "lite" — never tier "full") mount the two
// home rail islands over their NATIVE snap scrollers: RailPlanes behind the
// case-studies cards and FounderPortraitMorph over the founders cards, both
// driven by a CONTINUOUS touch source (a passive `scroll` listener on the
// rail's own [data-rail-scroller], writing scrollLeft/progress/velocity —
// or the founders' snap-relative scrub — into railStore / foundersMorphStore;
// store writes only, zero setState, zero preventDefault). When FALSE every
// phone renders byte-identical to before this phase: DOM-only rails, the
// duotone→colour founder reveal, no store writes, and neither island mounts
// (Scene.tsx AND-s this flag into its `railIslandsTouch` selector, so the
// selectors short-circuit before reading a single store field).
//
// Desktop (tier "full", level 3) never consults this flag: every selector
// that reads it is also AND-ed with `tier !== "full"`, so the pinned
// ScrollTrigger rail + the gated vertical morph stage are untouched.
//
// Lives HERE (DOM-free, three-free) for the same reason as HERO_BRAND_COMPACT:
// the route bundle (case-studies-rail / founders-rail DOM writers) and the
// lazy WebGL host (Scene.tsx mount gates) both read it. Constant only.
export const RAIL_ISLANDS_TOUCH = true;

// === Hero beats kill-switch (2026-08-27) ===================================
// SPINE_BEATS — owner ask: "cambia lo stile di animazione delle prime slide
// della hero (01-02-03-04-05) … animazioni professionali GSAP stile Lusion".
// When TRUE the spine's text panels (and panel 05 in the singularity passage)
// are choreographed by TRIGGERED per-beat GSAP timelines (masked line rise +
// word stagger, rolling "0N" index, eyebrow decode, hairline draw; clean
// directional exits) fired from the SAME scrubbed progress the old crossfade
// read — see src/components/fx/beat-choreographer.ts + src/lib/spine-beats.ts.
// When FALSE every panel renders byte-for-byte on the pre-refactor path: the
// per-panel rAF `panelOpacity` crossfade (opacity + 16px translate) in
// StagePanel, and the passage's compose() `panelAlpha/panelY` scrub writes.
// Scroll geometry, snap stations, the intro gate, the store contracts and the
// SSR poses are identical on both sides of this switch — it only changes who
// writes the text nodes' opacity/transform.
//
// Lives HERE (DOM-free, three-free) like the other spine switches so both the
// route bundle and any lazy island can read it. Constant only.
export const SPINE_BEATS = true;
