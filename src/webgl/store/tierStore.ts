/**
 * Device/performance tier for the WebGL layer.
 *
 * Resolved once on the client (CanvasHost effect) so SSR markup never
 * depends on it; downgradable at runtime by drei's PerformanceMonitor
 * when sustained fps dips are detected.
 *
 *   full — desktop, capable GPU: tube line + postprocessing + extras
 *   lite — mobile / weak GPU / narrow desktop: simplified line; postprocessing
 *          decided by fxBudget.postFx (off at level 1, lite at level 2)
 *   off  — prefers-reduced-motion or no WebGL: no canvas at all
 *
 * SEMANTIC DEBT, recorded deliberately (MOBILE_HOME_SPEC §4.1b, §7):
 * `tier` now answers exactly ONE question — which DOM LAYOUT to serve. It no
 * longer answers "may a decorative WebGL island mount": since the `phoneGL`
 * axis landed, **`tier === "lite"` NO LONGER IMPLIES "no islands"**. A capable
 * phone is `tier: "lite", phoneGL: true` and mounts NeuralLattice. The full
 * capability-model migration (MOBILE_AUDIT §5) is NOT done — it has 13 `tier`
 * call sites and must be atomic — so the only thing guarding this split is the
 * invariant written on `detectPhoneGL()` below. Read it before adding a gate.
 *
 * `fxBudget` (mobile-parity plan 2026-08-17, Phase 1.2) is the ADDITIVE budget
 * axis that pays that debt without touching the 13 `tier` call sites: effects
 * are meant to read `fxBudget.level / postFx / particleScale …` instead of
 * `tier`. `level 3` ⇔ tier `"full"` (fine pointer AND ≥768 px — exactly the
 * devices that mount everything today), `level 1` == today's `lite` (frozen:
 * postFx off, current particle constants, no islands), `level 2` = capable
 * phone (`tier lite` + coarse + `phoneGL`), `level 0` = `tier off`.
 * `resolveFxBudget()` is PURE (no store write, never reads `backend`) and
 * callable BEFORE `resolve()` — the preloader-tunnel mounts before CanvasHost
 * and may call it directly. Runtime step-down (`stepDownBudget`, level 2→1 only)
 * is driven by AdaptiveResolution once the DPR floor is reached; nothing ever
 * steps UP automatically. Dev/preview URL overrides `?fx= ?postfx= ?dpr=` are
 * read there too (`dprOverride` lands on the store and clamps the DPR range).
 *
 * PERF HUD (mobile-parity plan Phase 6.1): `?perf=1` on any dev build or
 * Vercel preview host (same `devOverridesAllowed()` gate as the overrides
 * above — never on the real domain, never during SSR) sets `perfHud: true` in
 * `resolve()`. That single flag mounts TWO things and nothing else: `PerfProbe`
 * inside the Canvas (Scene.tsx — one priority-0 useFrame + one R3F
 * after-effect, writes `perfStore` at most 4×/s) and the DOM overlay `PerfHud`
 * (components/fx/perf-hud.tsx — bottom-left mono panel: fps / frame ms, dpr,
 * per-frame draw calls + triangles, texture MB, backend, renderer string,
 * fxBudget, tier/phoneGL, cores/deviceMemory, viewport). With the flag absent
 * neither component mounts (the HUD returns null, the probe is not in the
 * tree) — zero cost, desktop render path byte-identical.
 */
import { create } from "zustand";
import type { Backend } from "../renderer/createRenderer";

export type SceneTier = "full" | "lite" | "off";

/**
 * Additive per-axis effects budget (plan Phase 1.2). Derived from DEVICE facts
 * only (`tier`, pointer, `phoneGL`) — never from `backend`, never from the UA.
 *
 *   level 0 — off: reduced-motion / no WebGL2 (`tier off`)
 *   level 1 — "today": legacy lite (weak phone OR narrow desktop <768 px). Its
 *             consumers MUST keep today's constants (postFx off, no islands,
 *             the current lite counts); `particleScale 0.25` is documentary,
 *             not a multiplier to apply.
 *   level 2 — capable phone (`tier lite` + coarse pointer + `phoneGL`)
 *   level 3 — desktop tier `"full"` (fine pointer AND ≥768 px)
 */
