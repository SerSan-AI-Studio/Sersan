/**
 * seqStore — bridge between the DOM singularity passage (the home cinematic
 * sequence between the spine's beat 04 and the ProblemSection "divario") and
 * the WebGL layer (SignatureLine's camera pan + the SequenceSingularity
 * island).
 *
 * OWNERSHIP (the camTilt/textMorphStore precedent):
 *   - src/components/sections/singularity-passage.tsx owns the CLOCK — in
 *     TWO regimes (owner corrections 2026-08-07 + 2026-08-09):
 *       SCRUBBED  p 0..1: settle → horizontal traverse → hold → approach.
 *                 Every value is a pure function of progress `p` (fully
 *                 reversible), written per scrubbed ScrollTrigger tick. On
 *                 the FORWARD path only SETTLE + the tiny pre-trigger window
 *                 (p < 0.10) are ever scrubbed; p 0.10..1 remains scrub
 *                 territory for REVERSE ENTRY (scrolling up from the
 *                 divario) only.
 *       ONE-SHOT  the plunge (traverse → light-speed → enter → black speed →
 *                 zoom-in emergence) is a TRIGGERED GSAP timeline (~6.9s,
 *                 input locked): it writes dist/holeFade/tunnelAlpha/warp/
 *                 pan01/plungeT directly per timeline tick. Scroll does not
 *                 scrub it; the FIRST forward scroll of the horizontal
 *                 regime (crossing TRIGGER_P right after SETTLE) fires it,
 *                 then it plays itself, accelerating ("andando sempre più
 *                 veloce da solo").
 *   - SignatureLine consumes `pan01` inside its priority-0 useFrame (it stays
 *     the single camera authority; the pan is one more additive term).
 *   - SequenceSingularity consumes `dist`/`holeYFrac`/`holeFade`/`starAlpha`/
 *     `tunnelAlpha`/`plungeT` as uniform/placement inputs, and is the only
 *     writer of `holeNdcX/holeNdcY` + `marchLive` (island → DOM back-channel
 *     for the tunnel's zoom-blur center lock and the CSS-imposter
 *     suppressor).
 *
 * THE PHONE BEAT PUBLISHES EXACTLY TWO SCALARS — `lite` and `liteSwallow`
 * (MOBILE_HOME_SPEC.md §3.4; it published NOTHING before, by design). The
 * coarse-pointer branch of singularity-passage.tsx drives its own DOM layers
 * + its own raw-WebGL1 tunnel instance directly and otherwise touches only
 * the `SEQ.LITE_*` CONSTANTS below. It still writes NONE of the desktop
 * fields, and that stays deliberate: `active` / `pan01` are consumed by
 * SignatureLine on EVERY tier, so a lite branch that published them would pan
 * the shared camera on phones, and `armed` / `marchLive` belong to an island
 * that is not mounted there at all. The two new fields are pure functions of
 * the passage's own scrub progress `t` and nothing round-trips: the line
 * reads them, the passage never reads them back.
 *
 * THE ONE EXCEPTION IS BEHIND `SEQ.LITE_RAYMARCH` (mobile-parity plan Phase
 * 4c, DEFAULT OFF): when that flag is on AND `fxBudget.raymarchLite &&
 * backend === "webgpu"` (a capable WebGPU phone), Scene.tsx mounts
 * `<SequenceSingularity lite />` and the coarse branch of the passage feeds
 * it the island's scrub inputs (`active`, `armed`, `p`, `dist`, `holeYFrac`,
 * `holeFade`, `starAlpha`) as pure functions of its own `t`, demoting its
 * CSS hole to the desktop's imposter role (painted until `marchLive`, then
 * opacity 0) and dropping its point tunnel (island and fallback are mutually
 * exclusive). It
 * STILL never publishes `pan01` (stays 0 — the shared camera is never panned
 * on a phone; the lite island is camera-locked in X instead), and with the
 * flag off the branch is byte-identical to the paragraph above.
 *
 * No React subscribers on the hot fields — everything is read via getState()
 * inside frame loops / rAF ticks, textMorphStore discipline.
 *
 * NO three import here: this module is shared by the ROUTE bundle (the DOM
 * passage) and the lazy WebGL island chunk. It must stay three-free, and it
 * is pinned on globalThis for exactly the same reason textMorphStore is —
 * Turbopack may inline a separate copy of a small module into each chunk,
 * splitting writers from readers (reproduced on the intro store 2026-06-10).
 */
import { create } from "zustand";

