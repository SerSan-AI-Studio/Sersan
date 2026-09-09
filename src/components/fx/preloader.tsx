"use client";

/**
 * Preloader v2 — chrome only, on the scene's own stage (owner 2026-08-28:
 * "non devi usare per forza l'svg… meglio qualcosa in 3d… anche lo sfondo bg
 * devi togliere, non è smooth perché è diverso da quello dell'hero").
 *
 * THE LOADER HAS NO WORLD OF ITS OWN. v1 painted a private universe (tunnel,
 * starfield, an SVG twin of the mark) over an opaque sheet and then had to
 * hand off into a DIFFERENT world — the seam was structural. v2 removes the
 * world: the overlay is TRANSPARENT chrome (a corner tag + the mono %
 * readout) sitting directly on the page's own navy (`--bg` on <body>) with
 * the persistent WebGL canvas visible beneath from the first frame. The
 * loading actor is the HERO'S OWN 3D spore mark: HeroLogo reads the live
 * counter fraction (introProgressRef, written here every tick) and scrubs
 * the spore materialisation with it — the mark literally grows out of
 * nothing as the percentage climbs, on the exact stage, ground and light it
 * will live on. There is nothing to hand off, because nothing ever changes
 * places: at 100% the crust EXPLODES (the hero's own auto-burst, fired on
 * the introComplete edge — the beat the owner asked for), the exposure
 * ignites (PostFXNodes uIgnite), the camera settles (SignatureLine), the
 * wordmark assembles, and this chrome simply fades out over it all.
 *
 * While the chrome is up the page DOM (nav + [data-lang-fade] content) is
 * held transparent via a <body> class (see globals.css "first-load intro
 * hold") so the stage shows ONLY the scene — Arago's trick: their loader is
 * transparent chrome over the body's black while the canvas warms beneath.
 * The hold is released with the reveal and the DOM's own entrance beats take
 * over. JS-off / crawlers never get the class (client effect) — the SSR page
 * is untouched.
 *
 * Progress is driven by REAL readiness, not a fake timer (unchanged from v1
 * — this is the part of the old preloader worth keeping):
 *   - document.fonts.ready   0.25  (brand type swapped in — no FOUT flash)
 *   - window "load"          0.20  (the static SSR'd page painted)
 *   - asset manifest         0.25 × byte progress (preloadManifest — the
 *                                   founder headshots on the level-3 WebGPU
 *                                   home, empty ⇒ instant elsewhere)
 *   - introStore.warmProgress 0.30 × progress (0.5 once gl.compileAsync
 *                                   resolved, 1 on the smooth-frame
 *                                   heuristic — the TRUTH gate on 100%)
 * Each resolved signal advances a target; a per-frame rAF eases the readout
 * toward it, and a RISE floor caps how fast the displayed fraction may climb
 * so a warm cache cannot snap the mark into existence before the eye has
 * read it growing (the v1 assembly floor, repurposed). Bounded fallbacks on
 * fonts/load/manifest keep a single stuck sub-resource from trapping the
 * counter; `warm` stays the only truthful gate on reaching 100. A MIN
 * visible time (700ms; 350ms on a repeat visit in this tab session)
 * prevents a flash; a MAX watchdog (21s, derived — this docblock claimed
 * ~14s while the constant read 25000, which is the drift the derived chain
 * below exists to stop) guarantees a stuck GPU never traps the visitor.
 *
 * The BRAND-BEAT holds (wordmark + eclipse) are the one place the counter can
 * legitimately park at its 90% cap, so they take their release from the
 * island's own verdict — `introStore.brandBeatSkipped`, published by the
 * components that decide whether a beat mounts at all — and only fall back to
 * the timers when a beat that WAS armed then stalls.
 *
 * SSR-safe: the overlay renders only AFTER mount (no hydration mismatch).
 * Body scroll is locked while visible (Lenis parked + html overflow hidden)
 * and released on reveal. prefers-reduced-motion: the overlay never mounts,
 * the hold class is never added, introStore completes immediately — the page
 * just appears.
 *
 * Removable: delete this file + its <Preloader /> mount in layout.tsx + the
 * intro-hold rules in globals.css; introProgressRef rests at 1 so HeroLogo
 * shows the mark fully materialised, exactly as on a soft entry.
 */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useLanguage } from "@/components/language-provider";
