"use client";

/**
 * The signature scroll line (AGENTS.md §3a) — a CatmullRom tube snaking
 * through document space, progressively "drawn" by scroll.
 *
 * World mapping — TWO viewport heights, deliberately kept apart:
 *  - the CANVAS/FRUSTUM group uses the r3f canvas height (`size.height`) —
 *    the box the frustum actually spans. That is both the world↔CSS-px scale
 *        k = WORLD_VIEW_HEIGHT / size.height
 *    and, because the canvas is `fixed inset-0` (CanvasHost.tsx), the
 *    half-viewport CENTRING term that turns a scroll offset into a camera
 *    centre: the frustum covers doc range [scrollY, scrollY + size.height],
 *    so its centre is `scrollY + size.height / 2` — never innerHeight.
 *  - the document↔scroll-offset MAPPING uses `window.innerHeight` (`ih`),
 *    because that is the denominator Lenis uses for its scroll limit
 *    (scrollHeight − innerHeight) and hence for the `progress` we consume.
 * On iOS Safari a `position: fixed` box keeps the LARGE viewport height while
 * innerHeight reports the small one, so the two differ by the browser-chrome
 * height; mixing them either drifts the lit head ~10% of a viewport by page
 * bottom (innerHeight missing from the mapping) or shifts the WHOLE world
 * strip off its DOM anchors by a constant ~45px at every scroll position
 * including the hero (innerHeight leaking into the centring).
 * Desktop is unaffected (the two are equal without dynamic chrome).
 *
 * The curve spans the whole page in world-Y and the camera glides down it as
 * the user scrolls — waypoints stay glued to their sections at any page height.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { createLineMaterial, type LineUniforms } from "./materials/lineShader";
import { webgpuEnabled } from "./renderer/createRenderer";
import { getRouteCurve } from "./curves/routeCurves";
import { CAMERA_FOV, CAMERA_Z, WORLD_VIEW_HEIGHT } from "./constants";
import { useScrollStore } from "./store/scrollStore";
import { useCutStore } from "./store/cutStore";
import { useSectionStore, sectionProgress } from "./store/sectionStore";
import { useProductionPulseStore } from "./store/productionPulseStore";
import { useAuditTimelineStore } from "./store/auditTimelineStore";
import { useTextMorphStore } from "./store/textMorphStore";
import { useSeqStore, SEQ_PAN_FRAC } from "./store/seqStore";
import {
  useIntroStore,
  introProgressRef,
  introCamShiftRef,
  introHeadRaiseRef,
  introHoleRef,
  introZoomRef,
} from "./store/introStore";
import { useFxStore } from "./store/fxStore";
import { usePointerStore } from "./store/pointerStore";
import { routeFx } from "./store/routeFxStore";
import type { SectionAnchors } from "./hooks/useSectionAnchors";
import { useTierStore } from "./store/tierStore";
import type { FxBudget, SceneTier } from "./store/tierStore";

interface SignatureLineProps {
  tier: Exclude<SceneTier, "off">;
  pathname: string;
  anchors: SectionAnchors;
}

/** Damping speed for the drawn-progress chase (higher = snappier). */
const PROGRESS_DAMP = 6;

// --- Intro-gate camera shake (textMorphStore.gateKick consumer) -----------
// While HeroIntroGate holds the page at scrollY=0, each consumed wheel/touch
// gesture lands here as a signed px impulse. It drives a slightly
// under-damped spring on the camera's Y (the same axis real scroll moves),
// so the camera dips with the gesture and swings back — the scene keeps the
// alive "scroll shake" while the document genuinely never moves. The kick is
// only ever written by the gate, so normal scrolling is untouched.
/** World-units/s of spring velocity per px of consumed gesture.
 * Amplitude reduced to ~40% per design (2026-06-16): the camera should read as
 * near-locked during the gated intro, with only a faint hint of motion. Was
 * 0.01. Keep the spring/damping feel below; only the magnitude shrank. */
const GATE_KICK_SCALE = 0.004;
/** Spring stiffness (ω² ≈ 90 → ~1.5 Hz wobble). */
const GATE_SPRING = 90;
/** Spring damping — under-damped (ζ ≈ 0.47): a couple of micro-overshoots. */
const GATE_DAMP = 9;
/** Hard clamp on the bob amplitude (world units). Halved per the same
 * near-locked design pass (2026-06-16) so peaks stay small. Was 0.35. */
const GATE_SHAKE_MAX = 0.175;
/** px-ish energy per px of gesture, fed into the velocity glow/breath. */
const GATE_ENERGY_SCALE = 0.5;
const GATE_ENERGY_MAX = 150;
/** damp() lambda for the energy decay back to rest. */
const GATE_ENERGY_DECAY = 4;

// --- Cinematic camera rig (dolly-Z / arrival orbit / pointer parallax) ------
// Three TRANSLATION-only channels layered onto the same single camera
// authority (the useFrame below). They never touch orientation, and the
// camera-space billboards (RailPlanes, FounderPortraitMorph, NeuralLattice,
// ResourcePreviewPlane) rebuild from the camera's full pose per frame, so
// they cancel the rig by construction — no re-registration needed anywhere.
// World-anchored objects (the tube, RouteHero/GatewayPortal, DriftParticles)
// receive the rig as genuine parallax/depth: that IS the effect.
/** damp() lambda for the breathing dolly (slow, lens-like). */
const DOLLY_DAMP = 2.2;
/** damp() lambda for the arrival-orbit sweep. */
const ORBIT_DAMP = 2.5;
/** damp() lambda for the pointer micro-parallax follower. */
const PAR_DAMP = 3;
/** Intro CAMERA RIG (preloader v2, owner 2026-08-28: "non ci sono movimenti
 * di camera… guarda il sito argo"). Arago's intro is a dolly: the scene is
 * seen CLOSER and the camera pulls back into the resting frame. Two phases,
 * continuous by construction:
 *   LOAD  — while the chrome is up the camera sits INTRO_CAM_IN of CAMERA_Z
 *           closer (plus a whisper of lateral offset) and eases toward
 *           INTRO_CAM_MID as the counter climbs (scrubbed by
 *           introProgressRef — the materialising lockup is watched from a
 *           slowly retreating camera, never a static tableau);
 *   GLIDE — on the introComplete edge the REMAINING offset (wherever the
 *           scrub left it) expo-glides to 0 over INTRO_CAM_GLIDE_S: the
 *           pull-back lands exactly in the hero frame, no seam at the edge
 *           because the glide starts from the load pose by construction.
 * Soft entries never enter (introComplete already true, glide clock spent).
 * This subsumes the earlier 2.2% "settle". */
// Owner passes 2-5 (2026-08-28, "più zoommato" ×3, then "il 19 deve
// iniziare alla fine del preloader, così fa due movimenti"): the load phase
// HOLDS the full close-up at IN (no pre-spent pull-back — the lateral
// whisper is the only in-load motion), and the exit is TWO distinct
// gestures: STAGE 1 pulls IN → MID over S1 with a smoothstep (a deliberate
// beat, landing with the burst under the fading chrome), a short DWELL lets
// it read, then STAGE 2 expo-glides MID → 0 over GLIDE_S — the long smooth
// zoom-out into the hero frame. Next notch of IN starts cropping the lockup
// on short viewports — tune with eyes on.
// INSIDE THE BLACK HOLE (owner concept 2026-08-28, Oddity's zoom-out: "la
// scena del preloader inizia a schermo nero — siamo dentro il buco nero").
// The load phase is GATE 1: the camera sits deep inside (INTRO_CAM_IN of
// CAMERA_Z), the stage is near-black (PostFXNodes' ignite floor), and the
// only thing that happens is the SERSAN wordmark generating on the dark.
const INTRO_CAM_IN = 0.52;
const INTRO_CAM_X = 0.015;
/** Frame lift during gate 1 (fraction of WORLD_VIEW_HEIGHT, positive lowers
 * the composition): centres the FORMING WORDMARK on the black — the mark is
 * dead until gate 2, so the text is the whole frame. Published through
 * introCamShiftRef; during the exit the lift is its own animated channel. */
const INTRO_CAM_LIFT = 0.02;
/** EXIT GATES — the climb out of the hole, after the counter completes:
 *   GATE 2 — zoom out to 39%: the 3D spore mark GENERATES and EXPLODES
 *            (HeroLogo starts the reform clock on the introComplete edge and
 *            fires the burst at INTRO_BURST_AT_S ≈ the reform's completion)
 *            while the black hole starts to be GLIMPSED behind the brand
 *            (the ignite ramp is still low, the eclipse rim reads first);
 *   GATE 3 — zoom out to 0: the hero frame, every offset at an exact 0.
 * `z` = dolly-in fraction of CAMERA_Z, `lift` = frame shift, `dur`/`dwell`
 * seconds. Each leg runs cubic in-out from wherever the previous one ended
 * — continuous at every seam. */
const INTRO_CAM_GATES = [
  // Gate 2a — THE CLIMB OUT: the hole shrinks out of the frame (it rides
  // this leg's zoom fraction). The frame does NOT lift yet — owner
  // 2026-08-28: "prima c'è lo zoom out del buco nero, POI la camera si
  // sposta in alto per l'esplosione".
  { z: 0.39, lift: INTRO_CAM_LIFT, dur: 2.4, dwell: 0.15 },
  // Gate 2b — THE LOGO: the gaze rises (lift sinks the whole scene, so the
  // cropped mark drops into frame) WITH a small push-in on it (z 0.39 →
  // 0.44), and only then does the mark BURST (HeroLogo's INTRO_BURST_AT_S
  // is timed into this leg, after the move).
  { z: 0.44, lift: 0.3, dur: 1.9, dwell: 0.15 },
  // Gate 3 — the hero.
  { z: 0, lift: 0, dur: 2.6, dwell: 0 },
];
/** Total exit-clock length — the frame block idles past this. */
const INTRO_CAM_EXIT_S = INTRO_CAM_GATES.reduce(
  (s, g) => s + g.dur + g.dwell,
  0,
);
/** Viewport fraction over which the whole rig fades in from the top. While
 * the page is pinned at scroll 0 (intro gate, brand replay) every channel is
 * EXACTLY 0, so the particle brand + HeroLogo keep their pixel registration
 * against the DOM — the camera there is byte-identical to the pre-rig one. */
const RIG_TOP_SPAN = 0.55;

// === Shared curve/geometry builder (FIX B) ==================================
// ONE implementation used by BOTH the render-path useMemo and the
// commit-independent imperative rebuild in useFrame: the island's React
// commits can stall behind a pending Suspense elsewhere in the bridged tree
// (R3F v9 wedge — see RouteHeroLogo.tsx), so the line must be able to rebuild
// its geometry + doc→arc LUT + curve without a commit. Pure: no ref writes —
// callers own all side effects.

interface LineBuildInputs {
  /** Route whose curve config to build (getRouteCurve key). */
  pathname: string;
  /** Anchor id → center document fraction (span midpoint). */
  fractions: Record<string, number>;
  /** document.documentElement.scrollHeight at measure time (1 = sentinel). */
  scrollHeight: number;
  /** Pathname the fractions were measured FOR ("" pre-measure). */
  measuredPath: string;
  /** World units per document/CSS pixel. */
  k: number;
  worldViewWidth: number;
  /**
   * Geometry BUDGET (mobile-parity plan Phase 4e) — `fxBudget.level`, not
   * `tier`: the tube's segment/radial density is vertex cost, so a capable
   * phone (level 2) gets the full desktop tessellation. Level 3 ⇔ desktop
   * `tier "full"` (byte-identical), level ≤ 1 = today's lite constants.
   */
  budgetLevel: FxBudget["level"];
}

