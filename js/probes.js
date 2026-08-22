// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// probes.js
//
// Spacecraft and Mars rover sites from data/probes.json, core project data
// that fails loudly like planets.json; there is no fallback and no optional
// path.
//
// Each spacecraft renders as a small marker at the position linearly
// interpolated between its stored JPL Horizons samples at the simulated time,
// plus its full sampled trajectory as a line joining the stored points. Both
// exist only while the simulated time is inside the craft's span_jd: outside
// it neither marker nor path is shown, so the scene never presents a craft
// outside its recorded mission ephemeris. The markers register with the scene
// as followable bodies (scene.js addProbe), so the body list, fly-to and
// labels treat them like any other body; the control-bar "Probes" toggle
// (default on) governs the whole layer.
//
// Rover pins attach to Mars's tilt group at each site's stored current-rover
// coordinates, exactly like the Earth photo pins in skymap.js pin to Earth's
// globe, and are shown while the camera is near Mars. Clicking one opens the
// info card (wired in main.js), not a photo link.
//
// Every position comes from probes.json; the constants below are
// presentational marker sizing and visibility tuning, not astronomy data,
// and are marked so.

import * as THREE from 'three';

const DEG = Math.PI / 180;

// Presentational constants (marker sizing and visibility tuning, not data).
const PATH_COLOUR = 0x6f7480; // trajectory line tint, grey family, presentational
const PATH_OPACITY = 0.55; // trajectory line opacity, presentational
const ROVER_PIN_PX = 9; // rover pin diameter on screen, pixels (matches the Earth pins)
const ROVER_PIN_LIFT = 1.005; // pin offset from the centre, body radii (just above the surface)
const MARS_PIN_VISIBLE_RADII = 60; // show pins when the camera is this close, display radii
const ROVER_PIN_COLOUR = 0xfff1da; // rover pin tint, warm white for contrast on Mars's surface, presentational

// Spacecraft marker tint, presentational; exported so scene registration in
// main.js uses the one value.
export const PROBE_DOT_COLOUR = 0xbcc6e0;

// ---- validation ----

function reqString(entry, key, slug) {
  const v = entry[key];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`probes.json entry ${slug} needs a non-empty "${key}" string`);
  }
  return v;
}

function reqNumber(entry, key, slug) {
  const v = entry[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`probes.json entry ${slug} needs a finite "${key}" number`);
  }
  return v;
}

// Shape check for data/probes.json (schema in DATA-SOURCES.md): top-level
// metadata strings, one object per spacecraft carrying display_name, span_jd,
// mission_note and a samples array of [jd, x, y, z] with strictly increasing
// Julian days whose ends match span_jd exactly, and a mars_sites object of
// rover sites on Mars. Anything off throws; the caller surfaces the error
// visibly. Returns { craft, rovers } in file order.
export function validateProbes(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('probes.json must be an object');
  }
  const craft = [];
  for (const [key, entry] of Object.entries(data)) {
    if (key === 'mars_sites' || typeof entry === 'string') continue; // metadata strings and the rover block
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`probes.json entry ${key} must be an object or a metadata string`);
    }
    const name = reqString(entry, 'display_name', key);
    const missionNote = reqString(entry, 'mission_note', key);
    if (
      !Array.isArray(entry.span_jd) || entry.span_jd.length !== 2 ||
      !entry.span_jd.every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      !(entry.span_jd[0] < entry.span_jd[1])
    ) {
      throw new Error(`probes.json craft ${key}: "span_jd" must be [start, end] Julian days, start before end`);
    }
    if (!Array.isArray(entry.samples) || entry.samples.length < 2) {
      throw new Error(`probes.json craft ${key}: "samples" must be an array of at least two samples`);
    }
    let prev = -Infinity;
    for (const s of entry.samples) {
      if (
        !Array.isArray(s) || s.length !== 4 ||
        !s.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        throw new Error(`probes.json craft ${key}: every sample must be [jd, x, y, z] finite numbers`);
      }
      if (s[0] <= prev) {
        throw new Error(`probes.json craft ${key}: sample Julian days must strictly increase`);
      }
      prev = s[0];
    }
    if (
      entry.samples[0][0] !== entry.span_jd[0] ||
      entry.samples[entry.samples.length - 1][0] !== entry.span_jd[1]
    ) {
      throw new Error(`probes.json craft ${key}: span_jd must equal the first and last sample Julian days`);
    }
    craft.push({ key, name, missionNote, spanJd: entry.span_jd, samples: entry.samples });
  }
  if (!craft.length) throw new Error('probes.json carries no spacecraft entries');

  const sites = data.mars_sites;
  if (typeof sites !== 'object' || sites === null || Array.isArray(sites)) {
    throw new Error('probes.json needs a "mars_sites" object');
  }
  const rovers = [];
  for (const [key, entry] of Object.entries(sites)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`probes.json mars_sites entry ${key} must be an object`);
    }
    if (entry.body !== 'Mars') {
      throw new Error(`probes.json mars_sites entry ${key}: only Mars rover sites are supported ("body" is "${entry.body}")`);
    }
    rovers.push({
      key,
      name: reqString(entry, 'display_name', key),
      missionNote: reqString(entry, 'mission_note', key),
      latDeg: reqNumber(entry, 'rover_lat_deg', key),
      lonEastDeg: reqNumber(entry, 'rover_lon_east_deg', key),
    });
  }
  return { craft, rovers };
}

// ---- interpolation ----

