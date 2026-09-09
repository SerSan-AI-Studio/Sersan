"use client";

/**
 * HomeSingularity — the HOME-hero ECLIPSE: the same TSL raymarched black hole
 * as /audit (AuditSingularity), re-framed for the brand-intro beat. NOT a
 * repeat of /audit: there the hole is a ~65vh object floated beside the H1;
 * here it is HUGE and LOW-CENTER — the sphere's center sits ~42vh below the
 * viewport center at an apparent diameter of ~122vh, so only the UPPER ARC of
 * the gravitationally-lensed accretion ring crowns the frame's lower half
 * like an eclipse horizon rising behind the wordmark. "Sersan AI" (the
 * particle brand) floats IN FRONT of the ring's glow; the black core sinks
 * to the fold.
 *
 * TWIN NOTE (the repo's duplicate-with-note convention): this island and
 * AuditSingularity share the instantiable factories
 * (singularity/blackHoleMaterial.ts + proceduralTextures.ts — one build per
 * island, never a live shared instance; the two never coexist since each is
 * route-gated) and the same build/orbit/parallax GRAMMAR, but the lifecycles
 * are structurally different — /audit is WORLD-ANCHORED to a section with a
 * scroll fade, this one is CAMERA-LOCKED with an intro-lifecycle fade — so
 * the frame loops are deliberately duplicated, not extracted. A fix to the
 * shared grammar (orbit composition, the uCamWorld/uCamLocal write, the dev
 * handle shape) likely applies to BOTH files.
 *
 * PLACEMENT ARITHMETIC (the eclipse framing)
 * ------------------------------------------
 * The proxy sphere is radius 1 (diameter D = 2) and MUST stay unscaled
 * (every raymarch constant is calibrated to the unit sphere; the uCamLocal
 * shortcut is only exact translation-only) — apparent size comes purely from
 * camera distance. With CAMERA_FOV = 50°:
 *
 *   viewport height at distance d = 2·tan(FOV/2)·d = 0.93262·d
 *   apparent fraction = D / (0.93262·d)  →  d = D / (0.93262·frac)
 *
 * For frac = 1.22 (≈122vh, mid of the directed 110–130vh band):
 *   d = 2 / (0.93262·1.22) ≈ 1.758 world units → group z = cam.z − 1.758
 *   view height AT the group's plane = D/frac ≈ 1.639 world units (=100vh).
 * Vertical: yFrac −0.42 of that plane's view height ≈ −0.689 world units —
 * the center lands 92vh from the viewport top. Derived silhouette on a 100vh
 * frame: apparent radius 61vh → sphere top edge at ~31vh; the black core
 * (march radius 0.13 → apparent radius ~7.9vh) spans ~84vh→fold; the lensed
 * photon arc (march r ≈ 0.2–0.35) crowns ~71–80vh — the "horizon". x is
 * centered (xFrac 0). All three live in `placeRef`
 * (window.__sersanHomeSingularity.place) for live eclipse-framing tuning.
 *
 * CAMERA-LOCKED, NOT WORLD-ANCHORED: during its intended visible life the
 * page is parked at the top under HeroIntroGate's lock, and a distant horizon
 * should hold the frame under the gate's spring-back camera bob anyway — so
 * the group follows camera.position each frame (a HUD anchor, like
 * NeuralLattice) instead of a section anchor. No camDescend compensation and
 * no camRoll counter-rotation: both beats run long after the fade below has
 * fully retired the hole (and a rolled horizon would be correct regardless).
 * That "parked at the top" assumption is NOT guaranteed (a scroll-restored
 * hard reload lands past the hero with the gate never engaged, owner report
 * 2026-08-27), so the fade ALSO carries a store-driven hero-hold scroll term
 * (ECLIPSE_HERO_HOLD): the eclipse retires over the first 0.7 viewports of
 * real scroll, HeroTextParticles' own uFade law, and can never ride the
 * camera over the rest of the page whatever the intro state says.
 *
 * LIFECYCLE (tied to the intro, the whole point):
 *   • never even STARTS BUILDING until textMorphStore.assembleDone flips
 *     true (REGRESSION FIX, lead live-verify 2026-08-07: this island's
 *     build — three/webgpu import + march material + 2048×1024 starfield
 *     generation + pipeline compile — co-resident with HeroTextParticles'
 *     compute build at the exact entry moment silently starved the text
 *     build, the documented no-exception pipeline-failure mode: the
 *     wordmark never assembled, the gate waited forever. The entry beat
 *     OWNS the GPU compile window, exactly as it did before this island
 *     existed; we arm on the assembleDone edge via a store subscription).
 *     An ESC-skip during the entry means assembleDone never flips → the
 *     island never builds at all;
 *   • the armed build still requires the true-WebGPU compute backend (the
 *     eclipse accompanies the compute-driven particle intro — mirror of
 *     HeroTextParticles' probe) and bails on a session-skipped intro; the
 *     march pipeline is then WARMED via renderer.compileAsync against the
 *     live scene BEFORE the mesh ever mounts, so the first visible frame
 *     never stalls the still-gate-locked page;
 *   • never SHOWS unless textMorphStore.active (the particle intro actually
 *     owns the hero — every fallback path leaves it false → a skipped/absent
 *     intro shows nothing) and the preloader curtain has lifted;
 *   • IGNITES over ~1.2s (smoothstep ease on its own clamped-dt clock) —
 *     the horizon RISES behind the already-formed brand rather than
 *     popping in with the deferred build;
 *   • FADES with the melt: uFade = ignite × eased(1 − domReveal) × damped
 *     route reveal. As the brand melts into the DOM hero (domReveal 0→1)
 *     the hole fades out FULLY — it never competes with the spore mark's
 *     hero-right rest pose. Scrolling back to top re-engages the gate,
 *     domReveal reverses, and the eclipse rises again with the re-forming
 *     brand (ignite is already pinned at 1 by then).
 *   • group.visible flips off when faded, so the march costs nothing outside
 *     the intro beat.
 *
 * LAYERING (why this instance overrides the material's depth/side): at
 * d ≈ 1.76 the sphere is NEARER the camera than the z=0 wordmark particles,
 * so three's back-to-front transparent sort would draw the eclipse LAST —
 * over the brand. renderOrder −1 on the mesh (the repo's backdrop
 * convention: RailPlanes / NeuralLattice / ResourcePreviewPlane) draws it
 * first instead, and the wordmark (additive, depth-off) settles in front of
 * the glow. That reordering forces two instance-level material overrides:
 * depthWrite OFF (the factory's depthWrite:true would otherwise stamp a
 * near-plane depth across a ~122vh disc BEFORE the depth-tested
 * SignatureLine draws, erasing the line inside the whole silhouette) and
 * side: FrontSide (the factory's DoubleSide relied on that same depth write
 * to let front faces overwrite the useless outside-view backface march;
 * with depth off the two layers would double-composite. The camera stays
 * outside the volume at any dist > 1, so the backface path is unreachable
 * here anyway). The factory itself stays untouched — /audit keeps its exact
 * behavior.
 *
 * GPU NOTE: the raymarch is heavy (128 steps over a near-fullscreen
 * silhouette) and home already carries the spore hero + the 48k text sim —
 * AdaptiveResolution owns the framerate (effects identical at any DPR); the
 * honest quality knob if it ever needs a manual floor is
 * u.uIterations (scale uStep inversely — keep the ≈1.82 path product).
 * Island frame-loop conventions honored: single useFrame at default
 * priority, mounted AFTER SignatureLine (camera-relative reads depend on the
 * single camera authority having written camera.position earlier in the same
 * priority-0 pass), no rect reads, no per-frame allocations, clamped-dt
 * damps.
 *
 * LITE (mobile-parity plan Phase 4b — capable phones): the Scene consumption
 * site mounts `<HomeSingularity lite />` when `fxBudget.raymarchLite &&
 * backend === "webgpu"` (level 2 only; level 3 ⇒ raymarchLite false ⇒ the
 * desktop mount is byte-identical with lite=false). In lite the march runs
 * at the SEQ low step — `uIterations = SEQ.ITER_LO (64)`, `uStep =
 * SEQ.STEP_LO (0.0142)`, path product 1.818 ≈ the factory's 128×0.0071×2 =
 * 1.82 — iterations and step MUST move inversely (blackHoleMaterial contract).
 * Fallback knob if the Phase 6 measure fails: 48 iterations with step
 * 0.0071·128/48 ≈ 0.01893 (product 1.817). While the eclipse can be visible
 * lite also holds `tierStore.dprCap` at 1 (the coarse range is {1,1,1.5}: the
 * monitor may climb to 1.25/1.5 after its hysteresis, so the cap is
 * meaningful), cleared with a `dprCap === 1` guard on the first
 * visible→invisible edge / unmount so singularity-passage's own caps
 * (SEQ.LITE_DPR_CAP 1 / SEQ.DPR_CAP 1.5) are never clobbered — the two
 * writers cannot overlap in time (the hole is faded out within ~0.7
 * viewports; the passage caps far below). The intro lifecycle (arm on
 * assembleDone, compileAsync warm, melt on domReveal, active/introSkipped
 * gates) is UNCHANGED and works on touch because the compact beat in
 * HeroTextParticles drives the very same gateProgress a desktop wheel does.
 * The one signal flowing the OTHER way is `textMorphStore.eclipseReady`:
 * set true right after this island's build resolves (lite AND full path —
 * on desktop nothing reads it), false again on dispose/rebuild and by the
 * provider's nav-into-home reset. The compact auto-driver holds the formed
 * brand for at least AUTO_HOLD_S and extends the hold up to AUTO_HOLD_MAX_S
 * until this is true, so the melt never starts over an eclipse that has not
 * risen on a slow phone.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { webgpuEnabled } from "./renderer/createRenderer";
import { CAMERA_FOV } from "./constants";
import { useScrollStore } from "./store/scrollStore";
import { useSectionStore } from "./store/sectionStore";
import {
  useIntroStore,
  introHoleRef,
  introHeadRaiseRef,
} from "./store/introStore";
import { useTextMorphStore } from "./store/textMorphStore";
import { usePointerStore, installPointerTracking } from "./store/pointerStore";
import { useTierStore } from "./store/tierStore";
import { SEQ } from "./store/seqStore";
import type { SingularityBuild } from "./singularity/blackHoleMaterial";

/** tan(FOV/2) — the one trig constant the placement math needs. */
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2);
/** Unit proxy sphere: radius 1 → diameter 2 (NEVER scaled — see header). */
const SPHERE_DIAMETER = 2;
/** Target apparent diameter as a fraction of viewport height (~122vh). */
const APPARENT_HEIGHT_FRAC = 1.22;
/** Camera→group distance for that apparent size: ≈ 1.758 world units. */
const DEFAULT_DIST =
  SPHERE_DIAMETER / (2 * TAN_HALF_FOV * APPARENT_HEIGHT_FRAC);

