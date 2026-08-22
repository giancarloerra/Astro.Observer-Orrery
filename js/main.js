// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// main.js
//
// Wires data loading, the kepler propagation, the three.js scene, the scale
// modes and the UI. The simulated clock starts at the real current time and
// runs inside a requestAnimationFrame loop.
//
// Data loading fails loudly: if a data file cannot be fetched or parsed, a
// plain visible error is shown and nothing is simulated. There is no fallback
// or sample data. The core data files are planets.json, bodies.json,
// moons.json, rotation.json, comets.json (well-known comets), probes.json
// (spacecraft trajectories and Mars rover sites), descriptions.json (the
// info card sentences) and galaxy.json (the galactic context view); all
// eight are fatal on failure.
//
// photos.json and skymap.json are the two optional files: both are
// documented site configuration linking bodies and sky positions to gallery
// photographs, so HTTP 404 means the site chose not to configure them
// (stated once on the console, not an error). A file that exists but is
// malformed is still a visible error.
//
// The interface state (scale mode, toggles, speed, clock, camera, followed
// body, first-arrival card dismissal) persists in one versioned localStorage
// key; see the note above loadStoredState for how that sits outside the
// fail-loudly rule.

import * as THREE from 'three';
import { jd } from './kepler.js';
import { createModes } from './modes.js';
import { createRotationModel } from './rotation.js';
import { createScene } from './scene.js';
import { initUI } from './ui.js';
import { loadSkymap, initSkymap } from './skymap.js';
import { validateComets, addCometBody } from './comets.js';
import { validateProbes, initProbes } from './probes.js';
import { validateGalaxy, initGalaxy } from './galaxy.js';

// Validity range of the JPL planetary elements (1800 AD to 2050 AD); the
// simulated clock is clamped to it and pauses at the edges.
const SIM_MIN_MS = Date.UTC(1800, 0, 1);
const SIM_MAX_MS = Date.UTC(2050, 11, 31, 23, 59, 59, 999);

// Presentational fly-to tuning.
const FLY_DURATION_MS = 800;
const FLY_RADII = 8; // camera distance in multiples of the body's display radius
const FLY_MIN_DIST = { easy: 4, accurate: 0.02 };

// ---- view persistence ----
//
// One versioned localStorage key holds the interface state: scale mode, the
// Axes, Sky photos, Comets and Probes toggles, speed, play state, simulated
// time, camera position and target, the followed body, whether the
// first-arrival usage card has been dismissed, and which view is up (the
// planetary scene or the galactic context view). Saved debounced on change
// and on pagehide; restored at boot before the first frame. Fields added
// after v1 first shipped (the Probes toggle, the usage-card dismissal, the
// view) stay forward compatible: absent from an older snapshot means that
// field's default, and the rest of the snapshot is kept.
//
// Boundary with the fail-loudly rule: the data files are scientific inputs
// and their failures are fatal and visible, never worked around. This key is
// UI preference state, not scientific data, so it gets the opposite
// treatment: a missing key means defaults; a malformed or version-mismatched
// value is discarded, the key removed, one console line states it, and the
// defaults apply. Nothing here masks a data error.
const STORAGE_KEY = 'orrery-ui-v1';
const STORAGE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

// Whether localStorage could be read at boot; loadStoredState clears it when
// the browser blocks storage. The one-off usage card reads it: with nothing
// able to record a dismissal the card would return on every load, so it stays
// hidden instead.
let storageUsable = true;

// ---- deep links ----
//
// A page elsewhere can open the model on one body, at one date, in one view,
// so a link written about Voyager 1 arrives showing Voyager 1 rather than the
// default overview. Four parameters, all optional:
//
//   body=<key>    a key from data/descriptions.json, e.g. voyager-1, saturn
//   t=<date>      a date or date-time the browser can parse, e.g. 2026-08-22
//   view=system|galaxy
//   scale=easy|accurate
//
// Read once at boot and never written back. The URL is a starting state, not
// a mirror of the view, so what is in the address bar always means what it
// said when it was written down and can be shared without capturing whatever
// the visitor did afterwards.
//
// A value this build cannot honour is reported in the control bar, never
// dropped in silence: showing the default view to someone who followed a link
// naming something else is the failure mode worth avoiding.
function readLinkParams() {
  const empty = { body: null, timeMs: null, view: null, mode: null, refused: [] };
  let q;
  try {
    q = new URLSearchParams(location.search);
  } catch {
    // No query string to read is not an error; it is the ordinary case.
    return empty;
  }
  const refused = [];
  const get = (k) => {
    const v = q.get(k);
    return v === null ? null : v.trim();
  };
  const oneOf = (k, allowed) => {
    const v = get(k);
    if (v === null || v === '') return null;
    if (allowed.includes(v)) return v;
    refused.push(`${k}=${v}`);
    return null;
  };

  const mode = oneOf('scale', ['easy', 'accurate']);
  const view = oneOf('view', ['system', 'galaxy']);

  let timeMs = null;
  const t = get('t');
  if (t !== null && t !== '') {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) timeMs = ms;
    else refused.push(`t=${t}`);
  }

  const body = get('body');
  return { body: body || null, timeMs, view, mode, refused };
}

// Which layer a linked body sits behind, decided from the validated data
// before the interface state is built so the layer is on from the first frame
// rather than switched on after it. The keys are the same descriptions.json
// keys the interface uses; missionKey below mirrors the one in boot.
function linkBodyKind(key, bodiesData, famousComets, probesParsed, skymapData) {
  const missionKey = (name) => name.toLowerCase().replace(/ /g, '-');
  if (bodiesData.bodies.some((b) => b.name.toLowerCase() === key)) return 'body';
  if (famousComets.some((c) => c.key === key)) return 'comet';
  if (probesParsed.craft.some((c) => missionKey(c.name) === key)) return 'probe';
  if (probesParsed.rovers.some((r) => missionKey(r.name) === key)) return 'rover';
  // skymap.json is optional site data; its comets are photographed ones.
  if (skymapData && Array.isArray(skymapData.comets)
      && skymapData.comets.some((c) => missionKey(c.name) === key)) return 'comet';
  return null;
}

function fatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

function discardStoredState(reason) {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Removal is best effort; the state below is ignored either way.
  }
  console.info(`Stored view state discarded (${reason}); starting from defaults.`);
  return null;
}

// Returns the validated stored interface state, or null for defaults (no
// key, storage unavailable, or a discarded malformed value).
function loadStoredState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageUsable = false;
    console.info('localStorage unavailable: the view state will not persist.');
    return null;
  }
  // Reading can work where writing throws (private modes, quota, policy). The
  // card must not appear where its dismissal cannot be recorded, so the write
  // is proven here rather than assumed.
  try {
    localStorage.setItem(STORAGE_KEY + '-probe', '1');
    localStorage.removeItem(STORAGE_KEY + '-probe');
  } catch {
    storageUsable = false;
    console.info('localStorage is read-only: the view state will not persist.');
  }
  if (raw === null) return null; // no key: defaults, by design
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return discardStoredState('unreadable JSON');
  }
  if (typeof data !== 'object' || data === null || data.v !== STORAGE_VERSION) {
    return discardStoredState('version mismatch');
  }
  const vec3 = (a) =>
    Array.isArray(a) && a.length === 3 && a.every((n) => Number.isFinite(n));
  const speedOptions = Array.from(
    document.getElementById('speed').options,
    (o) => parseFloat(o.value)
  );
  if (
    (data.mode !== 'easy' && data.mode !== 'accurate') ||
    typeof data.axes !== 'boolean' ||
    typeof data.skyPhotos !== 'boolean' ||
    typeof data.comets !== 'boolean' ||
    typeof data.playing !== 'boolean' ||
    !speedOptions.includes(data.speed) ||
    !Number.isFinite(data.simMs) ||
    !vec3(data.camera) ||
    !vec3(data.target) ||
    (data.follow !== null && typeof data.follow !== 'string')
  ) {
    return discardStoredState('malformed value');
  }
  // Fields added after v1 first shipped are forward compatible: a value
  // absent from an older snapshot means that field's default, so the stored
  // state is kept rather than discarded. The Probes toggle defaults on.
  if (data.probes === undefined) {
    data.probes = false;
  } else if (typeof data.probes !== 'boolean') {
    return discardStoredState('malformed value');
  }
  // The usage-card dismissal, added the same way: absent from an older
  // snapshot means the default, not yet dismissed, so a visitor who has
  // stored state from before the card existed still sees it once.
  if (data.helpSeen === undefined) {
    data.helpSeen = false;
  } else if (typeof data.helpSeen !== 'boolean') {
    return discardStoredState('malformed value');
  }
  // The view, added the same way: absent from an older snapshot means the
  // planetary view, so stored state from before the galactic view existed
  // boots exactly as it did.
  if (data.view === undefined) {
    data.view = 'system';
  } else if (data.view !== 'system' && data.view !== 'galaxy') {
    return discardStoredState('malformed value');
  }
  return data;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  }
  return res.json();
}

// Shape check for photos.json (schema in README.md): a top-level "bodies"
// object keyed by body name, each entry carrying label, gallery_link and an
// images array of {slug, title, thumb, link}. Anything off throws; the
// caller surfaces the error visibly. Returns the bodies map.
function validatePhotos(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data) ||
      typeof data.bodies !== 'object' || data.bodies === null || Array.isArray(data.bodies)) {
    throw new Error('photos.json must be an object with a "bodies" object keyed by body name');
  }
  for (const [name, entry] of Object.entries(data.bodies)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`photos.json entry for ${name} must be an object`);
    }
    if (typeof entry.label !== 'string' || entry.label === '') {
      throw new Error(`photos.json entry for ${name} needs a non-empty "label" string`);
    }
    if (typeof entry.gallery_link !== 'string' || entry.gallery_link === '') {
      throw new Error(`photos.json entry for ${name} needs a non-empty "gallery_link" string`);
    }
    if (!Array.isArray(entry.images)) {
      throw new Error(`photos.json entry for ${name} needs an "images" array`);
    }
    for (const photo of entry.images) {
      if (
        typeof photo !== 'object' || photo === null ||
        typeof photo.thumb !== 'string' || photo.thumb === '' ||
        typeof photo.link !== 'string' || photo.link === '' ||
        typeof photo.title !== 'string' || photo.title === ''
      ) {
        throw new Error(`photos.json images of ${name} need non-empty "thumb", "link" and "title" strings`);
      }
    }
  }
  return data.bodies;
}

