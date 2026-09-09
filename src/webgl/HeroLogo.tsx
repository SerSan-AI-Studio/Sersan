"use client";

/**
 * Hero logo — the SERSAN mark as a GPGPU particle cloud that dissolves &
 * regenerates.
 *
 * THE ENGINE (post-C3 consolidation, restyle step 4, 2026-06-13)
 * --------------------------------------------------------------
 * Two render paths survive (the FBO ping-pong rigs and the sprite debug modes
 * `solid` / `both` / `particles` / `particles-2layer` were retired — see
 * gpgpu/gpgpuNodeSim.ts):
 *
 *   "spores" (DEFAULT) — TRUE-WebGPU compute only. Two shells of instanced
 *   SHADED OPAQUE icospheres (violet erodible crust + glowing cyan immortal
 *   core) over a solid occluder mark, driven by the storage-buffer momentum
 *   sim: the unified anchor-spring force model + cursor attractor (radial
 *   push² repulsion + orbital swirl) + the DDD life machine (hover erode,
 *   scroll-out burst, respawn/regrow).
 *
 *   "particles-static" — the analytic fallback (and a debug toggle): billboard
 *   sprites at their HOME positions (per-instance vec3 attribute), displaced
 *   ANALYTICALLY near the cursor in the vertex stage (lift + violet→cyan,
 *   eased hover). Stateless, no compute — robust on every backend. The spores
 *   mode DEGRADES to this automatically off true WebGPU.
 *
 * HOME (rest) positions are sampled on the GLB mesh SURFACE via
 * MeshSurfaceSampler (geometry/sersanMark.ts); the solid mesh is never drawn —
 * it feeds the sampler, the spore occluder slab and the invisible raycast
 * target.
 *
 * BACKEND SPLIT (the dual-import discipline, mirrors DriftParticles):
 *   flag OFF (WebGL2)  → synchronous GLSL static build
 *                        (gpgpu/gpgpuRenderShader.ts). Never imports
 *                        three/webgpu.
 *   flag ON  (WebGPU)  → lazy-imported TSL builds (gpgpu/gpgpuNodeSim.ts); the
 *                        heavy three/webgpu + three/tsl namespaces are imported
 *                        ONCE here and passed in, so they never reach the OFF
 *                        bundle. Spores additionally require the TRUE WebGPU
 *                        sub-backend (`backend.isWebGLBackend !== true` AND
 *                        `gl.compute` — storage indexing no-ops on the WebGL2
 *                        sub-backend, three #31221) and degrade to the static
 *                        build otherwise.
 *
 * INTEGRATION CONTRACT (kept verbatim across engine swaps):
 *  - announces heroReady on the first frame (arms the drag-capture layer),
 *    resets on unmount;
 *  - screen-anchored across the sticky spine pin (position relative to
 *    camera.position.y, worldViewWidth, the `hp` hero-span progress, the
 *    `fade = 1 - smoothstep(hp,0.74,0.97)` recede+fade handoff, group.visible);
 *  - delta clamp for tab-refocus stalls;
 *  - ANCHORED orientation: NO drag-to-rotate and NO idle spin — the mark sits
 *    still at its front-facing rest and only eases a few degrees toward the
 *    cursor (a soft mouse-parallax tilt, damped toward rest). The hero-hover
 *    layer feeds heroHoverStore.hovering (the repulsion gate); the old drag
 *    velocity channel was retired outright, so click-and-hold never moves
 *    the mark.
 *
 * FALLBACKS: tier `off` / reduced-motion never mounts this (Scene gates home →
 * HeroLogo to full/lite). Every degradation lands on the static build or, at
 * worst, nothing renders — no crash, and heroReady still fires so the
 * poster/drag handoff is unaffected.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SPINE_TRAVEL_VH } from "@/lib/spine";
import { CAMERA_Z, WORLD_VIEW_HEIGHT } from "./constants";
import { useTextMorphStore } from "./store/textMorphStore";
import {
  useIntroStore,
  introCamShiftRef,
  introZoomRef,
} from "./store/introStore";
import {
  sampleMarkHomePositions,
  type MarkHomeField,
} from "./geometry/sersanMark";
import {
  createGpgpuStaticBuild,
  type GpgpuStaticUniforms,
} from "./gpgpu/gpgpuRenderShader";
import {
  DEFAULT_GPGPU_CONFIG,
  SIZE_BY_TIER,
  SPORE_SIZE_BY_TIER,
  SPORE_LITE_RADIUS_SCALE,
  type GpgpuConfig,
  type GpgpuSimRig,
  type GpgpuTickParams,
} from "./gpgpu/gpgpuConfig";
import { getSporePreset } from "./gpgpu/sporePresets";
import { webgpuEnabled } from "./renderer/createRenderer";
import { useScrollStore } from "./store/scrollStore";
import { useTierStore, type SceneTier } from "./store/tierStore";
import { useFxStore } from "./store/fxStore";
import { useHeroHoverStore } from "./store/heroHoverStore";
import { usePointerStore } from "./store/pointerStore";
import { holeField } from "./HomeSingularity";
import { entryProgressRef } from "./HeroTextParticles";
import type { SectionAnchors } from "./hooks/useSectionAnchors";

interface HeroLogoProps {
  tier: Exclude<SceneTier, "off">;
  anchors: SectionAnchors;
}

/**
 * Resting tilt — a slight downward nod so the mark has depth/dimension but the
 * camera-facing FRONT plate stays clearly readable (like DDD's near-static "D").
 * The GLB's front face is +Z and the camera looks down −Z, so 0 yaw already
 * presents the mark face-on; we only add a small X tilt. This is the BASE rest
 * orientation; the mouse-parallax tilt below eases on top of it.
 *
 * Kept small (~4°) so the 1.62-unit-wide hexagon mark reads FACE-ON, not a
 * slanted box — at a larger near-plane scale a bigger tilt foreshortens the
 * plate and the mark stops looking like the mark.
 */
const TILT = THREE.MathUtils.degToRad(4);
/**
 * Mouse-parallax tilt — the mark is ANCHORED (no drag-to-rotate, no idle spin)
 * and only "looks toward" the cursor by a few degrees. The smoothed pointer
 * (normalized −1..1 from screen center) maps to a tiny target rotation
 * (rotY = pointerX·MAX, rotX = −pointerY·MAX) that the assembly DAMPS toward
 * each frame, easing back to the front-facing rest (0,0) when the pointer is
 * centered/absent. Live-tunable via fxStore.gpgpuTilt (default below).
 */
const TILT_DAMP = 3.5; // damp lambda — soft ease toward the pointer target

// --- Intro brand lockup (2026-08-07 v3, owner direction: mark ON TOP) -------
// While the particle "Sersan AI" wordmark owns the hero, the mark sits
// centered ABOVE it — mark leading, wordmark beneath, a classic vertical
// lockup — then FLIES to its hero-right rest as the brand melts into the DOM
// hero (a pure function of domReveal, so the reverse replay brings it back
// on top of the re-forming wordmark for free).
//
// Geometry behind the numbers (1440×810 reference desktop; WORLD_VIEW_HEIGHT
// ≡ 100vh at the z=0 content plane):
//   mark height = 2 (normalized) × WORLD_VIEW_HEIGHT·fx.heroScale(0.17)
//     × LOCKUP_SCALE(0.66) ≈ 2.51 world ≈ 22.4vh (~2% smaller apparent at
//     the lockup's z = heroPosZ −0.3), width ≈ 2.04 world.
// PLACEMENT IS CALIBRATED EMPIRICALLY, not from rect math: on the reference
// desktop the whole WebGL lockup renders ~19vh ABOVE the DOM-center mapping
// (browser-verified 2026-08-07 — the old flex-centered wordmark's particle
// render sat at ~31vh optical center, not 50vh), so a "pure" DOM-derived
// offset lands the mark clipped behind the header. The numbers below come
// from measuring the LIVE render AT LOCKUP_SCALE 0.58, then DERIVING the
// 0.66 deltas (owner 2026-08-07: mark a bit bigger; +0.08 scale = +2×1.902
// ×0.08 ≈ +0.30 world ≈ +2.7vh full height ⇒ ≈+1.4vh half-height — the
// lead re-verifies these clearances live): at −0.09 the mark's observed
// center stays ≈22vh from the frame top (offset unchanged); half-height
// grows 9.85 → ≈11.2vh, so top edge ≈12vh → ≈10.8vh (still clear of the
// ~7vh header band) and bottom ≈32vh → ≈33.2vh; the wordmark span
// (clamp(3.25rem, 9.5vw, 10rem), translated +13vh in
// cinematic-system-scroll) renders its text center ≈44vh, top ≈35.5vh ⇒
// the visible gap under the mark narrows ~4vh → ≈2.3vh, still clear,
// bottom ≈52.5vh — an upper-half-weighted lockup, both elements in frame
// with margin. The wordmark is width-clamped, so narrower windows only
// gain clearance.
/** Mark center offset from the viewport (camera) center, as a fraction of
 * WORLD_VIEW_HEIGHT — same screen-down-positive sign convention as
 * fx.heroOffsetY (the use site SUBTRACTS it: lockY = cam.y − WVH·offset),
 * so NEGATIVE parks the mark ABOVE center and moving toward 0 LOWERS it
 * (sign verified against the use site 2026-08-07 — "more negative" is
 * HIGHER, not lower). −0.09 → −0.04 (owner live-review 2026-08-07: nudge
 * the whole hero composition DOWN ~5vh on tall viewports — the DOM brand
 * translateY moved 13→18vh and the eclipse yFrac −0.42→−0.47 on the same
 * beat, so mark, wordmark and hole keep their relationships). Previous
 * calibration: −0.09 ⇒ observed mark center ≈22vh from the frame top (the
 * naive DOM-math value was −0.22 and clipped the mark behind the header);
 * −0.04 ⇒ ≈27vh, top edge ≈15.8vh — still well clear of the header band
 * (which is now hidden inside the hero anyway). */
const LOCKUP_OFFSET_Y = -0.04;
/** Mark scale at the lockup vs its hero rest — the mark leads the lockup
 * (owner 2026-08-07: mark on top, a bit bigger; wordmark a bit smaller —
 * raised again 0.58 → 0.66 the same day, "a bit bigger" round two):
 * ≈22.4vh tall against the wordmark's ≈16.9vh line. */