/** Pointer parallax: max translation in world units (±), damped. Audit ships
 * 0.15 at dist 3.2; scaled by the distance ratio (×1.76/3.2) so the ANGULAR
 * drift — what the eye reads — stays equally subtle this close. */
const PARALLAX_MAX = 0.08;
const PARALLAX_DAMP = 4;
/** Route-transition reveal damp (ignition through the opening curtain). */
const REVEAL_DAMP = 4;

/** Slow continuous orbit — the audit island's orbit grammar reused at HALF
 * the period: home runs 13s vs /audit's 26s (owner 2026-08-09: the orbital
 * swim through space — NOT the disc spin — must be faster; a deliberate
 * divergence, the audit island keeps its 26s). Radius is distance-scaled
 * like the parallax (0.5·1.76/3.2 ≈ 0.275) so the virtual march camera
 * swims the same apparent amount; bob is cut to ~0.3× the audit's 0.45
 * (owner direction: the framing is fixed-low, the inclination breathing
 * should stay a murmur under the horizon). */
const ORBIT_PERIOD = 13; // seconds per lateral revolution (half of /audit's 26)
const ORBIT_RADIUS = 0.275; // lateral (x/z) drift radius, world units
const ORBIT_BOB = 0.14; // vertical bob amplitude, world units (half rate)