// === Beat map (THE LONG TAKE v2 — horizontal traverse + one-shot plunge) ===
// Scrub values are fractions of the main passage ScrollTrigger (start
// "2.5% top" → end "bottom bottom" over the 380vh container ≈ 270.5vh of
// scrub travel). Since the round-4 PINNED HANDOFF the container is pulled up
// one viewport (marginTop −100vh, armed desktop path only), so p = 0 sits
// 9.5vh AFTER the spine's pin end — inside the 100vh window where the spine's
// empty stage slides away over this one, which is already pinned at top:0.
// The plunge is NOT in this scrub range anymore: it is a triggered
// timeline in SECONDS (the *_S constants below) — and since 2026-08-09 it
// fires right after SETTLE, so the TRACK/HOLD/APPROACH beats below are
// forward-unreachable: they exist for reverse entry (up from the divario).
export const SEQ = {
  /** Desktop container height (sticky h-screen stage inside). */
  DESKTOP_HEIGHT_VH: 380,

  // --- Scrubbed beat boundaries (p) ----------------------------------------
  // Forward flow hands off to the one-shot at TRIGGER_P (0.10) — everything
  // past it below is the REVERSE-ENTRY scrub map (down-scrub replay after a
  // reverse entry included; the trigger only re-arms below REARM_P).
  SETTLE_END: 0.08, // panel 05 materializes (PANEL_ENTER band below) then
  // rests frame-left; 2% pan pre-drift
  TRACK_END: 0.52, // horizontal parallax traverse (the domus-tua grammar)
  HOLD1_END: 0.62, // dead-center rest at dist 12 — restraint beat
  APPROACH_END: 1, // dist 12→2.6 exponential (micro-hold plateau at d≈6);
  // p = 1 IS the "near hold": hole centered at DIST_NEAR — the designed
  // re-entry pose when scrolling UP from the divario.

  // --- The physics rule: apparent size = pure camera distance --------------
  // apparent height fraction = 2 / (2·tan(FOV/2)·d) = SEQ_APPARENT_K / d.
  DIST_FAR: 16, // ~13.4vh — first read: warped starlight, then the hole
  DIST_MID: 12, // ~17.9vh — HOLD 1 framing; also the one-shot TRAVERSE end
  DIST_HOLD2: 6, // ~35.7vh — the APPROACH micro-hold plateau
  DIST_NEAR: 2.6, // ~82.5vh — end of the scrubbed APPROACH (near hold)
  DIST_LS_END: 4.5, // ~47.7vh — hole distance at the END of the light-speed
  // beat. OWNER 2026-09-04: "vorrei che si entrasse ancora di più dentro il
  // buco nero, quindi in prospettiva il buco nero deve diventare più grande."
  // This was 10 (~21.4vh), i.e. 17.9→21.4vh across the WHOLE warp — a
  // deliberately imperceptible approach so the body read as enormous and
  // DISTANT. That intent is rejected: the jump must be a real DIVE. 17.9 →
  // ~47.7vh is a 2.6× growth over the beat, so the hole visibly rushes at the
  // camera while the streaks stretch, instead of hanging as a distant disc.
  DIST_FLOOR: 1.5, // ~143vh — one-shot ENTER floor. Was 1.9 (~112.9vh); the
  // deeper floor is the second half of the same note. Still 0.2 above
  // SequenceSingularity's DIST_HARD_FLOOR (1.3) and 0.3 above the dossier's
  // r≈1.2 no-go, so the FrontSide/depthWrite-off proxy stays valid.

  // --- Raymarch fade (lensing-first reveal; NO scrub fade-out — owner: "il
  // buco nero non deve fare fade e sparire, ci dobbiamo entrare dentro").
  // holeFade only ever drops to 0 INSIDE the one-shot, at the black-frame
  // call after ENTER (veil closed), where the swap is invisible. -------------
  FADE_IN_START: 0.08,
  FADE_IN_END: 0.4,

  // --- Lensed-star alpha (graft 1: high through TRACK, falls on APPROACH) --
  STAR_HI: 0.9,
  STAR_LO: 0.4,

  // --- High-composition entrance (graft 2) ---------------------------------
  Y_FRAC_ENTER: -0.08, // of view height at the hole plane, easing to 0

  // --- Horizontal DOM track (credibility-strip lineage) --------------------
  /** Foreground depth rate: the DOM track translates at this multiple of the
   * world's screen-space pan (world 1.0×, far dust slower via z-spread). */
  TRACK_RATE_FG: 1.15,
  /** The in-place materialize band for panel 05 — the same crossfade grammar
   * as the spine's grouped panels (owner 2026-08-09: the 04→05 handoff must
   * read like the 02→03 transition, never like a scroll): the panel is
   * INVISIBLE while the section rides in (p ≈ 0) and fully lit well before
   * TRIGGER_P (0.10). Band WIDTH matches the spine's crossfade RATE: the
   * spine's stage bands are 0.03 of a 215vh scrub (≈ 6.5vh of travel); this
   * scrub is ~270.5vh (380vh container, start "2.5% top" → end "bottom
   * bottom" = 280 − 9.5), so 0.029 − 0.005 = 0.024 × 270.5vh ≈ 6.5vh — the
   * same scroll distance per crossfade.
   * Band START moved 0.02 → 0.005 with the round-4 PINNED HANDOFF (the
   * passage is pulled up one viewport, see singularity-passage.tsx): the
   * passage ST now engages right AT the spine's pin end instead of one
   * viewport later, so the band can start almost immediately — stage 04
   * dissolves across the spine's own 0.97→1 band, ~10.9vh of pinned black
   * pass (the 9.5vh ST start offset + 0.005), then 05 materializes over
   * 6.5vh. A short breath between two crossfades, both under a frame that
   * never moves. Symmetric on reverse — scrubbing back up fades it out in
   * place across 0.029→0.005 before the section detaches. */
  PANEL_ENTER_START: 0.005,
  PANEL_ENTER_END: 0.029,
  /** Panel 05 opacity ramp-out across the tail of the traverse (it has
   * tracked mostly off-frame by then; fully gone before HOLD 1 settles). */
  PANEL_FADE_START: 0.4,
  PANEL_FADE_END: 0.55,

  // --- Tunnel lifecycle ----------------------------------------------------
  TUNNEL_CREATE_P: 0.02, // instance created parked during SETTLE — the
  // forward flow never scrubs past ~0.10 anymore, so parking it this early
  // is what keeps the one-shot's first hot frame hitch-free
  TUNNEL_WARM_P: 0.8, // first warm renders at alpha 0 (mid-APPROACH —
  // reverse-entry band; the one-shot starts its own rAF at fire)
  TUNNEL_PARK_P: 0.72, // reverse-scroll: rAF halts below this

  // --- Virtual-orbit fade (island): the slow swim dies across late APPROACH
  // so the hole sits exactly centered at the reverse-entry near hold; on the
  // forward path the one-shot's center lock (plungeT × PLUNGE_LOCK_T) kills
  // the swim instead — see SequenceSingularity's orbitEnv ------------------
  ORBIT_FADE_START: 0.8,
  ORBIT_FADE_END: 0.95,

  // --- One-shot plunge trigger (hysteresis) --------------------------------
  /** Forward crossing of this p — the FIRST forward scroll of the
   * horizontal regime, right after SETTLE_END (0.08) — fires the one-shot. */
  TRIGGER_P: 0.1,
  /** After a played plunge, the trigger re-arms only once p < REARM_P. MUST
   * stay BELOW TRIGGER_P: a re-armed user parked between the two could
   * otherwise never produce the forward crossing (prev < TRIGGER ≤ p) again
   * and the passage would dead-end with no way to replay the plunge. */
  REARM_P: 0.05,
  /** Ceiling on the fire tick. The window must swallow one-tick MOMENTUM
   * jumps through the TRACK band: a fast Lenis fling (or a momentary rAF
   * stall) can advance p by 0.1–0.4 in a single ScrollTrigger update, and a
   * crossing tick landing past the ceiling silently drops the shot (live QA
   * 2026-08-09: the user fast-scrubbed the whole beat map to the divario
   * instead of getting the cinematic). Firing from a deeper pose is safe —
   * the TRAVERSE tweens start FROM the captured launch state (pan0/dist0/
   * fade0/y0 in startPlunge), so they adapt to wherever the tick landed.
   * What must stay EXCLUDED is the single-tick NATIVE jump to the container
   * end (End key, scrollbar click-jump land at p ≈ 1): firing there would
   * launch the 6.9s locked shot off-stage (over unrelated content, even the
   * footer where the band has disposed the island) and covert-jump the
   * visitor BACKWARD. Those landings stay scrubbed; mainST's onLeave closes
   * the map past the end. */
  FIRE_MAX_P: 0.6,
  /** Cumulative reverse-wheel px during the one-shot that skips it. */
  SKIP_REVERSE_PX: 120,

  // --- One-shot plunge timeline (seconds; total ≈ 6.9s) --------------------
  /** TRAVERSE: the horizontal passage plays itself (power2.inOut) — pan
   * completes to 1, dist rides launch→DIST_MID, the hole fades in
   * lensing-first to full. Warp stays WARP_MIN; veil untouched. */
  PLUNGE_TRAVERSE_S: 1.7,
  /** LIGHT-SPEED: the jump (power2.in) — warp WARP_MIN→WARP_MAX, streaks
   * rise, stars fall; the hole stays FULLY VISIBLE and DEAD-CENTER while it
   * RUSHES AT THE CAMERA (DIST_MID→DIST_LS_END = 17.9→~47.7vh, 2.6×). No
   * veil. (Was a near-constant apparent size; see DIST_LS_END.) */
  // 1.6 -> 1.2 (owner: "il salto a velocità della luce è troppo lungo"). With
  // the warp lag inverted in singularity-passage's rAF, the authored curve is
  // now what plays on screen, so this reads as a genuinely abrupt jump rather
  // than a smeared one — which is the note.
  PLUNGE_LIGHTSPEED_S: 1.2,
  /** ENTER: the slow final approach (power1.in) — dist DIST_LS_END→FLOOR;
   * the black veil completes coverage only in the tail (the color-seam
   * trick), then the black-frame call hides the march + covert-jumps. */
  PLUNGE_ENTER_S: 1.8,
  /** PURE SPEED: inside the black — streaks at full, warp holds WARP_MAX;
   * the camera pan silently unwinds beneath the covered frame. */
  // 0.7 -> 0.5: the on-the-nose part of "continua l'effetto anche dopo" —
  // full black, streaks at peak, no hole to justify them. 0.5s still lets
  // pan01 unwind and leaves SignatureLine's PROGRESS_DAMP = 6 camera chase at
  // e^-3 ≈ 5% residual over the covert jump, which is the constraint here.
  PLUNGE_SPEED_S: 0.5,
  /** EMERGENCE: the black opens, streaks die, the divario ZOOMS IN. */
  // 1.1 -> 0.9: the streaks must be done decelerating by the time the divario
  // is legible. Total shot 6.9s -> 6.1s.
  PLUNGE_EMERGE_S: 0.9,

  // --- Warp drive (timeCoef target; module lerps 0.02/frame) ---------------
  WARP_MIN: 2,
  WARP_MAX: 100, // reached across LIGHT-SPEED (MIN→MAX), held through
  // ENTER + PURE SPEED
  WARP_EMERGE: 8, // the streaks die toward this as the black opens

  // --- Island center-lock ramp (fraction of plungeT) -----------------------
  // 0.25 × the ~6.9s total ≈ the end of TRAVERSE: the hole is exactly
  // centered as the lock completes, before the light-speed jump.
  PLUNGE_LOCK_T: 0.25,

  // --- Divario zoom-in landing (transform/opacity only) --------------------
  ZOOM_SCALE_START: 0.8, // [data-emerge] scale at black-open start
  ZOOM_PULL: 0.1, // translate toward the vanishing point (fraction)

  // --- DPR cap during the heavy near-hold + one-shot (hysteresis) ----------
  DPR_CAP_ON: 0.85,
  DPR_CAP_OFF: 0.82,
  DPR_CAP: 1.5,

  // --- Scripted march quality step (graft 4; path ≈ 1.82 preserved) --------
  ITER_HI: 96,
  STEP_HI: 0.0095, // 0.0095·96·2 ≈ 1.824
  ITER_LO: 64,
  STEP_LO: 0.0142, // 0.0142·64·2 ≈ 1.818

  // --- Desktop CSS hole imposter (the non-WebGPU stand-in for the march) ---
  /** Base diameter (vh) of the `.seq-imposter` element. `applyHoleVisuals`
   * scales it by `apparent / IMPOSTER_BASE_VH`, so the RENDERED apparent size
   * is invariant in this constant — it only sets the layer's rasterisation
   * base. Desktop-only: the phone beat owns its own `.seq-lite-hole` (below)
   * so the two paths can be tuned independently. */
  IMPOSTER_BASE_VH: 12,

  // === PHONE / COARSE BEAT ("the passage, on a phone") =====================
  // Phase 4 (MOBILE_AUDIT.md §2 + §7 item 4.1), re-cut by MOBILE_HOME_SPEC.md
  // §3. Panel 05 is the PINNED FOREGROUND PLATE of this beat, not a vertical
  // section sitting above it: one 100svh sticky stage under a 180svh runway
  // gives 80svh (675px at 390×844) of scrub travel carrying hold → copy
  // handoff → the 1/d dive. The star field spins up from drift to light
  // speed, the black closes over the frame, and the streaks die inside it.
  // NO input lock, NO covert jump — MOBILE_AUDIT.md §5 already decided touch
  // keeps native scrolling, and the desktop one-shot's touchmove/preventDefault
  // hijack is exactly what must not ship here.
  //
  // Every value below is a pure function of the ScrollTrigger progress `t`,
  // so the whole beat reverses cleanly and never needs a state machine.
  /** Runway height in **svh** (small-viewport height — the address-bar-VISIBLE
   * viewport). Named `_SVH` deliberately: `vh` is the LARGE viewport, so
   * reading this as `vh` reintroduces exactly the address-bar jump the unit
   * was chosen to remove (MOBILE_AUDIT.md D-7), and svh needs no resize
   * listener to stay frozen (it is defined against the bar-visible viewport,
   * so a bar collapse cannot rewrite it mid-scroll).
   *
   * 180 (MOBILE_HOME_SPEC.md §3.4), and this is now the WHOLE section: the
   * sticky stage owns 100 of it — panel 05 rides inside that stage — and the
   * spacer below it is the remaining 80. So the SCRUB TRAVEL is 80svh ≈ 675px
   * at 390×844, 2.67× the 253px this beat had while the panel was a separate
   * vertical block above the runway. Below ~140 the beat is a flick (a 1/d
   * curve compressed into a quarter of a thumb drag reads as a disc that pops,
   * not as a fall); above ~200 the empty-scroll complaint returns. */
  LITE_RUN_SVH: 180,

  // --- The hole (a CSS layer on the same 1/d divergence law) ---------------
  /** `.seq-lite-hole` element diameter in svh — the rasterisation base only.
   * Apparent size = BASE × scale, so this constant is invisible in the
   * composition; it exists to keep the MAX UPSCALE modest, because a
   * composited layer is rastered once and then stretched.
   *
   * 96 (was 56, and 12 before that): max upscale 170/96 = **1.77×**, down
   * from 3.04× and from ~14×. The layer is rastered 1:1 at t ≈ 0.834, i.e. it
   * is scaled DOWN — sharp — for the first 83% of the beat, and the only
   * frames where it is stretched at all sit behind a ~70%-closed veil. This
   * one constant is the ring-mush fix (MOBILE_HOME_SPEC.md §3.9). */
  LITE_HOLE_BASE_VH: 96,
  /** Apparent diameter at t = 0. 15, not 22: the hole now sits BEHIND panel
   * 05's live copy through the hold band, as a dark well under the type, and
   * must not compete with the H2. It is still an order of magnitude past the
   * desktop's 12vh first read — nothing here spends its opening as a dot. */
  LITE_HOLE_START_VH: 15,
  /** Apparent diameter at t = 1 — the frame is swallowed. */
  LITE_HOLE_END_VH: 170,
  /** Growth ease: apparent = START·(END/START)^(t^POW). POW > 1 keeps the
   * physical acceleration (1/d diverges); 1.45 rather than 1.25 because with
   * 2.7× the travel the growth can be back-loaded without the first half
   * reading as a static disc. Apparent at t 0.20 / 0.34 / 0.70 / 0.90 =
   * 19 / 25 / 64 / 120 svh. */
  LITE_HOLE_EASE_POW: 1.45,
  /** Fade-in band for the hole layer, from 0 to LITE_HOLE_HOLD_ALPHA. 0.14 ≈
   * 94px of scroll on the 675px runway — it settles well inside the hold band
   * and then sits still under the copy. (At 0.08 an earlier trace showed
   * 0 → 1 inside 20px, which is a cut, not a fade.) */
  LITE_HOLE_IN_END: 0.14,
  /** Hole alpha during the HOLD band: a dark well under live copy, never a
   * competing subject. It lifts to 1.0 across the copy-handoff band
   * [LITE_HOLD_END, LITE_COPY_OUT_END] — the copy dissolves and the hole
   * takes the frame it was sitting in. */
  LITE_HOLE_HOLD_ALPHA: 0.35,

  // --- The copy handoff (panel 05 IS the foreground plate) ----------------
  /** Panel 05 is fully legible, motionless and INTERACTIVE up to here —
   * 0.20 × 675px = 135px of scroll where nothing but reading happens. */
  LITE_HOLD_END: 0.2,
  /** Copy fully faded and the panel inert by here. `copyOpacity = 1 −
   * seqSmooth(t, LITE_HOLD_END, LITE_COPY_OUT_END)`, and the panel's entry-Y
   * grammar ((1−α)·16px, the spine StagePanel's exact offset) runs in
   * reverse. `setPanelInteractive` follows the visual state, never leads it —
   * see THE ACCESSIBILITY CONTRACT in singularity-passage.tsx. */
  LITE_COPY_OUT_END: 0.34,

  // --- The star field (the raw-WebGL1 point tunnel, reused verbatim) -------
  /** Canvas alpha ramp-in END. 0.30: the field arrives WITH THE DIVE, not
   * under the copy (the tunnel host is a fixed z-40 layer — it paints OVER
   * the pinned panel, so it may not be lit while the copy is being read; the
   * ramp therefore opens at LITE_HOLD_END and completes here, rising exactly
   * as the copy dissolves). */
  LITE_TUNNEL_IN_END: 0.3,
  /** Peak canvas alpha. */
  LITE_TUNNEL_ALPHA: 0.9,
  /** The streaks die inside the black across [this, LITE_TUNNEL_OUT_END] —
   * the frame is left clean before the stage scrolls away. */
  LITE_TUNNEL_OUT_START: 0.86,
  LITE_TUNNEL_OUT_END: 0.98,
  /** Warp (timeCoef) ramp band and peak. 60, not the desktop's 100: the
   * streak length the eye reads is angular, and a 390px-wide frame reaches
   * "light speed" at a much lower coefficient.
   *
   * Re-timed to 0.34 → 0.80 (was 0.22 → 0.72): the spin-up now begins exactly
   * where the copy handoff ends, so the warp is the dive's own verb rather
   * than something happening behind live text. The payoff still completes
   * before the tail — the last 20% is only the arrival normalising, and the
   * tail of a flick is where momentum is most likely to skip frames. */
  LITE_WARP_START: 0.34,
  LITE_WARP_END: 0.8,
  LITE_WARP_PEAK: 60,
  /** Ceiling on the *requested* target handed to the tunnel module. The
   * module lerps its own timeCoef toward the target at a fixed 2%/frame
   * (~0.8s time constant) — fine for the desktop's 4s timeline, useless for a
   * scrub — so the passage requests an overshoot to make the warp genuinely
   * scroll-linked (see TUNNEL_COEF_LERP in singularity-passage.tsx). This cap
   * bounds that overshoot: it limits the climb to ~2%·(240 − current) per
   * frame ≈ 0.25s from rest to peak, and bounds the worst case if the
   * module's lerp constant ever changes underneath us. */
  LITE_WARP_REQ_MAX: 240,

  // --- The entry (two opacity-only layers; see the JSX) --------------------
  /** #000 radial veil — "we are inside it". Its centre is the same black as
   * the hole's core, so the coverage completes on a colour seam. It is also
   * THE SWALLOW window: `liteSwallow` runs 0→1 across this band and
   * SignatureLine multiplies its `uReveal` by (1 − liteSwallow), so the
   * filament the reader has followed since the hero is extinguished inside
   * the hole rather than merely covered by it (MOBILE_HOME_SPEC.md §3.5).
   * The hole crosses its 1:1 raster size at t ≈ 0.834, i.e. behind a veil
   * that is already ~70% closed. */
  LITE_VEIL_START: 0.7,
  LITE_VEIL_END: 0.9,
  /** Flat page-navy cover — the arrival. It normalises the frame to
   * `hsl(var(--bg))` before the sticky stage scrolls away, so the handoff to
   * the divario has no visible edge (a black rectangle sliding up over a navy
   * page is the artefact this removes). Ends at 0.98, not 1: a momentum tail
   * that overshoots the last few percent of the runway must still find the
   * frame normalised. */
  LITE_COVER_START: 0.88,
  LITE_COVER_END: 0.98,

  // --- Budget (resolution and overdraw FIRST — MOBILE_AUDIT.md §5.5) -------
  /** Hard DPR cap asserted on the R3F canvas for the whole approach band.
   * Mobile GPUs are tile-based and fill-bound (cost ∝ DPR²) and the beat runs
   * the point tunnel + three composited full-frame layers on top of the
   * persistent canvas — so the canvas gives up its resolution first. Nothing
   * on it is legible during the beat (SignatureLine + DriftParticles behind a
   * closing black frame), which makes this the cheapest lever available. */
  LITE_DPR_CAP: 1,
  /** `navigator.hardwareConcurrency` at or below this → the CSS-only beat (no
   * point tunnel). The narrow, additive capability check for this module: a
   * phone reporting ≤4 cores in 2026 is genuinely old, and the CSS layers
   * alone still carry the full 1/d move. Deliberately NOT a tierStore change
   * — see the FALLBACK MATRIX in singularity-passage.tsx. */
  LITE_MIN_CORES: 4,

  // --- Phase 4c kill-switch: the raymarch TWIN on capable phones -----------
  /** mobile-parity plan Phase 4c (plans/2026-08-17-mobile-parity.md): when
   * TRUE, a capable WebGPU phone (`fxBudget.raymarchLite && backend ===
   * "webgpu"`) mounts `<SequenceSingularity lite />` — the real TSL march at
   * the low step (ITER_LO / STEP_LO, path ≈ 1.82 preserved) under the
   * LITE_DPR_CAP the coarse branch already asserts — and the coarse branch of
   * singularity-passage.tsx feeds it the scrub inputs, keeps its CSS hole as
   * the imposter until `marchLive` and drops its point tunnel (island and
   * fallback are mutually exclusive). Scene.tsx additionally ANDs `tier !==
   * "full"` into the `lite` prop, so a dev `?fx=2` on a fine-pointer desktop
   * keeps the desktop grammar.
   * DEFAULT OFF until the real-device gate passes (plan Phase 4c / Phase 6:
   * at 390 px the lensed ring with bloom lite must read like the desktop in a
   * side-by-side screenshot AND hold ≥ 50 fps; either failing ⇒ this stays
   * false and the CSS composite beat remains the shipped phone path). Typed
   * `boolean` on purpose so the flip is a one-character change with no type
   * ripple; desktop (`tier full` ⇒ raymarchLite false) never consults it.
   *
   * THE DEVICE GATE RAN 2026-09-09 AND FAILED — back to false.
   *
   * Turned on that day at the owner's request ("manca il buco nero … nella
   * sezione del viaggio a velocità della luce") because he is exactly the
   * handset this flag was waiting for: a 393×695 iPhone, confirmed through
   * /diag as backend webgpu at fxBudget level 2. He reported back within the
   * hour — "da telefono il buco nero fa laggare la pagina". That is the
   * ≥50fps criterion above, judged by the only instrument that can judge it,
   * and the rule this flag ships with is explicit about what happens next:
   * either criterion failing ⇒ false, and the CSS composite beat stays the
   * phone path. So it does.
   *
   * The march is already at ITER_LO/STEP_LO under LITE_DPR_CAP 1, i.e. the
   * cheap end of the knobs it has. Re-enabling wants a real profile of that
   * section on a handset — which cannot be taken from the dev machine, since
   * the Browser pane does not composite while hidden — not another guess at
   * the iteration count.
   */
  LITE_RAYMARCH: false as boolean,
} as const;