type LineBuildResult =
  | {
      status: "built";
      geometry: THREE.TubeGeometry;
      curve: THREE.CatmullRomCurve3;
      lut: { docF: number[]; arcF: number[] };
    }
  /** Anchored config but the measurement belongs to another route (route-change
   *  race, FIX A2) — hold the previous geometry. */
  | { status: "hold" }
  /** Pre-measure sentinel — no layout data to build from yet. */
  | { status: "no-data" };

function buildLineGeometry(inp: LineBuildInputs): LineBuildResult {
  // Before the first anchor measurement (scrollHeight still at its initial
  // sentinel) every anchored waypoint would collapse to fraction 0 — a
  // degenerate curve. Skip building until real layout data exists.
  if (inp.scrollHeight <= 1) return { status: "no-data" };

  const config = getRouteCurve(inp.pathname);

  // FIX A2 (route-change race): when this route's curve glues waypoints to
  // [data-line-anchor] nodes but the measurement still belongs to another
  // path, any anchor missing from the stale span set would collapse to
  // fraction 0 (document top) — a garbage tube doubling back up the page
  // could flash before the new measure. Callers hold the last good geometry
  // instead (uReveal is 0 during the ~420ms route beat, so nothing stale is
  // visible) and rebuild on the first version bump where measuredPath ===
  // pathname. at-only configs (detail/default) never consult the span set,
  // so they build immediately as before.
  const usesAnchors = config.waypoints.some((wp) => wp.anchor !== undefined);
  if (usesAnchors && inp.measuredPath !== inp.pathname) {
    return { status: "hold" };
  }

  const radiusFactor = useFxStore.getState().radiusFactor;
  const { tessellationScale } = routeFx(inp.pathname);

  // Waypoint document fractions — resolved once, shared by the point
  // positions below and the doc→arc LUT (FIX A1).
  const fractions = config.waypoints.map(
    (wp) => (wp.anchor ? inp.fractions[wp.anchor] : undefined) ?? wp.at ?? 0,
  );
  const points = config.waypoints.map((wp, i) => {
    return new THREE.Vector3(
      wp.x * inp.worldViewWidth * 0.45,
      -fractions[i] * inp.scrollHeight * inp.k,
      wp.z ?? 0,
    );
  });

  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");

  // FIX A1 — build the doc-fraction → arc-fraction LUT alongside the curve.
  // docF: the waypoint doc fractions, clamped to [0,1] and floored to be
  // STRICTLY increasing (+1e-4) so the per-frame segment search never
  // divides by zero on coincident anchors. Geometry keeps the RAW fractions
  // above — the sanitize only stabilizes the lookup. arcF: the cumulative
  // arc-length fraction at each waypoint's CatmullRom parameter i/(n−1),
  // read off the curve's length table (getPointAt/uv.x live in this space).
  const docF = fractions.map((f) => THREE.MathUtils.clamp(f, 0, 1));
  for (let i = 1; i < docF.length; i++) {
    docF[i] = Math.max(docF[i - 1] + 1e-4, docF[i]);
  }
  const arcDivisions = 512;
  const lens = curve.getLengths(arcDivisions);
  const totalLen = lens[arcDivisions];
  const lastIdx = points.length - 1;
  const arcF = points.map((_, i) => {
    const u = lastIdx > 0 ? i / lastIdx : 0;
    return totalLen > 0 ? lens[Math.round(u * arcDivisions)] / totalLen : u;
  });

  // Density matters at the serpentine turn-arounds: too few tubular
  // segments between adjacent waypoints renders the bends as polygonal
  // elbows (and the tube can self-intersect). ~40 segments per waypoint
  // keeps every visible sweep perfectly smooth.
  // tessellationScale (1 on home → unchanged) biases segment density per
  // route before the same min/max clamp; rounded so the count stays integral.
  // Segment/radial caps read the BUDGET level (plan Phase 4e): level ≥ 2
  // (desktop full AND capable phone) gets 640/8, level ≤ 1 keeps today's
  // lite 320/6. Level 3 is exactly the old `tier === "full"` branch.
  const fullBudget = inp.budgetLevel >= 2;
  const tubularSegments = THREE.MathUtils.clamp(
    Math.round(config.waypoints.length * 40 * tessellationScale),
    256,
    fullBudget ? 640 : 320,
  );
  const radius = WORLD_VIEW_HEIGHT * radiusFactor;
  const radialSegments = fullBudget ? 8 : 6;

  const geo = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    radialSegments,
    false,
  );

  // Per-vertex centerline tangent for the breath normal-correction (WI-2).
  // TubeGeometry exposes its Frenet tangents (one unit vector per tubular
  // ring i ∈ [0..tubularSegments]); its vertex layout is, in order, for each
  // ring i, (radialSegments + 1) vertices. So aTangent is the ring tangent
  // repeated across that ring — matching position/normal/uv ordering exactly.
  const ringTangents = geo.tangents; // Vector3[], length tubularSegments + 1
  const ringVerts = radialSegments + 1;
  const tangentArr = new Float32Array((tubularSegments + 1) * ringVerts * 3);
  for (let i = 0; i <= tubularSegments; i++) {
    const t = ringTangents[i];
    for (let j = 0; j < ringVerts; j++) {
      const o = (i * ringVerts + j) * 3;
      tangentArr[o] = t.x;
      tangentArr[o + 1] = t.y;
      tangentArr[o + 2] = t.z;
    }
  }
  geo.setAttribute("aTangent", new THREE.BufferAttribute(tangentArr, 3));

  if (process.env.NODE_ENV !== "production") {
    geo.computeBoundingBox();
  }

  return { status: "built", geometry: geo, curve, lut: { docF, arcF } };
}

/**
 * Hard clamp on the cinematic camera ROLL, in radians (~2.6°). The bank leans
 * into serpentine bends but must stay small so hero/section DOM text (which
 * sits on camera-locked billboards inheriting camera.quaternion) never reads as
 * tilted. fxStore.camRoll × routeFx.cameraRollScale × tangent.x is clamped to
 * ±this.
 */
const CAM_ROLL_MAX = 0.046;

// --- Round 3 §C1 — warp-jump camera (igloo entry-scene grammar) -------------
/** igloo `sineNoise1` (bundle fn kD, mined 2026-08-21), ported verbatim as
 * six hardcoded dot products — DETERMINISTIC (never Math.random in a frame
 * path), zero allocation. Sum of six sines of dot((x,y,z), fixed vec3s) / 6. */
function sineNoise1(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 1.5 + y * 3.4598 + z * 1.234) +
      Math.sin(x * 3.12 - y * 3.234 + z * 4.221) +
      Math.sin(x * 0.355 + y * 2.3 - z * 1.375) +
      Math.sin(-x * 0.156 - y * 3.34 - z * 0.4566) +
      Math.sin(-x * 4.1235 - y * 0.485 - z * 1.45) +
      Math.sin(x * 2.54 - y * 0.879 - z * 2.123)) /
    6
  );
}
/** damp() λ for the up-flip chase — fast enough that the timeline's own ease
 * is the visible motion (steady-state lag ≈ rate/λ ≈ 0.07 rad at the flip's
 * peak rate), and a skip/teardown snap-to-0 eases out in ~0.2s instead of
 * cutting the world's roll in one frame. */
const WARP_FLIP_DAMP = 14;
/** damp() λ for the fov widen + shake amplitude (slower channels). */
const WARP_FOV_DAMP = 10;