/** domReveal band over which the hole melts out — starts just after the
 * brand starts dissolving, fully gone before the DOM cascade lands (the
 * crisp hero never shares the frame with a live event horizon). domReveal
 * is already damped upstream (derived from HeroTextParticles' smoothed g),
 * so the eased smoothstep needs no extra damping of its own. */
const MELT_START = 0.05;
const MELT_END = 0.9;
/** KILL-SWITCH (Fix B, owner report 2026-08-27): multiply a hero-hold scroll
 * term into the fade — 1 while the page is parked in the hero, retiring to 0
 * over the first HERO_HOLD_VH viewports of real scroll (store reads only:
 * scrollStore.progress × sectionStore.scrollHeight, never window.scrollY).
 * During the gated intro scroll is 0 → term is 1 → byte-identical intro.
 * `false` restores the intro-lifecycle-only fade. */
const ECLIPSE_HERO_HOLD = true;
/** Viewports of scroll over which the hero hold retires (HeroTextParticles'
 * own 0.7·h uFade law, so wordmark and eclipse leave together). */
const HERO_HOLD_VH = 0.7;

/**
 * GRAVITATIONAL FLYBY FIELD (owner 2026-08-07) — module-scope shared ref,
 * the pointerStore pattern: mutated per frame by THIS island (the single
 * writer), read via plain property access inside the consumers' useFrame
 * (HeroLogo's crust layers, HeroTextParticles) — never React state, never a
 * store subscription. Published at the END of this island's frame loop;
 * consumers registered earlier in the same priority-0 pass therefore read
 * the PREVIOUS frame's value — a one-frame phase lag on a 13s orbit,
 * imperceptible, and every consumer damps its response anyway.
 *
 *   x/y/z    world position of the hole's APPARENT center. The orbit
 *            displaces the VIRTUAL march camera by +o, which translates the
 *            marched hole content by −o at the sphere plane (holding the
 *            camera and moving the hole by −o is the equivalent transform) —
 *            so the point the eye tracks is group.position − orbitOffset,
 *            NOT the group anchor itself.
 *   strength 0..1 envelope = uFade × proximity (apparent center ↔ the fixed
 *            lockup anchor, in view-height fractions at the group plane).
 *   active   false whenever the island is faded out / gated off / unmounted.
 *
 * Consumers must treat activation edges as steps and damp with clamped dt.
 */
export const holeField = {
  active: false,
  x: 0,
  y: 0,
  z: 0,
  strength: 0,
};

/** Flyby proximity envelope — distance (view-height fractions at the group
 * plane) between the hole's apparent center and the fixed lockup anchor,
 * mapped 1→0 over [NEAR, FAR]. Derived from the shipped geometry (yFrac
 * −0.47, orbit radius 0.275 / bob 0.14, anchor +0.01 ≈ the wordmark's ~49vh
 * optical center after the owner's 5vh composition nudge — both moved
 * together, so the rest distance is unchanged at ≈0.48): nearest approach
 * d≈0.40 (bob up, orbit centered — the hole sits dead-center under the
 * lockup, first reached at oa=π ≈ 6.5s with the negated bob) → 1; far phase
 * d≈0.59 → 0; the t=0 rest pose d≈0.48 → ~0.58. No rect reads — pure orbit
 * arithmetic. */
const HOLE_ANCHOR_Y_FRAC = 0.01;

/** INSIDE-THE-HOLE intro pose (owner screenshot 2026-08-28). The hole rides
 * introZoomRef (1 = load hold, 0 = landed) through a TWO-LEG path:
 *   LOAD (gate 1, zoom 1): dist LOAD_DIST — maximum zoom, the disk spans
 *     ≈200vh and the frame sits fully inside it: black screen. MUST stay
 *     > 1 — the camera can never enter the unit sphere (FrontSide march).
 *   GATE 2 (zoom → KNOT): the hole barely recedes but SINKS — yFrac slides
 *     to G2_Y, so climbing out the enormous horizon FALLS below the brand:
 *     the drawn framing, a full-width arc ≈62vh down with the disk still
 *     ~200vh.
 *   GATE 3 (zoom KNOT → 0): recedes + rises to the tuned rest (`place.dist`
 *     / `place.yFrac`) — byte-identical framing at zoom 0.
 * Legs interpolate linearly in the (already leg-eased) zoom, meeting at the
 * KNOT pose — continuous by construction. KNOT mirrors gate 2's landing
 * fraction in SignatureLine's INTRO_CAM_GATES (0.39 / 0.52). */