// photos.json is optional site configuration (see README.md): absent file
// (HTTP 404) means the photo strip feature is off, stated once on the
// console. Any other failure, including a file that exists but does not
// parse or validate, throws and is surfaced visibly by the caller.
async function loadPhotos() {
  let res = await fetch('./photos.json', { cache: 'no-cache' });
  if (res.status === 404) {
    // One retry after a beat: a deploy swapping the directory can 404 an
    // in-flight request for a moment. A genuinely absent file 404s twice.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    res = await fetch('./photos.json', { cache: 'no-cache' });
  }
  if (res.status === 404) {
    console.info(
      'photos.json not present: photo strips disabled (optional site configuration)'
    );
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to load ./photos.json: HTTP ${res.status}`);
  }
  const data = await res.json();
  return validatePhotos(data);
}

// Shape check for data/descriptions.json (schema in DATA-SOURCES.md): a
// top-level "bodies" object whose entries each carry a non-empty "text"
// sentence and its "source" URL. Anything off throws; the caller surfaces
// the error visibly. Returns the bodies map.
function validateDescriptions(data) {
  if (
    typeof data !== 'object' || data === null || Array.isArray(data) ||
    typeof data.bodies !== 'object' || data.bodies === null || Array.isArray(data.bodies)
  ) {
    throw new Error('descriptions.json must be an object with a "bodies" object');
  }
  for (const [key, entry] of Object.entries(data.bodies)) {
    if (
      typeof entry !== 'object' || entry === null ||
      typeof entry.text !== 'string' || entry.text === '' ||
      typeof entry.source !== 'string' || entry.source === ''
    ) {
      throw new Error(`descriptions.json entry ${key} needs non-empty "text" and "source" strings`);
    }
  }
  return data.bodies;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---- info card value formatting (presentational display precision) ----

function fmtAu(v) {
  return `${v.toFixed(2)} au`;
}

// Long periods read in years: the Julian year of 365.25 days, the same day
// count the JPL algorithm's centuries define (36525 days per century). A
// unit conversion, not a datum.
function fmtPeriod(days) {
  const d = Math.abs(days);
  return d >= 1000 ? `${(d / 365.25).toFixed(1)} years` : `${d.toFixed(1)} days`;
}

// bodies.json stores signed hours (negative means retrograde rotation, per
// its units note); slow rotations read in days (hours / 24).
function fmtRotation(hours) {
  const h = Math.abs(hours);
  const retro = hours < 0 ? ' (retrograde)' : '';
  return h >= 100 ? `${(h / 24).toFixed(2)} days${retro}` : `${h.toFixed(2)} hours${retro}`;
}

function fmtRadius(km) {
  return `${km.toLocaleString('en-GB')} km`;
}

function boot(
  planetsData,
  bodiesData,
  moonsData,
  rotationData,
  skymapData,
  cometsData,
  probesData,
  descriptionsData,
  galaxyData
) {
  const stored = loadStoredState();

  // Validated up front so a malformed core file stops the boot loudly.
  const famousComets = validateComets(cometsData);
  const probesParsed = validateProbes(probesData);
  const descriptions = validateDescriptions(descriptionsData);
  const galaxyParsed = validateGalaxy(galaxyData);

  // Read before anything reads the interface state: the scale mode is fixed
  // at construction, and the clock and the layer toggles are fixed just below.
  const link = readLinkParams();
  const linkKind = link.body
    ? linkBodyKind(link.body, bodiesData, famousComets, probesParsed, skymapData)
    : null;

  const modes = createModes(link.mode || (stored ? stored.mode : 'easy'));

  // Validates every WGCCRE series in rotation.json up front; a malformed
  // entry throws here and surfaces through the fatal handler below.
  const rotationModel = createRotationModel(rotationData);

  const sceneApi = createScene({
    canvas: document.getElementById('scene'),
    labelLayer: document.getElementById('labels'),
    planetsData,
    bodiesData,
    moonsData,
    rotationModel,
    modes,
  });

  // ---- simulated clock and interface state (persisted, see above) ----
  // A URL parameter wins over the stored snapshot, field by field, and the
  // stored snapshot wins over the default. A link naming a date also pauses:
  // at the default speed of a day per second the moment it names would be
  // gone before it could be read.
  //
  // Comets and probes both default off, so a link to one has to turn its layer
  // on here, before initSkymap and initProbes read these flags. A rover pin
  // rides the probes layer too.
  const state = {
    simMs: link.timeMs !== null ? link.timeMs : stored ? stored.simMs : Date.now(),
    speed: stored ? stored.speed : 86400, // default matches the selected markup option (1 day/s)
    playing: link.timeMs !== null ? false : stored ? stored.playing : true,
    axes: stored ? stored.axes : true, // orientation indicators default on, matching the markup
    skyPhotos: stored ? stored.skyPhotos : true,
    comets: linkKind === 'comet' ? true : stored ? stored.comets : false,
    probes:
      linkKind === 'probe' || linkKind === 'rover'
        ? true
        : stored
          ? stored.probes
          : false, // spacecraft and rover pins default off, matching the markup
    helpSeen: stored ? stored.helpSeen : false, // the first-arrival usage card
    view: 'system', // 'system' or 'galaxy'; a stored galaxy view is re-entered after the restore below
    followName: null,
    fly: null,
  };
  // A link naming a date outside the elements' validity is clamped like any
  // other, but says so once the interface exists: silently showing 1800 to
  // someone who asked for 1799 would be the model lying about what it drew.
  const linkTimeClamped = clampSim() && link.timeMs !== null;

  // Optional photo sky-mapping from skymap.json: photographed comets as
  // followable bodies with a photo marker beside each, deep-sky thumbnail
  // markers, Earth pins. Inert when the file is absent (skymapData null).
  const skymap = initSkymap({
    data: skymapData,
    sceneApi,
    modes,
    rotationModel,
    skyPhotosOn: state.skyPhotos,
    cometsOn: state.comets,
    onSkyPhotosToggle(on) {
      state.skyPhotos = on;
      scheduleSave();
    },
  });

  // ---- info card data (descriptions.json plus per-body static values) ----
  //
  // Orbital periods: moons carry theirs in moons.json (the magnitude; the
  // sign there is a simulator convention, see its period_sign_note). A
  // planet's follows from its mean-longitude rate in planets.json: one
  // revolution takes 360 / rate Julian centuries of 36525 days, the century
  // the JPL algorithm defines. A unit conversion of the stored datum, not a
  // new number. Comets carry "per" in their elements.
  const moonPeriodDays = new Map(
    moonsData.moons.map((m) => [m.name, Math.abs(parseFloat(m.orbital_period_days))])
  );
  const planetPeriodDays = new Map(
    planetsData.planets.map((p) => [
      p.name,
      (360 / parseFloat(p.elements.L_deg_rate_per_century)) * 36525,
    ])
  );

  // Every selectable name must carry a description; a gap in the core file
  // is a data error surfaced at boot, never a blank card later.
  function requireDescription(name, key) {
    if (!Object.prototype.hasOwnProperty.call(descriptions, key)) {
      throw new Error(`descriptions.json has no entry "${key}" for ${name}`);
    }
    return key;
  }

  const cardInfo = new Map();
  for (const body of bodiesData.bodies) {
    cardInfo.set(body.name, {
      kind: body.type,
      descKey: requireDescription(body.name, body.name.toLowerCase()),
      periodDays:
        body.type === 'planet'
          ? planetPeriodDays.get(body.name)
          : body.type === 'moon'
            ? moonPeriodDays.get(body.name)
            : null,
      rotationHours: parseFloat(body.sidereal_rotation_period_hours),
      radiusKm: parseFloat(body.mean_radius_km),
      missionNote: null,
    });
  }

  // The photographed skymap comets are already registered; their
  // descriptions key is the same body key that joins them to photos.json.
  for (const comet of skymap.comets) {
    cardInfo.set(comet.name, {
      kind: 'comet',
      descKey: requireDescription(comet.name, skymap.photoKey(comet.name)),
      periodDays: comet.el.periodDays,
      rotationHours: null,
      radiusKm: null,
      missionNote: null,
    });
  }

  // Well-known comets from comets.json join the same Comets toggle, list
  // section and propagation path as the photographed ones; registered after
  // them so the photographed two sort first in the list. They have no photo
  // strip (photos.json carries no entry for them).
  for (const comet of famousComets) {
    addCometBody(sceneApi, comet.name, comet.el);
    cardInfo.set(comet.name, {
      kind: 'comet',
      descKey: requireDescription(comet.name, comet.key),
      periodDays: comet.el.periodDays,
      rotationHours: null,
      radiusKm: null,
      missionNote: null,
    });
  }

  // descriptions.json keys craft and rovers by hyphenated mission name,
  // derived from the display name ("New Horizons" -> "new-horizons").
  const missionKey = (name) => name.toLowerCase().replace(/ /g, '-');
  for (const craft of probesParsed.craft) {
    cardInfo.set(craft.name, {
      kind: 'probe',
      descKey: requireDescription(craft.name, missionKey(craft.name)),
      periodDays: null,
      rotationHours: null,
      radiusKm: null,
      missionNote: craft.missionNote,
    });
  }
  for (const rover of probesParsed.rovers) {
    cardInfo.set(rover.name, {
      kind: 'rover',
      descKey: requireDescription(rover.name, missionKey(rover.name)),
      periodDays: null,
      rotationHours: null,
      radiusKm: null,
      missionNote: rover.missionNote,
    });
  }

  // Spacecraft markers, trajectory lines and Mars rover pins.
  const probes = initProbes({
    data: probesParsed,
    sceneApi,
    modes,
    probesOn: state.probes,
  });

  // The static galactic context view, built hidden; the view swap below
  // shows it and hides the planetary layers.
  const galaxy = initGalaxy({ data: galaxyParsed, sceneApi });

  const { camera, controls } = sceneApi;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const prevFollowPos = new THREE.Vector3();

  // Filled once loadPhotos resolves; null while loading and when photos.json
  // is absent.
  let photosData = null;

  // photos.json keys planets and moons by their lower-cased interface name;
  // comets carry their own key in skymap.json (the "body" field), resolved
  // through the skymap module.
  function photoEntry(name) {
    const key = skymap.photoKey(name) || String(name).toLowerCase();
    return photosData &&
      Object.prototype.hasOwnProperty.call(photosData, key)
      ? photosData[key]
      : null;
  }

  // ---- persistence plumbing ----
  let saveTimer = 0;
  let saveFailed = false;

  function snapshot() {
    return JSON.stringify({
      v: STORAGE_VERSION,
      mode: modes.mode,
      axes: state.axes,
      skyPhotos: state.skyPhotos,
      comets: state.comets,
      probes: state.probes,
      helpSeen: state.helpSeen,
      view: state.view,
      playing: state.playing,
      speed: state.speed,
      simMs: state.simMs,
      camera: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      follow: state.followName,
    });
  }

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, snapshot());
    } catch {
      // UI preference only (see the persistence note above): state it once
      // and keep the model running.
      if (!saveFailed) {
        saveFailed = true;
        console.info('localStorage unavailable: the view state will not persist.');
      }
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  // pagehide catches everything the debounce has not flushed yet, including
  // the continuously moving clock and a camera carried by a follow.
  window.addEventListener('pagehide', saveNow);
  // OrbitControls dispatches "change" only when user interaction (or its
  // damping tail) actually moved the camera.
  controls.addEventListener('change', scheduleSave);

  function flyMinDist() {
    return FLY_MIN_DIST[modes.mode];
  }

  // ---- info card ----
  //
  // The card shows the followed body, or a clicked rover pin. Distance rows
  // update every frame from the model's au positions (rec.posAu, set by
  // scene.update); period and radius rows are static data. Rover pins show
  // no live rows: their model position is Mars's, already a card of its own.
  let cardRows = []; // value providers matching the shown labels, in order

  function updateCardLive() {
    if (!cardRows.length) return;
    ui.updateInfoLive(cardRows.map((r) => r.value()));
  }

  function showCard(name) {
    const info = cardInfo.get(name);
    const desc = descriptions[info.descKey];
    const rec = info.kind === 'rover' ? null : sceneApi.bodies.get(name);
    const earthRec = sceneApi.bodies.get('Earth');
    const rows = [];
    if (rec && info.kind !== 'star') {
      rows.push({
        label: 'From the Sun',
        value: () => fmtAu(Math.hypot(rec.posAu.x, rec.posAu.y, rec.posAu.z)),
      });
    }
    if (rec && name !== 'Earth') {
      rows.push({
        label: 'From Earth',
        value: () =>
          fmtAu(
            Math.hypot(
              rec.posAu.x - earthRec.posAu.x,
              rec.posAu.y - earthRec.posAu.y,
              rec.posAu.z - earthRec.posAu.z
            )
          ),
      });
    }
    if (Number.isFinite(info.periodDays)) {
      const text = fmtPeriod(info.periodDays);
      rows.push({ label: 'Orbital period', value: () => text });
    }
    // Probes show the mission note instead of rotation and radius.
    if (info.kind !== 'probe' && info.kind !== 'rover') {
      if (Number.isFinite(info.rotationHours)) {
        const text = fmtRotation(info.rotationHours);
        rows.push({ label: 'Rotation period', value: () => text });
      }
      if (Number.isFinite(info.radiusKm)) {
        const text = fmtRadius(info.radiusKm);
        rows.push({ label: 'Mean radius', value: () => text });
      }
    }
    cardRows = rows;
    ui.showInfoCard({
      name,
      text: desc.text,
      source: desc.source,
      note: info.missionNote,
      liveLabels: rows.map((r) => r.label),
    });
    updateCardLive();
  }

  function hideCard() {
    cardRows = [];
    ui.hideInfoCard();
  }

  // The card's close button dismisses it without changing the follow; it
  // reopens on the next selection.
  document.getElementById('card-close').addEventListener('click', hideCard);

  function overviewCamera() {
    const d = modes.overviewDistance(sceneApi.maxAu);
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0.5, 1).normalize().multiplyScalar(d);
  }

  function startFly(name) {
    sceneApi.getWorldPosition(name, tmpA);
    const dir = camera.position.clone().sub(tmpA);
    if (dir.lengthSq() === 0) dir.set(0, 0.5, 1);
    dir.normalize();
    state.fly = {
      name,
      start: performance.now(),
      fromTarget: controls.target.clone(),
      fromCam: camera.position.clone(),
      dir,
      dist: Math.max(sceneApi.displayRadius(name) * FLY_RADII, flyMinDist()),
    };
    state.followName = name;
    ui.setActiveBody(name);
    ui.updatePhotoStrip(photoEntry(name));
    showCard(name);
    scheduleSave();
  }

  // Stop following without moving the camera (a followed body clicked again).
  function releaseFollow() {
    state.followName = null;
    state.fly = null;
    ui.setActiveBody(null);
    ui.updatePhotoStrip(null);
    hideCard();
    scheduleSave();
  }

  // The System entry and the Escape key: stop following and return the
  // camera to the initial overview framing for the current mode. The info
  // card dismisses with the photo strip.
  function resetView() {
    state.followName = null;
    state.fly = null;
    overviewCamera();
    ui.setActiveBody('System');
    ui.updatePhotoStrip(null);
    hideCard();
    scheduleSave();
  }

  // A body clicked in the list or in the scene: the same toggle either way.
  function selectBody(name) {
    if (state.followName === name) {
      releaseFollow();
    } else {
      startFly(name);
    }
  }

  // ---- the galactic context view (a view swap, not a zoom) ----
  //
  // Single precision cannot hold the galactic-centre distance and a
  // planetary position in one frame, so the galaxy layer lives at ordinary
  // scene scale and the two views swap: entering hides the planetary
  // layers (bodies, orbit lines, comets, probes, sky-photo markers and
  // pins) behind their own toggles, which keep their state, and shows the
  // galaxy layer with its fine-print note. The follow is suspended, not
  // dropped: leaving restores the planetary camera and resumes the follow
  // where the body is now. The clock keeps running underneath; the view is
  // simply not time-dependent.

  // The planetary framing captured on entering, so leaving restores it
  // exactly; null when the view was entered at boot from stored state (the
  // planetary framing then never existed) or the scale mode changed inside
  // the view (the framing belongs to the old scale).
  let savedPlanetary = null;

  // frame = false re-enters the view at boot with the stored camera kept.
  function enterGalaxyView(frame = true) {
    if (state.view === 'galaxy') return;
    state.view = 'galaxy';
    savedPlanetary = frame
      ? {
          camera: camera.position.clone(),
          target: controls.target.clone(),
          mode: modes.mode,
        }
      : null;
    state.fly = null;
    sceneApi.setPlanetaryVisible(false);
    skymap.setLayerVisible(false);
    probes.setLayerVisible(false);
    galaxy.setVisible(true);
    galaxy.applyControlLimits(controls);
    if (frame) galaxy.frameCamera(camera, controls);
    ui.setActiveBody('Milky Way');
    ui.updatePhotoStrip(null);
    hideCard();
    ui.setGalaxyNoteVisible(true);
    scheduleSave();
  }

  function exitGalaxyView() {
    if (state.view !== 'galaxy') return;
    state.view = 'system';
    galaxy.setVisible(false);
    ui.setGalaxyNoteVisible(false);
    sceneApi.setPlanetaryVisible(true);
    skymap.setLayerVisible(true);
    probes.setLayerVisible(true);
    sceneApi.applyMode(); // restores the per-mode camera distance clamps
    // The suspended follow resumes under the same conditions the boot
    // restore applies: the body's layer toggle must still be on and a
    // probe must still be inside its recorded span.
    let followRec = state.followName ? sceneApi.bodies.get(state.followName) : undefined;
    if (
      followRec &&
      ((followRec.type === 'comet' && !state.comets) ||
        (followRec.type === 'probe' && (!state.probes || !followRec.exists)))
    ) {
      state.followName = null;
      followRec = undefined;
    }
    if (savedPlanetary && savedPlanetary.mode === modes.mode) {
      if (followRec) {
        // Resume the follow where the body is now, keeping the captured
        // viewing offset (the body moved if the clock ran).
        sceneApi.getWorldPosition(state.followName, tmpA);
        tmpB.copy(savedPlanetary.camera).sub(savedPlanetary.target);
        controls.target.copy(tmpA);
        camera.position.copy(tmpA).add(tmpB);
      } else {
        camera.position.copy(savedPlanetary.camera);
        controls.target.copy(savedPlanetary.target);
      }
    } else if (followRec) {
      // No planetary framing to restore (the view was entered at boot, or
      // the scale mode changed inside it): acquire the follow at a distance
      // suited to the current scale, the same law the mode change applies.
      sceneApi.getWorldPosition(state.followName, tmpA);
      const dir = camera.position.clone().sub(tmpA);
      if (dir.lengthSq() === 0) dir.set(0, 0.5, 1);
      dir.normalize();
      const dist = Math.max(
        sceneApi.displayRadius(state.followName) * FLY_RADII,
        flyMinDist()
      );
      controls.target.copy(tmpA);
      camera.position.copy(tmpA).addScaledVector(dir, dist);
    } else {
      overviewCamera();
    }
    savedPlanetary = null;
    if (state.followName) {
      ui.setActiveBody(state.followName);
      ui.updatePhotoStrip(photoEntry(state.followName));
      showCard(state.followName);
    } else {
      ui.setActiveBody('System');
    }
    scheduleSave();
  }

  // A followed body just vanished (its toggle switched off, or a craft left
  // its recorded span). In the planetary view that returns the camera to
  // the overview; in the galactic view the camera belongs to the galaxy, so
  // only the suspended follow is dropped.
  function dropFollow() {
    if (state.view === 'galaxy') {
      state.followName = null;
      state.fly = null;
      scheduleSave();
    } else {
      resetView();
    }
  }

  function clampSim() {
    if (state.simMs < SIM_MIN_MS) {
      state.simMs = SIM_MIN_MS;
      return true;
    }
    if (state.simMs > SIM_MAX_MS) {
      state.simMs = SIM_MAX_MS;
      return true;
    }
    return false;
  }

  const ui = initUI({
    bodies: bodiesData.bodies.map((b) => ({
      name: b.name,
      type: b.type,
      parent: b.parent || null,
    })),
    // Photographed comets first, then the well-known ones, matching their
    // registration order with the scene.
    comets: [...skymap.comets, ...famousComets.map((c) => ({ name: c.name }))],
    probes: probes.craft,

    // The one-off usage card: up only on an arrival that has no dismissal
    // stored, and only where a dismissal can be stored at all.
    showUsageCard: storageUsable && !state.helpSeen,

    onUsageDismiss() {
      state.helpSeen = true;
      // Written at once, not debounced: the card must not come back even if
      // the tab goes away immediately after the dismissal.
      saveNow();
    },

    onPlayToggle() {
      state.playing = !state.playing;
      ui.setPlaying(state.playing);
      scheduleSave();
    },

    onAxesToggle() {
      state.axes = !state.axes;
      sceneApi.setAxesVisible(state.axes);
      ui.setAxes(state.axes);
      scheduleSave();
    },

    onCometsToggle() {
      state.comets = !state.comets;
      ui.setComets(state.comets);
      sceneApi.setCometsVisible(state.comets);
      ui.setCometsListVisible(state.comets);
      skymap.setCometsOn(state.comets);
      if (
        !state.comets && state.followName &&
        sceneApi.bodies.get(state.followName).type === 'comet'
      ) {
        // The followed body just disappeared with the toggle: stop
        // following rather than orbit a hidden point.
        dropFollow();
      }
      scheduleSave();
    },

    onProbesToggle() {
      state.probes = !state.probes;
      ui.setProbes(state.probes);
      sceneApi.setProbesVisible(state.probes);
      ui.setProbesListVisible(state.probes);
      probes.setVisible(state.probes);
      if (
        !state.probes && state.followName &&
        sceneApi.bodies.get(state.followName).type === 'probe'
      ) {
        // Same rule as the comets: never keep following a hidden marker.
        dropFollow();
      }
      scheduleSave();
    },

    onSpeedChange(speed) {
      state.speed = speed;
      scheduleSave();
    },

    onDateInput(value) {
      const ms = Date.parse(`${value}T00:00:00Z`);
      if (Number.isNaN(ms)) return;
      state.simMs = ms;
      clampSim();
      scheduleSave();
    },

    onNow() {
      state.simMs = Date.now();
      clampSim();
      scheduleSave();
    },

    onModeChange(mode) {
      if (mode === modes.mode) return;
      modes.set(mode);
      sceneApi.applyMode();
      const jdNow = jd(new Date(state.simMs));
      // Recompute body positions at the new scale before repositioning the
      // camera, so the follow target is not a stale old-mode position.
      sceneApi.update(jdNow, 0);
      sceneApi.refreshOrbits(jdNow);
      skymap.applyMode();
      probes.applyMode();
      ui.setMode(mode);
      state.fly = null;
      if (state.view === 'galaxy') {
        // The galactic view is not scale-dependent: the hidden planetary
        // layers take the new mode underneath while the camera stays on
        // the galaxy, whose zoom clamps replace the per-mode ones
        // applyMode just set. The captured planetary framing belongs to
        // the old scale, so leaving re-frames instead of restoring it.
        galaxy.applyControlLimits(controls);
        savedPlanetary = null;
        scheduleSave();
        return;
      }
      if (state.followName) {
        // Keep following the same body at a distance suited to the new scale.
        sceneApi.getWorldPosition(state.followName, tmpA);
        const dir = camera.position.clone().sub(controls.target);
        if (dir.lengthSq() === 0) dir.set(0, 0.5, 1);
        dir.normalize();
        const dist = Math.max(
          sceneApi.displayRadius(state.followName) * FLY_RADII,
          flyMinDist()
        );
        controls.target.copy(tmpA);
        camera.position.copy(tmpA).addScaledVector(dir, dist);
      } else {
        // Nothing followed: the mode change re-frames the whole system, the
        // same state the System entry represents.
        overviewCamera();
        ui.setActiveBody('System');
      }
      scheduleSave();
    },

    onSelectBody(name) {
      if (state.view === 'galaxy') {
        // Picking a body leaves the galactic view: restore the planetary
        // scene and fly straight to the selection instead of toggling it.
        state.followName = null;
        exitGalaxyView();
        startFly(name);
        return;
      }
      selectBody(name);
    },

    onResetView() {
      // In the galactic view the System entry leaves the view, restoring
      // the planetary scene and the suspended follow.
      if (state.view === 'galaxy') {
        exitGalaxyView();
        return;
      }
      resetView();
    },

    onGalaxyView() {
      enterGalaxyView();
    },
  });

  ui.setPlaying(state.playing);
  ui.setAxes(state.axes);
  ui.setSpeed(state.speed);
  sceneApi.setAxesVisible(state.axes);
  ui.setMode(modes.mode);
  sceneApi.applyMode();
  sceneApi.setCometsVisible(state.comets);
  ui.setComets(state.comets);
  ui.setCometsListVisible(state.comets);
  sceneApi.setProbesVisible(state.probes);
  ui.setProbes(state.probes);
  ui.setProbesListVisible(state.probes);
  probes.setVisible(state.probes);

  // Escape closes the first-arrival usage card while it is up; once it is
  // gone the same key leaves the galactic view when that is up, and
  // otherwise returns the camera to the whole-system view.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (ui.dismissUsageCard()) return;
    if (state.view === 'galaxy') {
      exitGalaxyView();
      return;
    }
    resetView();
  });

  resetView();

  // First propagation so fly targets and orbit lines exist before frame one.
  sceneApi.update(jd(new Date(state.simMs)), 0);
  sceneApi.refreshOrbits(jd(new Date(state.simMs)));

  // Restore the stored camera and follow over the default framing, still
  // before the first frame renders, so a reload or a return from a gallery
  // page resumes the exact view. The follow resumes only when the body
  // still exists (a comet can leave skymap.json between visits) and, for a
  // comet or a probe, only while its toggle is on and, for a probe, while
  // the restored simulated time is inside its recorded span; otherwise the
  // camera alone is restored. A stored galactic view is re-entered with the
  // stored camera kept: the follow stays suspended behind it (no card, no
  // photo strip) exactly as it was when the snapshot was taken, and resumes
  // on the way out.
  // descriptions.json keys are the vocabulary a link uses; the scene is keyed
  // by display name. cardInfo already holds both, so the reverse map keeps one
  // vocabulary rather than inventing a second that could drift from it.
  const slugToName = new Map();
  for (const [name, info] of cardInfo) slugToName.set(info.descKey, name);

  // Acquire a body without the fly animation. A link should open on its
  // subject, not perform an 800 ms camera move away from a framing the
  // visitor never saw. Mirrors the acquisition in exitGalaxyView, including
  // the degenerate guard for a camera sitting exactly on the target.
  function acquireNow(name) {
    sceneApi.getWorldPosition(name, tmpA);
    const dir = camera.position.clone().sub(tmpA);
    if (dir.lengthSq() === 0) dir.set(0, 0.5, 1);
    dir.normalize();
    const dist = Math.max(sceneApi.displayRadius(name) * FLY_RADII, flyMinDist());
    controls.target.copy(tmpA);
    camera.position.copy(tmpA).addScaledVector(dir, dist);
  }

  const linkRefused = [...link.refused];
  let linkFramed = false;

  if (link.body) {
    const name = slugToName.get(link.body);
    const info = name ? cardInfo.get(name) : null;
    if (!name || !info) {
      // Named something this build does not carry. Two comets reach the model
      // only through an optional skymap.json, so this is a real case rather
      // than only a typo.
      linkRefused.push(`body=${link.body}`);
    } else if (info.kind === 'rover') {
      // Rovers are pins on Mars, not followable bodies: getWorldPosition
      // throws on them. The existing pin click opens the card and leaves the
      // camera alone, and a link does the same rather than inventing a
      // behaviour the interface does not otherwise have.
      showCard(name);
    } else {
      const rec = sceneApi.bodies.get(name);
      if (rec && rec.type === 'probe' && !rec.exists) {
        // Outside its recorded ephemeris there is nothing to point at, and
        // the scene deliberately draws no marker. Cassini's data ends the day
        // the mission ended, so a link to it at today's date lands here.
        linkRefused.push(`${link.body} has no recorded position at this date`);
      } else if (rec) {
        state.followName = name;
        acquireNow(name);
        ui.setActiveBody(name);
        ui.updatePhotoStrip(photoEntry(name));
        showCard(name);
        linkFramed = true;
      } else {
        linkRefused.push(`body=${link.body}`);
      }
    }
  }

  // The stored camera is restored only where the link did not frame the view.
  // A visitor arriving from a link about Voyager 1 must see Voyager 1, not the
  // corner of the system they were looking at yesterday.
  if (stored && !linkFramed) {
    camera.position.set(stored.camera[0], stored.camera[1], stored.camera[2]);
    controls.target.set(stored.target[0], stored.target[1], stored.target[2]);
  }
  if (stored && !link.body) {
    const followRec = stored.follow ? sceneApi.bodies.get(stored.follow) : undefined;
    if (
      followRec &&
      (followRec.type !== 'comet' || state.comets) &&
      (followRec.type !== 'probe' || (state.probes && followRec.exists))
    ) {
      state.followName = stored.follow;
      if (stored.view !== 'galaxy' && link.view !== 'galaxy') {
        ui.setActiveBody(stored.follow);
        ui.updatePhotoStrip(photoEntry(stored.follow));
        showCard(stored.follow);
      }
    }
  }

  // The link's view wins over the stored one. Entering without framing keeps
  // whatever the planetary camera is, which is what a galactic link wants.
  const wantGalaxy = link.view ? link.view === 'galaxy' : stored && stored.view === 'galaxy';
  if (wantGalaxy) {
    enterGalaxyView(false);
  }

  if (linkTimeClamped) ui.showClampNote();
  if (linkRefused.length) {
    ui.showLinkNote(`link ignored: ${linkRefused.join(', ')}`);
  }

  loadPhotos()
    .then((data) => {
      photosData = data;
      if (state.followName && state.view !== 'galaxy') {
        ui.updatePhotoStrip(photoEntry(state.followName));
      }
    })
    .catch((err) => {
      fatal(`photos.json failed to load. ${err.message}`);
      throw err;
    });

  sceneApi.updateOverlay(state.followName);

  // ---- scene picking ----
  //
  // Clicking a body in the scene (planet or moon sphere, Sun, comet or
  // probe dot) selects it exactly like its list button; clicking a rover
  // pin opens its info card without changing the follow. Skymap photo
  // markers and Earth pins keep their own click-through to the gallery
  // (skymap.js handles that on the same event), so a hit on one of them is
  // left alone here, and including them in the ray keeps a body behind a
  // marker from being selected by the same click. Click-gesture thresholds
  // are presentational, matching skymap.js.
  const CLICK_MAX_PX = 5;
  const CLICK_MAX_MS = 500;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const sceneCanvas = sceneApi.renderer.domElement;
  let scenePressX = 0;
  let scenePressY = 0;
  let scenePressAt = 0;

  function pickSceneObject(event) {
    pointerNdc.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const targets = [];
    for (const rec of sceneApi.bodies.values()) {
      if (rec.type === 'comet' && !state.comets) continue;
      if (rec.type === 'probe' && (!state.probes || !rec.exists)) continue;
      if (rec.mesh) targets.push(rec.mesh);
      if (rec.sprite.visible) targets.push(rec.sprite);
    }
    if (probes.pinsGroup.visible) {
      for (const pin of probes.pins) targets.push(pin.sprite);
    }
    if (skymap.markersGroup && skymap.markersGroup.visible) {
      for (const m of skymap.markers) if (m.sprite.visible) targets.push(m.sprite);
    }
    if (skymap.cometMarkersGroup && skymap.cometMarkersGroup.visible) {
      for (const m of skymap.cometMarkers) if (m.sprite.visible) targets.push(m.sprite);
    }
    if (skymap.pinsGroup && skymap.pinsGroup.visible) {
      for (const p of skymap.pins) targets.push(p.sprite);
    }
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

  sceneCanvas.addEventListener('pointerdown', (event) => {
    scenePressX = event.clientX;
    scenePressY = event.clientY;
    scenePressAt = performance.now();
  });
  sceneCanvas.addEventListener('pointerup', (event) => {
    // The raycaster does not consult ancestor visibility, so picking is off
    // while the planetary scene is swapped away for the galactic view.
    if (state.view === 'galaxy') return;
    if (performance.now() - scenePressAt > CLICK_MAX_MS) return;
    if (Math.hypot(event.clientX - scenePressX, event.clientY - scenePressY) > CLICK_MAX_PX) {
      return;
    }
    const obj = pickSceneObject(event);
    if (!obj) return;
    if (obj.userData.marker) return; // a skymap marker or pin: skymap.js opens it
    if (obj.userData.rover) {
      showCard(obj.userData.rover);
      return;
    }
    if (obj.userData.bodyName) selectBody(obj.userData.bodyName);
  });

  // ---- frame loop ----
  let lastFrame = performance.now();

  function frame(now) {
    // Clamp the real step so a backgrounded tab does not jump.
    const dtReal = Math.min((now - lastFrame) / 1000, 0.5);
    lastFrame = now;

    let dtSim = 0;
    if (state.playing) {
      dtSim = dtReal * state.speed;
      state.simMs += dtSim * 1000;
      if (clampSim()) {
        // The clock reached the edge of the JPL validity range: pause and
        // show the validity sentence next to the date input.
        state.playing = false;
        ui.setPlaying(false);
        ui.showClampNote();
      }
    }

    const simDate = new Date(state.simMs);
    const jdNow = jd(simDate);

    // The galactic view suspends the follow: the camera belongs to the
    // galaxy while the clock keeps running underneath.
    const following = state.followName !== null && state.view !== 'galaxy';

    if (following) {
      sceneApi.getWorldPosition(state.followName, prevFollowPos);
    }

    sceneApi.update(jdNow, dtSim);

    // A followed craft whose recorded span the simulated time just left no
    // longer exists in the scene: stop following rather than orbit a
    // vanished marker.
    if (state.followName) {
      const followRec = sceneApi.bodies.get(state.followName);
      if (followRec.type === 'probe' && !followRec.exists) {
        dropFollow();
      }
    }

    // Craft outside their span dim in the body list while staying listed.
    for (const craft of probes.craft) {
      ui.setProbeAvailable(craft.name, sceneApi.bodies.get(craft.name).exists);
    }

    if (state.fly) {
      const t = Math.min((now - state.fly.start) / FLY_DURATION_MS, 1);
      const s = easeInOut(t);
      sceneApi.getWorldPosition(state.fly.name, tmpA);
      tmpB.copy(tmpA).addScaledVector(state.fly.dir, state.fly.dist);
      controls.target.lerpVectors(state.fly.fromTarget, tmpA, s);
      camera.position.lerpVectors(state.fly.fromCam, tmpB, s);
      if (t >= 1) state.fly = null;
    } else if (following && state.followName) {
      // Keep the followed body centred while time runs: translate the camera
      // by the body's motion since the previous frame.
      sceneApi.getWorldPosition(state.followName, tmpA);
      tmpB.copy(tmpA).sub(prevFollowPos);
      camera.position.add(tmpB);
      controls.target.copy(tmpA);
    }

    controls.update();
    // Sprites and labels project through the camera as it will render this
    // frame, after OrbitControls damping has moved it.
    sceneApi.updateOverlay(state.followName);
    skymap.updateFrame();
    probes.updateFrame();
    galaxy.updateFrame();
    sceneApi.render();

    ui.setDate(simDate);
    updateCardLive();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Read-only inspection handle for headless checks and debugging; not a
  // public interface.
  window.__orrery = { sceneApi, modes, skymap, probes, galaxy, state };
}

(async () => {
  let skymapData;
  try {
    skymapData = await loadSkymap();
  } catch (err) {
    fatal(`skymap.json failed to load. ${err.message}`);
    throw err;
  }
  try {
    const [
      planetsData,
      bodiesData,
      moonsData,
      rotationData,
      cometsData,
      probesData,
      descriptionsData,
      galaxyData,
    ] = await Promise.all([
      loadJson('./data/planets.json'),
      loadJson('./data/bodies.json'),
      loadJson('./data/moons.json'),
      loadJson('./data/rotation.json'),
      loadJson('./data/comets.json'),
      loadJson('./data/probes.json'),
      loadJson('./data/descriptions.json'),
      loadJson('./data/galaxy.json'),
    ]);
    boot(
      planetsData,
      bodiesData,
      moonsData,
      rotationData,
      skymapData,
      cometsData,
      probesData,
      descriptionsData,
      galaxyData
    );
  } catch (err) {
    fatal(`Solar system data failed to load. ${err.message}`);
    throw err;
  }
})();