/** Camera pan amplitude as a fraction of worldViewWidth (SignatureLine and
 * the island must agree — the hole's fixed world X is this same product so
 * it lands dead-center at pan end). */
export const SEQ_PAN_FRAC = 0.55;

/** Apparent-height constant: 2 / (2·tan(CAMERA_FOV/2)) with FOV 50°.
 * apparent height fraction of the viewport = SEQ_APPARENT_K / dist — the
 * owner's 1/distance divergence law, exactly. (Kept as a literal so this
 * module never imports three; SequenceSingularity re-derives the same value
 * from CAMERA_FOV and the two must match.) */
export const SEQ_APPARENT_K = 2.1445;

// === Tiny pure helpers (shared by the DOM passage + the CSS imposter) ======
export const seqClamp01 = (x: number): number =>
  x < 0 ? 0 : x > 1 ? 1 : x;
/** Linear 0..1 ramp of x across [a, b]. */
export const seqRamp = (x: number, a: number, b: number): number =>
  seqClamp01((x - a) / (b - a));
/** Smoothstep of the same ramp. */
export const seqSmooth = (x: number, a: number, b: number): number => {
  const t = seqRamp(x, a, b);
  return t * t * (3 - 2 * t);
};

// === Store =================================================================
interface SeqState {
  /** True while the desktop cinematic sequence owns its scroll range (the
   * armed matchMedia context is live). Every WebGL consumer no-ops at false. */
  active: boolean;
  /** True while inside the approach band (section −1 viewport → +250vh past
   * the passage): the island keeps its march build alive only inside it. */
  armed: boolean;
  /** True once the island's raymarch build is live — suppresses the DOM CSS
   * hole imposter on the non-WebGPU/fallback path. */
  marchLive: boolean;
  /** True when createPreloaderTunnel returned null (no WebGL1): the veil
   * carries the plunge alone — a dark entry, never a dead cut (graft 5). */
  tunnelNull: boolean;
  /** Main passage scrub progress 0..1 — FROZEN at ~TRIGGER_P while the
   * one-shot owns the frame; traverse → near hold on reverse entry only. */
  p: number;
  /** One-shot plunge timeline progress 0..1 (0 while idle/reversible). */
  plungeT: number;
  /** Eased camera-pan progress 0..1 (includes the 2% SETTLE pre-drift; the
   * one-shot completes it →1 across TRAVERSE, then unwinds it 1→0 under the
   * black frame). SignatureLine multiplies by SEQ_PAN_FRAC ×
   * worldViewWidth. */
  pan01: number;
  /** Camera→hole distance, world units (the ONLY size driver — the island
   * never scales the proxy sphere). Scrub (reverse entry): 16→2.6. One-shot:
   * launch→12→10→1.9 (TRAVERSE → LIGHT-SPEED → ENTER). */
  dist: number;
  /** Vertical hole offset as a fraction of view height at the hole plane
   * (graft 2: −0.08 entering, 0 by HOLD 1). */
  holeYFrac: number;
  /** Raymarch uFade 0..1. Lensing-first ramp-in on the traverse; NEVER fades
   * out on scroll — dropped to 0 only under the one-shot's full-black frame. */
  holeFade: number;
  /** uEnvStarAlpha 0.9→0.4 (graft 1 falloff across APPROACH). */
  starAlpha: number;
  /** Tunnel canvas opacity 0..1 — one-shot timeline territory only. */
  tunnelAlpha: number;
  /** Tunnel warp target (timeCoef; the module lerps toward it 0.02/frame).
   * WARP_MIN at rest; the one-shot rides it to WARP_MAX and back down. */
  warp: number;
  /** Hole apparent-center in canvas UV space (0..1, y-up — the zoom-blur
   * uCenter convention). Island-written; eased to exact 0.5/0.5 across the
   * one-shot's first PLUNGE_LOCK_T. */
  holeNdcX: number;
  holeNdcY: number;