import { useTierStore } from "@/webgl/store/tierStore";
import { useIntroStore, introProgressRef } from "@/webgl/store/introStore";
import { useTextMorphStore } from "@/webgl/store/textMorphStore";
import { getLenis } from "@/lib/lenis-singleton";
import {
  manifestUrlsForBudget,
  startPreloadManifest,
  type PreloadManifestHandle,
} from "@/webgl/loading/preloadManifest";

// Timing envelope (ms). MIN keeps the loader from flashing on a warm cache.
const MIN_VISIBLE_MS = 700;
// Session-short: a REPEAT hard load in the same tab session lowers the
// minimum visible time (and the rise floor below) — the readiness signals
// still gate 100% truthfully. The key is separate from `sersan_skip_intro`
// (src/lib/intro-skip.ts), which has another purpose.
const SESSION_SHORT = true;
const SESSION_KEY = "sersan_seen";
const MIN_VISIBLE_SHORT_MS = 350;
// Bounded fallbacks for the NETWORK-DEPENDENT polish signals (see header).
const FONTS_MAX_MS = 3000;
const LOAD_MAX_MS = 3500;
const MANIFEST_MAX_MS = 4000;
// Bound on the home stage-actor gate (the spore build + hidden prime): a
// build that never lands (broken GPU, failed chunk) self-resolves here so
// the reveal degrades to the plain fade instead of trapping the visitor.
// Generous because a cold dev compile genuinely takes seconds (measured
// 10-12s on a fresh Turbopack graph; production chunks are prebuilt and land
// in a fraction of that); still safely under the WATCHDOG.
const STAGE_MAX_MS = 12000;
// Bound on the wordmark hold (owner 2026-08-28: the counter may not complete
// before the SERSAN assemble wave has fully formed). Sized as the stage
// worst case + the 3.6s entry with margin; paths that never mount a
// wordmark (WebGL2, phones without the brand anchor) self-resolve here.
// DERIVED, not typed in (2026-09-09). These are now INSURANCE ONLY: since
// `brandBeatSkipped` exists, a device that was never going to play the beat
// leaves the hold the moment the backend resolves, so the only load that
// still reaches this number is one where the beat WAS armed and then stalled
// — and cutting that short would truncate the show on a slow-but-working
// phone, which is the opposite of what these holds are for.
//
// The ordering is a CONTRACT, not a coincidence: the wordmark cannot form
// before the stage actor exists, so this must sit above STAGE_MAX_MS by at
// least the 3.6s entry. Writing the three numbers by hand is exactly how
// that invariant gets broken (it was, briefly, in this very edit: 12000
// against a STAGE_MAX_MS of 12000 — no room for the entry at all). Deriving
// them makes the relationship the source of truth, so moving the stage bound
// carries the other two with it.
const WORDMARK_MAX_MS = STAGE_MAX_MS + 4000;
// Bound on the ECLIPSE hold (owner 2026-08-28: the black hole must already
// fill the screen behind SERSAN before the zoom-out starts). Its deferred
// build only arms once the wordmark has assembled, so this waits on top of
// the wordmark hold; every path that never builds one (WebGL2, lite tiers,
// skipped intro) self-resolves here.
// The wordmark bound plus the eclipse's own deferred build — it only ARMS at
// assembleDone, i.e. after the wordmark — and its compileAsync warm.
const ECLIPSE_MAX_MS = WORDMARK_MAX_MS + 2500;
// Milliseconds the eclipse is given to IGNITE (its own ~1.2s smoothstep
// rise) once ready, so the reveal never starts on a half-risen horizon.
const ECLIPSE_IGNITE_MS = 900;
// LAST-RESORT safety only: if the scene never reports `warm` (a truly stuck
// GPU), reveal anyway so the visitor is never trapped. Sits above
// WORDMARK_MAX_MS with margin.
// Derived like the two above, so its "sits above ECLIPSE_MAX_MS with margin"
// contract survives any future move of the stage bound.
const WATCHDOG_MS = ECLIPSE_MAX_MS + 2500;
// Counter easing toward its target each frame (fraction per ~16ms frame).
// Lowered 0.12 → 0.08 (owner live pass 2026-08-28: "fai tutto più lento e
// smooth") — the readout breathes instead of ticking.
const COUNTER_EASE = 0.08;
// RISE floor (s): the displayed fraction may not outrun elapsed/RISE_MIN_S,
// so the spore materialisation it scrubs always gets a readable arc — the
// v1 assembly floor, repurposed for the 3D actor. Session-short rule as the
// visible-time floor. Stretched 1.9/0.95 → 3.2/1.6 on the same owner pass:
// the whole build-up is the show now, and it must take its time.
const RISE_MIN_S = 3.2;
const RISE_MIN_SHORT_S = 1.6;
// Chrome exit fade (s) — the readout dissolving over the igniting scene.
// The crust burst + uIgnite ramp start on the same beat underneath.
const CHROME_FADE = 0.9;
// <body> classes for the first-load content hold (globals.css). HOLD pins
// nav + [data-lang-fade] at opacity 0 while the chrome is up; RELEASE adds
// the opacity transition for the way back in and is dropped shortly after.
const HOLD_CLASS = "sersan-intro-hold";
const RELEASE_CLASS = "sersan-intro-release";
const RELEASE_SWEEP_MS = 1200;