export interface FxBudget {
  level: 0 | 1 | 2 | 3;
  postFx: "off" | "lite" | "full";
  /** Multiplies the EXISTING desktop counts on level 2/3 (0.5 · 1). Level 1
   *  keeps today's lite constants as-is (documented above); level 0 = 0. */
  particleScale: number;
  /**
   * WISH for the reduced-iteration/step raymarch twin. It is device-only and
   * says nothing about the renderer: `backend` is written AFTER `resolve()`
   * (Scene.tsx `onCreated` → `setBackend`), so every TSL-only consumer MUST
   * gate as `fxBudget.raymarchLite && backend === "webgpu"` AT THE CONSUMPTION
   * SITE. Never treat this flag alone as "the twin may mount".
   */
  raymarchLite: boolean;
  /** Backing-store ceiling in device pixels. Levels 2 and 3 carry Lusion's
   *  MAX_PIXEL_COUNT (2560×1440 = 3.69 MP); levels 0 and 1 carry `+Infinity`
   *  (no cap — level 1 is today's lite, frozen). Consumed by AdaptiveResolution
   *  as an extra cap on the DPR range ONLY at `level === 2`; at level 3 it is
   *  informative (desktop has no cap today and AdaptiveResolution ignores it). */
  maxPixels: number;
  /** Coarse pointer AND `DeviceOrientationEvent` present (level 2 only). */
  gyroParallax: boolean;
}

interface TierState {
  tier: SceneTier;
  /**
   * MAY a coarse-pointer device mount decorative WebGL islands? Resolved
   * once alongside `tier` (see `detectPhoneGL`), forced back to false by
   * `degrade()`.
   *
   * INVARIANT: `tier` selects the DOM LAYOUT; `phoneGL` selects whether
   * decorative islands may mount. NEVER conflate them. Gates read
   * `tier === "full" || phoneGL` — strictly ADDITIVE, never a redefinition of
   * what `tier === "full"` resolves to. False forever on a fine pointer, so a
   * desktop render path cannot move.
   */
  phoneGL: boolean;
  resolved: boolean;
  /**
   * The RESOLVED runtime render backend, written once from Scene.tsx's
   * `onCreated` (via `backendOf(gl)`). `null` until the renderer exists.
   *
   * `webgpuEnabled()` is only a BUILD-TIME env read: with the flag on, a
   * browser without WebGPU (Safari, Firefox default, blocklisted Chrome) still
   * resolves to the WebGL2 fallback backend at runtime. DOM features that
   * require a true compute backend to be driveable must gate on THIS, not on
   * the flag — otherwise they render a layout their island can never animate
   * (the founders morph left founder B permanently at opacity 0).
   *
   * Consumers must treat `null` as "not webgpu" so first paint never shows a
   * layout that may turn out to be undriveable.
   */
  backend: Backend | null;
  /**
   * GPU-aware render device-pixel-ratio range, resolved on the client. The
   * EFFECTS are identical at any DPR — only the render resolution differs — so
   * this lets the FULL WebGPU scene run on weak/ARM GPUs (which are fill-bound:
   * cost scales with DPR²) by starting them at a low DPR and adapting, while
   * strong desktops stay at their device DPR. `initial` is the Canvas's starting
   * dpr; AdaptiveResolution steps within [min, max] on fps dips/headroom.
   */
  dprInitial: number;
  dprMin: number;
  dprMax: number;
  /**
   * Temporary hard cap layered over the adaptive DPR range (null = no cap).
   * Written by the home singularity passage while the plunge approaches
   * fullscreen raymarch coverage (p > ~0.70 → 1.5, cleared with hysteresis
   * on the way out) — the mandated close-range fill-rate lever. Consumed by
   * AdaptiveResolution as `min(dprMax, dprCap)`; a set cap that is below the
   * current DPR drops it immediately (drops are always allowed), and clearing
   * it lets the monitor climb back under its normal hysteresis.
   */
  dprCap: number | null;
  /**
   * Dev/preview-only `?dpr=<n>` QA override (null = none). Read by `resolve()`
   * from the URL and applied there as `dprInitial = dprMin = dprMax =
   * min(n, device dpr)`, so AdaptiveResolution has nothing to adapt and the
   * whole session renders at exactly that DPR. Never set in production.
   */
  dprOverride: number | null;
  /**
   * The additive effects budget (see `FxBudget`). Default is the level 0
   * profile until `resolve()` runs; then written INSIDE the same single set()
   * as `tier`/`phoneGL`, so no consumer can observe a frame where the layout
   * tier resolved but the budget has not. `level/postFx/particleScale/
   * maxPixels/gyroParallax` are device-only, hence genuinely atomic with the
   * tier. `raymarchLite` is only a wish: `backend` is written later
   * (Scene.tsx `onCreated`), so every TSL-only consumer must AND it with
   * `backend === "webgpu"` at the consumption site.
   */
  fxBudget: FxBudget;
  /**
   * Dev/preview-only `?perf=1` (plan Phase 6.1): mounts the in-Canvas
   * `PerfProbe` + the DOM `PerfHud` overlay. Read by `resolve()` through the
   * same `devOverridesAllowed()` gate as `?fx=`/`?dpr=`, so it is false in
   * production hosts and during SSR (server HTML never changes). Untouched by
   * `degrade()`/`stepDownBudget()` — the HUD is exactly what you want to keep
   * watching while the budget steps down.
   */
  perfHud: boolean;
  /** True once the WebGL hero (the procedural Saturn) has rendered its first
   *  frame. Gates the hero drag-to-rotate capture layer so dragging only
   *  arms once the planet is live. */
  heroReady: boolean;
  resolve: () => void;
  degrade: () => void;
  /**
   * Runtime budget step-down, level 2 → 1 ONLY (capable phone that cannot
   * hold the fps band even at `dprMin`): postFx off, today's lite counts,
   * raymarch twin off. Never steps up automatically (Lusion never climbs back
   * either); a no-op at any other level. Deliberately does NOT call
   * `degrade()` — `lite → off` would unmount the Canvas.
   */
  stepDownBudget: () => void;
  setHeroReady: (ready: boolean) => void;
  setBackend: (backend: Backend) => void;
  setDprCap: (cap: number | null) => void;
}