/** GATE-1 SCALE of the whole hole (owner 2026-08-28: "devi semplicemente
 * ingrandire tutto il buco nero e rimpicciolirlo, così da simulare un'uscita
 * dal buco nero dal centro"). The group is scaled uniformly — the march runs
 * in OBJECT space (uCamLocal + normalized directions), so a uniform scale is
 * an exact magnification of the entire hole, event horizon included, with no
 * recalibration. At 9 the camera (rest distance 1.758) sits deep INSIDE the
 * proxy sphere and the black core alone spans ≈130vh: the screen is the
 * inside of the hole. It shrinks to 1 across gate 2 = the climb out. */
const INTRO_HOLE_SCALE_IN = 9;
/** Scale + height the hole LANDS ON at the end of its climb-out (the owner's
 * drawing): still enormous — photon ring ≈68vh radius, so a full-width arc
 * cresting ≈62vh down, well below the brand — and only the FINAL gate walks
 * it to the shipped size/position. Sized against the rest framing: at
 * dist 1.758 one world unit ≈ 61vh, ring radius ≈ 0.35·scale. */
const INTRO_HOLE_G2_SCALE = 6.5;
const INTRO_HOLE_G2_Y = -1.6;
/** DEPTH PUSH-BACK (owner 2026-08-28: "il buco nero dev'essere dietro anche
 * al logo… in modo che l'orbita non copra sopra il logo"). The magnified
 * proxy sphere is physically NEARER the camera than the opaque spore mark,
 * so the depth test lets it paint over the logo. Multiplying the group's
 * distance AND its scale by the same factor leaves the apparent size
 * mathematically unchanged (size ∝ scale/dist) while pushing the geometry
 * far behind the mark, where the depth test correctly hides it. Rides back
 * to 1 across the final gate, so the shipped hero pose is untouched. */
const INTRO_HOLE_DEPTH_K = 3;
/** Load-pose yFrac (owner screenshot pass 2): the hole's CENTER sits
 * full-screen BEHIND the forming SERSAN — "dobbiamo uscire dall'interno del
 * buco nero, dev'essere a pieno schermo il centro" — not parked low like
 * the rest pose. Gate 2 then sinks it from here to G2_Y. */
const INTRO_HOLE_LOAD_Y = 0;
const INTRO_HOLE_KNOT = 0.5;
/** EVENT-HORIZON radius during gate 1 (march units; the shipped rest value
 * is 0.13). THIS is what makes "siamo dentro il buco nero" literal: the
 * core is the only truly BLACK part of the march, and at 0.13 it can never
 * cover the frame from outside the unit proxy (max ≈27vh) — so the horizon
 * itself is swollen to nearly the whole sphere while the wordmark forms,
 * filling the screen with black, and shrinks back to 0.13 across gate 2 as
 * the hole recedes: the contour emerges exactly as the zoom-out starts
 * ("si rimpicciolisce e quindi si intravede il contorno"). Restored to the
 * factory value for the whole hero life. */
const HOLE_NEAR_FRAC = 0.4;
const HOLE_FAR_FRAC = 0.58;

/** Ignite ease-in (seconds): with the build deferred until the brand has
 * assembled, the horizon rises behind the formed wordmark over this window
 * instead of popping in on its first frame. Smoothstep-eased, composed
 * multiplicatively with the melt fade-out and the route reveal. */
const IGNITE_DURATION = 1.2;

/**
 * LITE march step (see the header): the SEQ low step, shared with
 * SequenceSingularity's scripted quality band. Kept as named constants here
 * so the fallback knob (48 / 0.01893) is a one-line swap.
 */
const HOME_LITE_ITER = SEQ.ITER_LO;
const HOME_LITE_STEP = SEQ.STEP_LO;
/**
 * DPR held while the lite eclipse can be visible.
 *
 * 1 → 1.25 (2026-09-09). The old value was chosen as the BOTTOM of the coarse
 * DPR range as it stood then ({1, 1, 1.5}); that range is now {1.5, 1, 2}
 * (tierStore detectDprRange — the owner's iPhone reports devicePixelRatio 3
 * and was rendering at 1.0), so leaving this at 1 would have pinned the phone
 * BELOW its own starting resolution for the whole intro — the one stretch of
 * the page the visitor actually stares at, and the stretch the "it doesn't
 * look like desktop" report is about. 1.25 is still a real cap, below the new
 * starting DPR, so the march keeps its fill-rate protection.
 *
 * It also un-breaks the release guard below, which compares dprCap BY VALUE:
 * at 1 this was indistinguishable from SEQ.LITE_DPR_CAP (also 1), so a
 * release here could clear a cap the passage had set. At 1.25 the two are
 * distinct again and the guard discriminates as its comment claims.
 */
const HOME_LITE_DPR_CAP = 1.25;

/**
 * Release the lite DPR cap — GUARDED on the store still holding OUR value, so
 * singularity-passage's caps (SEQ.LITE_DPR_CAP 1 / SEQ.DPR_CAP 1.5, written
 * far below the hero and cleared by the passage itself) are never clobbered.
 * One-shot per hold (the ref flips false first); a plain store write, never
 * per-frame.
 */
function releaseLiteCap(cappedRef: { current: boolean }): void {
  cappedRef.current = false;
  const ts = useTierStore.getState();
  if (ts.dprCap === HOME_LITE_DPR_CAP) ts.setDprCap(null);
}