  // === The phone beat's ONLY two published scalars (MOBILE_HOME_SPEC §3.4) ==
  /** True while the coarse-pointer branch owns the section (its matchMedia
   * context is live). Every reader must gate on this: on a fine pointer it is
   * false forever, so a `tier === "full"` build can never reach the swallow. */
  lite: boolean;
  /** 0→1 across [LITE_VEIL_START, LITE_VEIL_END] — the swallow. A pure
   * function of the passage's scrub `t` (same easing as the veil, so the line
   * dies exactly as the black closes), read by SignatureLine's useFrame via
   * getState() and multiplied into `uReveal`. Nothing round-trips. */
  liteSwallow: number;

  // === WARP-JUMP fields (round 3 §C, igloo grammar — desktop one-shot ONLY;
  // the phone/RM variants never write these, so they stay 0 there) ==========
  /** NET camera up-flip roll about the view axis, RADIANS (0 at rest). The
   * passage composes igloo's two-channel move per timeline tick — upRotation
   * 0→π (power3.inOut) overlapped by the lerp-back-to-world-up settle — into
   * this ONE angle: φ = atan2((1−s)·sinθ, (1−s)·cosθ + s). CONSUMED ONLY in
   * SignatureLine's camera-authority frame (camera.rotateZ, additive, after
   * every other orientation writer). */
  upFlip: number;
  /** Fov widen in DEGREES added to CAMERA_FOV (0 at rest, up to +8 at max
   * warp — igloo's 22→30 ramp transposed). SignatureLine applies it with an
   * updateProjectionMatrix call gated on a >0.01° change. */
  fovShift: number;
  /** Deterministic sine-noise camera-shake amplitude, RADIANS (igloo's
   * shake.setScalar(0.02) grammar): 0 → 0.02 near the horizon, 0 after
   * emergence. SignatureLine evaluates the stacked-sine noise (sineNoise1
   * port — never Math.random in a frame path). */
  shakeAmp: number;
  /** Ring-passage burst spike 0→1→0 (igloo uRingProximity envelope: 0.5s
   * power1.in up / 0.4s power1.out down), fired at the horizon crossing and
   * at emergence. Read via getState in PostFXNodes' useFrame and damped
   * there; drives the TSL angular-smear / block-glitch / sat-value lift,
   * which is If-guarded so idle cost ≈ 0. */
  burst: number;
  /** Per-burst seed (igloo uSquareAttr: .x/.y = noise-lookup offset, .z =
   * block-glitch intensity). Randomized ONCE at fire time (Math.random is
   * allowed there, never per frame). Three scalars — this module stays
   * three-free, no Vector3. */
  burstSeedX: number;
  burstSeedY: number;
  burstSeedZ: number;

