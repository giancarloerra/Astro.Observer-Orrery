// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// galaxy.js
//
// Static galactic context view fed by data/galaxy.json, core project data
// that fails loudly like planets.json: where the solar system sits in the
// Milky Way and which way it is heading. A view swap, not a zoom: single
// precision cannot hold the galactic-centre distance and a planetary
// position in one frame, so this layer lives at ordinary scene scale like
// the starfield shell, and main.js swaps the planetary layers away while it
// shows. Nothing here depends on the simulated clock; the view is a fixed
// sketch of cited structure.
//
// Drawn top-down from the north galactic pole: the seven spiral arm
// centrelines fitted by Reid et al. 2019 (ApJ 885, 131, Table 2), each the
// log-periodic spiral R(beta) = R_kink * exp(-(beta - beta_kink) * tan psi)
// with the pitch angle changing at the kink azimuth, sampled strictly over
// the fitted azimuth range and never beyond it; Sagittarius A* at the
// centre; the Sun at its measured distance from the centre (GRAVITY
// collaboration 2022); an arrow at the Sun along the direction of galactic
// rotation, which is clockwise from this viewpoint as the source states.
// No orbit line is drawn around the centre, deliberately: the Sun's
// galactic orbit does not close, and a closed ellipse would invent one.
//
// Every physical number comes from data/galaxy.json (provenance in
// DATA-SOURCES.md). The constants below are presentational layer sizing and
// tuning, not astronomy data, and are marked so.

import * as THREE from 'three';

const DEG = Math.PI / 180;

// Presentational constants (layer sizing and tuning, not astronomy data).
const UNITS_PER_KPC = 600; // scene units per kiloparsec of the sketch
const ARM_STEP_DEG = 0.5; // centreline sample spacing in azimuth
const ARM_COLOUR = 0x6e6a62; // arm centrelines, dim warm grey
const ARM_OPACITY = 0.55;
const MARKER_COLOUR = 0x8b8f98; // Sgr A* dot and the rotation arrow, grey family
const SUN_COLOUR = 0xe0a458; // Sun marker, accent family
const SUN_PX = 8; // Sun dot on-screen diameter, pixels
const CORE_PX = 6; // Sgr A* dot on-screen diameter, pixels
const ARROW_GAP_KPC = 0.3; // arrow shaft start, clear of the Sun dot
const ARROW_LEN_KPC = 1.6; // arrow shaft length
const ARROW_HEAD_KPC = 0.35; // arrow head stroke length
const ARROW_HEAD_DEG = 25; // arrow head stroke half-angle
const FRAME_MARGIN = 1.25; // overhead framing clearance around the sketch
const FRAME_TILT = 0.1; // slight camera offset keeping OrbitControls' up defined
const MIN_CAMERA_KPC = 2; // zoom clamps while the view is active
const MAX_CAMERA_KPC = 60;

// ---- validation ----

// Strict numeric read of the stored digit-preserving strings: Number, not
// parseFloat, so a trailing unit or other junk fails loudly instead of being
// silently truncated (the same rule comets.js applies).
function armNumber(arm, key, name) {
  const raw = arm[key];
  const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(v)) {
    throw new Error(`galaxy.json arm ${name}: "${key}" is not numeric`);
  }
  return v;
}

// Shape check for data/galaxy.json (schema in DATA-SOURCES.md): an "arms"
// array carrying each fitted arm's azimuth range, kink azimuth and radius
// and the two pitch angles, and a "sun" object with the Sun's distance from
// the galactic centre in parsecs. Anything off throws; the caller surfaces
// the error visibly. Returns the parsed numeric records the layer renders.
export function validateGalaxy(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('galaxy.json must be an object');
  }
  if (!Array.isArray(data.arms) || data.arms.length === 0) {
    throw new Error('galaxy.json needs a non-empty "arms" array');
  }
  const arms = [];
  for (const arm of data.arms) {
    if (typeof arm !== 'object' || arm === null || Array.isArray(arm)) {
      throw new Error('galaxy.json arms entries must be objects');
    }
    if (typeof arm.name !== 'string' || arm.name === '') {
      throw new Error('galaxy.json arm needs a non-empty "name" string');
    }
    const rec = {
      name: arm.name,
      betaMin: armNumber(arm, 'beta_min_deg', arm.name),
      betaMax: armNumber(arm, 'beta_max_deg', arm.name),
      betaKink: armNumber(arm, 'beta_kink_deg', arm.name),
      rKink: armNumber(arm, 'r_kink_kpc', arm.name),
      psiBefore: armNumber(arm, 'psi_before_kink_deg', arm.name),
      psiAfter: armNumber(arm, 'psi_after_kink_deg', arm.name),
    };
    if (!(rec.betaMin < rec.betaMax)) {
      throw new Error(`galaxy.json arm ${arm.name}: beta_min_deg must be below beta_max_deg`);
    }
    if (!(rec.rKink > 0)) {
      throw new Error(`galaxy.json arm ${arm.name}: r_kink_kpc must be positive`);
    }
    arms.push(rec);
  }
  if (typeof data.sun !== 'object' || data.sun === null || Array.isArray(data.sun)) {
    throw new Error('galaxy.json needs a "sun" object');
  }
  const r0Raw = data.sun.r0_pc;
  const r0Pc = typeof r0Raw === 'string' && r0Raw.trim() !== '' ? Number(r0Raw) : NaN;
  if (!Number.isFinite(r0Pc) || !(r0Pc > 0)) {
    throw new Error('galaxy.json sun needs a positive numeric "r0_pc" string');
  }
  return { arms, r0Kpc: r0Pc / 1000 };
}