// Heliocentric ecliptic position in au at Julian date j, linearly
// interpolated between the two bracketing stored samples, or null outside
// the craft's span (the craft then does not exist in the scene; nothing is
// extrapolated).
function positionAt(craft, j) {
  if (j < craft.spanJd[0] || j > craft.spanJd[1]) return null;
  const s = craft.samples;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid][0] <= j) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const t = (j - a[0]) / (b[0] - a[0]);
  return {
    x: a[1] + (b[1] - a[1]) * t,
    y: a[2] + (b[2] - a[2]) * t,
    z: a[3] + (b[3] - a[3]) * t,
  };
}

// ---- feature wiring ----

// data is the validateProbes result. Registers every craft with the scene as
// a followable probe body, builds the trajectory lines and the Mars rover
// pins, and returns the per-frame and per-mode hooks main.js drives. The
// probesOn boot state (persisted preference or the default, off) comes from
// main.js, which also owns the toggle consequences that cross modules.
export function initProbes({ data, sceneApi, modes, probesOn }) {
  const { scene, camera, bodies } = sceneApi;

  const pathMat = new THREE.LineBasicMaterial({
    color: PATH_COLOUR,
    transparent: true,
    opacity: PATH_OPACITY,
  });

  const craftRecs = [];
  for (const craft of data.craft) {
    const rec = sceneApi.addProbe({
      name: craft.name,
      positionAu: (j) => positionAt(craft, j),
      colourHex: PROBE_DOT_COLOUR,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(craft.samples.length * 3), 3)
    );
    const line = new THREE.Line(geo, pathMat);
    line.visible = false; // per-frame gate below: Probes toggle and span
    scene.add(line);
    craftRecs.push({ craft, rec, line });
  }

  // Trajectory vertices re-map the stored au samples through the current
  // scale mode, the same distance law every heliocentric position uses.
  function refreshPaths() {
    for (const { craft, line } of craftRecs) {
      const attr = line.geometry.getAttribute('position');
      for (let i = 0; i < craft.samples.length; i += 1) {
        const s = craft.samples[i];
        const v = modes.planetToScene({ x: s[1], y: s[2], z: s[3] });
        attr.setXYZ(i, v.x, v.y, v.z);
      }
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }
  refreshPaths();

  // ---- Mars rover pins ----

  // Mesh-local direction for a latitude and east longitude, in the frame
  // scene.js documents (local +x the prime meridian on the equator, +y the
  // north pole, east longitude towards local -z); the same mapping the Earth
  // photo pins use in skymap.js.
  function latLonToLocal(latDeg, lonEastDeg) {
    const lat = latDeg * DEG;
    const lon = lonEastDeg * DEG;
    return new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      -Math.cos(lat) * Math.sin(lon)
    );
  }

  function makePinTexture() {
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

  const marsRec = bodies.get('Mars') || null;
  if (data.rovers.length && !marsRec) {
    throw new Error('probes.json carries Mars rover sites but the scene has no Mars');
  }
  const pinsGroup = new THREE.Group();
  pinsGroup.visible = false;
  const pins = [];
  if (marsRec && data.rovers.length) {
    marsRec.tiltGroup.add(pinsGroup);
    const pinTexture = makePinTexture();
    for (const rover of data.rovers) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: pinTexture,
          color: ROVER_PIN_COLOUR,
          transparent: true,
          depthTest: true, // the globe occludes far-side pins
        })
      );
      sprite.position
        .copy(latLonToLocal(rover.latDeg, rover.lonEastDeg))
        .multiplyScalar(ROVER_PIN_LIFT);
      sprite.userData.rover = rover.name;
      pinsGroup.add(sprite);
      pins.push({ rover, sprite });
    }
  }

  let on = probesOn;

  // The galactic context view (main.js) swaps the whole probe layer away
  // without touching the Probes toggle: layerOn is that gate, ANDed with the
  // toggle and each craft's span everywhere they decide visibility, so
  // leaving the view restores the toggle state unchanged.
  let layerOn = true;

  const tmpV = new THREE.Vector3();

  // The Probes toggle state; scene-side marker visibility is handled by
  // sceneApi.setProbesVisible, which main.js calls alongside this.
  function setVisible(visible) {
    on = visible;
    if (!visible) pinsGroup.visible = false;
  }

  // The galactic view gate (see layerOn above).
  function setLayerVisible(visible) {
    layerOn = visible;
    if (!visible) {
      for (const { line } of craftRecs) line.visible = false;
      pinsGroup.visible = false;
    }
  }

  // Runs every frame after the scene update (which sets each probe rec's
  // exists flag for the simulated time): gates the trajectory lines on the
  // toggle and the span, gates the rover pins on the camera's distance to
  // Mars, and keeps the pins at a constant on-screen size.
  function updateFrame() {
    for (const { rec, line } of craftRecs) {
      line.visible = on && layerOn && rec.exists;
    }

    if (marsRec && pins.length) {
      const near =
        on && layerOn &&
        camera.position.distanceTo(marsRec.worldPos) <
          MARS_PIN_VISIBLE_RADII * modes.bodyRadius(marsRec.radiusKm);
      pinsGroup.visible = near;
      if (near) {
        const h = window.innerHeight;
        const fovFactor = Math.tan((camera.fov / 2) * DEG);
        const parentScale = marsRec.tiltGroup.scale.x; // uniform, set by applyMode
        for (const p of pins) {
          p.sprite.getWorldPosition(tmpV);
          const dist = tmpV.distanceTo(camera.position);
          const worldPerPx = (2 * dist * fovFactor) / h;
          p.sprite.scale.setScalar((ROVER_PIN_PX * worldPerPx) / parentScale);
        }
      }
    }
  }

  return {
    craft: data.craft.map((c) => ({ name: c.name })),
    setVisible,
    setLayerVisible,
    updateFrame,
    applyMode: refreshPaths,
    // Scene objects exposed for picking (main.js) and inspection.
    pins,
    pinsGroup,
  };
}