  // === P0 disarm hardening (2026-08-21): the passage's measured armed band
  // as PAGE-PROGRESS fractions, published by the desktop path's cache() on
  // every ScrollTrigger refresh. SequenceSingularity's useFrame clamps
  // group.visible to false whenever scrollStore.progress sits outside
  // [armedLoP, armedHiP] — a deterministic belt-and-braces gate that cannot
  // go stale with downstream layout changes (defaults 0/1 = permissive until
  // the passage measures; reset with the store). ============================
  armedLoP: number;
  armedHiP: number;
}

const SEQ_DEFAULTS: SeqState = {
  active: false,
  armed: false,
  marchLive: false,
  tunnelNull: false,
  p: 0,
  plungeT: 0,
  pan01: 0,
  dist: SEQ.DIST_FAR,
  holeYFrac: SEQ.Y_FRAC_ENTER,
  holeFade: 0,
  starAlpha: SEQ.STAR_HI,
  tunnelAlpha: 0,
  warp: SEQ.WARP_MIN,
  holeNdcX: 0.5,
  holeNdcY: 0.5,
  lite: false,
  liteSwallow: 0,
  upFlip: 0,
  fovShift: 0,
  shakeAmp: 0,
  burst: 0,
  burstSeedX: 0,
  burstSeedY: 0,
  burstSeedZ: 1,
  armedLoP: 0,
  armedHiP: 1,
};

const createSeqStore = () => create<SeqState>(() => ({ ...SEQ_DEFAULTS }));

declare global {
  // eslint-disable-next-line no-var
  var __sersanSeqStore: ReturnType<typeof createSeqStore> | undefined;
}

/** Pinned on globalThis — imported from BOTH the route bundle and the lazy
 * WebGL island chunk (see the header + textMorphStore's identical note). */
export const useSeqStore = (globalThis.__sersanSeqStore ??= createSeqStore());

/** Full reset (passage teardown: language toggle, viewport class change,
 * unmount). `marchLive` is preserved — it belongs to the island's build
 * lifecycle, which tears down on its own `armed` edge. */
export function resetSeqStore(): void {
  const { marchLive } = useSeqStore.getState();
  useSeqStore.setState({ ...SEQ_DEFAULTS, marchLive });
}