export function SignatureLine({ tier, pathname, anchors }: SignatureLineProps) {
  const { camera, size } = useThree();
  // Effects BUDGET (mobile-parity plan Phase 4e). ONE store selector on a
  // primitive: re-renders only when the level itself changes (resolve() before
  // mount, or the one-shot stepDownBudget() 2 → 1) — never per frame, never a
  // setState from useFrame. It decides BUDGET only (tube tessellation, the
  // uBreath/comet driver); every CAMERA behaviour below (dolly ×0.5, orbit,
  // pointer parallax, lookAt/roll) stays on `tier` — those need a pointer /
  // the desktop layout, and the plan keeps them off on touch until a gyro
  // source feeds pointerStore. Level 3 ⇔ tier "full" ⇒ desktop byte-identical;
  // level 1 ⇔ today's lite (weak phone / narrow fine window) unchanged.
  const budgetLevel = useTierStore((s) => s.fxBudget.level);
  const meshRef = useRef<THREE.Mesh>(null);
  const dampedProgress = useRef(0);
  const dampedReveal = useRef(1);
  // The live signature curve — captured during geometry build so the camera
  // (the single authority in this useFrame) can aim slightly AHEAD along it for
  // the cinematic lookAt-ahead tilt. Rebuilt per route/resize alongside the
  // geometry, so the camera motion adapts per route for free. `null` while a
  // rebuild is mid-flight (guarded in useFrame).
  const curveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  // FIX A1 — doc-fraction → arc-fraction lookup table, rebuilt WITH the curve
  // in the geometry memo (same deps, same lifecycle). uProgress is compared
  // against uv.x, which TubeGeometry generates via getPointAt — an ARC-LENGTH
  // fraction — while the reader's head position is a DOCUMENT fraction. Arc
  // length accumulates roughly per waypoint, not per document px, so a direct
  // write desyncs the lit head wherever waypoint density per doc-px deviates
  // (home's 390vh hero spine is ONE segment; /audit's 580vh timeline likewise).
  // docF[i] = waypoint i's sanitized (strictly increasing) document fraction;
  // arcF[i] = the arc-length fraction of the SAME point on the tube.
  const progressLut = useRef<{ docF: number[]; arcF: number[] } | null>(null);
  // FIX A2 — last successfully-built geometry, HELD across the route-change
  // race: the geometry memo re-runs the instant `pathname` flips, but
  // sectionStore still describes the PREVIOUS route until SectionBus's
  // post-paint effect re-measures. Holding returns the SAME object, so the
  // dispose effect below (keyed on the geometry identity) never fires
  // mid-hold — no leak, no double-dispose.
  const lastGoodGeometry = useRef<THREE.TubeGeometry | null>(null);
  // FIX B — commit-independence (defense in depth). The island's React commits
  // can stall behind a pending Suspense in the bridged tree (R3F v9 wedge, see
  // RouteHeroLogo.tsx); everything the line NEEDS per frame must therefore be
  // reachable without a commit:
  //  - tslRef: the lazily-built TSL material+uniforms pair, attached to the
  //    mesh imperatively (setTsl stays for React hygiene only);
  //  - lastBuildKey: the {measureVersion, measuredPath} the LIVE tube was
  //    built from — compared against sectionStore per frame to trigger
  //    imperative geometry rebuilds when a re-measure never lands as a prop;
  //  - pendingBuildKey: staging slot written by the memo during render and
  //    PROMOTED to lastBuildKey only at commit time (aborted renders can
  //    never claim a build that was never committed);
  //  - frameOwned: the geometry created by the imperative path (React knows
  //    nothing about it) — disposed by the imperative path when it replaces
  //    its own build, by the commit effect when a memo build supersedes it,
  //    or by the unmount safety net. React-owned (memo-committed) geometries
  //    are NEVER disposed here — no leak, no double-dispose.
  const tslRef = useRef<{
    material: THREE.Material;
    uniforms: LineUniforms;
  } | null>(null);
  const lastBuildKey = useRef<{ version: number; path: string } | null>(null);
  const pendingBuildKey = useRef<{ version: number; path: string } | null>(null);
  const frameOwned = useRef<THREE.TubeGeometry | null>(null);
  // Persistent look target damped toward the ahead-point each frame (no
  // per-frame allocation; smooths out jitter at curve bends).
  const lookTarget = useRef(new THREE.Vector3());
  const lookInitialized = useRef(false);
  const aheadPoint = useRef(new THREE.Vector3());
  // Camera bank/roll (full tier): curve tangent at the look-ahead point, and the
  // damped roll angle applied after lookAt. Persistent so the roll eases (never
  // snaps) and holds C1 across route/curve rebuilds.
  const aheadTangent = useRef(new THREE.Vector3());
  const rollCurrent = useRef(0);
  // Intro-gate shake spring state (world units / world units per second) and
  // the decaying px-ish energy that feeds the velocity glow/breath channels.
  const shakeY = useRef(0);
  const shakeVel = useRef(0);
  const gateEnergy = useRef(0);
  // Comet-head velocity (uVel, 0..1): the normalized alive velocity damped at
  // λ=4 so a scroll flick eases the comet tail IN quickly and relaxes it back
  // to a point over ~0.5s (95% settle ≈ 3/λ = 0.75s) instead of the raw
  // velocity's frame-to-frame jitter snapping the head length around.
  const cometVel = useRef(0);
  // Camera-descent beat state (tilt phase): the previous camTilt clock (the
  // pitch is now derived from the SMOOTH 0→1 beat clock velocity, not
  // world-units/sec, so it can't spike on the gate's odd dt) and the smoothed
  // pitch itself.
  const prevCamTilt = useRef(0);
  const descendPitch = useRef(0);
  // Cinematic camera rig state (see the rig block in useFrame).
  const dollyCurrent = useRef(0);
  const orbitCurrent = useRef(0);
  const parCurrent = useRef({ x: 0, y: 0 });
  // Intro camera-rig state: the glide clock (initialized SPENT ⇒ idle;
  // re-armed to 0 by the introComplete edge in the hand-off effect below)
  // and the load-pose snapshot the glide departs from — kept fresh every
  // load-phase frame, so the edge hand-off is continuous by construction.
  const introGlideClock = useRef(INTRO_CAM_EXIT_S);
  const introCamFrom = useRef({ zf: 0, lift: 0, x: 0 });
  // Singularity-passage lateral pan (seqStore.pan01 — the passage's scrubbed
  // ScrollTrigger owns the clock, this file stays the single camera
  // authority; exact camTilt precedent). Lightly damped so a passage
  // teardown mid-scrub (language toggle) relaxes instead of snapping.
  const seqPanCurrent = useRef(0);
  // Round 3 §C1 — warp-jump camera state (home one-shot plunge; seqStore
  // upFlip/fovShift/shakeAmp consumers — this frame stays the single camera
  // authority). Damped chases + a monotonic clock for the deterministic
  // sine-noise shake.
  const warpFlipCurrent = useRef(0);
  const warpFovCurrent = useRef(CAMERA_FOV);
  const warpShakeCurrent = useRef(0);
  const warpClock = useRef(0);
  // Cached `window.innerHeight` — the viewport height Lenis derives its scroll
  // limit from, and therefore the only correct denominator for the doc→scroll
  // mapping below (see the file header). A REF, not state: it is read inside
  // useFrame and must never trigger a React commit inside the Canvas island.
  const vhRef = useRef(typeof window === "undefined" ? 0 : window.innerHeight);
  useEffect(() => {
    const onResize = () => {
      vhRef.current = window.innerHeight;
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  // Material selection by the build-time WebGPU flag (createRenderer.ts):
  //   flag OFF → the GLSL ShaderMaterial (unchanged, byte-identical to today),
  //   flag ON  → the TSL NodeMaterial (compiles to WGSL; raw GLSL would render
  //              as a black silhouette under a WebGPU backend).
  // Both expose the SAME uniform shape `{ uX: { value } }`, so the per-frame
  // update logic below drives either one identically. `uniforms` is the shared
  // reference the useFrame body writes to; `material` is the Object3D-attachable
  // material for the mesh.
  //
  // The TSL module imports `three/webgpu` + `three/tsl` — a SECOND, self-contained
  // copy of three (the node-material build). To keep that heavy build out of the
  // classic-WebGL (flag-OFF) bundle entirely — the dual-namespace pitfall in
  // webgpu-migration-spec §1.6 / §6.1, and mirroring createRenderer.ts's dynamic
  // `import("three/webgpu")` — `lineNodeMaterial` is imported ONLY behind the ON
  // flag, lazily. On the OFF path it is never referenced, so it never bundles.
  const glsl = useMemo(() => (webgpuEnabled() ? null : createLineMaterial()), []);
  const [tsl, setTsl] = useState<{
    material: THREE.Material;
    uniforms: LineUniforms;
  } | null>(null);

  useEffect(() => {
    if (!webgpuEnabled()) return;
    let cancelled = false;
    let built: { material: THREE.Material; uniforms: LineUniforms } | null = null;
    // Dynamic import → the `three/webgpu`/`three/tsl` chunk loads only on the ON
    // path. Lands inside the already-lazy Scene island, never the entry bundle.
    void import("./materials/lineNodeMaterial").then(
      ({ createLineNodeMaterial }) => {
        if (cancelled) return;
        const m = createLineNodeMaterial();
        // LineNodeUniforms is structurally the GLSL LineUniforms shape (same
        // field names, each `{ value }`); the per-frame writes only set `.value`.
        built = {
          material: m.material as unknown as THREE.Material,
          uniforms: m.uniforms as unknown as LineUniforms,
        };
        // FIX B (commit-independence): park the built pair in the ref and
        // attach the material imperatively RIGHT HERE — a pending Suspense
        // elsewhere in the island can stall React commits indefinitely (the
        // /consulting wedge), so correctness must not depend on setTsl's
        // commit landing. useFrame ALSO attaches from the ref (below) for the
        // reverse ordering, where the mesh mounts after this promise resolved.
        tslRef.current = built;
        const mesh = meshRef.current;
        if (mesh && mesh.material !== built.material) {
          const prev = mesh.material as THREE.Material;
          mesh.material = built.material;
          // Only three's default placeholder is ever replaced here — the mesh
          // mounts material-less on the ON path (never the GLSL material,
          // which exists only on the OFF path where this effect early-returns).
          if (prev && prev !== built.material) prev.dispose();
        }
        // React hygiene: keep state in sync so the JSX material prop matches
        // what's attached (a no-op re-assign whenever it commits).
        setTsl(built);
      },
    );
    return () => {
      cancelled = true;
      tslRef.current = null;
      // Dispose whichever TSL material this effect instance created (route/anchor
      // churn does not re-run this effect — deps are empty — but unmount must).
      built?.material.dispose();
    };
  }, []);

  // The active material for the JSX prop. OFF: GLSL (synchronous,
  // byte-identical to today). ON: the TSL material once its lazy chunk
  // resolves AND the setTsl commit lands — the per-frame path does not wait
  // for it (it attaches from tslRef; see useFrame).
  const material = (glsl ?? tsl?.material) as THREE.Material | undefined;

  // Dispose the GLSL material on unmount (OFF path). The TSL material is disposed
  // by its own effect cleanup above.
  useEffect(() => () => glsl?.dispose(), [glsl]);

  // Per-route tone for the line. The color-blend factor is 0 on home (colors
  // untouched) and a small fixed weight on interior routes; even off-home the
  // home output is unchanged because routeFx('/') colors equal the fxStore
  // colors (lerp of equal endpoints is a no-op). Scratch Colors avoid
  // per-frame allocation in useFrame.
  const route = useMemo(() => routeFx(pathname), [pathname]);
  const colorBlend = pathname === "/" ? 0 : 0.6;
  const routeColors = useMemo(
    () => ({
      a: new THREE.Color(route.lineColorA),
      b: new THREE.Color(route.lineColorB),
      hot: new THREE.Color(route.lineColorHot),
    }),
    [route.lineColorA, route.lineColorB, route.lineColorHot],
  );

  // World units per document/CSS pixel (stable: size only changes on resize).
  const k = WORLD_VIEW_HEIGHT / size.height;
  const worldViewWidth = WORLD_VIEW_HEIGHT * (size.width / size.height);

  const geometry = useMemo(() => {
    // Shared implementation with the imperative useFrame rebuild (FIX B) —
    // see buildLineGeometry above for the full build/A1/A2 rationale.
    const res = buildLineGeometry({
      pathname,
      fractions: anchors.fractions,
      scrollHeight: anchors.scrollHeight,
      measuredPath: anchors.measuredPath,
      k,
      worldViewWidth,
      budgetLevel,
    });
    if (res.status === "no-data") return null;
    // FIX A2 route-change race: HOLD the last good geometry (uReveal is 0
    // during the ~420ms route beat, so nothing stale is visible); rebuild on
    // the first version bump where measuredPath === pathname.
    if (res.status === "hold") return lastGoodGeometry.current;
    // Keep the live curve for the camera lookAt-ahead and the doc→arc LUT for
    // the per-frame progress remap (FIX A1) — same lifecycle as the geometry.
    curveRef.current = res.curve;
    progressLut.current = res.lut;
    lastGoodGeometry.current = res.geometry;
    // FIX B: stage the freshness key; it is PROMOTED to lastBuildKey only at
    // commit time (effect below), so an aborted render can never claim a
    // build that was never committed — which would silently disable the
    // imperative rebuild path.
    pendingBuildKey.current = {
      version: anchors.version,
      path: anchors.measuredPath,
    };
    return res.geometry;
    // anchors.version covers fraction/scrollHeight/measuredPath changes (a
    // path change always bumps the version — sectionStore.setMeasured never
    // short-circuits it).
    // `budgetLevel` replaces the old `tier` dep (the build no longer reads the
    // tier): a level change is a ONE-SHOT rebuild here, exactly as a tier
    // change was — the level is a primitive that only moves on resolve() /
    // stepDownBudget(), so no per-frame rebuild can arise from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, anchors.version, size.width, size.height, k, worldViewWidth, budgetLevel]);

  // Commit-time bookkeeping + disposal for memo-built geometries. Effects run
  // only for COMMITTED renders, so:
  //  - the pending freshness key is promoted here (see the memo above);
  //  - ownership is reconciled with any imperative (useFrame) build: when the
  //    memo (hold path) returned the imperative geometry itself, React takes
  //    ownership (the cleanup below will dispose it); when a fresh memo build
  //    was committed over an imperative one, the superseded imperative
  //    geometry — detached by this very commit — is disposed exactly once
  //    here. The useFrame path never disposes React-owned geometries, so no
  //    geometry can leak or be double-disposed.
  useEffect(() => {
    if (geometry) {
      if (pendingBuildKey.current) {
        lastBuildKey.current = pendingBuildKey.current;
        pendingBuildKey.current = null;
      }
      const mine = frameOwned.current;
      if (mine) {
        if (mine === geometry) {
          frameOwned.current = null; // ownership transferred to React
        } else {
          mine.dispose(); // superseded by the committed memo build
          frameOwned.current = null;
        }
      }
    }
    // Dispose replaced geometries (rebuilds on resize/route would leak GPU
    // buffers otherwise).
    return () => geometry?.dispose();
  }, [geometry]);

  // Unmount safety net for an imperative build React never took ownership of.
  useEffect(
    () => () => {
      frameOwned.current?.dispose();
      frameOwned.current = null;
    },
    [],
  );

  // First-load hand-off (preloader → line). The preloader holds the viewport
  // while readiness counts to 100, then flips introStore.introComplete. On that
  // false→true edge we re-kick the reveal beat (setReveal 0 → 1) so the line
  // draws in EXACTLY as the curtain lifts — the eye reads "the loading bar
  // became the signature line". On a soft route change the preloader never
  // remounts, so introComplete is already true and this never re-fires; the
  // per-route re-curve beat (Scene.tsx, keyed on pathname) owns those.
  useEffect(() => {
    const { setReveal } = useScrollStore.getState();
    // If the intro already completed (e.g. this SignatureLine instance mounted
    // late, after the preloader handed off), don't re-trigger — just ensure the
    // line is drawn.
    if (useIntroStore.getState().introComplete) {
      setReveal(1);
      return;
    }
    // While the preloader covers the screen, keep the line undrawn so its
    // draw-in is the reveal, not a pop-in behind the overlay.
    setReveal(0);
    let timeoutId = 0;
    const unsubscribe = useIntroStore.subscribe((state, prev) => {
      if (state.introComplete && !prev.introComplete) {
        setReveal(0);
        // Arm the one-shot camera pull-back GLIDE on the same beat (ref
        // write only — the rig block in useFrame integrates it; see
        // INTRO_CAM_*).
        introGlideClock.current = 0;
        // Brief beat so the curve is settled before the draw-in begins,
        // matching the ~420ms route-reveal window.
        timeoutId = window.setTimeout(() => setReveal(1), 60);
      }
    });
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    // Live measurement state, read transiently per the repo store discipline.
    // The `anchors` PROP can go stale when React commits stall (the R3F
    // bridge freezes island props — see the FIX B ref block above), so every
    // per-frame consumer below reads the STORE, never the prop.
    const section = useSectionStore.getState();

    // === FIX B — commit-independent material + geometry =====================
    // (1) TSL material attach (ON path). The lazy TSL chunk resolves into
    // tslRef (effect above); attach it imperatively the moment both the mesh
    // and the built material exist — correctness never waits for the setTsl
    // commit. Covers the ordering where the mesh mounts AFTER the chunk
    // resolved (the effect's own attach covers the reverse). On the OFF path
    // `glsl` was attached synchronously via JSX.
    if (mesh && !glsl) {
      const built = tslRef.current;
      if (built && mesh.material !== built.material) {
        const prev = mesh.material as THREE.Material;
        mesh.material = built.material;
        // Only three's default placeholder is ever replaced here.
        if (prev && prev !== built.material) prev.dispose();
      }
    }

    // (2) Measurement-freshness rebuild. When the section bus re-measured
    // (accordion toggles, EN↔IT copy-length changes, late layout shifts) but
    // the version bump never reached this island as a committed prop, rebuild
    // the tube + doc→arc LUT + curve imperatively from the store — the SAME
    // buildLineGeometry implementation the memo uses. Guards: skip while the
    // scrollHeight sentinel is unmeasured; at most one rebuild per frame
    // (this block runs once per frame and performs at most one build). The
    // route is read from the STORE's measuredPath (SectionBus measures the
    // live DOM), never the possibly-stale `pathname` prop — the prop remains
    // the source only for routeFx colors and the initial memo.
    if (mesh && section.scrollHeight > 1 && section.measuredPath !== "") {
      const lk = lastBuildKey.current;
      if (
        !lk ||
        lk.version !== section.measureVersion ||
        lk.path !== section.measuredPath
      ) {
        const fractions: Record<string, number> = {};
        for (const id of Object.keys(section.spans)) {
          const span = section.spans[id];
          fractions[id] = (span.start + span.end) / 2;
        }
        const res = buildLineGeometry({
          pathname: section.measuredPath,
          fractions,
          scrollHeight: section.scrollHeight,
          measuredPath: section.measuredPath,
          k,
          worldViewWidth,
          budgetLevel,
        });
        // "hold" is impossible here (pathname === measuredPath by
        // construction) and "no-data" is excluded by the sentinel guard.
        if (res.status === "built") {
          const old = mesh.geometry as THREE.BufferGeometry | undefined;
          mesh.geometry = res.geometry;
          // Dispose ONLY geometries this imperative path created; React-owned
          // (memo-committed) geometries are disposed by the commit effect /
          // its cleanup — never here (no leak, no double-dispose).
          if (old && old === frameOwned.current) old.dispose();
          frameOwned.current = res.geometry;
          curveRef.current = res.curve;
          progressLut.current = res.lut;
          lastGoodGeometry.current = res.geometry;
          lastBuildKey.current = {
            version: section.measureVersion,
            path: section.measuredPath,
          };
        }
      }
    }

    // (3) Visibility. The mesh is ALWAYS mounted (see the JSX below) so the
    // imperative paths above have something to attach to; show the tube only
    // when a REAL build is attached and a REAL line material is live (never
    // three's default placeholder / empty default geometry). Written per
    // frame, so no stalled commit can strand it in either state.
    const liveMaterial: THREE.Material | undefined =
      glsl ?? tslRef.current?.material;
    if (mesh) {
      const geomLive =
        (lastGoodGeometry.current !== null &&
          mesh.geometry === lastGoodGeometry.current) ||
        (geometry !== null && mesh.geometry === geometry);
      mesh.visible =
        !!liveMaterial && mesh.material === liveMaterial && geomLive;
    }
    // ========================================================================

    const scroll = useScrollStore.getState();
    const { progress, velocity, reveal } = scroll;
    const fx = useFxStore.getState();

    // Section-arrival pulse: the section-state bus holds a TARGET bumped to 1
    // each time a new section centers (set by SectionBus). Decay it toward 0
    // here (~400ms feel, frame-rate independent) and write the damped value
    // back so the bus stays the single source of truth — never incremented
    // per frame.
    const anchorPulse = section.pulse;
    const decayedPulse = THREE.MathUtils.damp(anchorPulse, 0, 7, delta);
    // Write the damped value back only while there's actually a pulse to
    // decay — once it has settled to 0, skip the store write so the idle
    // line never churns the store every frame (no spurious set/notify).
    if (anchorPulse !== 0) {
      section.setPulse(decayedPulse < 0.001 ? 0 : decayedPulse);
    }

    // Production-grade per-panel pulse (BEAT 1). Same decay discipline as the
    // section-arrival pulse: the globalThis-pinned store holds the TARGET
    // (bumped to 1 by the ProductionGrade DOM panels as each scans into view);
    // we decay it toward 0 here and write the damped value back, skipping the
    // write once settled so the idle line never churns the store. The boost is
    // gated spatially (prodGate, below) to a 0→1→0 triangle across the
    // production section, so a stray late-decaying pulse never lifts a
    // far-away part of the line or any other route/section.
    const prodPulse = useProductionPulseStore.getState();
    const prodPulseTarget = prodPulse.pulse;
    const decayedProdPulse = THREE.MathUtils.damp(prodPulseTarget, 0, 7, delta);
    if (prodPulseTarget !== 0) {
      prodPulse.setPulse(decayedProdPulse < 0.001 ? 0 : decayedProdPulse);
    }

    dampedProgress.current = THREE.MathUtils.damp(
      dampedProgress.current,
      progress,
      PROGRESS_DAMP,
      delta,
    );
    dampedReveal.current = THREE.MathUtils.damp(
      dampedReveal.current,
      reveal,
      8,
      delta,
    );

    // Live scrollHeight from the store (FIX B): the geometry rebuild above
    // consumed the same per-frame snapshot, so camera glide, head fraction
    // and tube stay mutually consistent even when the anchors prop is stale.
    const sh = section.scrollHeight;
    // window.innerHeight (NOT size.height) — matches Lenis's scroll limit, so
    // the camera lands where the reader actually is even when browser chrome
    // makes the fixed canvas box taller than the visual viewport. Falls back to
    // the canvas height if the ref has not resolved yet, so an unresolved value
    // can never collapse the mapping. `k`/`worldViewWidth` deliberately stay on
    // `size` — they are the world↔canvas scale/aspect (see file header).
    const ih = vhRef.current || size.height;
    const scrollYWorld = dampedProgress.current * Math.max(sh - ih, 0);

    // Camera glides down the world strip; the viewport center tracks the
    // document position exactly (see file header for the k mapping).
    // The half-viewport CENTRING term is `size.height`, NOT `ih`: k spans the
    // frustum over exactly the `fixed inset-0` canvas box, so the frustum
    // covers doc range [scrollYWorld, scrollYWorld + size.height] and its
    // centre is scrollYWorld + size.height/2. Using `ih` here displaces every
    // world point from its DOM anchor by a constant (size.height − ih)/2 —
    // ~45px on mobile chrome, at ALL scroll positions including the hero.
    // Only `scrollYWorld` above is Lenis-derived and so keeps `ih`.
    camera.position.y = -(scrollYWorld + size.height / 2) * k;

    // === Cinematic camera rig (see the constants block for the contract) ====
    // Everything fades in over the first ~half viewport of scroll: at the
    // pinned top (intro gate / brand replay) the rig is EXACTLY zero.
    const rigT = THREE.MathUtils.clamp(scrollYWorld / (ih * RIG_TOP_SPAN), 0, 1);
    const rigGate = rigT * rigT * (3 - 2 * rigT);
    // (a) Breathing dolly-Z — PURE scroll velocity, never aliveVelocity: the
    // pinned intro pumps gateEnergy while the brand must stay glued to the
    // DOM. Normalized like velNorm below, then smoothstep-shaped so reading-
    // speed scrolls stay imperceptible and only a genuine flick pulls the
    // camera back; the snap engine's settles end at velocity 0 → dz relaxes
    // to 0 and every station lands at the exact shipped framing.
    const dollyNorm = Math.min(Math.abs(velocity) * 0.01, 1);
    const dollyShaped = dollyNorm * dollyNorm * (3 - 2 * dollyNorm);
    // TASK 6 (section cuts, dossier §3.3 item 4 — igloo's parallaxY as a
    // camera term): the active seam's scrub adds a symmetric dolly bump
    // `dolly·sin(π·u)·rigGate` — even in u, so reverse is a mirror — through
    // this SAME damped channel (C¹). cutStore is written only by the PostFX
    // cut driver; this stays the single camera writer.
    const cut = useCutStore.getState();
    const cutBell = cut.idx === -1 ? 0 : Math.sin(Math.PI * cut.live.u);
    const dollyTarget =
      dollyShaped * fx.camDollyMax * rigGate * (tier === "full" ? 1 : 0.5) +
      cut.dolly * cutBell * rigGate;
    dollyCurrent.current = THREE.MathUtils.damp(
      dollyCurrent.current,
      dollyTarget,
      DOLLY_DAMP,
      delta,
    );
    // Passage aim gate — the SAME pan01 driver as the dead-ahead aim blend /
    // roll kill further below, hoisted here so the velocity rig shares one
    // per-frame snapshot. The arrival orbit (b) and the pointer parallax (c)
    // offset camera.position.x, while the hole is WORLD-anchored
    // (SequenceSingularity parks it at SEQ_PAN_FRAC × world-view-width on the
    // camera row): at aim = 1 the lookAt aims dead-ahead THROUGH the camera's
    // own x, so any surviving rig offset drags the hole off screen-center by
    // exactly that offset (a mouse held off-center ≈ 1% of frame at warp
    // start). Fading the two TARGETS by (1 − seqAim) lets the existing
    // PAR/ORBIT damps smooth both the die-off and the reverse-unwind
    // fade-back; seqAim is 0 outside the home passage, so every other
    // route/beat is byte-identical.
    const seqState = useSeqStore.getState();
    const seqAim =
      pathname === "/" && seqState.active
        ? THREE.MathUtils.clamp(seqState.pan01, 0, 1)
        : 0;
    // (b) Arrival orbit — as the viewport center approaches the route's
    // ritual anchor (home: the gateway; interior routes: "ritual"), the
    // camera sweeps laterally on a sin() bell that is exactly 0 AT the
    // anchor, so arrivals (and snap settles) always land head-on. Full tier
    // only: the sweep needs the lookAt below to counter-yaw toward the
    // curve target, or it reads as a flat pan instead of an orbit.
    let orbitTarget = 0;
    if (
      tier === "full" &&
      sh > ih &&
      curveRef.current &&
      section.measuredPath === pathname
    ) {
      const ritual = section.spans[pathname === "/" ? "gateway" : "ritual"];
      if (ritual) {
        const ritualPx = ((ritual.start + ritual.end) / 2) * sh;
        const bell = THREE.MathUtils.clamp(
          1 - Math.abs(scrollYWorld + ih / 2 - ritualPx) / (ih * 1.35),
          0,
          1,
        );
        orbitTarget =
          Math.sin(bell * Math.PI) * fx.camOrbitAmp * rigGate * (1 - seqAim);
      }
    }
    orbitCurrent.current = THREE.MathUtils.damp(
      orbitCurrent.current,
      orbitTarget,
      ORBIT_DAMP,
      delta,
    );
    // (c) Pointer micro-parallax — full tier only. pointerStore's own gating
    // (coarse pointer / reduced motion → no listener) leaves smooth parked at
    // center, so the offset is structurally 0 on those devices. × (1 − seqAim):
    // the parallax dies as the passage's dead-ahead aim engages (see the aim
    // gate comment above) so the hole holds dead-center regardless of where
    // the mouse rests.
    const ptr = usePointerStore.getState().smooth;
    const parScale =
      tier === "full" ? fx.camParallax * rigGate * (1 - seqAim) : 0;
    parCurrent.current.x = THREE.MathUtils.damp(
      parCurrent.current.x,
      (ptr.x - 0.5) * 2 * parScale,
      PAR_DAMP,
      delta,
    );
    parCurrent.current.y = THREE.MathUtils.damp(
      parCurrent.current.y,
      -(ptr.y - 0.5) * 2 * parScale * 0.7,
      PAR_DAMP,
      delta,
    );
    // APPLY × rigGate (review fix): damp() converges only asymptotically, so
    // after a fast return to top the currents still carry a tail exactly when
    // the brand/DOM registration window opens (scrollPx <= 2). Gating the
    // OUTPUT crushes that tail quadratically over the last half-viewport
    // (mid-page feel unchanged — rigGate is 1 there), and at a true top rest
    // the currents hard-snap to 0 so the idle frame is byte-identical to the
    // pre-rig camera.
    if (rigT < 0.001) {
      dollyCurrent.current = 0;
      orbitCurrent.current = 0;
      parCurrent.current.x = 0;
      parCurrent.current.y = 0;
    }
    // Singularity-passage pan: THE TRACK-RIGHT camera move of the home plunge
    // sequence (beat 05 → the divario). pan01 is a pure function of the
    // passage's scrub progress (already eased + scrub-smoothed; includes the
    // 2% SETTLE pre-drift and the hidden 1→0 unwind under the tunnel), so the
    // move is reversible at every point. Home-only, like the descent beat —
    // seqStore is reset by the passage on teardown, and the damp below eases
    // any reset step out instead of snapping the world sideways. Applied
    // OUTSIDE rigGate: this is a scripted dolly move, not the velocity rig.
    const seqPanTarget =
      pathname === "/" ? seqState.pan01 * SEQ_PAN_FRAC * worldViewWidth : 0;
    seqPanCurrent.current = THREE.MathUtils.damp(
      seqPanCurrent.current,
      seqPanTarget,
      10,
      delta,
    );
    if (Math.abs(seqPanCurrent.current) < 1e-4 && seqPanTarget === 0) {
      seqPanCurrent.current = 0;
    }
    // Intro camera rig (see INTRO_CAM_*): the LOAD pose is scrubbed by the
    // counter while the chrome is up, then the one-shot GLIDE armed by the
    // hand-off effect pulls the remaining offset to 0. The residual 2^(-10t)
    // tail at t = 1 is sub-millimeter; past the glide both offsets are
    // exactly 0 and this whole block is one getState + a compare per frame.
    let introZ = 0;
    let introX = 0;
    let introLift = 0;
    let introZoom01 = 0;
    if (!useIntroStore.getState().introComplete) {
      // LOAD: HOLD the close-up — the pull-back is not pre-spent; only the
      // lateral whisper drifts with the counter so the frame still breathes.
      const pIn = introProgressRef.current;
      const pe = pIn * pIn * (3 - 2 * pIn);
      introZ = -CAMERA_Z * INTRO_CAM_IN;
      introX = worldViewWidth * (INTRO_CAM_X * (1 - 0.5 * pe));
      introLift = INTRO_CAM_LIFT;
      introZoom01 = 1;
      introHoleRef.current = 1;
      introCamFrom.current.zf = INTRO_CAM_IN;
      introCamFrom.current.lift = INTRO_CAM_LIFT;
      introCamFrom.current.x = introX;
    } else if (introGlideClock.current < INTRO_CAM_EXIT_S) {
      // EXIT — walk the three gates (see INTRO_CAM_GATES): each leg eases
      // z + lift together, cubic in-out, from wherever the previous leg
      // ended, then dwells a breath so the framing reads. Continuous at
      // every seam by construction.
      introGlideClock.current += delta;
      let t = introGlideClock.current;
      let fromZf = introCamFrom.current.zf;
      let fromLift = introCamFrom.current.lift;
      let zf = 0;
      let lift = 0;
      // The hole's own staircase (see introHoleRef): 1 → 0.5 across gate 2a,
      // HELD at 0.5 through gate 2b (the logo push-in must not drag it back
      // up), 0.5 → 0 across gate 3.
      const HOLE_STOPS = [1, 0.5, 0.5, 0];
      let holeP = 0;
      for (let i = 0; i < INTRO_CAM_GATES.length; i++) {
        const gate = INTRO_CAM_GATES[i];
        if (t < gate.dur) {
          const gt = t / gate.dur;
          // ONE smooth cubic in-out for every channel of the leg — no
          // leading sub-curve (owner: "i movimenti non sono più smooth").
          const ge =
            gt < 0.5 ? 4 * gt * gt * gt : 1 - Math.pow(-2 * gt + 2, 3) / 2;
          zf = fromZf + (gate.z - fromZf) * ge;
          lift = fromLift + (gate.lift - fromLift) * ge;
          holeP = HOLE_STOPS[i] + (HOLE_STOPS[i + 1] - HOLE_STOPS[i]) * ge;
          break;
        }
        t -= gate.dur;
        zf = gate.z;
        lift = gate.lift;
        holeP = HOLE_STOPS[i + 1];
        if (t < gate.dwell) break;
        t -= gate.dwell;
        fromZf = gate.z;
        fromLift = gate.lift;
      }
      introZ = -CAMERA_Z * zf;
      introLift = lift;
      introZoom01 = zf / INTRO_CAM_IN;
      introHoleRef.current = holeP;
      // The lateral whisper rides the dolly fraction — exact 0 together
      // with it.
      introX = introCamFrom.current.x * (zf / INTRO_CAM_IN);
    }
    // Publish the frame lift for the screen-anchored lockup actors (mark +
    // wordmark) — each gate carries its own framing; exactly 0 past the exit.
    // HEAD RAISE (owner 2026-08-28, final form): raising the gaze sinks
    // EVERYTHING by the same screen fraction — the lockup (introCamShiftRef,
    // read by HeroLogo + HeroTextParticles) and the world/eclipse
    // (introHeadRaiseRef). One value, two consumers, so the whole scene
    // tilts as one and the cropped logo drops into frame.
    // The lockup translates by nothing — the head raise IS the camera pitch
    // applied further down. The eclipse, however, must NOT ride that pitch
    // (owner: "il buco nero deve rimanere fissato in basso fino al terzo
    // gate"), so it receives the lift as a COUNTER-shift and holds its
    // screen position while everything else tilts.
    introCamShiftRef.current = 0;
    introHeadRaiseRef.current = introLift;
    // Publish the zoom fraction (1 = inside the hole, 0 = landed): the
    // eclipse rides it between its swallowing-the-frame distance and its
    // hero rest — the "uscire da dentro il buco nero" of the owner concept.
    introZoomRef.current = introZoom01;
    // TWO zoom-outs on one timeline (owner 2026-08-28 final form): the REAL
    // camera dolly scales the brand — SERSAN big at the load close-up,
    // shrinking through gate 2 and landing at true size at 0 — while the
    // CAMERA-LOCKED hole is immune to it (its group follows the camera) and
    // rides its own introZoomRef distance curve out of the frame instead.
    camera.position.z = CAMERA_Z + dollyCurrent.current * rigGate + introZ;
    camera.position.x =
      (orbitCurrent.current + parCurrent.current.x) * rigGate +
      seqPanCurrent.current +
      introX;
    camera.position.y += parCurrent.current.y * rigGate;

    // Camera-descent beat STATE (textMorphStore.camTilt 0..1) — read EARLY so
    // the gate-shake below can fade by the applied-descent factor (FIX A3).
    // The offset itself is applied further down (camera.position.y -= desc).
    // scrollRamp eases the descent OUT by scroll distance from the anchor for
    // the post-release re-sync. During the lock the page sits at the anchor so
    // distance ≈ 0 → ramp ≈ 1; while the beat is mid-flight (0 < camTilt < 1)
    // we FORCE ramp = 1 so a frozen/teleported scrollPxNow can never corrupt the
    // descent — the camTilt clock is the sole driver of the locked move (FIX 1b).
    // FIX A3 — the ramp is a SMOOTHSTEP over ONE viewport, replacing the old
    // linear ramp hard-clamped at 1.5·ih: linear made the camera track at 1/3
    // scroll speed while unwinding, then snap to full speed at the clamp — an
    // instant 3× velocity jump the lit head shared (headFraction adds the same
    // descPx). Smoothstep is C1 at BOTH ends (no kink at the far edge, no cusp
    // at dist = 0 on the reverse approach), and its span now equals the
    // landing glide's distance (1·ih), so desc reaches 0 exactly as the
    // landing lenis.scrollTo completes — zero residual left to unwind.
    const { camTilt, tiltAnchorY } = useTextMorphStore.getState();
    // The descent beat belongs to the home cinematic spine ONLY. textMorphStore
    // is globalThis-pinned, so camTilt/tiltDone/tiltAnchorY survive soft nav and
    // no writer resets them on LEAVING home — an interior route would otherwise
    // consume a home-only beat clock (frozen mid-flight camTilt → a permanent
    // half-viewport camera offset; a completed camTilt=1 → a full dive/un-dive
    // as the reader scrolls past home's stale tiltAnchorY on a long route).
    // Gating the CLOCK here (not the `camera.position.y -= desc` line) collapses
    // desc, descPx, the tiltVel pitch and the published camDescend to 0 together,
    // so no consumer is ever left reading a stale offset.
    const beatActive = pathname === "/";
    const t = beatActive ? camTilt : 0;
    const tiltEase = t * t * (3 - 2 * t);
    const scrollPxNow = dampedProgress.current * Math.max(sh - ih, 0);
    const distT = Math.min(Math.abs(scrollPxNow - tiltAnchorY) / ih, 1);
    const distRamp = 1 - distT * distT * (3 - 2 * distT);
    const beatInFlight = t > 0.0001 && t < 0.9999;
    const scrollRamp = beatInFlight ? 1 : distRamp;
    // Normalized applied descent, 0..1 — desc = WORLD_VIEW_HEIGHT · descRamp.
    const descRamp = tiltEase * scrollRamp;

    // Intro-gate shake: consume the gesture impulse the gate accumulated and
    // integrate the under-damped spring (semi-implicit Euler at a clamped dt
    // so a background-tab hiccup can't explode the spring). Applied BEFORE
    // the lookAt-ahead block so the tilt follows the bob. Screen-anchored
    // objects (HeroLogo, the particle text) position themselves relative to
    // camera.position.y per frame, so they stay readable while the
    // world-anchored line/scene visibly shakes — exactly the intended feel.
    const kick = useTextMorphStore.getState().gateKick;
    if (kick !== 0) {
      // Signed: scroll-down dips the camera down, then it springs back.
      shakeVel.current -= kick * GATE_KICK_SCALE;
      gateEnergy.current = Math.min(
        gateEnergy.current + Math.abs(kick) * GATE_ENERGY_SCALE,
        GATE_ENERGY_MAX,
      );
      useTextMorphStore.setState({ gateKick: 0 });
    }
    if (shakeY.current !== 0 || shakeVel.current !== 0) {
      const dt = Math.min(delta, 1 / 30);
      shakeVel.current +=
        (-GATE_SPRING * shakeY.current - GATE_DAMP * shakeVel.current) * dt;
      shakeY.current = THREE.MathUtils.clamp(
        shakeY.current + shakeVel.current * dt,
        -GATE_SHAKE_MAX,
        GATE_SHAKE_MAX,
      );
      // Snap to rest once imperceptible so the idle frame loop stays a no-op.
      if (Math.abs(shakeY.current) < 1e-4 && Math.abs(shakeVel.current) < 1e-3) {
        shakeY.current = 0;
        shakeVel.current = 0;
      }
      // FIX A3: fade the shake OUTPUT by the applied-descent factor — kicks
      // consumed during the descent beat keep integrating the spring, but the
      // under-damped wobble can't ride over the dive/landing hand-off; it
      // returns naturally as the descent fully unwinds (descRamp → 0).
      camera.position.y += shakeY.current * (1 - descRamp);
    }
    gateEnergy.current =
      gateEnergy.current < 0.01
        ? 0
        : THREE.MathUtils.damp(gateEnergy.current, 0, GATE_ENERGY_DECAY, delta);
    // Velocity the "alive" channels see: real scroll velocity plus the gate
    // gesture energy — during the gate scroll velocity is 0, this keeps the
    // line glow/breath responding to the user's hand exactly like scrolling.
    const aliveVelocity = Math.abs(velocity) + gateEnergy.current;

    // === Camera-descent beat (textMorphStore.camTilt 0..1) ===================
    // FORMERLY the final hijacked beat at the end of the cinematic spine: the
    // exit gate locked the page at tiltAnchorY and drove camTilt 0→1 while the
    // camera descended ~one viewport, the lit head tracking the dive. Its
    // driver (SpineExitGate) was REMOVED 2026-08-09 (owner: the beat read as a
    // slide-up) — nothing writes camTilt above 0 anymore, so this block is
    // provably inert (desc = 0, pitch = 0) and kept as the camTilt CONSUMER
    // contract should a scripted descent ever return.
    //
    // The beat STATE (camTilt/tiltEase/scrollRamp → descRamp) was read above
    // the gate-shake block so the shake output could fade by it (FIX A3).
    // Applied HERE (before headFraction + the lookAt-ahead) so:
    //  (1) the world→px descent can be folded into headFraction below — the lit
    //      head follows the camera through the locked beat (kills the "scatto");
    //  (2) camera.position.y already carries the descent when the full-tier
    //      lookAt runs, and the descent pitch is applied by biasing the lookAt
    //      TARGET downward (no second camera.rotateX on the full path — that was
    //      the double-rotation wobble). Lite/no-curve keeps a single rotateX.
    // The applied offset is still published to camDescend (parity: HeroLogo +
    // HeroTextParticles SUBTRACT-by-adding it to hold their pre-descent station).
    const desc = WORLD_VIEW_HEIGHT * 1.0 * descRamp;
    // descPx: world-units descent → document px (inverse of the k mapping), so
    // it can be added to the head's scroll position below.
    const descPx = k > 0 ? desc / k : 0;
    // Pitch ∝ the SMOOTH camTilt clock velocity (per-second), NOT world-units/s:
    // the gate advances camTilt by dt/1.8 each frame, so this is a clean, small,
    // bounded signal that can't spike on the gate's odd dt the way the old
    // (desc - prevDescend)/delta did. Diving (camTilt↑) pitches the head down;
    // reversing (camTilt↓) pitches it up; at rest → level.
    // `t` (the route-gated clock), never the raw camTilt: on the frame the route
    // flips, recording the raw value would register a phantom step and pitch the
    // camera on an interior route.
    const tiltVel = (t - prevCamTilt.current) / Math.max(delta, 1e-4);
    prevCamTilt.current = t;
    descendPitch.current = THREE.MathUtils.damp(
      descendPitch.current,
      THREE.MathUtils.clamp(tiltVel * 0.45, -0.4, 0.4),
      6,
      delta,
    );
    // Apply the vertical descent now (after the gate shake, before lookAt) so
    // every downstream camera read includes it. Orientation (pitch) is applied
    // per-tier below: full+curve folds it into the lookAt target; lite/no-curve
    // gets the single rotateX.
    camera.position.y -= desc;
    if (useTextMorphStore.getState().camDescend !== desc) {
      useTextMorphStore.setState({ camDescend: desc });
    }

    // The lit head sits where the reader is: document fraction of the
    // viewport center. + descPx so during the locked camera-descent beat the
    // head TRACKS the diving camera (FIX 1b) — descPx is 0 in every other
    // state. This stays in DOC/PX space (the emissive beats + camDescend
    // below consume it there); the shader-facing progress is remapped next.
    // `size.height * 0.5`, not `ih * 0.5` — this is the SAME frustum-centring
    // term the camera uses above; the head must sit at the camera's centre.
    const headFraction =
      sh > 0 ? (scrollYWorld + size.height * 0.5 + descPx) / sh : 0;

    // FIX A1 — remap the reader's DOCUMENT fraction into the tube's
    // ARC-LENGTH space before it meets uv.x (TubeGeometry samples via
    // getPointAt, so uv.x is an arc-length fraction — the old direct write
    // made the head race/stall wherever waypoint density per doc-px deviated).
    // headFraction spans ~[size.height/2sh, 1−size.height/2sh] (the
    // viewport-center range — the CANVAS height, since that is the term the
    // numerator above carries; on mobile chrome the top end is exact and the
    // bottom overshoots by (size.height−ih)/2sh, which the clamp absorbs):
    // normalize that onto the curve's own doc span (also fixing the
    // never-lit last segment / pre-lit first segment on short routes), find
    // the waypoint segment in docF, and lerp the matching arcF pair. Only
    // uProgress + the lookAt-ahead parameter live in arc space — the
    // audit/production emissive beats and camDescend/descPx stay doc/px.
    const lut = progressLut.current;
    let arcProgress: number;
    if (sh <= ih) {
      // Unscrollable page: nothing to draw progressively — fully lit.
      arcProgress = 1;
    } else if (lut && lut.docF.length >= 2) {
      // The domain floor must be the SAME half-viewport term headFraction is
      // built from (size.height/2), or hn is non-zero at scroll top and the
      // first segment reads pre-lit on mobile chrome. With size.height ≥ ih
      // hSpan can degenerate on a page barely taller than the canvas box —
      // that is the unscrollable case, so fall through to fully lit.
      const hMin = size.height / (2 * sh);
      const hSpan = 1 - 2 * hMin; // = hMax − hMin
      const hn =
        hSpan > 1e-6
          ? THREE.MathUtils.clamp((headFraction - hMin) / hSpan, 0, 1)
          : 1;
      const { docF, arcF } = lut;
      const last = docF.length - 1;
      const hDoc = docF[0] + hn * (docF[last] - docF[0]);
      // Linear segment search — waypoint counts are ~4..12, trivially cheap.
      let j = 0;
      while (j < last - 1 && docF[j + 1] < hDoc) j++;
      const den = docF[j + 1] - docF[j]; // > 0: docF is strictly increasing
      const seg = den > 0 ? THREE.MathUtils.clamp((hDoc - docF[j]) / den, 0, 1) : 0;
      arcProgress = arcF[j] + seg * (arcF[j + 1] - arcF[j]);
    } else {
      // No LUT yet (geometry held/not built) — degrade to the old behavior.
      arcProgress = THREE.MathUtils.clamp(headFraction, 0, 1);
    }

    // Cinematic lookAt-ahead (ANALISI_LUSION §3.7) — FULL tier only.
    // The camera aims slightly ahead along the SAME signature curve, producing
    // a gentle parallax tilt as the user scrolls. This is the single camera
    // authority (we already own camera.position.y above); no second writer.
    // X/Z of the ahead-point are scaled DOWN by lookTiltScale so the camera
    // yaws/pitches only a few degrees — hero/section text stays stable. Y of
    // the target tracks the curve naturally (small relative to camera.position.y),
    // giving a subtle pitch without altering the vertical glide.
    // On lite/off tiers we skip this entirely → camera looks straight down -Z
    // (its default orientation), exactly as before this change.
    // The roll ACTUALLY applied to the camera this frame — stays 0 whenever the
    // full-tier bank block below does not run (lite tier / no curve), so a tier
    // or route change can never leave a consumer holding a stale angle.
    // Published to textMorphStore after the block (parity with camDescend).
    let appliedRoll = 0;
    const curve = curveRef.current;
    if (tier === "full" && curve) {
      // FIX A1: the ahead parameter is the SAME arc-length fraction the lit
      // head uses (getPointAt is arc-length-parameterized), so the camera
      // leans toward the bend the reader is actually approaching — the old
      // raw scroll-range fraction was a third, inconsistent parameter space.
      const ahead = THREE.MathUtils.clamp(arcProgress + fx.lookAhead, 0, 1);
      curve.getPointAt(ahead, aheadPoint.current);
      // Build the desired look target relative to the camera's current position:
      // dampen the lateral (x) and depth (z) curve offset so the tilt is subtle,
      // and keep the target's y near the camera's y plane (the curve's own y is
      // the full page strip — using it directly would over-pitch).
      const tilt = fx.lookTiltScale;
      // Passage AIM BLEND driver (owner 2026-08-09 round 2: "il buco nero
      // quando parte il warp non è al centro" — the hole must sit dead-center
      // from warp start). The hole is WORLD-anchored at x = SEQ_PAN_FRAC ×
      // worldViewWidth on the camera row, so it projects screen-center ONLY
      // under a straight -Z aim. The curve-derived target below carries a
      // residual yaw (aheadPoint.x × tilt) and — worse — a DOWN-pitch (the
      // look-ahead point rides the descending page curve, many world units
      // below the camera), which together pushed the hole hundreds of px
      // up/off-center (verified live: (780, 357) instead of (960, 467) on a
      // 1920×935 viewport at pan01 = 1). pan01 is the right driver: it eases
      // 0→1 across the traverse (aim complete BEFORE the warp ramps), holds
      // 1 through light-speed/enter (hole locked center), unwinds to 0 under
      // the black frame (the hand-back to the curve is invisible), and the
      // reverse-entry near hold from the divario sits at pan01 = 1 (hole
      // centered there too). It is 0 outside the passage on every route.
      // seqAim is computed ONCE in the rig block above (same frame snapshot),
      // which also fades the arrival-orbit / pointer-parallax x-offsets by
      // (1 − aim) — so at aim = 1 camera.x truly equals the world pan and the
      // hole truly centers (a parallaxed camera would drag it ~1% off-axis).
      const aim = seqAim;
      // + seqPanCurrent: during the passage's TRACK-RIGHT move the BASE look
      // target rides laterally WITH the camera, so the pan reads as a
      // straight-ahead tracking shot even while the aim blend is still
      // partial (without this the lookAt would counter-yaw back toward the
      // world strip). The blend then lerps out the residual curve yaw/pitch;
      // the damped lookTarget chase (λ 3.5) lags both slightly — a subtle,
      // filmic lead that settles to dead-ahead at every hold. Zero whenever
      // the passage is inactive.
      const targetX = aheadPoint.current.x * tilt + seqPanCurrent.current;
      const targetZ = aheadPoint.current.z * tilt;
      // Camera-descent pitch (FIX 1b): bias the look TARGET downward by the
      // descent pitch instead of composing a second camera.rotateX after the
      // lookAt (the old double-rotation wobble). For a target on the content
      // plane the geometric drop for a pitch θ is tan(θ) × (camera→plane depth);
      // descendPitch is 0 outside the beat, so this is a no-op otherwise.
      const lookDepth = Math.abs(camera.position.z - targetZ);
      const pitchDrop = Math.tan(descendPitch.current) * lookDepth;
      const targetY =
        camera.position.y +
        (aheadPoint.current.y - camera.position.y) * tilt -
        pitchDrop;
      // Aim blend (see the pan01 driver note above): lerp the curve-derived
      // target toward TRUE dead-ahead — the camera's own x/y this frame — as
      // the passage pan engages. targetZ stays curve-derived: once x/y match
      // the camera, ANY z in front of it yields the same straight -Z aim, so
      // there is nothing to blend there. Feeding the lerped values into the
      // EXISTING damped chase below (λ 3.5) smooths the handover in BOTH
      // directions for free.
      const aimX = THREE.MathUtils.lerp(targetX, camera.position.x, aim);
      const aimY = THREE.MathUtils.lerp(targetY, camera.position.y, aim);
      if (!lookInitialized.current) {
        // First frame at full tier: snap (no swing-in from origin).
        lookTarget.current.set(aimX, aimY, targetZ);
        lookInitialized.current = true;
      } else {
        lookTarget.current.x = THREE.MathUtils.damp(lookTarget.current.x, aimX, 3.5, delta);
        lookTarget.current.y = THREE.MathUtils.damp(lookTarget.current.y, aimY, 3.5, delta);
        lookTarget.current.z = THREE.MathUtils.damp(lookTarget.current.z, targetZ, 3.5, delta);
      }
      camera.lookAt(lookTarget.current);

      // View-space ROLL — bank INTO the bend the reader is approaching. The
      // curve tangent's x at the look-ahead point is the path's lateral lean;
      // roll ∝ -tangent.x (lean into the turn), scaled by fx.camRoll ×
      // routeFx.cameraRollScale, damped, and HARD-clamped to ±CAM_ROLL_MAX so
      // it reads as cinematic banking, never as tilted text. rotateZ is applied
      // in the camera's LOCAL frame AFTER lookAt → a pure roll about the view
      // axis; every camera-locked billboard inherits camera.quaternion, so the
      // roll needs no re-registration. Rotation only — it does NOT touch
      // camera.position, so the camDescend station-subtract in HeroLogo /
      // HeroTextParticles / RouteHero / GatewayPortal is unaffected.
      curve.getTangentAt(ahead, aheadTangent.current);
      // HERO SQUARE GATE — camera.rotateZ banks the ENTIRE WebGL layer, so every
      // camera-locked billboard (HeroLogo's brand mark, HeroTextParticles'
      // headline) inherits the roll. EVERY route's curve opens with a hard
      // lateral swing (x ≈ +1.2 at t=0 → x ≈ -1.2 at the first anchor), so the
      // look-ahead tangent's x is already large at scrollY 0 and the roll pins
      // at ±CAM_ROLL_MAX (≈2.6°) from the very first frame — the mark and the
      // headline would render visibly off-square at the top of the page, while
      // the DOM headline beside them stays level. Ramp the bank in over one
      // viewport of scroll so the hero reads square and the banking survives
      // undiminished in the bends below. Smoothstep, not a linear clamp: this
      // file's convention is zero slope at BOTH ends of any hand-off between a
      // time-driven beat and a scroll-driven mapping (a linear ramp lands as a
      // visible velocity kink). The gate multiplies the TARGET, so the damp()
      // and the ±CAM_ROLL_MAX clamp below still govern the transition. Keyed on
      // scroll position only — never on the route — so it squares up every
      // route's hero uniformly, including the 0.5 / 1.25 cameraRollScale ones.
      // (This full-viewport ramp + the appliedRoll publish below SUPERSEDE the
      // shorter rigGate factor the camera rig briefly applied here — the rig's
      // gate still governs dolly/orbit/parallax, which are translations.)
      const rollGateT = THREE.MathUtils.clamp(scrollPxNow / ih, 0, 1);
      const rollGate = rollGateT * rollGateT * (3 - 2 * rollGateT);
      // × (1 − aim): the cinematic bank dies as the passage's dead-ahead aim
      // takes over (same pan01 driver as the aim blend above) — a banked
      // frame would tilt the hole composition even with the yaw/pitch gone.
      // Multiplies the TARGET, like rollGate, so the damp() + clamp still
      // govern the transition and the unwind eases back in reverse.
      // TASK 6: + the seam's roll bump `roll·dir·sin(π·u)` (sign follows the
      // crossing direction LATCHED at window entry — reversing mid-window is
      // a mirror, no sign flip — unwinds through the same curve) BEFORE the clamp.
      const rollTarget = THREE.MathUtils.clamp(
        -aheadTangent.current.x *
          fx.camRoll *
          route.cameraRollScale *
          rollGate *
          (1 - aim) +
          cut.roll * cut.dir * cutBell,
        -CAM_ROLL_MAX,
        CAM_ROLL_MAX,
      );
      // Damp toward the target every frame (C1 across route/curve rebuilds; eases
      // in from 0 on first frame — no snap, no pop).
      rollCurrent.current = THREE.MathUtils.damp(rollCurrent.current, rollTarget, 3, delta);
      if (Math.abs(rollCurrent.current) > 1e-5) {
        camera.rotateZ(rollCurrent.current);
        appliedRoll = rollCurrent.current;
      }
    }

    // Camera-descent PITCH application (FIX 1b). The vertical descent
    // (camera.position.y -= desc), the camTilt-velocity pitch and the camDescend
    // store-publish were all computed earlier (before headFraction) so the head
    // tracks the dive and the lookAt below already saw the descent. Here we only
    // apply the ORIENTATION:
    //  - full + curve → the pitch was folded into the lookAt target above (no
    //    second rotateX → no double-rotation wobble); nothing to do here.
    //  - lite / no-curve → no lookAt ran, so reset orientation and apply the
    //    single descent rotateX (this is the ONLY orientation writer there).
    //
    // THE RE-BASE IS NOW UNCONDITIONAL ON THIS PATH (2026-09-09). It used to
    // be gated on `descendPitch > 0.0001`, i.e. it only ran while the descent
    // beat was live — which left the lite path with NO orientation base for
    // the rest of the page, and `camera.rotateX` is RELATIVE. The intro head
    // raise below rotates by `introLift × CAMERA_FOV` every frame and had no
    // base of its own, so on a phone it ACCUMULATED: 0.02 × 50° = 1° per
    // frame through the load hold (60°/s — a full revolution in the six
    // seconds of the preloader), then 0.3 × 50° = 15° per frame across intro
    // gate 2b. The camera tumbled, and the whole choreography — the wordmark
    // forming, the climb out of the hole, the crust burst, the final pull
    // back — played somewhere off the edge of the frame. Reported from the
    // owner's iPhone as "il mondo gira su se stesso" (2026-09-09).
    //
    // The hazard is already documented VERBATIM a few lines below, for the
    // warp terms: "on lite/no-curve nothing re-bases orientation, so an
    // additive rotate would ACCUMULATE into a spin". Those are guarded by
    // `warpOriented`; the intro lift never was, because when it was written
    // the intro only ever ran on the full-tier path — the compact brand beat
    // that brings it to a phone came later.
    //
    // Re-basing every frame gives the lite path the property the full-tier
    // lookAt already has by construction: orientation is a pure function of
    // THIS frame's inputs, never a running total. It also fixes the residual
    // the old threshold left behind — when descendPitch decayed under 0.0001
    // the reset simply stopped running and the camera kept its last pitch.
    // One quaternion write per frame on a path that skips the whole lookAt
    // block; desktop (`tier === "full" && curve`) does not enter here at all.
    if (tier !== "full" || !curve) {
      camera.quaternion.set(0, 0, 0, 1);
      if (Math.abs(descendPitch.current) > 0.0001) {
        camera.rotateX(-descendPitch.current);
      }
    }

    // === Round 3 §C1 — WARP CAMERA (home one-shot plunge; igloo grammar) ====
    // seqStore.upFlip / fovShift / shakeAmp are written ONLY by the passage's
    // desktop one-shot timeline (0 on every other route, on the phone beat and
    // under RM — those variants never write them), read from the SAME
    // `seqState` snapshot the pan/aim blocks above consumed. Applied here,
    // AFTER every other orientation writer (lookAt + bank above, descent
    // pitch), additive with the biggest term first: the ≤π corkscrew up-flip
    // (a pure roll about the view axis — igloo's baseUp.applyAxisAngle move),
    // then the ≤0.02 rad deterministic sine-noise shake (sineNoise1 port —
    // never Math.random in a frame path). Deliberately NOT folded into the
    // camRoll publish below: that channel is the cinematic bank HeroLogo
    // counter-rotates against, and the hero is nowhere on screen during the
    // plunge. Idle cost: two damp calls + comparisons, all channels
    // hard-snapped to rest.
    const seqWarpOn = pathname === "/" && seqState.active;
    // Orientation terms apply ONLY while the full-tier lookAt above owns (and
    // therefore RESETS) the camera quaternion every frame — on lite/no-curve
    // nothing re-bases orientation, so an additive rotate would ACCUMULATE
    // into a spin (reachable: a weak-GPU ≥1024px desktop runs the passage's
    // desktop branch — which writes these fields — at tier "lite"). The fov
    // channel below is an absolute write and stays live on every tier.
    const warpOriented = tier === "full" && !!curve;
    const flipTarget = seqWarpOn ? seqState.upFlip : 0;
    warpFlipCurrent.current = THREE.MathUtils.damp(
      warpFlipCurrent.current,
      flipTarget,
      WARP_FLIP_DAMP,
      delta,
    );
    if (flipTarget === 0 && Math.abs(warpFlipCurrent.current) < 1e-4) {
      warpFlipCurrent.current = 0;
    }
    if (warpOriented && warpFlipCurrent.current !== 0) {
      camera.rotateZ(warpFlipCurrent.current);
    }
    const shakeTarget = seqWarpOn ? seqState.shakeAmp : 0;
    warpShakeCurrent.current = THREE.MathUtils.damp(
      warpShakeCurrent.current,
      shakeTarget,
      WARP_FOV_DAMP,
      delta,
    );
    if (shakeTarget === 0 && warpShakeCurrent.current < 1e-4) {
      warpShakeCurrent.current = 0;
    }
    if (warpOriented && warpShakeCurrent.current > 0) {
      // Clamped clock (background-tab discipline, uTime precedent below).
      warpClock.current += Math.min(delta, 1 / 30);
      const ts = warpClock.current * 0.25; // igloo `time * shakeSpeed(0.25)`
      const amp = warpShakeCurrent.current;
      // igloo's exact per-axis phase constants: x-shake → yaw, y → pitch,
      // z → the extra up-roll.
      camera.rotateY(sineNoise1(12.23, 3.44, -3.234 + ts) * amp);
      camera.rotateX(sineNoise1(-2.45, 4.789, 7.343 + ts) * amp);
      camera.rotateZ(sineNoise1(23.434, -1.565, 8.454 + ts) * amp);
    }
    // INTRO HEAD RAISE — a REAL pitch, not a translation (owner 2026-08-28:
    // "anche il bg allora si dovrebbe spostare, come da logica"). Tilting
    // the camera up moves EVERYTHING down in frame — mark, wordmark, the
    // eclipse and the starfield the march samples by ray direction — which
    // a per-object translation could never do. The gate's `lift` is a
    // fraction of the view height, so the angle is lift × the vertical FOV.
    // Local rotateX after lookAt/roll, exactly the shake block's grammar;
    // exactly 0 outside the intro.
    if (introLift > 0.0001) {
      camera.rotateX(introLift * THREE.MathUtils.degToRad(CAMERA_FOV));
    }
    // Fov widen (igloo's 22→30 ramp transposed to CAMERA_FOV + up to 8°).
    // Re-project ONLY on a > 0.01° change — the idle frame never touches the
    // projection matrix.
    const fovTarget = CAMERA_FOV + (seqWarpOn ? seqState.fovShift : 0);
    warpFovCurrent.current = THREE.MathUtils.damp(
      warpFovCurrent.current,
      fovTarget,
      WARP_FOV_DAMP,
      delta,
    );
    if (
      fovTarget === CAMERA_FOV &&
      Math.abs(warpFovCurrent.current - CAMERA_FOV) < 0.005
    ) {
      warpFovCurrent.current = CAMERA_FOV;
    }
    const persp = camera as THREE.PerspectiveCamera;
    if (
      persp.isPerspectiveCamera &&
      Math.abs(persp.fov - warpFovCurrent.current) > 0.01
    ) {
      persp.fov = warpFovCurrent.current;
      persp.updateProjectionMatrix();
    }

    // Publish the APPLIED camera roll (same discipline as camDescend above:
    // transient store write, no React state, no per-frame commit). Written
    // AFTER both orientation writers so it always describes the camera as it
    // actually ends this frame. The bank rotates the ENTIRE WebGL layer — right
    // for the line and the scene, wrong for a brand mark, whose strong
    // horizontal bars read as crooked rather than cinematic (and would visibly
    // ROTATE while the bank's scroll gate ramps in across the hero). HeroLogo
    // counter-rotates ITS OWN group by this angle so the mark stays square;
    // this file remains the single camera authority.
    // Epsilon-gated to the same 1e-5 threshold that governs the rotateZ above,
    // so a settled roll stops churning the store every frame.
    if (Math.abs(useTextMorphStore.getState().camRoll - appliedRoll) > 1e-5) {
      useTextMorphStore.setState({ camRoll: appliedRoll });
    }

    // On the ON path the TSL material loads lazily; until its chunk resolves
    // the uniforms are undefined. The camera glide above still runs every
    // frame (so the view is in place when the material lands); the uniform
    // writes are skipped until then. Read via tslRef — NOT the React state —
    // so a stalled setTsl commit can never keep the line dark (FIX B). On the
    // OFF path the GLSL uniforms are always set synchronously.
    const u = glsl?.uniforms ?? tslRef.current?.uniforms;
    if (!u) return;
    // Arc-length space — matches uv.x (FIX A1). Both lineShader.ts (GLSL)
    // and lineNodeMaterial.ts (TSL) compare uProgress vs uv.x unchanged.
    u.uProgress.value = arcProgress;
    // Clamped advance (1/30, the sibling-island convention — see DriftParticles):
    // after a background-tab refocus R3F hands us the whole away-time as ONE
    // delta, which would snap the gradient-flow phase + vertex breathField to a
    // new phase in a single frame — a visible pop on the site's most prominent
    // effect. The damp()/spring paths above already handle big deltas safely.
    u.uTime.value += Math.min(delta, 1 / 30);
    u.uReveal.value = dampedReveal.current;
    // Velocity feeds a subtle energy boost into the glow; the section-arrival
    // pulse adds a brief ~×1.2 bump as the head "arrives" at each section
    // (proportional to base emissive so it reads as ×1.0→1.2→1.0). Both are
    // SUMMED then clamped to the same single ceiling — no double-counting.
    // Weight HALVED (0.004 → 0.002) when the comet head landed: speed should
    // read LOCALLY at the head (the uVel tail stretch + hot lift below), not
    // as a whole-page brightness lift — the global term stays only as a faint
    // supporting glow so the rest of the drawn path still feels the motion.
    const velocityBoost = aliveVelocity * 0.002;
    const pulseBoost = fx.emissive * 0.2 * decayedPulse;
    // BEAT 1 — production-grade per-panel pulse, gated to a smooth 0→1→0
    // triangle across the production section so the lift only ever reads near
    // it (and never on interior routes, where the store stays 0 anyway).
    // sectionProgress is 0→1 as the viewport center traverses the span;
    // 1 - |2p - 1| folds that to a centered triangle. Weight 0.25 ≈ the
    // section pulse's 0.2 — a brief ~×1.25 emissive lift across the bloom
    // threshold. ADD further gated line-beat terms (Beat 2: an /audit term)
    // right here, into the SAME clamped sum.
    const prodTri = sectionProgress("production", progress, ih);
    const prodGate = 1 - Math.abs(2 * prodTri - 1);
    const prodPulseBoost = fx.emissive * 0.25 * decayedProdPulse * prodGate;
    // BEAT 2 — /audit "How the week runs" timeline walk. While the pinned
    // timeline owns the page, its scrub progress (0..1 across the six Days) is
    // published to auditTimelineStore. We derive six evenly-spaced per-Day
    // boundary pulses: each Day boundary is a damped 0→1→0 triangle in the
    // local progress, so the head visibly "ticks" Day1→Day6 as the reader
    // scrubs. Gated to pathname==="/audit" + active (the store stays inert on
    // every other route, and the Canvas is unmounted under reduced motion), so
    // this only ever lifts the line near the timeline waypoint. Writes ONLY the
    // shared uEmissive boost — works identically on GLSL + TSL, no camera or
    // geometry change. Weight 0.22 ≈ the section pulse's 0.2 → a brief ~×1.2
    // emissive tick per Day. ADDED into the SAME clamped sum as the beats above.
    let auditWalkBoost = 0;
    if (pathname === "/audit") {
      const at = useAuditTimelineStore.getState();
      if (at.active) {
        // One "band" per phase chapter over [0,1]; the pulse peaks at the
        // centre of each band and folds to 0 at the band edges (1 - |2f - 1|
        // triangle), sharpened by squaring so the tick reads as a discrete
        // per-phase beat.
        //
        // The count comes from the store (written by audit-week-timeline from
        // the live `week` array) rather than a literal: this was hard-coded to
        // 6 against an array of a different length, which put every tick out of
        // step with the chapter it was punctuating.
        const days = at.count;
        const band = Math.min(0.999999, Math.max(0, at.progress)) * days;
        const frac = band - Math.floor(band);
        const tri = 1 - Math.abs(2 * frac - 1);
        auditWalkBoost = fx.emissive * 0.22 * (tri * tri);
      }
    }
    const boost = Math.min(
      velocityBoost + pulseBoost + prodPulseBoost + auditWalkBoost,
      0.6,
    );
    u.uEmissive.value = (fx.emissive + boost) * route.lineEmissiveScale;
    u.uGlowFalloff.value = fx.glowFalloff;
    u.uHeadSharp.value = fx.headSharp;
    u.uFlowSpeed.value = fx.flowSpeed;
    // "Gel tube" fresnel rim + fake-scatter (ANALISI_LUSION §3.2A). View-
    // dependent, no per-frame animation; same uniforms drive GLSL + TSL.
    u.uFresnelPower.value = fx.fresnelPower;
    u.uScatter.value = fx.scatter;

    // Breath (WI-2): RE-ENABLED after the P1 check, with the overscaled normal
    // correction removed in lineShader.ts. Only the radial POSITION breath
    // remains — a uniform per-ring inflate (≤ 0.4*radius) that leaves the uv.x
    // head-mask coordinate undisturbed. The facing-core normal is now passed
    // through unperturbed: the physically-correct tilt is < 0.2° (because uv.x
    // spans the full ~150-unit curve, so d/ds is divided by L), i.e. below
    // perception, so dropping the correction produces no shimmer. Driver gated
    // on the BUDGET level (plan Phase 4e): level ≥ 2 — desktop full (level 3,
    // the old `tier === "full"` branch, byte-identical) AND a capable phone
    // (level 2) — drives it; 0 at level ≤ 1 (today's lite) makes the shader
    // skip the breath branch (uBreath <= 0.0001). The comet vertex swell in
    // lineShader.ts / lineNodeMaterial.ts shares this uBreath > 0 gate, so
    // this single write turns breath AND comet on together (vertex cost, not
    // fill — the same rationale as the tessellation above). Under
    // prefers-reduced-motion the Canvas is unmounted anyway (tier "off").
    const radius = WORLD_VIEW_HEIGHT * fx.radiusFactor;
    const velNorm = Math.min(aliveVelocity * 0.01, 1);
    u.uBreath.value =
      budgetLevel >= 2 ? 0.4 * radius * (0.45 + 0.55 * velNorm) : 0;
    // Comet head (uVel): damp the SAME normalized alive velocity the breath
    // uses toward the shader — the fragment stretches the hot head band into
    // a tail (headLen ×(1+5·uVel)) and lifts its hot mix, the vertex swells
    // the tube radius under the head. Damping (vs writing velNorm raw) is
    // what makes the effect invisible at rest and during slow reading
    // scrolls: only a genuine flick pumps it up, and it relaxes back to a
    // point over ~0.5s once the hand stops. aliveVelocity already includes
    // the intro-gate gesture energy, so the gated hero gets the same comet
    // response while the document is pinned.
    cometVel.current = THREE.MathUtils.damp(cometVel.current, velNorm, 4, delta);
    u.uVel.value = cometVel.current;
    // Base = the live fxStore color (dev tuning), lerped toward the route tone
    // by colorBlend. On home colorBlend is 0 AND the endpoints are equal, so
    // the result is byte-identical to today's fx.color* set.
    u.uColorA.value.set(fx.colorA).lerp(routeColors.a, colorBlend);
    u.uColorB.value.set(fx.colorB).lerp(routeColors.b, colorBlend);
    u.uColorHot.value.set(fx.colorHot).lerp(routeColors.hot, colorBlend);

    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const liveGeo = lastGoodGeometry.current;
      (window as unknown as Record<string, unknown>).__sersanLineDebug = {
        camY: camera.position.y,
        camRig: {
          dollyZ: dollyCurrent.current,
          orbitX: orbitCurrent.current,
          parX: parCurrent.current.x,
          parY: parCurrent.current.y,
          gate: rigGate,
        },
        uProgress: u.uProgress.value,
        headDocFraction: headFraction,
        measuredPath: anchors.measuredPath,
        storeProgress: progress,
        anchorsScrollHeight: anchors.scrollHeight,
        anchorsVersion: anchors.version,
        // FIX B observability: the live store values + the build key the
        // attached tube was actually built from, plus the imperative-path
        // state (a lastBuildKey ahead of anchorsVersion = the island's
        // commits are stalled and the frame path is covering for them).
        storeScrollHeight: sh,
        storeMeasureVersion: section.measureVersion,
        storeMeasuredPath: section.measuredPath,
        lastBuildKey: lastBuildKey.current,
        tslReady: !!tslRef.current,
        meshVisible: mesh?.visible ?? null,
        k,
        viewportH: WORLD_VIEW_HEIGHT,
        // Both heights: `mapH` drives the doc→scroll mapping ONLY (Lenis's
        // denominator); `sizeH` drives the world↔px scale AND the
        // half-viewport frustum centring (camera.position.y, headFraction,
        // hMin). A persistent gap between them is the mobile browser-chrome
        // case — if the tube ever shifts off its anchors by a constant, check
        // whether mapH has leaked into a centring term.
        mapH: ih,
        sizeH: size.height,
        bboxY: liveGeo?.boundingBox
          ? [liveGeo.boundingBox.max.y, liveGeo.boundingBox.min.y]
          : null,
        bboxX: liveGeo?.boundingBox
          ? [liveGeo.boundingBox.min.x, liveGeo.boundingBox.max.x]
          : null,
      };
    }
  });

  // The mesh is ALWAYS mounted (FIX B): geometry and the TSL material can be
  // attached imperatively in useFrame even when the island's React commits
  // stall, so the mesh must exist from the first commit onward. Until a real
  // build + material are live it stays invisible (per-frame visibility gate in
  // useFrame): three's default empty geometry / placeholder material render
  // nothing. `visible={false}` only seeds the pre-first-frame state — useFrame
  // owns it from then on (constant prop, never re-applied by React).
  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      visible={false}
      {...(geometry ? { geometry } : {})}
      {...(material ? { material } : {})}
    />
  );
}