export function Preloader() {
  // Readout copy follows the visitor's language (owner Decision 8): this
  // component is a child of LanguageProvider, whose pre-paint layout effect
  // commits the persisted language before this mount effect arms the overlay
  // — the first painted readout frame is already in the right language.
  const { t } = useLanguage();
  // Render nothing on the server / first client paint; mount after hydration
  // so the SSR HTML is identical with and without JS (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  // null while we decide whether to show at all (reduced-motion skips).
  const [active, setActive] = useState<boolean | null>(null);
  // Displayed counter (0..100), integer for the digit-roll readout.
  const [display, setDisplay] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Mount gate — runs once after hydration.
  useEffect(() => {
    setMounted(true);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No counter, no hold, no scroll lock. Complete the intro immediately
      // so SignatureLine draws in normally; the page just appears.
      useIntroStore.getState().complete();
      setActive(false);
      return;
    }
    setActive(true);
  }, []);

  useEffect(() => {
    if (active !== true) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let rafId = 0;
    let revealed = false;
    const startedAt = performance.now();
    const introTweens: gsap.core.Tween[] = [];
    let releaseTimer = 0;

    // ----- The stage is the page: hold the DOM, show the scene -------------
    // The canvas (z-0) shows through this transparent overlay; nav +
    // [data-lang-fade] are pinned at opacity 0 by the body class so the only
    // thing on the navy ground is the materialising spore mark + this chrome.
    document.body.classList.add(HOLD_CLASS);
    // The mark's materialisation scrub starts from nothing.
    introProgressRef.current = 0;

    // ----- Lock scroll while the chrome covers the page -----
    // This Preloader is a CHILD of SmoothScrollProvider, so this effect runs
    // BEFORE the provider's acquireLenis() — getLenis() can be null here. The
    // html overflow lock blocks native scroll immediately; the rAF loop then
    // calls lenisStop() each tick until the singleton exists.
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    let lenisStopped = false;
    const lenisStop = () => {
      if (lenisStopped) return;
      const l = getLenis();
      if (l) {
        l.stop();
        lenisStopped = true;
      }
    };
    lenisStop();

    // ----- Session-short floors (see SESSION_SHORT) -----
    let minVisibleMs = MIN_VISIBLE_MS;
    if (SESSION_SHORT) {
      try {
        if (window.sessionStorage.getItem(SESSION_KEY) === "1") {
          minVisibleMs = MIN_VISIBLE_SHORT_MS;
        }
      } catch {
        // Storage unavailable — full minimum.
      }
    }
    const riseMinS =
      minVisibleMs === MIN_VISIBLE_SHORT_MS ? RISE_MIN_SHORT_S : RISE_MIN_S;

    // ----- Real-readiness target (0..1) -----
    // Four independent signals, each a weighted slice — assets 0.70 (fonts
    // .25 + load .20 + manifest .25 × bytes) + warm 0.30 × warmProgress. The
    // counter never EXCEEDS the resolved fraction (capped at 90% until all
    // resolve), so it can't show 100 before the page is genuinely ready.
    const signals = { fonts: false, load: false, manifest: false, warm: false };
    // Stage-actor gate (home only): the spore mark IS the loading readout, so
    // the counter may not complete before the mark's build is live and its
    // hidden prime has finished (introStore.heroStageReady, published by
    // HeroLogo). Interior routes have no stage actor and auto-pass; a build
    // that never lands self-resolves after STAGE_MAX_MS so a broken GPU
    // degrades to the plain reveal instead of trapping the visitor (the
    // watchdog still backstops everything).
    const onHome = window.location.pathname === "/";
    let stageForced = false;
    let wordmarkForced = false;
    let eclipseForced = false;
    // Wall-clock stamp of the frame the eclipse first reported ready, so the
    // hold can add its ignite beat on top (0 = not yet).
    let eclipseReadyAt = 0;
    let manifest: PreloadManifestHandle | null = null;
    let manifestForced = false;
    const manifestProgress = () => {
      if (manifestForced) return 1;
      if (!manifest) return 0; // tier not resolved yet ⇒ manifest not started
      return manifest.progress();
    };
    const targetFraction = () => {
      // A RESOLVED `tier === "off"` without reduced motion has no Canvas, so
      // PipelineWarmup never runs and nothing would ever set warm: treat it
      // as warm. `resolved` is MANDATORY — tier defaults to "off" BEFORE
      // resolve() runs.
      const ts = useTierStore.getState();
      const tierOff = ts.resolved && ts.tier === "off";
      // The two compute-only holds below (wordmark, eclipse) can NEVER be
      // satisfied on the WebGL2 fallback: HeroTextParticles returns before it
      // can build, so `wordmarkFormed` is never published, and HomeSingularity
      // returns null, so `eclipseReady` never fires. `tierOff` does NOT cover
      // this — a desktop without WebGPU resolves to "full" and a phone to
      // "lite"; both mount a Canvas. Without this escape the counter parks at
      // the 90% cap until the 17s/22s insurance timers fire.
      //
      // Must read the RUNTIME backend, never `webgpuEnabled()`: that is a
      // build-time flag, true in production regardless of what the adapter
      // actually handed us, and keying on it would skip the wordmark hold on
      // real WebGPU sessions — the exact thing the hold exists for.
      // `backend` stays null until Scene's `onCreated` runs, so a session that
      // never mounts a Canvas still falls through to the existing timers.
      const noCompute = ts.backend !== null && ts.backend !== "webgpu";
      const intro = useIntroStore.getState();
      // THE VERDICT (2026-09-09). `noCompute` above only catches the WebGL2
      // fallback; it says nothing about a TRUE WebGPU phone that still never
      // plays the beat because its fxBudget resolved to level 1 (no compact
      // brand anchor, no lite eclipse island) or because it is in landscape
      // (stacked spine, no anchor at all). Those phones satisfied every
      // signal, reached the 90% cap, and then sat there for ~23 seconds
      // waiting out WORDMARK_MAX_MS and ECLIPSE_MAX_MS for a wordmark that
      // was never mounting — the live iPhone report. `brandBeatSkipped` is
      // the island side saying so out loud (see introStore), published by
      // CinematicSystemScroll the moment the backend resolves and by
      // HeroTextParticles' own dead ends. Both holds take it as satisfied.
      const brandSkipped = intro.brandBeatSkipped;
      signals.warm = tierOff || intro.warmReady;
      const warmProgress = tierOff ? 1 : intro.warmProgress;
      const mp = manifestProgress();
      signals.manifest = mp >= 1;
      // Stage actor (see the declaration above): required on home only, and
      // never weighted into the fraction — it HOLDS the completion, so the
      // counter breathes at the 90% cap until the mark can actually grow.
      const stageReady =
        !onHome || tierOff || stageForced || intro.heroStageReady;
      // Wordmark hold (owner: the loader lasts until SERSAN has fully
      // composed) — same shape as the stage gate, bounded by WORDMARK_MAX_MS.
      const wordmarkReady =
        !onHome ||
        tierOff ||
        noCompute ||
        brandSkipped ||
        wordmarkForced ||
        intro.wordmarkFormed;
      // Eclipse hold: the hole must be built AND given its ignite beat, so
      // the curtain lifts onto a black hole already filling the frame behind
      // the brand — never onto one still rising.
      if (!eclipseReadyAt && useTextMorphStore.getState().eclipseReady) {
        eclipseReadyAt = performance.now();
      }
      const eclipseReady =
        !onHome ||
        tierOff ||
        noCompute ||
        brandSkipped ||
        eclipseForced ||
        (eclipseReadyAt > 0 &&
          performance.now() - eclipseReadyAt >= ECLIPSE_IGNITE_MS);
      const resolved =
        (signals.fonts ? 0.25 : 0) +
        (signals.load ? 0.2 : 0) +
        0.25 * mp +
        0.3 * warmProgress;
      const allReady =
        signals.fonts &&
        signals.load &&
        signals.manifest &&
        signals.warm &&
        stageReady &&
        wordmarkReady &&
        eclipseReady;
      const elapsed = performance.now() - startedAt;
      const minElapsed = Math.min(elapsed / minVisibleMs, 1);
      if (allReady && minElapsed >= 1) return 1;
      // Never exceed ~90% until the shaders are genuinely warm.
      return Math.min(resolved, 0.9);
    };

    // Bounded fallbacks so a single stuck sub-resource can never trap the
    // counter below 90% forever. Cleared in teardown.
    const fallbackTimers: number[] = [];

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) signals.fonts = true;
      });
      fallbackTimers.push(
        window.setTimeout(() => {
          signals.fonts = true;
        }, FONTS_MAX_MS),
      );
    } else {
      signals.fonts = true;
    }

    if (document.readyState === "complete") {
      signals.load = true;
    } else {
      const onLoad = () => {
        signals.load = true;
      };
      window.addEventListener("load", onLoad, { once: true });
      fallbackTimers.push(
        window.setTimeout(() => {
          signals.load = true;
        }, LOAD_MAX_MS),
      );
    }

    // WebGL tier resolved ⇒ START THE ASSET MANIFEST (the resolved fxBudget
    // decides the URL list). Started at most once; if resolve() never
    // happens the MANIFEST_MAX_MS bound treats it as empty.
    const startManifest = () => {
      if (manifest !== null || cancelled) return;
      manifest = startPreloadManifest(
        manifestUrlsForBudget(useTierStore.getState().fxBudget),
      );
    };
    if (useTierStore.getState().resolved) {
      startManifest();
    }
    const unsubTier = useTierStore.subscribe((s) => {
      if (s.resolved) startManifest();
    });
    fallbackTimers.push(
      window.setTimeout(() => {
        manifestForced = true;
      }, MANIFEST_MAX_MS),
    );
    fallbackTimers.push(
      window.setTimeout(() => {
        stageForced = true;
      }, STAGE_MAX_MS),
    );
    fallbackTimers.push(
      window.setTimeout(() => {
        wordmarkForced = true;
      }, WORDMARK_MAX_MS),
    );
    fallbackTimers.push(
      window.setTimeout(() => {
        eclipseForced = true;
      }, ECLIPSE_MAX_MS),
    );

    // ----- Counter ease + rise floor + reveal trigger (single rAF) ---------
    let current = 0; // 0..1
    // Previous frame's timestamp, for the dt-corrected ease below. 0 = first
    // frame, treated as one nominal 60Hz step.
    let prevNow = 0;
    const frame = () => {
      if (cancelled || revealed) return;
      // Keep parking Lenis until the provider has created it.
      lenisStop();

      const now = performance.now();
      // Truthful target: driven ONLY by real readiness signals, never a
      // fixed timer.
      const target = targetFraction();
      // dt-CORRECTED ease. COUNTER_EASE is authored as "fraction per ~16ms
      // frame"; applying it raw makes the readout's speed a function of the
      // visitor's refresh rate. During the climb the RISE floor below binds
      // first and hides it, but it bites on the TAIL: once every gate passes,
      // `target` jumps to 1 with `current` at the 0.9 cap and the snap needs
      // > 0.99, which is ~28 frames of pure ease with nothing left to wait
      // for — 0.47s at 60Hz, 0.23s at 120Hz, ~0.93s at 30fps. Dead time in the
      // one moment the visitor is actually watching the number.
      // dt is CLAMPED so a tab resuming from background rAF starvation cannot
      // snap through the RISE floor's readable arc in a single step.
      const dtMs = prevNow ? Math.min(now - prevNow, 100) : 1000 / 60;
      prevNow = now;
      const k = 1 - Math.pow(1 - COUNTER_EASE, dtMs / (1000 / 60));
      current += (target - current) * k;
      // Snap the last sliver so we land cleanly on 100 (the ease asymptotes
      // at 99 forever otherwise).
      if (target >= 1 && current > 0.99) current = 1;
      // RISE floor: the readout (and the spore materialisation it scrubs)
      // may not outrun the floor — a warm cache still shows the mark GROW.
      // Wall-clock based, so background-tab rAF starvation can only ever
      // slow it further, never skip it.
      const riseCap = Math.min((now - startedAt) / (riseMinS * 1000), 1);
      if (current > riseCap) current = riseCap;

      // Publish the scrub for HeroLogo (module ref — no store notify).
      introProgressRef.current = current;
      const pct = Math.round(current * 100);
      setDisplay(pct);

      // Reveal as soon as the readout reads 100 AND the target is genuinely 1
      // (all readiness signals + min time + rise floor satisfied). Trigger on
      // target + rounded display, NOT the asymptotic tail — under rAF
      // throttling the ease crawls and "100" would otherwise display while
      // the chrome stayed up for seconds.
      if (target >= 1 && pct >= 100) {
        revealed = true;
        reveal();
        return;
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    // ----- Last-resort watchdog (insurance, NOT the normal path) -----
    // setTimeout fires off the macrotask queue — independent of a starved
    // rAF — and hard-reveals so the visitor is never trapped. It does NOT
    // fake the counter (honest): it lifts the chrome at whatever it reached.
    const revealTimer = window.setTimeout(() => {
      if (cancelled || revealed) return;
      revealed = true;
      introProgressRef.current = 1;
      useIntroStore.getState().complete();
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Storage unavailable — nothing to remember.
      }
      releaseHold();
      restoreScroll();
      setActive(false); // unmount the chrome immediately
    }, WATCHDOG_MS);

    // ----- The hold release (shared by reveal / watchdog / teardown) -------
    function releaseHold() {
      document.body.classList.remove(HOLD_CLASS);
      document.body.classList.add(RELEASE_CLASS);
      releaseTimer = window.setTimeout(() => {
        document.body.classList.remove(RELEASE_CLASS);
      }, RELEASE_SWEEP_MS);
    }

    // ----- Hand-off: one beat, everything at once --------------------------
    // introStore.complete() is the single edge every actor keys on: HeroLogo
    // fires the crust EXPLOSION and finishes the materialisation,
    // PostFXNodes ramps uIgnite (the lights come up), SignatureLine re-kicks
    // its draw-in + plays the camera settle, HeroTextParticles arms the
    // wordmark entry — while this chrome (readout + tag) fades out over the
    // scene and the DOM hold releases into its own entrance beats.
    function reveal() {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Storage unavailable — nothing to remember.
      }
      introProgressRef.current = 1;
      useIntroStore.getState().complete();
      releaseHold();

      const node = overlayRef.current;
      if (!node) {
        finish();
        return;
      }
      introTweens.push(
        gsap.to(node, {
          opacity: 0,
          duration: CHROME_FADE,
          ease: "power2.inOut",
          onComplete: finish,
        }),
      );
    }

    function finish() {
      restoreScroll();
      setActive(false); // unmount the overlay entirely
    }

    function restoreScroll() {
      document.documentElement.style.overflow = prevHtmlOverflow;
      // Only re-start Lenis if we actually parked it.
      if (lenisStopped) getLenis()?.start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(revealTimer);
      clearTimeout(releaseTimer);
      fallbackTimers.forEach((tm) => clearTimeout(tm));
      unsubTier();
      introTweens.forEach((tw) => tw.kill());
      // Never leave the page held or dimmed, whatever tears us down.
      document.body.classList.remove(HOLD_CLASS);
      document.body.classList.remove(RELEASE_CLASS);
      // If we tear down before revealing (e.g. fast HMR in dev), restore
      // scroll and complete the intro so the scene is never left waiting.
      // The manifest is aborted ONLY on this path (an aborted fetch is not
      // stored in the HTTP cache); after a reveal the in-flight fetches run
      // to completion and land in the cache for the morph's later loads.
      if (!revealed) {
        manifest?.cancel();
        introProgressRef.current = 1;
        restoreScroll();
        useIntroStore.getState().complete();
      }
    };
  }, [active]);

  if (!mounted || active !== true) return null;

  // Split the percentage for the tabular digit-roll look.
  const pctStr = String(display).padStart(2, "0");

  return (
    // TRANSPARENT chrome — no background, no backdrop canvas: the page's own
    // navy and the WebGL stage beneath ARE the loader's world. The div still
    // blankets the viewport so stray pointer input never reaches the held
    // page.
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="fixed inset-0 z-[100] overflow-hidden"
    >
      {/* Corner index mark — the sober "52." / SERSAN tag, mono, dim. */}
      <div className="pointer-events-none absolute left-6 top-6 flex items-center gap-2 sm:left-10 sm:top-10">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-mute"
          style={{ fontFamily: "var(--font-jbm), ui-monospace, monospace" }}
        >
          52.&nbsp;SERSAN
        </span>
      </div>

      {/* Readout — bottom-center, under the materialising mark's stage. The
          mark itself is the scene's: HeroLogo grows it with this number. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[10vh] flex flex-col items-center">
        <div
          className="flex items-baseline tabular-nums leading-none text-ink-mute"
          style={{
            fontFamily: "var(--font-jbm), ui-monospace, monospace",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span className="text-[clamp(1.5rem,4.5vw,2.25rem)] font-medium tracking-[-0.01em] text-ink">
            {pctStr}
          </span>
          <span className="ml-1 text-[clamp(0.8rem,2vw,1rem)] font-medium">
            %
          </span>
        </div>

        <div
          className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--ink-dim))]"
          style={{ fontFamily: "var(--font-jbm), ui-monospace, monospace" }}
        >
          {t("preloader.readout")}
        </div>
      </div>
    </div>
  );
}

export default Preloader;