const LOCKUP_SCALE = 0.66;
/** Widest the mark may render, as a fraction of the visible frame width at
 *  its own distance (see the HORIZONTAL FIT block in the frame loop). 0.74
 *  leaves a real margin on a 375px phone for the spore crust, which blooms a
 *  few percent past the mesh silhouette during the intro regrow. Slack on
 *  every desktop aspect, where the height-derived scale binds first. */
const MARK_MAX_WIDTH_FRAC = 0.74;
/** Toward-camera z bulge (world units) at mid-flight of the lockup→hero
 * move, so it reads as the camera carrying the mark, not a flat slide. */
const FLIGHT_BULGE = 0.7;

/**
 * ONE-SHOT intro REFORM-from-nothing, on HARD site entry (the REVERSE of a
 * decompose — client 2026-06-29).
 *
 * While the preloader curtain is up the whole mark is held DEAD (burst pinned
 * at PEAK) so there is NOTHING behind it; when the curtain lifts the spores
 * respawn AT HOME and regrow from nothing into the solid logo. The EXPLODE is
 * the OTHER half of the arc — the scroll dissolve as you reach the end of the
 * hero (the `burst` window in the frame loop). All the burst beats (intro
 * reform, scroll explode, scroll-back regrow, and the ANTICIPATED crust
 * AUTO-BURST as the wordmark entry settles — one-shot per LOCKUP VISIT, see
 * the frame loop and fx.sporeAutoBurstAt) ride the SAME `uBurst`
 * mechanism (gpgpuNodeSim "disappear and regrow on top"), so they stay one
 * coherent system. Driven by a wall-clock (delta), NOT scroll, and composed with the
 * scroll burst via max(). Plays on HARD load only; a soft route re-entry just
 * shows the logo already present (no replay). The visible reform is the sim's
 * regrow bloom (~1s, paced by crust/core LIFE_REGROW in sporePresets — lower it
 * for a slower materialise). The core's stiffer spring + slower regrow
 * reassembles a beat behind the crust — a natural inside-out reform.
 */
// RETIMED (owner 2026-08-07: "il logo si genera troppo in ritardo rispetto
// alla scritta") — the mark's reform must complete BEFORE the wordmark
// finishes assembling, target ≈ fully formed at ~60–70% of the entry. The
// wordmark entry clock (HeroTextParticles ENTRY_DURATION 3.6s) is UNTOUCHED;
// only the mark's pace changed. RETIGHTENED (owner 2026-08-09 round 2:
// "l'esplosione delle spore dello strato esterno deve avvenire prima") — the
// crust auto-burst gates on INTRO_REFORM_RELEASE, so the reform was
// compressed again; the mark must still be VISUALLY WHOLE before its crust
// explodes. Arithmetic behind the current values:
//   release = HOLD 0.12 + RAMP 0.25 + BLOOM 1.7 = 2.07s ≈ 58% of 3.6s ✓
//   the respawn threshold (burst < 0.05) clears ≈0.33s in; the visible
//   regrow (default "explosive" crust LIFE_REGROW 0.7 × REGROW_SLOW 0.85)
//   then takes ≈1.7s ⇒ bloom completes ≈2.0s — the BLOOM window is sized
//   to the regrow it paces, exactly as the old 5.5s was to 0.7 × 0.3.
// Old → new: HOLD 0.35→0.12 · RAMP 0.4→0.25 · BLOOM 5.5→1.9→1.7 ·
// REGROW_SLOW 0.3→0.75→0.85 · BODY_REVEAL 2.2→0.8 (tail 35%→~39% of the
// arc — BODY_REVEAL was not retightened when BLOOM took its second cut).
const INTRO_REFORM_PEAK = 0.92; // burst that holds the mark as NOTHING (1 = gone)
const INTRO_REFORM_HOLD = 0.12; // s held as nothing after the curtain lifts (was 0.35)

// ---- PRELOADER v3 (owner 2026-08-28): out of the black hole ---------------
// Gate 1 (the load, on the near-black stage) belongs to the SERSAN wordmark
// alone — this mark is DEAD the whole time: PRIME kills the seeded-alive
// spores unseen (envelope PEAK, group hidden) and they wait parked in the
// regrow queue at rate 0. The introComplete edge then starts the reform
// CLOCK: the full-rate regrow bloom (~1.4s) IS the gate-2 "il logo si
// genera", the burst countdown fires the explosion as it completes, and the
// camera (SignatureLine's INTRO_CAM_GATES) frames the whole thing on its
// zoom-out to 39%. All on the sim's EXISTING uniforms — no new sim path.
const INTRO_PRIME_S = 0.55; // s of hidden kill before the spores can park
// INSIDE-THE-HOLE rework (owner concept 2026-08-28): the mark stays DEAD
// through the whole load — gate 1 on the black belongs to the SERSAN
// wordmark alone — and its reform CLOCK starts on the introComplete edge:
// the ~1.4s regrow bloom at full rate IS the "il logo si genera" the
// camera's gate-2 zoom-out frames, and the burst countdown below fires the
// explosion as it completes.
/** Seconds after the introComplete edge before the crust AUTO-BURST fires —
 * sized to the reform bloom's completion, inside gate 2 of SignatureLine's
 * INTRO_CAM_GATES. */
const INTRO_BURST_AT_S = 4.2;
/** INTRO LOCKUP SPREAD (fraction of WORLD_VIEW_HEIGHT, owner 2026-08-28:
 * "il logo è troppo vicino alla scritta, dovrebbe stare più in alto
 * all'inizio — essendo che iniziamo con uno zoom, c'è più distanza tra un
 * oggetto e l'altro a linea d'aria"). The mark sits HIGHER in world space
 * for the whole zoomed-in phase, so the camera's head-raise lands it
 * centred while the wordmark and the eclipse sink out of frame below — the
 * rigid-camera physics the owner asked for. Rides introZoomRef down to 0,
 * so the shipped lockup is exactly what the hero rests on. */
const INTRO_MARK_RAISE = 0.13;
/** Seconds (at the END of the reform clock) over which the dark occluder
 * body fades back in — kept late so the generation reads as particles
 * forming from nothing with the body filling in behind. */
const INTRO_REFORM_BODY_AT_S = 0.8;
const INTRO_REFORM_RAMP = 0.25; // s to drop burst→0, releasing the regrow bloom (was 0.4)
const INTRO_REFORM_BLOOM = 1.7; // s the materialise bloom is given to finish (was 5.5, then 1.9)
/** Clock value past which the intro is fully over (burst 0 + regrow restored).
 * v2: the clock no longer RUNS on hard loads (the counter scrub supersedes
 * it) — it jumps straight here on the introComplete edge, because the
 * auto-burst machinery and the lockup-replay reset still key on it. */
const INTRO_REFORM_RELEASE =
  INTRO_REFORM_HOLD + INTRO_REFORM_RAMP + INTRO_REFORM_BLOOM;

// EXPLODE (scroll-out) — STAGGERED so the OUTER crust expands BEFORE the inner
// core (client: "lo strato di sopra inizia ad espandersi prima di quello di
// sotto"). The crust scatters on a tight hp window; the core only STARTS later
// and completes by the end of the hero. The dark occluder body follows the
// (trailing) core so it stays solid behind the crust as that leads off.
const EXPLODE_CRUST_END = 0.78; // hp by which the outer crust is fully scattered
const EXPLODE_CORE_LAG = 0.33; // hp at which the inner core only STARTS to go
const EXPLODE_CORE_END = 1.0; // hp by which the core is fully scattered

// (v2: the clock-driven reform envelope was removed — the PRIME/GROW scrub
// in the frame loop drives the same uniforms from the live counter instead.)

/**
 * ONE-SHOT crust AUTO-BURST envelope (owner 2026-08-07) vs seconds since the
 * intro-completion trigger: 0 → PEAK over RAMP (the visible center-out
 * explosion — the sim's burst term is already a radial push from the model
 * CENTER, `pos.normalize() · uBurst`, per-spore staggered; no pointer-radius
 * semantics anywhere near it), held at PEAK for HOLD so the staggered kill
 * clears the whole crust, then → 0 over FALL. Dropping under the sim's 0.05
 * respawn threshold is what releases the standard LIFE_REGROW-paced regrowth
 * — the exact "disappear and regrow on top" release the intro reform and the
 * scroll-back regrow already use. t < 0 = not fired → 0. All four shape
 * params are live fxStore knobs (sporeAutoBurst* in __sersanFx).
 */
function autoBurstEnvelope(
  t: number,
  peak: number,
  ramp: number,
  hold: number,
  fall: number,
): number {
  if (t < 0) return 0;
  if (t < ramp) return peak * THREE.MathUtils.smoothstep(t, 0, ramp);
  const tf = t - ramp - hold;
  if (tf < 0) return peak;
  return peak * (1 - THREE.MathUtils.smoothstep(tf, 0, fall));
}

/** The Blender-built SERSAN mark. Geometry-only (no materials). */
const MARK_GLB = "/models/sersan-mark.glb";
/** Normalize the GLB to ~2 world units tall (same envelope as the old
 * procedural mark, so the anchoring/scale math is unchanged). */
const TARGET_HEIGHT = 2;
useGLTF.preload(MARK_GLB);

/** Cursor far away → repulsion vanishes (pointer-leave / coarse pointer). */
const MOUSE_OFF = new THREE.Vector3(1e9, 1e9, 1e9);

/**
 * TSL STATIC build (the home-position billboards, analytic dispersion). Shape
 * mirrors createStaticParticleNodeBuild's return, loose-typed because the
 * builder module is loose-typed for the lazy dual-import discipline.
 */
interface TslStatic {
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.Material;
  uFade: { value: number };
  uPointSize: { value: number };
  uPixelRatio: { value: number };
  uViewport: { value: THREE.Vector2 };
  uEmissive: { value: number };
  uPointAlpha: { value: number };
  uMouse: { value: THREE.Vector3 };
  uHover: { value: number };
  uTime: { value: number };
  uRadius: { value: number };
  uPush: { value: number };
  dispose: () => void;
}