/**
 * Release a PROBE context (one we created on a throw-away canvas) as soon as
 * it has been read: browsers cap live WebGL contexts per page (~16) and evict
 * the oldest — including the REAL Canvas — when the cap is hit. Guarded: the
 * extension may be absent, and a lost/failed context must never throw here.
 * Only ever called on our own probe canvases, never on a real canvas.
 */
function releaseProbe(gl: WebGLRenderingContext | null | undefined): void {
  try {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Best effort — nothing else to do.
  }
}

function detectTier(): SceneTier {
  if (typeof window === "undefined") return "off";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "off";
  }
  let gl: WebGLRenderingContext | null = null;
  try {
    const probe = document.createElement("canvas");
    gl = (probe.getContext("webgl2") ??
      probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "off";
  } catch {
    return "off";
  } finally {
    releaseProbe(gl);
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse || window.innerWidth < 768) return "lite";
  return "full";
}

/**
 * MAY a coarse-pointer device mount decorative islands?
 *
 * INVARIANT: `tier` selects the DOM LAYOUT; `phoneGL` selects whether
 * decorative islands may mount. NEVER conflate them, and never let phoneGL
 * change what `tier === "full"` resolves to. `detectTier()` above is the choke
 * point for 13 consumers and is deliberately NOT touched.
 *
 * Returns false on a fine pointer BEFORE touching anything, so desktop can
 * never reach the body of this function.
 *
 * It deliberately does NOT consult detectGpuClass(): that regex marks
 * adreno|mali|powervr|qualcomm "weak", i.e. every Android phone that exists,
 * and the coarse branch of detectDprRange() routes every iPhone to the same
 * budget — gating capability on it yields a predicate no real phone satisfies.
 * GPU class is a BUDGET input, not a capability test. What we use instead is a
 * DENY-LIST of pre-2020 tile parts: an unknown 2026 phone must PASS.
 *
 * CLOSED 2026-09-09 (was: OPEN QA ITEM, MOBILE_HOME_SPEC §6 Wave 3, chunk M —
 * "the `cores <= 4` cut is carried over from SEQ.LITE_MIN_CORES … if a
 * supported iPhone reports ≤ 4, lower the threshold"). Rather than pick a new
 * number by hand, the cut is now SUBORDINATE to `navigator.gpu`: a
 * coarse-pointer device that exposes WebGPU is modern by construction and
 * skips the core test entirely; one that does not still faces it unchanged.
 * See the body. The remaining unknown is only which phones report what, and
 * that no longer changes the verdict for a WebGPU handset.
 */