// ---- geometry ----

// The fitted centreline radius in kpc at azimuth betaDeg: the source's
// log-periodic spiral, pitch angle psi_before at and below the kink azimuth
// and psi_after above it (Reid et al. 2019, Sect. 3 and Table 2).
function armRadiusKpc(arm, betaDeg) {
  const psi = betaDeg <= arm.betaKink ? arm.psiBefore : arm.psiAfter;
  return arm.rKink * Math.exp(-((betaDeg - arm.betaKink) * DEG) * Math.tan(psi * DEG));
}

// Galactocentric azimuth and radius -> scene position. The source defines
// beta as 0 toward the Sun, increasing in the direction of Galactic
// rotation, with rotation clockwise viewed from the north Galactic pole; in
// the galactic plane that is X = R sin(beta), Y = R cos(beta) with the Sun
// on +Y. The scene is y-up, so the plane maps to (x, 0, -y): viewed from
// overhead the Sun reads at the top and increasing beta runs to the right,
// matching the source's plan-view figure.
function planePoint(betaDeg, rKpc) {
  return new THREE.Vector3(
    rKpc * Math.sin(betaDeg * DEG) * UNITS_PER_KPC,
    0,
    -rKpc * Math.cos(betaDeg * DEG) * UNITS_PER_KPC
  );
}

function makeDotTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- feature wiring ----