export function HeroLogo({ tier, anchors }: HeroLogoProps) {
  const { camera, size, gl, raycaster } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const assemblyRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const fadeRef = useRef(1);
  // Lockup flight follower — damps the store-fed flight target so the two
  // discontinuous edges (particle build resolving AFTER the preloader lifts
  // on a slow GLB load, and the nav-into-home replay reset publishing
  // domReveal 1→0) glide instead of snapping the mark across the frame.
  const flightRef = useRef(1);
  // One-shot: on the introComplete edge of a HARD load, any residual flight
  // glide is snapped to its target under the just-opening crossfade, so the
  // mark sits exactly on the rect the preloader's FLIP aimed at (published
  // from the TARGET pose below — a fast repeat visit can reveal while the
  // damp is still mid-glide). Soft entries never arm the FLIP → never snap.
  const introFlightSnapped = useRef(false);
  const simTimeRef = useRef(0);
  const announcedReady = useRef(false);
  // Legacy intro REFORM clock (seconds). v2: it no longer RUNS on hard loads
  // (the counter scrub supersedes it) — it stays -1 through the load and
  // jumps straight to INTRO_REFORM_RELEASE on the introComplete edge, so the
  // auto-burst machinery and the lockup-replay reset keep their invariants.
  const introReformClock = useRef(-1);
  // PRIME clock (seconds) for the v2 materialisation: -1 until the spore
  // build lands on a hard load, then counts to INTRO_PRIME_S while the
  // seeded-alive spores are killed UNSEEN (group hidden) and parked in the
  // regrow queue. Never runs on soft entries or the static fallback.
  const introPrimeClock = useRef(-1);
  // Entry type, snapshotted on the first frame: true ⇒ soft route re-entry
  // (introComplete already true → no intro replay); false ⇒ hard load.
  const softEntryRef = useRef(false);
  // Crust auto-burst clock (seconds since the trigger; -1 = armed, not
  // fired). Fired by the intro-completion edge in the frame loop below,
  // plays the fxStore-tunable ramp/hold/fall envelope, then holds spent —
  // the clock never returns to -1, but a SPENT clock resets to 0 when the
  // intro reverse-replay carries the mark back to the centered lockup
  // (one-shot per LOCKUP VISIT, owner 2026-08-09 round 2). Soft route
  // re-entry never arms it; the dev re-fire knob resets the clock directly.
  const autoBurstClock = useRef(-1);
  // Gate-2 burst countdown (s since the introComplete edge; -1 = not armed).
  // Armed by the completion edge below; fires the auto-burst clock once it
  // reaches INTRO_BURST_AT_S — the crust explosion lands ON the logo gate.
  const introBurstDelay = useRef(-1);
  // Static/WebGL2 gate-2 reveal clock (s since the completion edge, capped):
  // the fallback mark's fade-in analog of the spores' generation.
  const staticRevealClock = useRef(0);
  // Last-seen fx.sporeAutoBurstFire (null until the first spores frame, so a
  // pre-bumped store value can never fire spuriously on mount) — any NEW
  // value re-fires the envelope for live tuning.
  const autoBurstFireSeen = useRef<number | null>(null);
  // Eased global hover intensity for the analytic-dispersion static render:
  // target 1 while hovering, 0 otherwise; damped so the lift fades in/out and
  // the particles settle back softly when the cursor leaves.
  const hoverRef = useRef(0);
  // Damped flyby envelope (0..1) — follows holeField.strength with a clamped-
  // dt damp so the eclipse's activation/retirement edges never step the
  // crust's lean (the publication itself is smooth; this covers the edges).
  const holeEnvRef = useRef(0);

  // Render mode (fxStore). Subscribed REACTIVELY so toggling it live
  // (window.__sersanFx.getState().set({ heroRenderMode: "..." })) re-renders
  // the component and mounts/unmounts the particle meshes accordingly.
  const heroRenderMode = useFxStore((s) => s.heroRenderMode);
  // Explicit static debug toggle (also the shape of every degradation).
  const showStatic = heroRenderMode === "particles-static";
  // SPORES: the DDD-correct shipping render — instanced SHADED icospheres on
  // the compute sim + a solid occluder mark (bundle teardown, see gpgpuConfig).
  const showSpores = heroRenderMode === "spores";
  // Active VARIANT (Logo Lab): the whole spore look — colours, physics, hover
  // feel, regrow speed, single/double shell. Subscribed REACTIVELY so the
  // picker re-renders the component and the build effect rebuilds the rig.
  const heroPreset = useFxStore((s) => s.heroPreset);
  const preset = useMemo(() => getSporePreset(heroPreset), [heroPreset]);
  // Spore mode needs TRUE WebGPU compute. Flag-OFF (plain WebGL2 renderer) is
  // known synchronously; the WebGPURenderer's WebGL2 sub-backend is detected in
  // the spore build effect (async) and flips this state. Either way the mode
  // DEGRADES to the robust static-particle mark instead of going blank.
  const [sporeBackendFallback, setSporeBackendFallback] = useState(false);
  const sporeStaticFallback =
    showSpores && (!webgpuEnabled() || sporeBackendFallback);
  // The static build serves two masters: the explicit debug mode and the
  // spores degradation path.
  const showStaticBuild = showStatic || sporeStaticFallback;

  const worldViewWidth = WORLD_VIEW_HEIGHT * (size.width / size.height);

  // Static-fallback grid size for the active tier (full 448², lite 224²).
  // The BACKEND-FALLBACK path gets an honest budget instead of the tier's: it
  // only engages because the WebGPU renderer resolved to its WebGL2 sub-backend
  // — i.e. a weak/older GPU — and detectTier() returns "full" for any fine-
  // pointer viewport ≥768px without ever consulting GPU strength. Sampling 448²
  // (≈200k) there stalls exactly the machines least able to absorb it; lite
  // (224² ≈ 50k) is ~4× less work.
  const gridSize = sporeStaticFallback
    ? SIZE_BY_TIER.lite
    : (SIZE_BY_TIER[tier] ?? SIZE_BY_TIER.lite);

  // === Geometry: the Blender-built mark (sampled, NEVER rendered). ==========
  // drei caches the loaded geometry across remounts, so we CLONE it and only
  // ever mutate/dispose the clone — never the shared cached `src.geometry`.
  const { nodes } = useGLTF(MARK_GLB) as unknown as {
    nodes: Record<string, THREE.Object3D>;
  };
  const bodyGeometry = useMemo(() => {
    const src = Object.values(nodes).find(
      (n) => (n as THREE.Mesh).isMesh,
    ) as THREE.Mesh | undefined;
    if (!src) {
      throw new Error(`HeroLogo: no mesh found in ${MARK_GLB}`);
    }

    // Clone so the normalization below cannot touch drei's cached geometry.
    const geometry = src.geometry.clone();

    // Center, then uniformly scale to ~TARGET_HEIGHT tall, recenter — the SAME
    // envelope the procedural mark produced, so the anchoring math is unchanged.
    geometry.center();
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (bbox) {
      const height = bbox.max.y - bbox.min.y || 1;
      const s = TARGET_HEIGHT / height;
      geometry.scale(s, s, s);
    }
    geometry.center();
    return geometry;
  }, [nodes]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  /**
   * The mark's WIDTH in world units at group scale 1 — measured, not assumed.
   * The normalisation above fixes the HEIGHT (TARGET_HEIGHT) and lets the
   * width fall where the artwork puts it, so this is the only honest source
   * for the horizontal fit below. Recomputed only when the geometry changes.
   */
  const markWorldWidth = useMemo(() => {
    bodyGeometry.computeBoundingBox();
    const b = bodyGeometry.boundingBox;
    return b ? Math.max(b.max.x - b.min.x, 1e-4) : TARGET_HEIGHT;
  }, [bodyGeometry]);

  // === Raycast-target material ==============================================
  // The invisible cursor-raycast mesh needs SOME material on both backends
  // (never drawn — visible:false; the raycaster ignores visibility). Basic so
  // the WebGPU renderer auto-converts it without scene-lighting dependencies.
  const raycastMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0x2a7fff }), // value now blue (was violet 0x7c5cff)
    [],
  );
  useEffect(() => () => raycastMaterial.dispose(), [raycastMaterial]);

  // === Home positions: SIZE×SIZE surface samples → the rest field. ==========
  // homeRGBA seeds the per-instance aHome attribute; aRef is the per-instance
  // grid UV (hashed for size variance). The mesh is unrendered. GATED on the
  // static build actually being shown (448² ≈ 200k samples is real startup
  // work — don't pay it under the shipping spores mode).
  // NOT a useMemo: the sampling is a rejection loop over gridSize² surface
  // samples (hundreds of ms), and the flip that turns it on
  // (setSporeBackendFallback from the ASYNC backend probe) is a state set — so a
  // memo body ran it synchronously INSIDE a React commit, freezing the main
  // thread (and the shared Lenis/R3F loop with it) right across the preloader
  // handoff. The rAF defers the work past the commit so the frame that flips the
  // fallback still paints. Consumers already tolerate `null` (it is null for the
  // whole spores path), so the one-frame delay is safe. The spore home fields
  // below defer through this SAME mechanism — see sporeHomes.
  const [homeField, setHomeField] = useState<MarkHomeField | null>(null);
  useEffect(() => {
    if (!showStaticBuild) {
      setHomeField(null);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      setHomeField(sampleMarkHomePositions(bodyGeometry, gridSize));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [bodyGeometry, gridSize, showStaticBuild]);

  // Spore home fields — TWO shells on their own (smaller) grid: the erodible
  // violet CRUST outside + the immortal glowing cyan CORE inset beneath it
  // (f_007: the revealed layer is the same spore material, lit). Gated on the
  // mode so the sampling cost isn't paid by the fallback path.
  const sporeGridSize = SPORE_SIZE_BY_TIER[tier] ?? SPORE_SIZE_BY_TIER.lite;
  // One home field per ACTIVE-PRESET layer (1 or 2). Variant switch → `preset`
  // changes → new array reference → the build effect below rebuilds the rig.
  // NOT a useMemo, for the SAME reason as homeField above: the sampling is a
  // rejection loop over layers × sporeGridSize² surface samples, and a memo
  // body ran it synchronously INSIDE a React commit — on first mount (exactly
  // the preloader-handoff beat) and again on every Logo Lab preset switch —
  // freezing the main thread (and the shared Lenis/R3F loop with it). The rAF
  // defers the work past the commit; the build effect below already tolerates
  // the gap (it bails on `!sporeHomes` and re-fires when the fields land, with
  // the occluder mark rendering meanwhile). Same cancellation guard as
  // homeField: a re-run/unmount cancels the pending rAF so a superseded
  // sampling run can never land.
  const [sporeHomes, setSporeHomes] = useState<MarkHomeField[] | null>(null);
  useEffect(() => {
    if (!showSpores || sporeStaticFallback) {
      setSporeHomes(null);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      setSporeHomes(
        preset.layers.map((l) =>
          sampleMarkHomePositions(bodyGeometry, sporeGridSize, l.sampling),
        ),
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [bodyGeometry, sporeGridSize, showSpores, sporeStaticFallback, preset]);

  // Base spore radius in MODEL space: DDD's diameter ≈ markHeight/47, scaled up
  // on lite (fewer but bigger, like DDD mobile). fx.sporeSize multiplies live.
  // Taken from the OUTER layer so the per-preset diameter applies to both.
  const sporeBaseRadius =
    ((TARGET_HEIGHT * preset.layers[0].spore.DIAMETER_RATIO) / 2) *
    (tier === "lite" ? SPORE_LITE_RADIUS_SCALE : 1);

  // Solid GLOWING occluder under the spore crust (the DDD "SOLID.buf" trick):
  // the interior revealed when spores disperse. toneMapped:false so any HDR
  // values survive into the bloom pass (same discipline as the particle
  // materials). Color is written per frame from the ACTIVE variant's
  // `preset.occluder` (base × fade) so the opaque mesh follows the scroll fade
  // and recolours instantly on a Logo Lab switch.
  const sporeOccluderMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
    m.toneMapped = false;
    // Transparent so the scroll-out burst can fade the solid slab away while
    // its spore shells scatter (opacity driven per frame).
    m.transparent = true;
    return m;
  }, []);
  useEffect(() => () => sporeOccluderMaterial.dispose(), [sporeOccluderMaterial]);

  // Depth-only occluder for the STATIC fallback path (PIANO_FIX_VISUAL FIX 1a
  // fallback). The static particle build is additive with depthWrite:false, and
  // the spore occluder above is NOT mounted on this path — so with the line now
  // depthTest:true there would be nothing for it to test against and it would
  // float back over the static mark. This invisible mesh (colorWrite:false →
  // writes ONLY depth, no color, no visual change to the particle look) supplies
  // the solid mark-shaped depth footprint the line tests against, exactly like
  // the spore occluder does on the WebGPU path. Opaque so it draws before the
  // transparent line; visibility/depthWrite are gated by the scroll fade per
  // frame so the line can draw through once the mark recedes and leaves.
  const staticOccluderMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.colorWrite = false; // depth-only: no color output, mark look unchanged
    m.depthWrite = true;
    m.depthTest = true;
    m.toneMapped = false;
    return m;
  }, []);
  useEffect(
    () => () => staticOccluderMaterial.dispose(),
    [staticOccluderMaterial],
  );

  // Static-build config (defaults + the live leva knobs applied per frame).
  const config = useMemo<GpgpuConfig>(
    () => ({ ...DEFAULT_GPGPU_CONFIG, SIZE: gridSize }),
    [gridSize],
  );

  // === STATIC build =========================================================
  // OFF → synchronous GLSL static build; ON → lazy TSL static build (same
  // dual-import discipline as the spore build). Reads POSITION from a
  // per-instance `aHome` vec3 attribute — no sim, no storage buffers.
  interface GlslStatic {
    geometry: THREE.InstancedBufferGeometry;
    material: THREE.ShaderMaterial & { uniforms: GpgpuStaticUniforms };
    uniforms: GpgpuStaticUniforms;
    dispose: () => void;
  }
  const [glslStatic, setGlslStatic] = useState<GlslStatic | null>(null);
  useEffect(() => {
    if (webgpuEnabled() || !showStaticBuild || !homeField) return;
    const build = createGpgpuStaticBuild(
      config,
      homeField.homeRGBA,
      homeField.aRef,
      homeField.count,
    );
    setGlslStatic(build);
    return () => {
      build.dispose();
      setGlslStatic(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStaticBuild, gridSize, homeField]);

  const [tslStatic, setTslStatic] = useState<TslStatic | null>(null);
  useEffect(() => {
    if (!webgpuEnabled() || !showStaticBuild || !homeField) return;
    let cancelled = false;
    let built: TslStatic | null = null;
    void Promise.all([
      import("three/webgpu"),
      import("three/tsl"),
      import("./gpgpu/gpgpuNodeSim"),
    ]).then(([webgpu, tslNs, mod]) => {
      if (cancelled) return;
      const b = mod.createStaticParticleNodeBuild(
        webgpu as never,
        tslNs as never,
        homeField.homeRGBA,
        homeField.aRef,
        homeField.count,
        config,
      );
      built = {
        geometry: b.geometry as unknown as THREE.InstancedBufferGeometry,
        material: b.material as unknown as THREE.Material,
        uFade: b.uFade,
        uPointSize: b.uPointSize,
        uPixelRatio: b.uPixelRatio,
        uViewport: b.uViewport as unknown as { value: THREE.Vector2 },
        uEmissive: b.uEmissive,
        uPointAlpha: b.uPointAlpha,
        uMouse: b.uMouse as unknown as { value: THREE.Vector3 },
        uHover: b.uHover,
        uTime: b.uTime,
        uRadius: b.uRadius,
        uPush: b.uPush,
        dispose: b.dispose,
      };
      setTslStatic(built);
    });
    return () => {
      cancelled = true;
      built?.dispose();
      setTslStatic(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStaticBuild, gridSize, homeField]);

  // === SPORE build (spores) ==================================================
  // Unified compute sim + instanced SHADED icospheres — TRUE WebGPU sub-backend
  // ONLY (storage-buffer compute no-ops on the WebGL2 fallback, three #31221).
  // On any other backend the mode degrades to the static-particle mark above
  // (no crash, no blank canvas).
  interface TslSpore {
    rig: GpgpuSimRig;
    geometry: THREE.InstancedBufferGeometry;
    material: THREE.Material;
    uFade: { value: number };
    uSporeRadius: { value: number };
    uEmissive: { value: number };
    uOrbit: { value: number };
    uOrbitFalloff: { value: number };
    uBurst: { value: number };
    uRegrowScale: { value: number };
    uHole: { value: THREE.Vector3 };
    uHoleStrength: { value: number };
    uHolePull: { value: number };
    uHoleRadius: { value: number };
    uHoleCapture: { value: number };
    uHoleKillRadius: { value: number };
    dispose: () => void;
  }
  const [tslSpore, setTslSpore] = useState<TslSpore[] | null>(null);
  useEffect(() => {
    if (!webgpuEnabled() || !showSpores || !sporeHomes) return;
    // Deferred-pair gate: on a preset/tier switch this effect re-runs one
    // commit BEFORE the rAF-deferred re-sampling above lands, still holding the
    // PREVIOUS inputs' fields. Never build from a mismatched SHAPE — a 1↔2
    // layer switch would index past the array, and a grid change would seed
    // SIZE²-sized buffers from the old grid's homeRGBA. Bail; the effect
    // re-fires when the matching sporeHomes state lands.
    if (
      sporeHomes.length !== preset.layers.length ||
      sporeHomes[0].size !== sporeGridSize
    )
      return;
    let cancelled = false;
    let built: TslSpore[] | null = null;
    void Promise.all([
      import("three/webgpu"),
      import("three/tsl"),
      import("./gpgpu/gpgpuNodeSim"),
    ]).then(([webgpu, tslNs, mod]) => {
      if (cancelled) return;
      // TRUE WebGPU sub-backend detection. The WebGPU backend leaves
      // `isWebGLBackend` UNDEFINED; only the WebGL backend sets it `true`. So
      // "is WebGPU" = backend present, NOT the WebGL backend, AND the renderer
      // exposes `compute`. (`=== false` was wrong: undefined !== false.)
      const bk = (gl as unknown as { backend?: { isWebGLBackend?: boolean } })
        .backend;
      const isWebGPUBackend =
        !!bk &&
        bk.isWebGLBackend !== true &&
        typeof (gl as unknown as { compute?: unknown }).compute === "function";
      if (!isWebGPUBackend) {
        // WebGL2 sub-backend: storage compute no-ops there (#31221) → degrade
        // the spores mode to the static-particle mark instead of going blank.
        setSporeBackendFallback(true);
        return;
      }
      // The ACTIVE variant's layers (1 = no outer crust, 2 = crust + core).
      const defs = preset.layers;
      built = defs.map((layer, i) => {
        const cfg: GpgpuConfig = { ...layer.config, SIZE: sporeGridSize };
        const b = mod.createSporeComputeNodeBuild(
          gl as never,
          webgpu as never,
          tslNs as never,
          sporeHomes[i].homeRGBA,
          sporeHomes[i].aRef,
          sporeGridSize,
          cfg,
          layer.spore,
          sporeBaseRadius,
        );
        return {
          rig: b.rig,
          geometry: b.geometry as unknown as THREE.InstancedBufferGeometry,
          material: b.material as unknown as THREE.Material,
          uFade: b.uFade,
          uSporeRadius: b.uSporeRadius,
          uEmissive: b.uEmissive,
          uOrbit: b.uOrbit,
          uOrbitFalloff: b.uOrbitFalloff,
          uBurst: b.uBurst,
          uRegrowScale: b.uRegrowScale,
          uHole: b.uHole as unknown as { value: THREE.Vector3 },
          uHoleStrength: b.uHoleStrength,
          uHolePull: b.uHolePull,
          uHoleRadius: b.uHoleRadius,
          uHoleCapture: b.uHoleCapture,
          uHoleKillRadius: b.uHoleKillRadius,
          dispose: b.dispose,
        };
      });
      setTslSpore(built);
    });
    return () => {
      cancelled = true;
      built?.forEach((b) => b.dispose());
      setTslSpore(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sporeGridSize, sporeHomes, showSpores, preset]);

  // Active static build. OFF → GLSL; ON → TSL once resolved.
  const staticGeometry = glslStatic?.geometry ?? tslStatic?.geometry;
  const staticMaterial = (glslStatic?.material ?? tslStatic?.material) as
    | THREE.Material
    | undefined;

  // Reset the poster cross-fade if this component unmounts (tier change).
  useEffect(
    () => () => {
      useTierStore.getState().setHeroReady(false);
      announcedReady.current = false;
    },
    [],
  );

  // === Per-frame: shell choreography + model-space mouse + sim step =========
  // Scratch objects (no per-frame allocation).
  const planeN = useMemo(() => new THREE.Vector3(), []);
  /** Scratch for the camera's world-space view axis (the counter-roll axis). */
  const viewAxis = useMemo(() => new THREE.Vector3(), []);
  const worldHit = useMemo(() => new THREE.Vector3(), []);
  const worldCenter = useMemo(() => new THREE.Vector3(), []);
  const plane = useMemo(() => new THREE.Plane(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const modelMouse = useMemo(() => new THREE.Vector3(), []);
  // Flyby attractor in the mark's MODEL space (parked far away until the
  // eclipse actually publishes — with the envelope at 0 both shader terms
  // are exactly zero regardless).
  const holeLocal = useMemo(() => new THREE.Vector3(1e9, 1e9, 1e9), []);
  const tickParams = useMemo<GpgpuTickParams>(
    () => ({ dt: 1 / 60, time: 0, mouse: new THREE.Vector3() }),
    [],
  );
  const raycastHits = useMemo<THREE.Intersection[]>(() => [], []);
  // Invisible raycast target — the SAME normalized mark geometry under the SAME
  // spin transform, so a cursor ray returns the exact surface point being
  // pointed at. Fixes the parallax of the old plane-through-CENTER projection:
  // with the mark high in the viewport, the center-depth plane hit lands a few
  // tenths BELOW where the cursor visually sits on the front plate (user
  // report: parked cursor on the top bar eroded nothing).
  const raycastTargetRef = useRef<THREE.Mesh>(null);
  // Model-space z of the front plate — the plane fallback (cursor just off the
  // letter silhouette) passes through the FRONT FACE, not the center.
  const markFrontZ = useMemo(() => {
    bodyGeometry.computeBoundingBox();
    return bodyGeometry.boundingBox?.max.z ?? 0;
  }, [bodyGeometry]);

  /**
   * Project the smoothed cursor into the mark's model space → modelMouse.
   * Raycast the mark mesh first (exact point under the cursor, perspective-
   * correct); fall back to a camera-facing plane through the FRONT PLATE when
   * the ray misses the silhouette. MOUSE_OFF when not hovering.
   */
  function projectCursorToModel(spin: THREE.Group) {
    const hover = useHeroHoverStore.getState();
    const ptr = usePointerStore.getState();
    if (!(hover.hovering && ptr.active)) {
      modelMouse.copy(MOUSE_OFF);
      return;
    }
    ndc.set(ptr.smooth.x * 2 - 1, -(ptr.smooth.y * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const target = raycastTargetRef.current;
    if (target) {
      raycastHits.length = 0;
      raycaster.intersectObject(target, false, raycastHits);
      if (raycastHits.length > 0) {
        modelMouse.copy(raycastHits[0].point);
        spin.worldToLocal(modelMouse);
        return;
      }
    }
    // Near-miss fallback: plane through the front plate, camera-facing.
    worldCenter.set(0, 0, markFrontZ);
    spin.localToWorld(worldCenter);
    camera.getWorldDirection(planeN);
    plane.setFromNormalAndCoplanarPoint(planeN, worldCenter);
    if (raycaster.ray.intersectPlane(plane, worldHit)) {
      modelMouse.copy(worldHit);
      spin.worldToLocal(modelMouse);
    } else {
      modelMouse.copy(MOUSE_OFF);
    }
  }

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    const assembly = assemblyRef.current;
    const spin = spinRef.current;
    if (!group || !assembly || !spin) return;

    // Clamp delta: after a tab refocus / long stall R3F hands us a multi-second
    // delta that would over-shoot the tilt damp and the sim.
    const delta = Math.min(rawDelta, 1 / 30);

    if (!announcedReady.current) {
      announcedReady.current = true;
      useTierStore.getState().setHeroReady(true);
      // Snapshot entry type ONCE: introComplete already true here ⇒ a soft
      // route re-entry (skip the intro reform); false ⇒ a hard load (play it).
      softEntryRef.current = useIntroStore.getState().introComplete;
    }

    const fx = useFxStore.getState();
    const { progress } = useScrollStore.getState();
    const hover = useHeroHoverStore.getState();
    const sh = anchors.scrollHeight;
    const ih = size.height;
    const scrollPx = progress * Math.max(sh - ih, 0);

    const heroSpan = anchors.spans["hero"];
    // No-span fallback = the spine's scrub travel (outer height − viewport),
    // derived from the shared SPINE constants instead of a stale hard-coded
    // multiple so a height change can never silently desync the choreography.
    const heroEndPx = heroSpan
      ? Math.max(heroSpan.end * sh - ih, 1)
      : ih * (SPINE_TRAVEL_VH / 100);
    const hp = THREE.MathUtils.clamp(scrollPx / heroEndPx, 0, 1);

    // Hold through the pin; recede + fade over the last quarter (identical to
    // the previous HeroLogo so the handoff is unchanged).
    let fade = 1 - THREE.MathUtils.smoothstep(hp, 0.74, 0.97);
    // Intro brand lockup (2026-08-07 v3, supersedes the full-hide yield): the
    // mark stays VISIBLE through the brand beat, parked centered ABOVE the
    // wordmark (see the LOCKUP_* constants), and `flight` carries it to the
    // hero-right rest as the brand dissolves. Inactive morph (fallback tiers,
    // skipped intro) → flight = 1 → the framing below is byte-identical to
    // the pre-lockup behavior.
    const morph = useTextMorphStore.getState();
    const flightT = morph.active ? morph.domReveal : 1;
    // Hard-load handoff snap (see introFlightSnapped): kill the residual
    // rest↔lockup glide the instant the curtain starts lifting, so the mark
    // is AT the station the FLIP targeted while the overlay is still ~opaque.
    if (
      !softEntryRef.current &&
      !introFlightSnapped.current &&
      useIntroStore.getState().introComplete
    ) {
      introFlightSnapped.current = true;
      flightRef.current = flightT;
    }
    flightRef.current = THREE.MathUtils.damp(
      flightRef.current,
      flightT,
      7,
      delta,
    );
    const flight =
      flightRef.current * flightRef.current * (3 - 2 * flightRef.current);
    fadeRef.current = fade;
    // v2 PRIME phase (see the INTRO_PRIME_S doc): advance the clock the
    // moment the spore build lands on a hard load, and keep the whole group
    // HIDDEN while it runs — the seeded-alive spores die unseen and park in
    // the regrow queue, so the first thing the visitor ever sees of the mark
    // is it GROWING with the counter, never a flash of the full mark
    // dissolving. Spores mode only; the static fallback materialises via its
    // own uFade scrub below and never primes.
    if (
      !softEntryRef.current &&
      showSpores &&
      !sporeStaticFallback &&
      introPrimeClock.current < INTRO_PRIME_S
    ) {
      if (introPrimeClock.current < 0) {
        if (tslSpore) introPrimeClock.current = 0;
      } else {
        introPrimeClock.current += delta;
      }
    }
    const introPriming =
      !softEntryRef.current &&
      introPrimeClock.current >= 0 &&
      introPrimeClock.current < INTRO_PRIME_S;
    // Hidden ≠ paused: while priming the RENDER is hidden but the frame must
    // keep running — the kill only happens when the compute below steps with
    // the envelope at PEAK. Only a genuine scroll-out fade early-returns.
    group.visible = fade > 0.005 && !introPriming;
    if (fade <= 0.005) return;

    // Framing + scroll choreography. The at-rest values come from LIVE fxStore
    // knobs (heroOffsetX / heroOffsetY / heroPosZ / heroScale) so the mark can
    // be tuned in the leva "GPGPU hero" folder (window.__sersanFx in dev). The
    // defaults frame the 1.62×2 hexagon mark as a PROMINENT, front-facing, fully-
    // visible particle logo on the hero right, near the content plane (verified
    // against CAMERA_Z/FOV: at hp=0 the full mark sits inside the viewport with
    // margin across every desktop aspect). The hp terms keep the loved scroll
    // choreography on top of those rest values: the mark drifts gently left,
    // sinks a touch, and recedes as the camera "passes" it, Lusion-style.
    const baseScale = WORLD_VIEW_HEIGHT * fx.heroScale;
    // camDescend: during the intro's camera-descent beat the camera dives
    // ~one viewport while the page is still pinned — subtracting the applied
    // offset keeps the mark at its pre-descent station so the camera
    // genuinely leaves it behind (above the frame) instead of dragging it
    // along. 0 in every other state → identical to before.
    const camDescend = useTextMorphStore.getState().camDescend;
    // Hero-rest station (unchanged math) ← lockup station, blended by the
    // eased `flight`. During the gated beat the page is pinned (hp = 0), so
    // the flight completes before the scroll choreography ever moves hp.
    const heroX = worldViewWidth * (fx.heroOffsetX - hp * 0.05);
    const heroY =
      camera.position.y +
      camDescend -
      WORLD_VIEW_HEIGHT * (fx.heroOffsetY + hp * 0.04);
    const heroZ = fx.heroPosZ - hp * 2.2;
    const lockY =
      camera.position.y +
      camDescend -
      WORLD_VIEW_HEIGHT * LOCKUP_OFFSET_Y +
      // INTRO SPREAD (see INTRO_MARK_RAISE): the mark rides higher in space
      // while the camera is zoomed in, so the head raise frames it while the
      // rest of the scene sinks below. Exactly 0 once the intro lands.
      WORLD_VIEW_HEIGHT * INTRO_MARK_RAISE * introZoomRef.current;
    group.position.set(
      heroX * flight,
      // HEAD RAISE (introCamShiftRef, rests at 0): the gaze lifts, so every
      // object sinks — this is what drops the cropped mark into frame right
      // before its burst.
      THREE.MathUtils.lerp(lockY, heroY, flight) -
        WORLD_VIEW_HEIGHT * introCamShiftRef.current,
      THREE.MathUtils.lerp(fx.heroPosZ, heroZ, flight) +
        Math.sin(flight * Math.PI) * FLIGHT_BULGE,
    );
    // === HORIZONTAL FIT (2026-09-09) ======================================
    // Every scale term above is derived from WORLD_VIEW_HEIGHT — the mark is
    // sized against the viewport's HEIGHT and nothing has ever consulted its
    // width. On a 16:9 window that is harmless (the lockup mark spans ~26% of
    // the frame). On a 375×812 phone the visible width at the intro's
    // dolly-in (camera z = CAMERA_Z·(1 − INTRO_CAM_IN) ≈ 5.76) is ≈2.48 world
    // against a mark ≈2.51 world wide: the mark is 101% of the frame and
    // bleeds off both edges — which is exactly what the loading screen looked
    // like on the owner's iPhone, 2026-09-09.
    //
    // Fixed by fitting to the frame instead of clamping a magic breakpoint:
    // the visible width AT THE MARK'S OWN DISTANCE this frame, times the
    // fraction of it the mark may occupy. It is applied to the final scalar,
    // so it holds across the whole lockup→hero flight and the scroll recede
    // rather than at one pose; on any desktop aspect the raw scale is already
    // well inside the limit and `Math.min` picks it unchanged — the desktop
    // render path does not move.
    const scaleRaw =
      baseScale *
      THREE.MathUtils.lerp(LOCKUP_SCALE, 1 - 0.2 * hp, flight) *
      (0.92 + 0.08 * fade);
    // Distance camera→mark. WORLD_VIEW_HEIGHT is defined at CAMERA_Z, so the
    // visible height at any other distance is a straight proportion of it —
    // no FOV maths, and no cast off the base Camera type. (The mid-page warp
    // does widen the FOV, but the clamp is slack by then anyway.)
    const distToMark = camera.position.z - group.position.z;
    let scaleOut = scaleRaw;
    // Guarded on a real distance. "Fraction of the visible width" stops
    // meaning anything as the camera closes on the mark's own plane — the
    // limit would fall toward zero and shrink the mark to nothing — and there
    // is no framing to protect there anyway. Below 1 world unit the clamp
    // simply does not apply. (Today the closest the camera ever gets during
    // the intro is ≈6.06: z 5.76 at the dolly-in against heroPosZ −0.3.)
    if (distToMark > 1) {
      const visibleH = WORLD_VIEW_HEIGHT * (distToMark / CAMERA_Z);
      const visibleW = visibleH * (size.width / size.height);
      scaleOut = Math.min(
        scaleRaw,
        (visibleW * MARK_MAX_WIDTH_FRAC) / markWorldWidth,
      );
    }
    group.scale.setScalar(scaleOut);


    // ANCHORED mark — no drag-to-rotate, no idle spin. The mark sits STILL at
    // its front-facing rest and only "looks toward" the cursor by a few degrees:
    // a soft mouse-parallax tilt that eases on top of the fixed TILT base and
    // returns to rest (0,0) when the pointer is centered/absent.
    //
    // The smoothed pointer is clip [0..1] top-left; map to NDC-ish −1..1 from
    // screen center (X→right, Y→up). Target yaw follows X, target pitch is the
    // BASE tilt minus pointer-Y (look up when the cursor is high). Damp toward
    // it with THREE.MathUtils.damp so it eases smoothly. The drag layer still
    // captures the pointer (it feeds `hovering` for the repulsion below) — its
    // drag velocity is simply ignored, so click-and-hold never moves the mark.
    const ptr = usePointerStore.getState();
    const maxTilt = fx.gpgpuTilt;
    const px = ptr.active ? ptr.smooth.x * 2 - 1 : 0;
    const py = ptr.active ? -(ptr.smooth.y * 2 - 1) : 0;
    const targetYaw = px * maxTilt;
    const targetPitch = TILT - py * maxTilt;
    // `spin` carries the parallax yaw, `assembly` the parallax pitch (its base
    // is the fixed TILT). damp(current, target, lambda, dt) eases frame-rate
    // independently toward rest when the pointer is centered/absent.
    spin.rotation.y = THREE.MathUtils.damp(
      spin.rotation.y,
      targetYaw,
      TILT_DAMP,
      delta,
    );
    assembly.rotation.x = THREE.MathUtils.damp(
      assembly.rotation.x,
      targetPitch,
      TILT_DAMP,
      delta,
    );

    // --- HOLD THE MARK SQUARE against the cinematic camera bank --------------
    // SignatureLine (the single camera authority) banks the camera into the
    // curve's bends with `camera.rotateZ`, which rotates the ENTIRE WebGL
    // layer. That reads as cinematography for the signature LINE — a path the
    // camera travels along, whose whole point is leaning into a turn — and for
    // the scene at large. It does NOT read that way on a brand mark: the mark's
    // strong horizontal bars make even the ±2.6° clamp look plainly CROOKED,
    // and because the bank's scroll gate ramps in over one viewport while the
    // mark is still on screen, the mark would visibly ROTATE as the reader
    // scrolls the hero — a rotating logo being worse than a statically tilted
    // one. So the scene keeps its bank and the mark holds its OWN orientation.
    //
    // Axis: the camera rolls about its LOCAL +Z (the view axis, applied after
    // lookAt), so on screen the world appears to rotate by −roll. Cancelling
    // that means rotating the object by +roll about that SAME axis in world
    // space. The mark is NOT billboarded — it is a world-space object — but its
    // outer group sits directly under the scene root (Scene.tsx mounts
    // RouteRitual as a Canvas child, no wrapping transform), so the group's
    // local frame IS the world frame and a world-axis quaternion can be written
    // straight to `group.quaternion`. The camera looks down its local −Z, so
    // camera-local +Z in world is −getWorldDirection(); a rotation of +roll
    // about −dir is identical to −roll about +dir, which is what we build.
    //
    // COMPOSITION: this is the OUTERMOST group, so the counter-roll composes
    // AFTER the parallax the mark already does — `assembly` still carries the
    // base TILT plus the pointer pitch and `spin` the pointer yaw, both in this
    // group's local frame. Net world orientation is R_counterRoll · R_pitch ·
    // R_yaw: the parallax tilt survives untouched and only gets re-squared on
    // screen. `group.rotation` has no other writer (position/scale only).
    const camRoll = useTextMorphStore.getState().camRoll;
    if (camRoll !== 0) {
      camera.getWorldDirection(viewAxis);
      group.quaternion.setFromAxisAngle(viewAxis, -camRoll);
    } else {
      group.quaternion.identity();
    }

    // --- STATIC fallback feed (analytic dispersion) --------------------------
    // The static render reads its own per-instance `aHome` positions (no sim,
    // no rig to step) and analytically displaces particles near the cursor in
    // the vertex shader. Feed it the model-space cursor + eased hover so the
    // lift fades in/out, plus the live render/force knobs.
    if (showStaticBuild) {
      const dprStatic = Math.min(gl.getPixelRatio(), 2);

      // Depth-only occluder follows the scroll fade: while the mark is on screen
      // it writes depth so the signature line is clipped behind the mark's
      // silhouette; once the mark recedes/fades out (fade → 0) stop writing depth
      // so the line can draw through the empty frame the mark left behind.
      const occlude = fade > 0.5;
      staticOccluderMaterial.depthWrite = occlude;
      staticOccluderMaterial.visible = occlude;

      // Eased hover: target 1 while the hero is hovered (and a pointer is
      // active), else 0. Damping it gives the soft settle on cursor-leave.
      const hoverTarget = hover.hovering && ptr.active ? 1 : 0;
      hoverRef.current = THREE.MathUtils.damp(
        hoverRef.current,
        hoverTarget,
        4,
        delta,
      );

      // Model-space cursor — raycast the mark mesh / front-plate plane (shared
      // helper), so the dispersion lands exactly under the cursor.
      projectCursorToModel(spin);

      simTimeRef.current += delta;

      if (glslStatic) {
        const u = glslStatic.uniforms;
        u.uPointSize.value = fx.gpgpuPointSize;
        u.uPixelRatio.value = dprStatic;
        u.uViewport.value.set(size.width * dprStatic, size.height * dprStatic);
        u.uFade.value = fade;
        u.uEmissive.value = fx.gpgpuEmissive;
        u.uPointAlpha.value = fx.gpgpuPointAlpha;
        u.uMouse.value.copy(modelMouse);
        u.uHover.value = hoverRef.current;
        u.uTime.value = simTimeRef.current;
        u.uRadius.value = fx.gpgpuRadius;
        u.uPush.value = fx.gpgpuPush;
      }
      if (tslStatic) {
        tslStatic.uPointSize.value = fx.gpgpuPointSize;
        tslStatic.uPixelRatio.value = dprStatic;
        tslStatic.uViewport.value.set(
          size.width * dprStatic,
          size.height * dprStatic,
        );
        // Inside-the-hole rework: the static/WebGL2 mark is HELD INVISIBLE
        // through the load (the wordmark owns gate 1 on the black) and fades
        // in over ~1.5s from the completion edge — the cheap analog of the
        // spores' gate-2 generation. The build being live IS stage-readiness
        // here (no prime phase to wait out).
        const introStatic = useIntroStore.getState();
        if (!introStatic.heroStageReady) introStatic.setHeroStageReady();
        if (!softEntryRef.current && introStatic.introComplete) {
          staticRevealClock.current = Math.min(
            staticRevealClock.current + delta,
            1.5,
          );
        }
        tslStatic.uFade.value =
          fade * (softEntryRef.current ? 1 : staticRevealClock.current / 1.5);
        tslStatic.uEmissive.value = fx.gpgpuEmissive;
        tslStatic.uPointAlpha.value = fx.gpgpuPointAlpha;
        tslStatic.uMouse.value.copy(modelMouse);
        tslStatic.uHover.value = hoverRef.current;
        tslStatic.uTime.value = simTimeRef.current;
        tslStatic.uRadius.value = fx.gpgpuRadius;
        tslStatic.uPush.value = fx.gpgpuPush;
      }
      return;
    }

    // --- SPORES (instanced shaded spheres on the unified compute sim) -------
    if (showSpores && !sporeStaticFallback) {
      // Scroll-out dissolve — the EXPLODE half of the arc, STAGGERED per layer:
      // the OUTER crust expands FIRST on a tight window, the inner core LAGS and
      // only completes by the END of the hero (client 2026-06-29: "lo strato di
      // sopra inizia ad espandersi prima di quello di sotto"). Still starts with
      // the first scroll ticks; both reach ~full by hp≈1 ⇒ a complete explosion
      // to nothing. Regrow in place on scroll-back.
      const burstCrust = THREE.MathUtils.smoothstep(hp, 0.02, EXPLODE_CRUST_END);
      const burstCore = THREE.MathUtils.smoothstep(
        hp,
        EXPLODE_CORE_LAG,
        EXPLODE_CORE_END,
      );

      // ---- FIRST-LOAD MATERIALISATION, scrubbed by the COUNTER (v2) --------
      // See the INTRO_PRIME_S doc block: PRIME kills the seeded-alive spores
      // unseen (envelope PEAK, group hidden by the gate above), then the
      // envelope drops to 0 — every spore parks in the regrow queue — and
      // uRegrowScale follows the preloader's eased counter, so the mark
      // GROWS with the percentage on its own stage. On the introComplete
      // edge the legacy clock parks at RELEASE (auto-burst arming + lockup
      // replay reset still read it), regrow snaps to full rate for any
      // stragglers, and the crust AUTO-BURST fires — the explosion is the
      // reveal beat. Soft entries never enter (introBurst 0, mark present).
      const intro = useIntroStore.getState();
      // Stage-actor gate (v2): tell the preloader the mark is genuinely ready
      // to perform — build landed AND the hidden prime kill finished — so the
      // counter cannot complete before there is a mark to grow (a cold
      // compile can otherwise outlast the whole load; the preloader bounds
      // this signal, so a broken build still degrades gracefully).
      if (
        !intro.heroStageReady &&
        tslSpore &&
        introPrimeClock.current >= INTRO_PRIME_S
      ) {
        intro.setHeroStageReady();
      }
      // GATE 2 ("il logo si genera e esplode"): the reform clock STARTS on
      // the introComplete edge — one-shot (< 0 = armed) — and runs its
      // 2.07s arc while the camera's first zoom-out gesture plays; the
      // burst countdown fires the explosion as the bloom completes.
      if (
        !softEntryRef.current &&
        intro.introComplete &&
        introReformClock.current < 0
      ) {
        introReformClock.current = 0;
        introBurstDelay.current = 0; // arm the gate-2 burst countdown
      }
      if (
        !softEntryRef.current &&
        introReformClock.current >= 0 &&
        introReformClock.current < INTRO_REFORM_RELEASE
      ) {
        introReformClock.current += delta;
      }
      // The crust explosion belongs to the LOGO gate (exit gate 2): fire it
      // INTRO_BURST_AT_S after the completion edge, when the camera's second
      // gesture has centred the mark. Wall-clock one-shot; -1 = not armed.
      if (introBurstDelay.current >= 0 && autoBurstClock.current < 0) {
        if (introBurstDelay.current >= INTRO_BURST_AT_S) {
          autoBurstClock.current = 0;
        } else {
          introBurstDelay.current += delta;
        }
      }
      const introBurst = !softEntryRef.current && introPriming
        ? INTRO_REFORM_PEAK
        : 0;
      // Parked DEAD through the whole load (regrow rate 0 — the primed
      // spores wait invisibly in the regrow queue); the completion edge
      // releases the full-rate bloom that IS the gate-2 generation.
      const introRegrowScale =
        softEntryRef.current || intro.introComplete ? 1 : 0;
      // Occluder body: on scroll it follows the TRAILING core (stays solid
      // behind the crust as that leads off). During the gate-2 generation it
      // must NOT show as a dim "spento" logo under the blooming particles
      // (client 2026-06-29) — hidden through the load (clock < 0 ⇒ 0) and
      // faded in only over the reform clock's last stretch, so the mark
      // reads as forming from nothing with the body filling in behind.
      const introBodyReveal = softEntryRef.current
        ? 1
        : THREE.MathUtils.smoothstep(
            introReformClock.current,
            INTRO_REFORM_RELEASE - INTRO_REFORM_BODY_AT_S,
            INTRO_REFORM_RELEASE,
          );
      const occBurst = Math.max(burstCore, 1 - introBodyReveal);

      // The opaque occluder follows the scroll fade AND that burst — a solid
      // dark slab can't hang around while the shells scatter, and it must vanish
      // ENTIRELY during the intro for a true "from nothing" reform. Colour is
      // the ACTIVE variant's occluder (what shows through eroded gaps) — read
      // from the live store so a Logo Lab switch recolours it now.
      const occDim = fade * (1 - occBurst) * (1 - occBurst);
      const occCol = getSporePreset(fx.heroPreset).occluder;
      sporeOccluderMaterial.color.setRGB(
        occCol[0] * occDim,
        occCol[1] * occDim,
        occCol[2] * occDim,
      );
      sporeOccluderMaterial.opacity = 1 - occBurst;
      sporeOccluderMaterial.visible = occBurst < 0.97;
      if (!tslSpore) return; // occluder-only until the lazy build resolves

      // --- CRUST AUTO-BURST, ANTICIPATED (owner 2026-08-07 v2) ---------------
      // RETIMED the same day it landed ("l'esplosione avviene troppo in
      // ritardo"), and again 2026-08-09 round 2 ("deve avvenire prima"): the
      // burst no longer waits for assembleDone — it fires when the mark's
      // materialise has released (introReformClock past INTRO_REFORM_RELEASE:
      // burst 0, regrow restored, dark body in — with the retightened reform
      // this now clears at ≈2.07s) AND the wordmark's entry has reached
      // fx.sporeAutoBurstAt (default 0.55 ⇒ ≈1.98s of the 3.6s entry) — net
      // fire ≈2.07s, the mark-side guard binding — so the explosion lands
      // while the wordmark is still settling. entryProgressRef is
      // HeroTextParticles' entry clock, published per frame as a
      // MODULE-SCOPE SHARED REF (the
      // pointerStore/holeField pattern — P0 hotfix 2026-08-07: a per-frame
      // zustand setState notifies every store listener unconditionally,
      // 60×/s, for a value nothing reads reactively; a ref write notifies
      // no one).
      // It rides the SAME uBurst mechanism as the scroll explode and the
      // intro reform (radial-from-center push + staggered kill + parked
      // respawn → LIFE_REGROW regrowth once the envelope drops under the
      // 0.05 respawn threshold): no new sim path, and uMouse/uRadius (the
      // pointer-hover semantics) are never touched. SELECTIVITY IS
      // STRUCTURAL: every preset layer is its own compute build with its own
      // uBurst uniform, and the envelope is composed (max(), like the other
      // beats) into CRUST-role layers ONLY — the core layer and the wordmark
      // particles are untouched by construction. One-shot per LOCKUP VISIT
      // (owner 2026-08-09 round 2): the SPENT clock re-arms to 0 when the
      // intro reverse-replay re-forms the brand lockup (the RESET clause in
      // the else-branch below), so the whole choreography replays on every
      // re-entry; softEntryRef keeps soft route re-entries from ever arming
      // the clock (they stay at -1, so the reset clause is unreachable for
      // them too); reduced-motion tiers never mount this component.
      // DEAD-LATCH GUARDS (all preserved, only the completion edge moved):
      // introSkipped pins entryRef at 1 — the ref publishes 1, so a skip
      // satisfies the clause immediately (the explicit check keeps it
      // airtight even before the next ref write); an inactive morph system
      // (text build absent/failed → the ref never advances past 0) waives
      // the clause entirely; soft entry never arms the clock at all.
      if (autoBurstClock.current < 0) {
        // (Preloader v3: the hard-load arming moved OUT of here and onto the
        // camera's logo gate — the INTRO_BURST_AT_S countdown above. This
        // legacy clause fired on the reform's own completion (~2.07s), which
        // put the explosion BEFORE the camera had moved to look at the mark
        // — owner 2026-08-28: "prima si sposta la camera per guardare il
        // logo, POI il logo esplode". Kept only as the entry-progress path
        // for a morph that never runs its own intro.)
        const wordmarkNearlyFormed =
          !morph.active ||
          morph.introSkipped ||
          entryProgressRef.value >= fx.sporeAutoBurstAt;
        if (
          !softEntryRef.current &&
          introBurstDelay.current < 0 &&
          introReformClock.current >= INTRO_REFORM_RELEASE &&
          wordmarkNearlyFormed
        ) {
          autoBurstClock.current = 0;
        }
      } else {
        // Owner 2026-08-09: the crust STAYS exploded through the lockup —
        // regrowth releases once the mark is COMMITTED to its flight right
        // (round 2: "la generazione dello strato... deve avvenire prima";
        // was flightRef ≥ 0.97, i.e. only at the hero-right rest). Advance
        // the clock, then PIN it ahead of the FALL (the equal-envelope remap
        // below ⇒ envelope parked at PEAK: spores dead, respawn withheld)
        // until flightRef (the damped follower of morph.domReveal) passes
        // 0.30 — mid-flight; FALL 0.35s + LIFE_REGROW ≈1.4s (1/0.7, the
        // "explosive" preset rate at uRegrowScale 1) then completes the
        // crust shortly after landing. Inactive morph (fallback text
        // build) and introSkipped pass the gate immediately — old behavior —
        // and the dev re-fire knob is clamped too (fine: it's a tuning
        // handle).
        autoBurstClock.current += delta;
        const atHeroRest =
          !morph.active || morph.introSkipped || flightRef.current >= 0.3;
        const fallStart = fx.sporeAutoBurstRamp + fx.sporeAutoBurstHold;
        // The arrival pin re-arms the clock onto the RAMP at the
        // EQUAL-ENVELOPE point: smoothstep's symmetry (s(1−u) = 1−s(u))
        // makes fall time tf and ramp time ramp·(1−tf/fall) carry the exact
        // same envelope value, so the hand-off is continuous at ANY depth of
        // the fall. Parked at the release edge (tf ≈ 0) this degenerates to
        // the old hold-at-PEAK (the clock cycles ramp→hold→remap with the
        // envelope flat at PEAK); a MID-FALL wheel reversal (routine now the
        // release gate sits at flightRef 0.30, mid-scrub territory) instead
        // re-kills the partially-regrown crust through a visible re-ramp —
        // this was the last path that could step uBurst ~0 → PEAK in one
        // frame (the old pin snapped the clock straight to fallStart). The
        // pin stays LATCHED to the burst's own lifetime (the ceiling term):
        // the intro is reverse-replayable (up-wheel at page top re-forms the
        // brand → flightRef dips back under the gate), and without the
        // ceiling that dip would restart a long-expired clock mid-page. The
        // true replay goes through the RESET below instead: a full fresh
        // ramp. fall ≤ 0 makes the window empty, so the division below can
        // never divide by zero.
        if (
          !atHeroRest &&
          autoBurstClock.current > fallStart &&
          autoBurstClock.current < fallStart + fx.sporeAutoBurstFall
        ) {
          const fallT =
            (autoBurstClock.current - fallStart) / fx.sporeAutoBurstFall;
          autoBurstClock.current = fx.sporeAutoBurstRamp * (1 - fallT);
        }
        // REPLAY on the intro reverse re-entry (owner 2026-08-09 round 2:
        // "dovrebbe funzionare il tutto anche se torno indietro"): once the
        // envelope is SPENT and the reverse replay has carried the mark back
        // to the centered brand lockup (flightRef ≤ 0.15 — the 0.15/0.30
        // hysteresis gap against the release gate above prevents flapping),
        // reset the clock so the whole choreography replays: a fresh visible
        // ramp explosion at the re-formed lockup, the arrival pin holding it
        // exploded through the lockup, then regrowth on the next flight
        // right. morph.active && !introSkipped scopes this to the true brand
        // replay; soft entries never arm the clock, so they never reach this
        // branch at all.
        if (
          autoBurstClock.current >= fallStart + fx.sporeAutoBurstFall &&
          morph.active &&
          !morph.introSkipped &&
          flightRef.current <= 0.15
        ) {
          autoBurstClock.current = 0;
        }
      }
      // Dev re-fire (__sersanFx): any NEW sporeAutoBurstFire value restarts
      // the envelope — bypasses the one-shot/soft-entry latches (tuning only).
      if (autoBurstFireSeen.current === null) {
        autoBurstFireSeen.current = fx.sporeAutoBurstFire;
      } else if (fx.sporeAutoBurstFire !== autoBurstFireSeen.current) {
        autoBurstFireSeen.current = fx.sporeAutoBurstFire;
        autoBurstClock.current = 0;
      }
      const autoBurst = autoBurstEnvelope(
        autoBurstClock.current,
        fx.sporeAutoBurstPeak,
        fx.sporeAutoBurstRamp,
        fx.sporeAutoBurstHold,
        fx.sporeAutoBurstFall,
      );

      // Model-space cursor via the raycast helper: the repulsion center is the
      // exact mark-surface point under the cursor (perspective-correct).
      projectCursorToModel(spin);

      simTimeRef.current += delta;
      tickParams.dt = delta;
      tickParams.time = simTimeRef.current;
      tickParams.mouse.copy(modelMouse);

      // --- GRAVITATIONAL FLYBY / ACCRETION feed (owner 2026-08-07 v2) -------
      // The eclipse publishes its APPARENT center + 0..1 envelope via
      // holeField (module-scope shared ref, HomeSingularity — the
      // pointerStore pattern). The CRUST leans in the far field and, inside
      // the capture band at near approach, spores DETACH, fall to the hole,
      // flash and die at the horizon, respawning at home (the kernel's
      // capture/horizon terms — all envelope-gated, so far phase = nothing).
      // Envelope is damped with the clamped delta so edges never step.
      holeEnvRef.current = THREE.MathUtils.damp(
        holeEnvRef.current,
        holeField.active ? holeField.strength : 0,
        6,
        delta,
      );
      if (holeField.active) {
        // Project the hole's apparent center onto the MARK's content plane
        // along the camera ray: the hole floats ≈1.76 units from the camera
        // — ~10 world units in FRONT of the mark plane — so the lean must
        // key off where it APPEARS below the lockup, not its true 3D
        // position (whose camera-axis offset would swamp any falloff).
        const camToHole = Math.max(camera.position.z - holeField.z, 1e-3);
        const sProj = (camera.position.z - group.position.z) / camToHole;
        holeLocal.set(
          camera.position.x + (holeField.x - camera.position.x) * sProj,
          camera.position.y + (holeField.y - camera.position.y) * sProj,
          group.position.z,
        );
        // World → model through the live transform stack (inherits the
        // group's uniform scale + the parallax tilt), same discipline as
        // the raycast cursor projection above.
        spin.worldToLocal(holeLocal);
      }
      // Radius knobs are WORLD units at the content plane → model units via
      // the group's uniform world scale (assembly/spin scales are 1). The
      // kill radius is FLOORED strictly positive: at 0 the kernel's horizon
      // smoothstep gets equal edges (divide-by-zero → NaN into the life
      // buffer, which would silently erase the crust).
      const holeRadiusModel =
        fx.holePullRadius / Math.max(group.scale.x, 1e-4);
      const holeKillModel =
        Math.max(fx.holeKillRadius, 1e-3) / Math.max(group.scale.x, 1e-4);

      for (let i = 0; i < tslSpore.length; i++) {
        const layer = tslSpore[i];
        layer.rig.tick(tickParams);
        layer.uFade.value = fade;
        layer.uSporeRadius.value = sporeBaseRadius * fx.sporeSize;
        layer.uEmissive.value = fx.sporeEmissive;
        // Attractor orbit term (C3): ratio of each layer's own PUSH, so the
        // pinned core keeps its whisper while the crust swirls. Falloff-gated
        // → the resting crust is untouched at any knob value.
        layer.uOrbit.value = fx.sporeAttractor;
        layer.uOrbitFalloff.value = fx.sporeOrbitFalloff;
        // STAGGERED explode: the OUTER crust (i=0) leads, inner layers (the
        // core) lag, so the upper layer expands before the lower. The intro
        // reform (when active) hits every layer together via max(); the
        // intro-completion AUTO-BURST joins the same max() composition but on
        // CRUST-role layers ONLY — the core stays formed. Roles come from the
        // ACTIVE preset (guarded: a preset switch swaps `preset` one commit
        // before the rig rebuilds); solo presets have no crust layer, so they
        // simply never auto-burst rather than bursting their only shell.
        const scrollBurst = i === 0 ? burstCrust : burstCore;
        const isCrust = preset.layers[i]?.role === "crust";
        const autoLayerBurst = isCrust ? autoBurst : 0;
        layer.uBurst.value = Math.max(scrollBurst, introBurst, autoLayerBurst);
        // Slow ONLY the intro materialise bloom; 1 the rest of the time.
        layer.uRegrowScale.value = introRegrowScale;
        // Flyby/accretion attractor — CRUST-role layers only (same
        // selectivity as the auto-burst): envelope 0 on the core zeroes the
        // force, the glow, the capture boost AND the horizon kill by
        // construction (the kernel's capGate is a pure function of the
        // envelope). Uniform writes only, per the budget notes.
        layer.uHole.value.copy(holeLocal);
        layer.uHoleStrength.value = isCrust ? holeEnvRef.current : 0;
        layer.uHolePull.value = fx.holePullCrust;
        layer.uHoleRadius.value = holeRadiusModel;
        layer.uHoleCapture.value = fx.holeCapture;
        layer.uHoleKillRadius.value = holeKillModel;
      }
      return;
    }
  });

  // STATIC mesh — the particle billboards at their HOME positions
  // (per-instance `aHome`), analytic cursor dispersion in the vertex stage.
  // Parented under the SAME spin/assembly/group stack as the spores so every
  // path is framed identically. Renders once the build resolves (synchronous
  // on OFF; after the lazy TSL chunk on ON).
  const staticMesh =
    showStaticBuild && staticGeometry && staticMaterial ? (
      <mesh
        geometry={staticGeometry}
        material={staticMaterial}
        frustumCulled={false}
      />
    ) : null;

  // Depth-only occluder for the static path (FIX 1a fallback) — invisible
  // (colorWrite:false) solid mark that writes depth so the signature line is
  // clipped behind the static mark, mirroring the spore occluder on the WebGPU
  // path. Parented under the SAME spin/assembly/group stack as the particles so
  // its depth footprint lines up exactly with the rendered mark.
  const staticOccluderMesh = showStaticBuild ? (
    <mesh
      geometry={bodyGeometry}
      material={staticOccluderMaterial}
      frustumCulled={false}
    />
  ) : null;

  // SPORE meshes (spores): dark occluder mark + TWO instanced sphere shells
  // (violet erodible crust outside, glowing cyan immortal core beneath). ALL
  // opaque + depth-tested — the depth buffer does the compositing (front balls
  // occlude back balls and nest into the occluder), no renderOrder/blending.
  const sporeMeshes =
    showSpores && !sporeStaticFallback ? (
    <>
      <mesh geometry={bodyGeometry} material={sporeOccluderMaterial} />
      {tslSpore?.map((layer, i) => (
        <mesh
          key={i}
          geometry={layer.geometry}
          material={layer.material}
          frustumCulled={false}
        />
      ))}
    </>
  ) : null;

  return (
    <group ref={groupRef} visible={false}>
      {/* Assembly carries the pitch (base TILT + parallax); the model-space
          mouse is computed against THIS group's worldToLocal so repulsion
          follows the faint parallax tilt. `spin` carries the parallax yaw. */}
      <group ref={assemblyRef} rotation={[TILT, 0, 0]}>
        <group ref={spinRef}>
          {/* Invisible cursor-raycast target: the SAME normalized mark geometry
              under the SAME transform. Never rendered (visible=false — the
              raycaster ignores visibility), purely the projection surface for
              projectCursorToModel. */}
          <mesh
            ref={raycastTargetRef}
            geometry={bodyGeometry}
            material={raycastMaterial}
            visible={false}
          />
          {staticOccluderMesh}
          {staticMesh}
          {sporeMeshes}
        </group>
      </group>
    </group>
  );
}