function detectPhoneGL(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(pointer: fine)").matches) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // WEBGPU AS THE MODERNITY SIGNAL (2026-09-09). `navigator.gpu` is a
  // synchronous capability read — no UA sniffing, no adapter request, no
  // await — and a coarse-pointer device that exposes it is a 2023-or-later
  // handset by construction. It is a strictly better answer to the question
  // the core count was standing in for, so where the two disagree it wins.
  const hasWebGPU = "gpu" in navigator;
  const cores = navigator.hardwareConcurrency;
  // The `cores <= 4` cut was carried over from SEQ.LITE_MIN_CORES and is the
  // OPEN QA ITEM in this function's docblock: "if a supported iPhone reports
  // ≤ 4, lower the threshold and record the reading here". It does — iOS
  // Safari reports a small, capped figure — so this cut was silently
  // demoting current iPhones to fxBudget level 1, where the compact brand
  // anchor is never rendered and the lite eclipse island never mounts. The
  // visible cost was not a missing effect but a STALLED LOADER: the
  // preloader held its counter at the 90% cap waiting for a wordmark that
  // could not arrive (reported live on an iPhone, 2026-09-09; that hold now
  // also has `brandBeatSkipped` as a fast exit, so this change is about the
  // phone GETTING the beat, not about the stall).
  //
  // Kept verbatim for a device WITHOUT WebGPU: there the core count is still
  // the only modernity signal we have. The pre-2020 tile-part deny-list
  // below, the deviceMemory floor and the WebGL2 requirement all still apply
  // to every device either way — this widens one heuristic, it does not open
  // the gate.
  if (!hasWebGPU && typeof cores === "number" && cores > 0 && cores <= 4) {
    return false; // = SEQ.LITE_MIN_CORES
  }
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem > 0 && mem < 4) return false; // absent on iOS → passes
  let gl: WebGL2RenderingContext | null = null;
  try {
    const probe = document.createElement("canvas");
    gl = probe.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    if (/mali-[tg](3|5|7)\d/i.test(r)) return false;
    if (/adreno \(tm\) (4\d\d|5[0-3]\d)\b/i.test(r)) return false;
    if (/powervr (ge|g6)/i.test(r)) return false;
    return true;
  } catch {
    return false;
  } finally {
    // Release the probe context after reading it (see releaseProbe).
    releaseProbe(gl);
  }
}

type GpuClass = "weak" | "mid" | "strong";

/**
 * Rough GPU strength from the WebGL UNMASKED_RENDERER string. Heuristic, not a
 * contract (the string is non-standard + may be hidden), so it only picks the
 * STARTING render resolution — AdaptiveResolution then climbs/drops from there.
 *   weak   — mobile/ARM tile GPUs (incl. Snapdragon/Adreno on Windows-ARM): very
 *            fill-bound, must start low.
 *   mid    — desktop integrated (Intel UHD/Iris).
 *   strong — discrete / Apple Silicon / unknown-but-capable: unchanged behaviour.
 */