// data is the validateGalaxy result. Builds the whole layer hidden; main.js
// owns the view swap (setVisible, the overhead camera framing and the
// control clamps) and calls updateFrame each frame for the labels and the
// constant-size dots.
export function initGalaxy({ data, sceneApi }) {
  const { scene, camera } = sceneApi;
  const labelLayer = document.getElementById('labels');

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Fine-print labels, projected each frame like the body labels; anchors
  // carry the world position each label tracks. below places the label under
  // its anchor instead of over it (the rotation arrow's, clear of the Local
  // arm's label beside the Sun).
  const anchors = [];

  function makeLabel(text, pos, extraClass, below = false) {
    const el = document.createElement('div');
    el.className = extraClass ? `galaxy-label ${extraClass}` : 'galaxy-label';
    el.textContent = text;
    labelLayer.appendChild(el);
    anchors.push({ el, pos, below });
  }

  // ---- arm centrelines ----

  const armMat = new THREE.LineBasicMaterial({
    color: ARM_COLOUR,
    transparent: true,
    opacity: ARM_OPACITY,
  });

  const armLines = [];
  for (const arm of data.arms) {
    // Azimuth samples strictly inside the fitted range, the range ends
    // exact, plus the kink azimuth itself where it falls inside so the
    // pitch-angle change stays sharp.
    const betas = [];
    const steps = Math.ceil((arm.betaMax - arm.betaMin) / ARM_STEP_DEG);
    for (let i = 0; i < steps; i += 1) {
      betas.push(arm.betaMin + i * ARM_STEP_DEG);
    }
    betas.push(arm.betaMax);
    if (arm.betaKink > arm.betaMin && arm.betaKink < arm.betaMax) {
      betas.push(arm.betaKink);
    }
    betas.sort((a, b) => a - b);

    const points = betas.map((b) => planePoint(b, armRadiusKpc(arm, b)));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      armMat
    );
    group.add(line);
    armLines.push({ name: arm.name, line });

    // The arm's name in fine print at its mid-range azimuth.
    const betaMid = (arm.betaMin + arm.betaMax) / 2;
    makeLabel(arm.name, planePoint(betaMid, armRadiusKpc(arm, betaMid)));
  }

  // ---- Sagittarius A*, the Sun and the rotation arrow ----

  const dotTexture = makeDotTexture();

  function makeDot(colour, pos) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTexture,
        color: colour,
        transparent: true,
        depthTest: false,
      })
    );
    sprite.renderOrder = 5;
    sprite.position.copy(pos);
    group.add(sprite);
    return sprite;
  }

  const corePos = new THREE.Vector3(0, 0, 0);
  const sunPos = planePoint(0, data.r0Kpc);
  const coreDot = makeDot(MARKER_COLOUR, corePos);
  const sunDot = makeDot(SUN_COLOUR, sunPos);
  makeLabel('Sgr A*', corePos);
  makeLabel('Sun', sunPos, 'sun');

  // The direction of galactic rotation at the Sun: increasing beta at the
  // Sun's azimuth, which in the mapping above is scene +x (to the right of
  // the overhead framing). Shaft plus two head strokes, hairline like the
  // orientation indicators.
  const arrowMat = new THREE.LineBasicMaterial({
    color: MARKER_COLOUR,
    transparent: true,
    opacity: 0.75,
  });
  {
    const start = sunPos.clone();
    start.x += ARROW_GAP_KPC * UNITS_PER_KPC;
    const tip = sunPos.clone();
    tip.x += (ARROW_GAP_KPC + ARROW_LEN_KPC) * UNITS_PER_KPC;
    const head = ARROW_HEAD_KPC * UNITS_PER_KPC;
    const dx = -head * Math.cos(ARROW_HEAD_DEG * DEG);
    const dz = head * Math.sin(ARROW_HEAD_DEG * DEG);
    const pts = [
      start, tip,
      tip, new THREE.Vector3(tip.x + dx, 0, tip.z + dz),
      tip, new THREE.Vector3(tip.x + dx, 0, tip.z - dz),
    ];
    const arrow = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      arrowMat
    );
    group.add(arrow);
    makeLabel(
      'galactic rotation',
      new THREE.Vector3((start.x + tip.x) / 2, 0, tip.z),
      undefined,
      true
    );
  }

  // Extent of the built sketch, for the overhead framing.
  const bounds = new THREE.Box3().setFromObject(group);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  // ---- view swap hooks ----

  function setVisible(on) {
    group.visible = on;
    if (!on) {
      for (const a of anchors) a.el.style.visibility = 'hidden';
    }
  }

  // Overhead framing: the whole sketch top-down, centred on its extent with
  // the Sun toward the top, at a distance fitting it in the current
  // viewport, with a slight tilt so OrbitControls' y-up stays defined.
  function frameCamera(cam, controls) {
    const half = Math.max(size.z / 2, size.x / 2 / cam.aspect);
    const d = (half / Math.tan((cam.fov / 2) * DEG)) * FRAME_MARGIN;
    controls.target.copy(centre);
    cam.position.set(centre.x, d, centre.z + d * FRAME_TILT);
  }

  // Zoom clamps for the view; main.js restores the per-mode planetary
  // clamps through sceneApi.applyMode on the way out.
  function applyControlLimits(controls) {
    controls.minDistance = MIN_CAMERA_KPC * UNITS_PER_KPC;
    controls.maxDistance = MAX_CAMERA_KPC * UNITS_PER_KPC;
  }

  const tmpV = new THREE.Vector3();
  const dots = [
    [sunDot, SUN_PX],
    [coreDot, CORE_PX],
  ];

  // Runs every frame while the view can be seen, after the camera has
  // settled: keeps the two dots at a constant on-screen size and projects
  // the labels, hiding any that fall behind the camera.
  function updateFrame() {
    if (!group.visible) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fovFactor = Math.tan((camera.fov / 2) * DEG);

    for (const [sprite, px] of dots) {
      const dist = sprite.position.distanceTo(camera.position);
      const s = px * ((2 * dist * fovFactor) / h);
      sprite.scale.set(s, s, 1);
    }

    for (const a of anchors) {
      tmpV.copy(a.pos).applyMatrix4(camera.matrixWorldInverse);
      if (tmpV.z >= 0) {
        a.el.style.visibility = 'hidden';
        continue;
      }
      tmpV.copy(a.pos).project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      a.el.style.visibility = 'visible';
      a.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${a.below ? '60%' : '-160%'})`;
    }
  }

  return {
    setVisible,
    frameCamera,
    applyControlLimits,
    updateFrame,
    // Scene objects exposed for inspection (headless checks and debugging).
    group,
    armLines,
    sunDot,
    coreDot,
  };
}