export function HomeSingularity({ lite = false }: { lite?: boolean }) {
  const { camera, size, gl, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  /** True while THIS island holds tierStore.dprCap at HOME_LITE_DPR_CAP
   * (lite only). Cleared — guarded on the store still holding OUR value —
   * on the first visible→invisible edge after the eclipse has shown, on the
   * gate branch once it has shown, and on unmount. */
  const cappedRef = useRef(false);
  /** Set once the eclipse has actually been visible this build (lite: the
   * cap is only released after the beat, never on the pre-ignite frames). */
  const shownRef = useRef(false);

  // --- ARM on the assembleDone edge (regression fix — see the header) -------
  // Nothing below — not even the dynamic imports — may start before the
  // entry assemble has completed: the entry beat owns the GPU compile
  // window. Store subscription per the island conventions (no polling rAF,
  // no reactive hook in a hot path); assembleDone already true at mount
  // (in-page remount after the intro) arms immediately.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (useTextMorphStore.getState().assembleDone) {
      setArmed(true);
      return;
    }
    const unsub = useTextMorphStore.subscribe((s) => {
      if (s.assembleDone) {
        setArmed(true);
        unsub();
      }
    });
    return unsub;
  }, []);

  // --- Lazy build (three/webgpu chunk loads ONLY here, and only ARMED) ------
  const [build, setBuild] = useState<SingularityBuild | null>(null);
  useEffect(() => {
    if (!armed) return;
    if (!webgpuEnabled()) return;
    // Session-skipped intro: the eclipse exists ONLY for the brand-intro
    // beat — a visitor who skipped it must never pay the march compile.
    // (An Esc-skip DURING the entry never arms at all — assembleDone stays
    // false; a skip AFTER arming is handled by the frame loop.)
    if (useTextMorphStore.getState().introSkipped) return;
    let cancelled = false;
    let built: SingularityBuild | null = null;

    void Promise.all([
      import("three/webgpu"),
      import("three/tsl"),
      import("./singularity/blackHoleMaterial"),
    ])
      .then(([webgpu, tslNs, mod]) => {
        if (cancelled) return null;
        // TRUE WebGPU compute backend only — mirror of HeroTextParticles'
        // probe. The march itself would run on the WebGL2 fallback, but the
        // intro it accompanies never activates there: no intro, no eclipse.
        const bk = (gl as unknown as { backend?: { isWebGLBackend?: boolean } })
          .backend;
        const isWebGPUBackend =
          !!bk &&
          bk.isWebGLBackend !== true &&
          typeof (gl as unknown as { compute?: unknown }).compute ===
            "function";
        if (!isWebGPUBackend) return null;

        built = mod.createBlackHoleBuild(webgpu as never, tslNs as never);
        // INSTANCE-LEVEL backdrop overrides (see the LAYERING header note) —
        // the shared factory stays untouched, /audit keeps its exact behavior.
        built.material.depthWrite = false;
        built.material.side = THREE.FrontSide;
        // LITE march step (plan Phase 4b, capable phones only): iterations
        // and step move INVERSELY so the path product stays ≈1.82 (the
        // blackHoleMaterial contract; 64 × 0.0142 × 2 = 1.818). Fallback if
        // the Phase 6 measure fails: 48 with step 0.0071·128/48 ≈ 0.01893.
        // Desktop (lite=false) keeps the factory default 128 / 0.0071.
        if (lite) {
          built.u.uIterations.value = HOME_LITE_ITER;
          built.u.uStep.value = HOME_LITE_STEP;
        }

        // WARM the march pipeline before the mesh ever mounts: even armed
        // post-assemble, a synchronous first-frame compile would hitch the
        // still-gate-locked hold beat. renderer.compileAsync compiles the
        // holder against the LIVE scene (targetScene) so the compiled
        // variant matches the mounted one; on any failure we fall through —
        // the mesh then compiles on first render exactly like /audit.
        const compileAsync = (
          gl as unknown as {
            compileAsync?: (
              scene: THREE.Object3D,
              camera: THREE.Camera,
              targetScene?: THREE.Scene | null,
            ) => Promise<unknown>;
          }
        ).compileAsync;
        if (typeof compileAsync === "function") {
          const holder = new THREE.Mesh(built.geometry, built.material);
          return compileAsync.call(gl, holder, camera, scene).catch(() => {});
        }
        return null;
      })
      .then(() => {
        if (cancelled || !built) return;
        setBuild(built);
        // HOLD GATE signal (plan Phase 4b): the island is built, warmed and
        // ready to ignite behind the formed wordmark → tell the compact
        // auto-driver in HeroTextParticles it may start the melt once its
        // MINIMUM hold has elapsed (it otherwise waits, up to
        // AUTO_HOLD_MAX_S, so a slow phone never melts the brand over an
        // eclipse that has not risen). Written on the lite AND full path —
        // one store write per build; on desktop nothing reads it (the gate
        // is wheel-driven there). Reset false in this effect's cleanup and by
        // the provider's nav-into-home replay reset.
        useTextMorphStore.getState().setEclipseReady(true);
        // LITE dprCap (plan Phase 4b): hold the render DPR at 1 while the
        // eclipse can be visible. On coarse the DPR is already 1 at this
        // point (dprInitial 1), so the cap costs no realloc hitch during the
        // calm hold beat — it only prevents the monitor climbing to 1.25/1.5
        // under the fullscreen march. Released with a guard on the first
        // visible→invisible edge / unmount (see the frame loop + cleanup);
        // singularity-passage's own caps are written far below the hero, so
        // the two writers never overlap in time.
        if (lite) {
          useTierStore.getState().setDprCap(HOME_LITE_DPR_CAP);
          cappedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      built?.dispose();
      setBuild(null);
      shownRef.current = false;
      // HOLD GATE signal back to false: the island is disposing (unmount) or
      // rebuilding (dep change) — until the next build resolves there is no
      // eclipse ready to show, and the compact auto-driver must not read a
      // stale true. Plain store write, once per dispose.
      useTextMorphStore.getState().setEclipseReady(false);
      // Guarded clear (releaseLiteCap): only if the store still holds OUR
      // cap value — a passage cap of 1.5 is left alone; the passage clears
      // its own. Dead when not lite (cappedRef never true there).
      if (cappedRef.current) releaseLiteCap(cappedRef);
    };
  }, [armed, gl, camera, scene, lite]);

  // Pointer tracking for the parallax (refcounted window listener; no-op on
  // coarse pointers / reduced-motion — parallax simply stays centered there).
  useEffect(() => installPointerTracking(), []);

  // Flyby field lifecycle: dead the moment this island unmounts (route
  // change, tier drop) so no consumer ever leans toward a stale center.
  useEffect(
    () => () => {
      holeField.active = false;
      holeField.strength = 0;
    },
    [],
  );

  // --- Live placement knobs (lead fine-tunes the eclipse framing) -----------
  const placeRef = useRef({
    /** Camera→group distance (world units). Smaller = bigger on screen.
     * DEFAULT_DIST ≈ 1.758 → ~122vh apparent diameter (header arithmetic). */
    dist: DEFAULT_DIST,
    /** Horizontal offset as a fraction of the view width at the group plane.
     * 0 = dead center (the eclipse is symmetric under the wordmark). */
    xFrac: 0,
    /** Vertical offset as a fraction of the view HEIGHT at the group plane
     * (negative = down). −0.47 sinks the center 47vh below the viewport
     * center (was −0.42 — the owner's 2026-08-07 5vh composition nudge:
     * mark, wordmark and hole all move down together, so the hole keeps the
     * same relationship to the wordmark), putting the ring's upper arc at
     * ~76–85vh from the frame top and the core at the fold. */
    yFrac: -0.47,
  });

  // --- Live orbit knobs -----------------------------------------------------
  const orbitRef = useRef({
    /** Seconds per full lateral revolution. */
    period: ORBIT_PERIOD,
    /** Lateral (x/z) orbit radius, world units. */
    radius: ORBIT_RADIUS,
    /** Vertical bob amplitude, world units — runs at HALF the orbit rate. */
    bob: ORBIT_BOB,
  });

  // --- Per-frame scratch (no allocations in the loop) -----------------------
  const parallax = useRef({ x: 0, y: 0 });
  const revealDamped = useRef(0);
  const fadeRef = useRef(0);
  /** Orbit clock — accumulated clamped delta (sibling convention). */
  const clockRef = useRef(0);
  /** Ignite clock 0..1 — the ~1.2s rise behind the formed brand. Only
   * advances once the lifecycle gates pass, so it can never pre-burn while
   * the island is held invisible. */
  const igniteRef = useRef(0);

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group || !build) return;
    const delta = Math.min(rawDelta, 1 / 30);

    // --- Intro-lifecycle gates (getState reads — the island wedge rule) ----
    // active: the particle intro genuinely owns the hero (every fallback
    // path — mobile layout, fonts, build failure — leaves it false).
    // introSkipped: an Esc mid-intro pins domReveal at 1 anyway, but the
    // explicit check retires the march the same frame, no melt tail.
    // introComplete: hold behind the preloader curtain (HeroTextParticles'
    // own discipline) so the march never burns GPU under the cover.
    // PRE-INTRO (preloader v3, owner 2026-08-28): the hole is no longer held
    // behind the curtain — it IS the loading stage. Once its deferred build
    // lands it shows immediately, full-screen behind the forming SERSAN
    // ("dev'essere a pieno schermo il centro del buco nero, dietro la
    // scritta"), and the counter waits for it (preloader's eclipse hold).
    const preIntro = !useIntroStore.getState().introComplete;
    const morph = useTextMorphStore.getState();
    if (!morph.active || morph.introSkipped) {
      group.visible = false;
      holeField.active = false;
      holeField.strength = 0;
      // LITE: the beat is over for good on this branch (skipped / anchor
      // gone) — release the DPR cap (guarded, one-shot; dead when not lite).
      if (cappedRef.current) releaseLiteCap(cappedRef);
      return;
    }

    // --- Fade wiring: ignite × eased (1 − domReveal) × damped route reveal --
    // ignite: the ~1.2s smoothstep rise behind the already-formed brand
    // (the build is deferred until assembleDone, so the first visible frame
    // is always post-assemble — the horizon RISES, never pops). The melt is
    // a pure function of domReveal, so the reverse replay (scrolling back
    // to top re-engages the gate) brings the eclipse back exactly as the
    // brand re-forms — ignite is pinned at 1 by then. The damped
    // scrollStore.reveal ties entry to the route beat (audit's REVEAL_DAMP
    // grammar).
    igniteRef.current = Math.min(
      igniteRef.current + delta / IGNITE_DURATION,
      1,
    );
    const ignite = THREE.MathUtils.smoothstep(igniteRef.current, 0, 1);
    const melt =
      1 - THREE.MathUtils.smoothstep(morph.domReveal, MELT_START, MELT_END);
    revealDamped.current = THREE.MathUtils.damp(
      revealDamped.current,
      useScrollStore.getState().reveal,
      REVEAL_DAMP,
      delta,
    );
    // Hero hold (ECLIPSE_HERO_HOLD): scrollHeight is 1 (sentinel) before
    // SectionBus measures → scrollPx ≈ 0 → hold 1, permissive until measured.
    let heroHold = 1;
    if (ECLIPSE_HERO_HOLD) {
      const sh = useSectionStore.getState().scrollHeight;
      const scrollPx =
        useScrollStore.getState().progress * Math.max(sh - size.height, 0);
      heroHold =
        1 - THREE.MathUtils.smoothstep(scrollPx, 0, size.height * HERO_HOLD_VH);
    }
    // The route-reveal damping is SUPPRESSED pre-intro: SignatureLine parks
    // scrollStore.reveal at 0 while the preloader is up (the line must not
    // draw under the chrome), which would zero the eclipse exactly when it
    // is meant to be the stage.
    const opacity =
      ignite * melt * heroHold * (preIntro ? 1 : revealDamped.current);
    fadeRef.current = opacity;
    build.u.uFade.value = opacity;
    group.visible = opacity > 0.005;
    if (!group.visible) {
      holeField.active = false;
      holeField.strength = 0;
      // LITE: first visible→invisible edge AFTER the eclipse has shown (the
      // melt landed) → release the DPR cap. Pre-ignite frames (opacity still
      // rising from 0) never release: shownRef is only set below. The
      // `domReveal >= MELT_END` clause covers the beat that ended BEFORE the
      // island could ever show (a scroll-abort during the entry, a late
      // build): the melt is fully landed, the hole is invisible for good on
      // touch (the compact beat never rewinds gateProgress), so the cap
      // must not be held for the rest of the page. Guarded one-shot; dead
      // when not lite (cappedRef never true there).
      if (
        cappedRef.current &&
        (shownRef.current || morph.domReveal >= MELT_END)
      ) {
        releaseLiteCap(cappedRef);
      }
      return;
    }
    shownRef.current = true;

    // --- Pointer parallax: TRANSLATION ONLY (±PARALLAX_MAX, damped). The
    // group counter-moves (near-layer depth parallax); uCamLocal keeps the
    // march correct under any translation. -----------------------------------
    const ptr = usePointerStore.getState();
    const px = ptr.active ? (ptr.smooth.x - 0.5) * 2 : 0;
    const py = ptr.active ? (ptr.smooth.y - 0.5) * 2 : 0;
    parallax.current.x = THREE.MathUtils.damp(
      parallax.current.x,
      -px * PARALLAX_MAX,
      PARALLAX_DAMP,
      delta,
    );
    parallax.current.y = THREE.MathUtils.damp(
      parallax.current.y,
      py * PARALLAX_MAX,
      PARALLAX_DAMP,
      delta,
    );

    // --- Placement: CAMERA-LOCKED (see the header — a horizon, not a
    // section object). view height at the group plane = 2·tan(FOV/2)·dist.
    // The EFFECTIVE distance rides the intro zoom (see INTRO_DIST_IN): the
    // hole swallows the frame while we are "inside" it and slides to the
    // tuned rest as the camera climbs out; identical to before at zoom 0.
    const place = placeRef.current;
    // Two-leg intro pose (see INTRO_HOLE_*): gate 2 SINKS the huge horizon
    // below the brand, gate 3 releases it to the tuned rest.
    // The hole walks its OWN staircase (introHoleRef: 1 load → 0.5 the big
    // low gate-2 pose → 0 rest), so the logo gate's push-in never drags it
    // back up. KNOT is therefore the fixed 0.5 midpoint of that ref.
    const introZoom = introHoleRef.current;
    // THE CLIMB OUT (see INTRO_HOLE_SCALE_IN): distance and every march
    // constant stay exactly as tuned — only the group's SCALE rides the
    // intro zoom, so the hole is a magnified version of itself at gate 1
    // (camera inside it, black core over the whole frame) and shrinks to
    // its shipped size as the zoom lands. yFrac travels with it so the
    // centre starts behind the wordmark and settles into the rest framing.
    let introScale = 1;
    let introYFrac = place.yFrac;
    let depthK = 1;
    if (introZoom > 0) {
      if (introZoom >= INTRO_HOLE_KNOT) {
        // Leg A — the climb out of the centre: 9x → still-enormous G2 pose.
        const legT = (1 - introZoom) / (1 - INTRO_HOLE_KNOT);
        const e = legT * legT * (3 - 2 * legT);
        introScale = THREE.MathUtils.lerp(
          INTRO_HOLE_SCALE_IN,
          INTRO_HOLE_G2_SCALE,
          e,
        );
        introYFrac = THREE.MathUtils.lerp(INTRO_HOLE_LOAD_Y, INTRO_HOLE_G2_Y, e);
        depthK = INTRO_HOLE_DEPTH_K;
      } else {
        // Leg B — the final gate walks it to the shipped hero framing (and
        // the depth push-back back to 1: apparent size never jumps).
        const legT = 1 - introZoom / INTRO_HOLE_KNOT;
        const e = legT * legT * (3 - 2 * legT);
        introScale = THREE.MathUtils.lerp(INTRO_HOLE_G2_SCALE, 1, e);
        introYFrac = THREE.MathUtils.lerp(INTRO_HOLE_G2_Y, place.yFrac, e);
        depthK = THREE.MathUtils.lerp(INTRO_HOLE_DEPTH_K, 1, e);
      }
      // PITCH COMPENSATION (introHeadRaiseRef): the camera's head raise
      // pushes every world object DOWN in frame; adding the same fraction
      // back here cancels it for the eclipse alone, so the hole stays
      // pinned low while the rest of the scene tilts (owner 2026-08-28).
      introYFrac += introHeadRaiseRef.current;
    }
    introScale *= depthK;
    const introDist = place.dist * depthK;
    group.scale.setScalar(introScale);
    // Inside the proxy sphere only back faces are visible; outside, the
    // shipped FrontSide (see the layering note in the header).
    const desiredSide =
      introScale > introDist ? THREE.BackSide : THREE.FrontSide;
    if (build.material.side !== desiredSide) {
      build.material.side = desiredSide;
      build.material.needsUpdate = true;
    }
    const viewHAtGroup = 2 * TAN_HALF_FOV * introDist;
    const aspect = size.width / size.height;
    group.position.set(
      camera.position.x +
        place.xFrac * viewHAtGroup * aspect +
        parallax.current.x,
      camera.position.y + introYFrac * viewHAtGroup + parallax.current.y,
      camera.position.z - introDist,
    );
    // ROTATION/SCALE STAY IDENTITY FOREVER (translation only) — the raymarch
    // constants and the uCamLocal shortcut both depend on it. Never scale.

    // --- Slow continuous orbit → the VIRTUAL march camera (audit grammar:
    // circular x/z drift + half-rate bob; (cos − 1) keeps the offset zero at
    // t=0 so the rest framing matches the tuned placement; composed WITH the
    // pointer parallax — group translation and camera offset simply sum
    // inside uCamLocal). The silhouette never moves; the rays swim. --------
    clockRef.current += delta;
    const orbit = orbitRef.current;
    const oa = clockRef.current * ((Math.PI * 2) / orbit.period);
    const ox = Math.sin(oa) * orbit.radius;
    const oz = (Math.cos(oa) - 1) * orbit.radius;
    // Bob NEGATED (BUG-1 fix, owner live-review 2026-08-07): the apparent
    // center is group − offset, and the half-rate bob's first half-cycle
    // (oa/2 ∈ 0→π over the WHOLE first lateral orbit) kept oy ≥ 0 — the hole
    // could only sink AWAY from the lockup until the SECOND orbit, so the
    // first true near-approach (proximity → 1, the accretion capGate open)
    // landed at oa = 3π ≈ 19.5s at the 13s period and the first orbit never
    // captured. Flipping the phase (sin(x+π) = −sin(x); still exactly 0 at
    // t=0, rest framing byte-identical) makes the bob RISE toward the
    // wordmark through orbit 1: first full-strength near-approach at
    // oa = π ≈ t 6.5s — bob fully up AND laterally centered (sin(π) = 0),
    // ignite (1.2s) long complete. (Phases are keyed on oa, not wall time,
    // so the owner's 2026-08-09 period halving 26→13 rescaled them intact.)
    // Deliberate divergence from AuditSingularity's orbit grammar (twin
    // note): /audit has no accretion consumers, its bob direction is purely
    // aesthetic and stays as shipped.
    const oy = -Math.sin(oa * 0.5) * orbit.bob;
    // Intro calm (owner 2026-08-28: "né gravità sulla scritta, né orbita —
    // solo la rotazione su se stesso"): the orbit swim and the flyby pull
    // are damped to ZERO for the whole intro and ramp back quadratically as
    // the zoom lands — the disk's own spin lives in the march time uniform
    // and is untouched. Exactly 1 at rest ⇒ byte-identical after the intro.
    const introCalm = (1 - introHoleRef.current) ** 2;
    const cox = ox * introCalm;
    const coy = oy * introCalm;
    const coz = oz * introCalm;

    // --- Virtual march camera: real camera + orbit. The group carries
    // identity rotation and a UNIFORM scale, so worldToLocal degenerates to
    // subtract-then-divide — the division is what expresses the intro
    // magnification to the object-space march (1 at rest ⇒ the historic
    // exact subtraction). ---------------------------------------------------
    const camX = camera.position.x + cox;
    const camY = camera.position.y + coy;
    const camZ = camera.position.z + coz;
    build.u.uCamWorld.value.set(camX, camY, camZ);
    build.u.uCamLocal.value.set(
      (camX - group.position.x) / introScale,
      (camY - group.position.y) / introScale,
      (camZ - group.position.z) / introScale,
    );

    // --- Publish the flyby field (see the holeField doc above) --------------
    // Apparent center = group anchor MINUS the virtual-camera orbit offset
    // (the orbit swims the rays, not the silhouette — the content the eye
    // tracks translates by −offset). Proximity is the view-height-fraction
    // distance to the fixed lockup anchor at the group plane — pure
    // arithmetic on values already in hand, no rect reads.
    const ax = group.position.x - cox;
    const ay = group.position.y - coy;
    const az = group.position.z - coz;
    const hnx = (ax - camera.position.x) / viewHAtGroup;
    const hny = (ay - camera.position.y) / viewHAtGroup - HOLE_ANCHOR_Y_FRAC;
    const holeDist = Math.sqrt(hnx * hnx + hny * hny);
    const prox =
      1 - THREE.MathUtils.smoothstep(holeDist, HOLE_NEAR_FRAC, HOLE_FAR_FRAC);
    holeField.active = true;
    holeField.x = ax;
    holeField.y = ay;
    holeField.z = az;
    // Intro calm also gates the published pull: no gravity on the forming
    // brand while the intro runs (see the introCalm doc above).
    holeField.strength = opacity * prox * introCalm;
  });

  // Dev-only debug handle: live eclipse-framing knobs + uniform handles + a
  // screen projection of the group center (AuditSingularity's pattern).
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__sersanHomeSingularity = {
      place: placeRef.current,
      orbit: orbitRef.current,
      /** Live flyby publication (apparent center + envelope). */
      hole: holeField,
      get uniforms() {
        return build?.u ?? null;
      },
      get fade() {
        return fadeRef.current;
      },
      /** False until assembleDone armed the deferred build (regression fix). */
      armed,
      hasBuild: !!build,
      /** Plan Phase 4b: lite march step (ITER_LO/STEP_LO) + dprCap hold. */
      lite,
      get capped() {
        return cappedRef.current;
      },
      project: () => {
        const g = groupRef.current;
        if (!g || !g.visible) return null;
        const v = g.position.clone().project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      },
    };
  }

  if (!build) return null;

  return (
    <group ref={groupRef} visible={false}>
      {/* renderOrder −1: the backdrop convention — drawn before the wordmark
          particles / signature line so both settle IN FRONT of the glow
          (see the LAYERING header note for the paired material overrides). */}
      <mesh
        geometry={build.geometry}
        material={build.material}
        renderOrder={-1}
        frustumCulled={false}
      />
    </group>
  );
}