function detectGpuClass(): GpuClass {
  if (typeof window === "undefined") return "strong";
  let gl: WebGLRenderingContext | null = null;
  try {
    const probe = document.createElement("canvas");
    gl = (probe.getContext("webgl2") ??
      probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "mid";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const r = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : "";
    if (/adreno|mali|powervr|qualcomm/i.test(r)) return "weak";
    if (/intel|\bUHD\b|Iris/i.test(r)) return "mid";
    return "strong";
  } catch {
    return "mid";
  } finally {
    // Release the probe context after reading it (see releaseProbe).
    releaseProbe(gl);
  }
}

/**
 * GPU-aware DPR range, clamped to the device dpr (never supersample beyond it).
 * Weak/ARM starts at 1.0 (≈4× fewer pixels than dpr 2 on a hi-DPI screen) and
 * may climb to 1.5; strong desktops are unchanged (start at their device dpr).
 * Every coarse pointer takes the tile-GPU branch below before the GPU-class
 * switch is consulted at all.
 */
function detectDprRange(): { initial: number; min: number; max: number } {
  if (typeof window === "undefined") return { initial: 2, min: 1, max: 2 };
  const device = Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (n: number) => Math.min(device, n);
  // Coarse pointer ⇒ tile GPU ⇒ fill-bound. detectGpuClass() cannot see this:
  // Safari hides WEBGL_debug_renderer_info (renderer string ""), and an iPhone
  // that exposes it reports "Apple GPU" — neither matches the weak or mid
  // regex, so every iOS device fell through to `strong` and rendered the
  // persistent canvas at 4× the pixel count of an Android, on the architecture
  // where cost scales with DPR².
  // SCOPED TO `(pointer: coarse)` ON PURPOSE: an M-series MacBook reports the
  // SAME string, so adding `apple` to the weak regex would silently halve
  // desktop canvas resolution site-wide. A fine pointer never reaches here.
  if (window.matchMedia("(pointer: coarse)").matches) {
    return { initial: clamp(1.0), min: clamp(1.0), max: clamp(1.5) };
  }
  switch (detectGpuClass()) {
    case "weak":
      return { initial: clamp(1.0), min: clamp(1.0), max: clamp(1.5) };
    case "mid":
      return { initial: clamp(1.25), min: clamp(1.0), max: clamp(1.75) };
    default:
      return { initial: clamp(2.0), min: clamp(1.0), max: clamp(2.0) };
  }
}

/** Lusion MAX_PIXEL_COUNT (plan Phase 1.3) — carried by levels 2 and 3 only. */
const MAX_PIXELS = 2560 * 1440;

/**
 * The four budget profiles. `level 1` is TODAY's lite, frozen: its consumers
 * keep today's constants (postFx off, no islands, current lite counts) — the
 * `particleScale 0.25` here documents that ratio, it is not a multiplier any
 * level-1 path applies. Levels 0/1 carry NO pixel cap (`+Infinity`) so the
 * frozen paths cannot be moved by it; level 3's cap is informative only
 * (AdaptiveResolution enforces it at level 2 alone). `gyroParallax` is decided
 * by the caller (level 2 only).
 */
function budgetProfile(level: FxBudget["level"], gyro = false): FxBudget {
  switch (level) {
    case 3:
      return {
        level: 3,
        postFx: "full",
        particleScale: 1,
        raymarchLite: false,
        maxPixels: MAX_PIXELS,
        gyroParallax: false,
      };
    case 2:
      return {
        level: 2,
        postFx: "lite",
        particleScale: 0.5,
        raymarchLite: true,
        maxPixels: MAX_PIXELS,
        gyroParallax: gyro,
      };
    case 1:
      return {
        level: 1,
        postFx: "off",
        particleScale: 0.25,
        raymarchLite: false,
        maxPixels: Number.POSITIVE_INFINITY,
        gyroParallax: false,
      };
    default:
      return {
        level: 0,
        postFx: "off",
        particleScale: 0,
        raymarchLite: false,
        maxPixels: Number.POSITIVE_INFINITY,
        gyroParallax: false,
      };
  }
}

/**
 * Where the dev/preview QA surface is allowed to exist: any non-production
 * build, or a production build served from a Vercel preview host. The SAME
 * predicate gates the URL overrides below and the `__sersanTier` window handle
 * (Scene.tsx), so what preview QA can set it can also inspect. False during
 * SSR (no window) and on the real domain.
 */
export function devOverridesAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    process.env.NODE_ENV !== "production" ||
    window.location.hostname.endsWith(".vercel.app")
  );
}

/**
 * Dev + Vercel-preview ONLY QA overrides (copied from Lusion's `Settings`
 * URL flags): `?fx=0|1|2|3`, `?postfx=off|lite|full`, `?dpr=<n>`, `?perf=1`
 * (the perf HUD, plan Phase 6.1). Every field is null/false when
 * absent/invalid or in production, so the production derivation never even
 * parses the query string.
 */
function readDevOverrides(): {
  fx: FxBudget["level"] | null;
  postfx: FxBudget["postFx"] | null;
  dpr: number | null;
  perf: boolean;
} {
  const none = { fx: null, postfx: null, dpr: null, perf: false };
  if (!devOverridesAllowed()) return none;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return none;
  }
  const fxRaw = params.get("fx");
  const fxNum = fxRaw === null ? NaN : Number(fxRaw);
  const fx: FxBudget["level"] | null =
    fxNum === 0 || fxNum === 1 || fxNum === 2 || fxNum === 3 ? fxNum : null;
  const postRaw = params.get("postfx");
  const postfx: FxBudget["postFx"] | null =
    postRaw === "off" || postRaw === "lite" || postRaw === "full"
      ? postRaw
      : null;
  const dprRaw = params.get("dpr");
  const dprNum = dprRaw === null ? NaN : Number(dprRaw);
  const dpr = Number.isFinite(dprNum) && dprNum > 0 ? dprNum : null;
  const perf = params.get("perf") === "1";
  return { fx, postfx, dpr, perf };
}

/**
 * PURE budget derivation (plan Phase 1.2, step 1 — device only). Never reads
 * `backend`, never writes the store, never reads the UA string.
 *
 *   tier "full"                  ⇒ level 3 (fine pointer AND ≥768 px — exactly
 *                                  the devices that mount everything today;
 *                                  NOT "fine pointer ⇒ 3": a narrow desktop
 *                                  window is `lite` today and must stay so)
 *   tier "lite" + fine pointer   ⇒ level 1 (frozen = today)
 *   tier "lite" + coarse pointer ⇒ phoneGL ? level 2 : level 1
 *   tier "off"                   ⇒ level 0
 *
 * Without `input` it runs the same internal detectors `resolve()` uses
 * (`detectTier()` / `detectPhoneGL()`), so it can be called BEFORE the store
 * has resolved (the preloader-tunnel mounts before CanvasHost). That no-input
 * device detection is MEMOISED at module level (`pureDeviceFacts`): the
 * detectors each open a probe WebGL context, so repeated pure calls must never
 * open new probes — the facts are computed once and reused; only the dev URL
 * overrides are re-read per call. With `input` (how `resolve()` calls it)
 * both derivations are identical by construction.
 *
 * Dev/preview URL overrides are applied last: `?fx=` clamps the level and
 * re-derives the whole profile; `?postfx=` then overrides `postFx` alone.
 * In production none of it is read.
 */
let pureDeviceFacts: { tier: SceneTier; phoneGL: boolean } | null = null;

export function resolveFxBudget(input?: {
  tier: SceneTier;
  phoneGL: boolean;
}): FxBudget {
  let facts = input;
  if (!facts) {
    // Once per module lifetime — see the docblock (probe contexts are not free).
    if (pureDeviceFacts === null) {
      pureDeviceFacts = { tier: detectTier(), phoneGL: detectPhoneGL() };
    }
    facts = pureDeviceFacts;
  }
  const { tier, phoneGL } = facts;
  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  // `coarse` already implies a window; the gyro wish is coarse-only.
  const gyro = coarse && "DeviceOrientationEvent" in window;

  let level: FxBudget["level"];
  switch (tier) {
    case "full":
      level = 3;
      break;
    case "lite":
      level = coarse && phoneGL ? 2 : 1;
      break;
    default:
      level = 0;
  }

  const ov = readDevOverrides();
  if (ov.fx !== null) level = ov.fx;
  const budget = budgetProfile(level, level === 2 && gyro);
  if (ov.postfx !== null) return { ...budget, postFx: ov.postfx };
  return budget;
}

export const useTierStore = create<TierState>((set, get) => ({
  tier: "off",
  phoneGL: false,
  resolved: false,
  backend: null,
  dprInitial: 2,
  dprMin: 1,
  dprMax: 2,
  dprCap: null,
  dprOverride: null,
  fxBudget: budgetProfile(0),
  perfHud: false,
  heroReady: false,
  resolve: () => {
    const tier = detectTier();
    const phoneGL = detectPhoneGL();
    let dpr = detectDprRange();
    // Dev/preview `?dpr=<n>`: pin the whole adaptive range to min(n, device)
    // so QA can hold a DPR steady. Null in production and when absent.
    // `?perf=1` (same gate) mounts the perf probe + HUD; false in production.
    const ov = readDevOverrides();
    const dprOverride = ov.dpr;
    if (dprOverride !== null) {
      const pinned = Math.min(dprOverride, window.devicePixelRatio || 1);
      dpr = { initial: pinned, min: pinned, max: pinned };
    }
    // tier and phoneGL land in ONE set() so no consumer can ever observe a
    // frame where the layout tier has resolved but the capability axis has not
    // (that half-state would flash the SVG neural fallback under the island).
    // fxBudget rides the same set(): its device-only fields are atomic with the
    // tier; `raymarchLite` still needs `backend` AND-ed at the consumption site.
    set({
      tier,
      phoneGL,
      resolved: true,
      dprInitial: dpr.initial,
      dprMin: dpr.min,
      dprMax: dpr.max,
      dprOverride,
      fxBudget: resolveFxBudget({ tier, phoneGL }),
      perfHud: ov.perf,
    });
  },
  // Level 2 → 1 only; never up; a no-op otherwise. Does NOT touch `tier`,
  // `phoneGL` or `degrade()` (lite → off would unmount the Canvas).
  stepDownBudget: () => {
    if (get().fxBudget.level !== 2) return;
    set({ fxBudget: budgetProfile(1) });
  },
  // The budget is RE-DERIVED in the SAME set() as the tier so no consumer can
  // observe a frame where the layout tier degraded but `fxBudget` still says
  // level 3 / postFx "full" (the post rigs gate on `fxBudget.postFx`, not on
  // `tier`, so a stale budget would keep them mounted on a degraded device).
  degrade: () => {
    const { tier, phoneGL } = get();
    if (tier === "full")
      set({
        tier: "lite",
        heroReady: false,
        // full → lite: same pure derivation `resolve()` uses (fine pointer ⇒
        // level 1; a coarse capable pointer could only be here via a dev
        // override, and stays level 2 by the same rule).
        fxBudget: resolveFxBudget({ tier: "lite", phoneGL }),
      });
    // lite → off must ALSO drop the capability axis: a degraded phone that
    // kept phoneGL would unmount the canvas and still suppress the DOM SVG
    // fallback (use-neural-lattice-fallback reads `tier === "full" || phoneGL`),
    // leaving the two neural sections with an empty centerpiece.
    else if (tier === "lite")
      set({
        tier: "off",
        phoneGL: false,
        heroReady: false,
        // lite → off ⇒ the level 0 profile (postFx off, particleScale 0).
        fxBudget: budgetProfile(0),
      });
  },
  setHeroReady: (heroReady) => set({ heroReady }),
  // One-shot, written from Scene.tsx `onCreated`. Guarded so a repeat write
  // (e.g. a Canvas remount onto the same backend) is a no-op and never
  // re-renders subscribers.
  setBackend: (backend) => {
    if (get().backend !== backend) set({ backend });
  },
  // Guarded like setBackend: unchanged writes never re-render subscribers
  // (the passage re-asserts on scrub-band hysteresis edges only, but stay
  // defensive anyway).
  setDprCap: (dprCap) => {
    if (get().dprCap !== dprCap) set({ dprCap });
  },
}));
