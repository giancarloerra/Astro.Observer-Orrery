// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// scene.js
//
// three.js scene for the orrery: Sun with an emissive material plus a
// PointLight and a low AmbientLight, planets and the nine moons as spheres
// carrying public-domain surface maps from textures/ aligned to the real
// prime meridian (flat colours from bodies.json where no map exists, see
// SURFACE_MAPS), a flat double-sided ring for Saturn, orbit lines
// sampled from the propagated elements, true orientation (pole direction and
// prime meridian) from the WGCCRE elements via rotation.js where the data
// carries them and axial tilt plus sidereal spin from bodies.json where it
// does not, a presentational starfield, and OrbitControls with damping.
// Comets (data/comets.json and skymap.json) register through addComet as
// followable bodies rendered as dots (they carry no radius datum) with an
// orbit line; the whole comet layer shows only while the control-bar Comets
// toggle is on (setCometsVisible, default off). Spacecraft from
// data/probes.json register through addProbe: dots whose position function
// can return null (the simulated time is outside the craft's recorded span),
// in which case the marker does not exist in the scene; the layer shows only
// while the Probes toggle is on (setProbesVisible, default on). While the
// galactic context view (galaxy.js) is active, main.js swaps the whole
// planetary scene away through setPlanetaryVisible; the comet and probe
// toggles keep their state underneath, so leaving the view restores them
// unchanged.
//
// Every physical number comes from the data files or the kepler.js algorithm.
// The remaining constants in this file (light intensities, ring proportions,
// star count and shell radius, dot pixel sizes, opacities, segment counts)
// are presentational scene tuning, not astronomy data, and are marked so.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { AU_KM } from './modes.js';
import {
  elementsAt,
  orbitPoint,
  planetPosition,
  moonOrbitPoint,
  moonPosition,
} from './kepler.js';

const DEG = Math.PI / 180;

// Presentational constants.
const ORBIT_SEGMENTS = 512; // sample count per orbit line (specified)
const ORBIT_REFRESH_DAYS = 730; // rebuild planet orbit lines after this drift
const STAR_COUNT = 2000; // starfield points (specified as roughly this)
const STAR_SHELL = 30000; // starfield shell radius, scene units
const DOT_PX = 6; // on-screen size of the sprite dots, pixels
const DOT_SHOW_BELOW_PX = 3.5; // show a dot when the sphere projects smaller
const LABEL_MOON_MIN_PX = 16; // hide a moon label this close to its parent
const RING_INNER = 1.24; // Saturn ring inner edge, planet radii (presentational)
const RING_OUTER = 2.27; // Saturn ring outer edge, planet radii (presentational)
const AXIS_LEN = 1.6; // axis indicator half-length, body radii (presentational)
const MERIDIAN_RADIUS = 1.03; // meridian indicator radius, body radii (presentational)
const MERIDIAN_SEGMENTS = 64; // meridian indicator sample count (presentational)
const TEXTURE_ANISOTROPY = 4; // surface map sampling quality (presentational)

// Surface maps from ./textures/ (provenance in textures/SOURCES.md). The
// offsetX of each entry aligns the raster's longitude layout with the UV
// layout of THREE.SphereGeometry so the map's prime meridian lands where
// rotation.js puts the body's real prime meridian (mesh local +x, the
// direction the meridian indicator marks).
//
// SphereGeometry places a vertex at azimuth phi = u * 2 PI with position
// (-cos phi, ., sin phi) * sin theta, so texture column u = 0.5 lands on
// mesh local +x and u = 0.75 lands on local -z. The orientation basis in
// update() maps local +x to the prime meridian and local -z to body east
// (pole cross meridian), so the default mapping expects an equirectangular
// raster with the prime meridian at the horizontal centre and east
// longitude increasing to the right.
//   offsetX 0    raster already centre-0 east-positive: direct mapping.
//   offsetX 0.5  raster stated 0-360 positive-west with 360 W at the left
//                edge. East longitude is 360 minus west longitude, so such
//                a raster runs from 0 east at the left edge increasing
//                eastwards to the right: the same direction as the default
//                mapping (no mirroring), with the prime meridian on the
//                texture seam instead of the centre. A half-turn phase
//                shift (offset.x 0.5 with repeat wrapping) recentres it.
//
// Uranus, Neptune and Deimos have no entry and keep their flat colour from
// bodies.json: per textures/SOURCES.md no public-domain equirectangular
// global map exists for Uranus or Neptune (no official cylindrical map
// product was released) and none was found for Deimos (the USGS WMS mosaic
// has no established public-domain status).
const SURFACE_MAPS = new Map([
  // Representative snapshot of the rotating atmosphere (304 Angstrom EUV);
  // longitudes not observational.
  ['Sun', { file: 'sun-2k.jpg', offsetX: 0 }],
  ['Mercury', { file: 'mercury-2k.jpg', offsetX: 0 }],
  ['Venus', { file: 'venus-2k.jpg', offsetX: 0 }],
  ['Earth', { file: 'earth-2k.jpg', offsetX: 0 }],
  ['Moon', { file: 'moon-2k.jpg', offsetX: 0 }],
  ['Mars', { file: 'mars-2k.jpg', offsetX: 0 }],
  // Prime meridian position unstated by the source; cloud features drift
  // relative to System III, longitudes not observational.
  ['Jupiter', { file: 'jupiter-2k.jpg', offsetX: 0 }],
  ['Saturn', { file: 'saturn-2k.jpg', offsetX: 0.5 }],
  ['Phobos', { file: 'phobos-2k.jpg', offsetX: 0 }],
  // The Io raster is centre-0 east-positive (SOURCES.md validates Pele,
  // 255.3 W, at x fraction 0.79), despite the product page's positive-west
  // label, so it maps directly.
  ['Io', { file: 'io-2k.jpg', offsetX: 0 }],
  ['Europa', { file: 'europa-2k.jpg', offsetX: 0.5 }],
  ['Ganymede', { file: 'ganymede-2k.jpg', offsetX: 0.5 }],
  ['Callisto', { file: 'callisto-2k.jpg', offsetX: 0.5 }],
  ['Titan', { file: 'titan-2k.jpg', offsetX: 0.5 }],
  ['Triton', { file: 'triton-2k.jpg', offsetX: 0 }],
]);

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

// Spin direction convention for bodies WITHOUT a WGCCRE model in
// rotation.json (a body whose entry is null; any body with a model gets its
// exact orientation from rotation.js and never uses this): when the source
// obliquity is above 90 degrees the tilted axis itself already encodes the
// retrograde sense, so the magnitude of the signed rotation period is used to
// avoid counting the reversal twice. When the obliquity is unpublished (null)
// or at most 90 degrees, the sign of the period from bodies.json gives the
// direction. All branches are kept so the function stays correct whatever
// the modelled set in rotation.json is.
function spinRadPerSec(body) {
  const hours = parseFloat(body.sidereal_rotation_period_hours);
  const tilt =
    body.axial_tilt_obliquity_to_orbit_deg === null
      ? null
      : parseFloat(body.axial_tilt_obliquity_to_orbit_deg);
  const effective = tilt !== null && tilt > 90 ? Math.abs(hours) : hours;
  return (2 * Math.PI) / (effective * 3600);
}

export function createScene({
  canvas,
  labelLayer,
  planetsData,
  bodiesData,
  moonsData,
  rotationModel,
  modes,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true, // the CSS ground colour shows through, so page and scene match
    logarithmicDepthBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.001,
    200000
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Low ambient fill plus the Sun as the light source. Decay 0 keeps the
  // outer planets lit; presentational, not physical.
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const sunLight = new THREE.PointLight(0xfff1da, 2.4, 0, 0);
  scene.add(sunLight);

  // Starfield: presentational random white points, no astronomical meaning.
  {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const r = STAR_SHELL * (0.8 + 0.2 * Math.random());
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    scene.add(new THREE.Points(geo, mat));
  }

  const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
  const dotTexture = makeDotTexture();
  const textureLoader = new THREE.TextureLoader();

  const planetElements = new Map(
    planetsData.planets.map((p) => [p.name, p.elements])
  );
  const moonElements = new Map(moonsData.moons.map((m) => [m.name, m]));
  const maxAu = Math.max(
    ...planetsData.planets.map((p) => parseFloat(p.elements.a_au))
  );

  const bodies = new Map();

  const planetOrbitMat = new THREE.LineBasicMaterial({
    color: 0x565a63,
    transparent: true,
    opacity: 0.6,
  });
  const moonOrbitMat = new THREE.LineBasicMaterial({
    color: 0x4a4d55,
    transparent: true,
    opacity: 0.5,
  });

  // Orientation indicators (toggled from the control bar, default off): a
  // hairline rotation axis and a faint half-ring through both poles marking
  // the prime meridian. Colours and opacities are presentational, in the
  // same grey family as the orbit lines. Geometry is shared: every body is a
  // unit sphere scaled by its tilt group.
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x8b8f98,
    transparent: true,
    opacity: 0.75,
  });
  const meridianMat = new THREE.LineBasicMaterial({
    color: 0x8b8f98,
    transparent: true,
    opacity: 0.35,
  });
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, -AXIS_LEN, 0, 0, AXIS_LEN, 0]), 3)
  );
  const meridianGeo = new THREE.BufferGeometry();
  {
    // Half circle from the south pole over the equator at local +x (the
    // prime meridian direction) to the north pole, in the local x-y plane.
    const pts = new Float32Array((MERIDIAN_SEGMENTS + 1) * 3);
    for (let i = 0; i <= MERIDIAN_SEGMENTS; i += 1) {
      const a = -Math.PI / 2 + (i / MERIDIAN_SEGMENTS) * Math.PI;
      pts[i * 3] = MERIDIAN_RADIUS * Math.cos(a);
      pts[i * 3 + 1] = MERIDIAN_RADIUS * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    meridianGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  }

  function makeOrbitLine(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(ORBIT_SEGMENTS * 3), 3)
    );
    return new THREE.LineLoop(geo, material);
  }

  for (const body of bodiesData.bodies) {
    const colour = new THREE.Color(body.colour_hex);
    const isSun = body.type === 'star';

    const material = isSun
      ? new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: colour,
          emissiveIntensity: 1.2, // presentational warmth
          roughness: 1,
          metalness: 0,
        })
      : new THREE.MeshStandardMaterial({
          color: colour,
          roughness: 1,
          metalness: 0,
        });

    const mesh = new THREE.Mesh(sphereGeo, material);
    // Scene picking (main.js) maps a raycast hit back to the body by name.
    mesh.userData.bodyName = body.name;

    // Surface map, where one exists (SURFACE_MAPS above). The map replaces
    // the flat colour only once it has loaded; on a failed load the body
    // keeps its flat colour and the error is thrown loudly, never swallowed.
    const surfaceMap = SURFACE_MAPS.get(body.name);
    if (surfaceMap) {
      textureLoader.load(
        `./textures/${surfaceMap.file}`,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = TEXTURE_ANISOTROPY;
          if (surfaceMap.offsetX !== 0) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.offset.x = surfaceMap.offsetX;
          }
          if (isSun) {
            // The Sun stays emissive; white emissive so the map's own
            // colour shows unmodified.
            material.emissive.set(0xffffff);
            material.emissiveMap = texture;
          } else {
            // White base colour so the map's own colour shows unmodified
            // (MeshStandardMaterial multiplies map by color).
            material.color.set(0xffffff);
            material.map = texture;
          }
          material.needsUpdate = true;
        },
        undefined,
        () => {
          throw new Error(
            `Surface map ./textures/${surfaceMap.file} for ${body.name} failed to load`
          );
        }
      );
    }

    // The tilt group carries the orientation and the per-mode display
    // radius. Bodies with closed-form WGCCRE elements in rotation.json get
    // the full true orientation (pole direction and prime meridian angle W)
    // as a quaternion on this group every frame in update(); the mesh does
    // not spin separately for them. Bodies without a model there (a null
    // entry, meaning the source publishes no closed-form elements, see the
    // entry's notes) use the obliquity magnitude from bodies.json tipped
    // about the scene z axis with an arbitrary azimuth (presentational
    // choice) and an arbitrary-phase sidereal spin on the mesh.
    const hasWgccre = rotationModel.hasModel(body.name);
    const tiltGroup = new THREE.Group();
    if (!hasWgccre && body.axial_tilt_obliquity_to_orbit_deg !== null) {
      tiltGroup.rotation.z =
        -parseFloat(body.axial_tilt_obliquity_to_orbit_deg) * DEG;
    }
    tiltGroup.add(mesh);

    // Orientation indicators only where the orientation is real data; a
    // meridian ring on an arbitrary-phase body would present an invented
    // orientation as fact.
    let axes = null;
    if (hasWgccre) {
      axes = new THREE.Group();
      // Hidden until main.js applies the boot state through setAxesVisible
      // before the first frame (the Axes toggle defaults on).
      axes.visible = false;
      axes.add(new THREE.Line(axisGeo, axisMat));
      axes.add(new THREE.Line(meridianGeo, meridianMat));
      tiltGroup.add(axes);
    }

    if (body.name === 'Saturn') {
      const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 128);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x8f8a80, // greyish, presentational
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.85,
      });
      tiltGroup.add(new THREE.Mesh(ringGeo, ringMat));
    }

    const group = new THREE.Group();
    group.add(tiltGroup);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTexture,
        color: colour,
        transparent: true,
        depthTest: false,
      })
    );
    sprite.renderOrder = 5;
    sprite.visible = false;
    sprite.userData.bodyName = body.name;
    group.add(sprite);

    const label = document.createElement('div');
    label.className = 'body-label';
    label.textContent = body.name;
    labelLayer.appendChild(label);

    const rec = {
      name: body.name,
      type: body.type,
      parent: body.parent || null,
      radiusKm: parseFloat(body.mean_radius_km),
      spinRate: spinRadPerSec(body),
      hasWgccre,
      axes,
      group,
      tiltGroup,
      mesh,
      sprite,
      label,
      worldPos: new THREE.Vector3(),
      // Heliocentric J2000 ecliptic position in au (model units, before any
      // scale-mode mapping), refreshed by update(); the info card reads it.
      posAu: { x: 0, y: 0, z: 0 },
      screenX: 0,
      screenY: 0,
      onScreen: false,
      orbitLine: null,
      orbitJd: null,
      moonSys: null,
      elements: null,
      moon: null,
    };

    if (body.type === 'planet') {
      rec.elements = planetElements.get(body.name);
      if (!rec.elements) {
        throw new Error(`No orbital elements in planets.json for ${body.name}`);
      }
      rec.orbitLine = makeOrbitLine(planetOrbitMat);
      scene.add(rec.orbitLine);
      rec.moonSys = new THREE.Group();
      scene.add(rec.moonSys);
      scene.add(group);
    } else if (body.type === 'moon') {
      rec.moon = moonElements.get(body.name);
      if (!rec.moon) {
        throw new Error(`No orbital elements in moons.json for ${body.name}`);
      }
      const parentRec = bodies.get(body.parent);
      if (!parentRec) {
        throw new Error(
          `Moon ${body.name} listed before its parent ${body.parent}`
        );
      }
      rec.orbitLine = makeOrbitLine(moonOrbitMat);
      parentRec.moonSys.add(rec.orbitLine);
      parentRec.moonSys.add(group);
    } else {
      scene.add(group); // the Sun, heliocentric origin
    }

    bodies.set(body.name, rec);
  }

  function updatePlanetOrbitLine(rec, j) {
    const p = elementsAt(rec.elements, j);
    const attr = rec.orbitLine.geometry.getAttribute('position');
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
      const E = (i * 360) / ORBIT_SEGMENTS;
      const v = modes.planetToScene(orbitPoint(p, E));
      attr.setXYZ(i, v.x, v.y, v.z);
    }
    attr.needsUpdate = true;
    rec.orbitLine.geometry.computeBoundingSphere();
    rec.orbitJd = j;
  }

  function updateMoonOrbitLine(rec) {
    const parentRec = bodies.get(rec.parent);
    const aKm = parseFloat(rec.moon.semi_major_axis_km);
    const attr = rec.orbitLine.geometry.getAttribute('position');
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
      const u = (i / ORBIT_SEGMENTS) * 2 * Math.PI;
      const v = modes.moonToScene(
        moonOrbitPoint(rec.moon, u),
        aKm,
        parentRec.radiusKm,
        rec.radiusKm
      );
      attr.setXYZ(i, v.x, v.y, v.z);
    }
    attr.needsUpdate = true;
    rec.orbitLine.geometry.computeBoundingSphere();
  }

  // Comet orbit shapes never change (their osculating elements carry no
  // rates), so the fixed ecliptic samples in rec.orbitPointsAu are re-mapped
  // through the current scale mode only.
  function updateCometOrbitLine(rec) {
    const attr = rec.orbitLine.geometry.getAttribute('position');
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
      const v = modes.planetToScene(rec.orbitPointsAu[i]);
      attr.setXYZ(i, v.x, v.y, v.z);
    }
    attr.needsUpdate = true;
    rec.orbitLine.geometry.computeBoundingSphere();
  }

  function refreshOrbits(j) {
    for (const rec of bodies.values()) {
      if (rec.type === 'planet') updatePlanetOrbitLine(rec, j);
      else if (rec.type === 'moon') updateMoonOrbitLine(rec);
      else if (rec.type === 'comet') updateCometOrbitLine(rec);
    }
  }

  function applyMode() {
    for (const rec of bodies.values()) {
      // Comets carry no tilt group: they have no radius datum and render as
      // dots, not scaled spheres.
      if (rec.tiltGroup) rec.tiltGroup.scale.setScalar(modes.bodyRadius(rec.radiusKm));
    }
    controls.minDistance = modes.minCameraDistance();
    controls.maxDistance = modes.maxCameraDistance(maxAu);
  }

  const tmpCam = new THREE.Vector3();

  // The galactic context view (galaxy.js, swapped in by main.js) replaces
  // the whole planetary scene as one switch: every body group, orbit line
  // and moon system hides together, the per-frame overlay keeps the dots
  // and labels off, and the comet and probe layers stay governed by their
  // own toggles underneath, so leaving the view restores them unchanged.
  let planetaryVisible = true;

  function setPlanetaryVisible(visible) {
    planetaryVisible = visible;
    for (const rec of bodies.values()) {
      if (rec.type === 'comet') {
        rec.group.visible = visible && cometsVisible;
        rec.orbitLine.visible = visible && cometsVisible;
      } else if (rec.type === 'probe') {
        rec.group.visible = visible && probesVisible && rec.exists;
      } else {
        rec.group.visible = visible;
        if (rec.orbitLine) rec.orbitLine.visible = visible;
        if (rec.moonSys) rec.moonSys.visible = visible;
      }
    }
  }

  // Comet visibility is one switch (the control-bar "Comets" toggle, default
  // off): body dot, orbit line and label go together. Comets registered
  // later through addComet inherit the current state. Positions still update
  // while hidden, so re-enabling needs no special pass.
  let cometsVisible = false;

  function setCometsVisible(visible) {
    cometsVisible = visible;
    for (const rec of bodies.values()) {
      if (rec.type === 'comet') {
        rec.group.visible = visible && planetaryVisible;
        rec.orbitLine.visible = visible && planetaryVisible;
      }
    }
  }

  // Probe visibility is one switch too (the control-bar "Probes" toggle,
  // default on), combined per frame with each craft's own existence inside
  // its recorded span; update() applies both to the marker group, and
  // probes.js gates the trajectory lines the same way.
  let probesVisible = true;

  function setProbesVisible(visible) {
    probesVisible = visible;
    for (const rec of bodies.values()) {
      if (rec.type === 'probe') {
        rec.group.visible = visible && rec.exists && planetaryVisible;
      }
    }
  }

  function updateOverlay(activeName) {
    // The renderer refreshes these during render; this pass runs before the
    // frame's render, so refresh them here to avoid projecting through the
    // previous frame's camera matrices.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const fovFactor = Math.tan((camera.fov / 2) * DEG);
    const accurate = modes.mode === 'accurate';

    for (const rec of bodies.values()) {
      // The galactic view has the planetary scene swapped away: every dot
      // and label stays off with it.
      if (!planetaryVisible) {
        rec.sprite.visible = false;
        rec.label.style.visibility = 'hidden';
        continue;
      }
      // Comets hidden by the Comets toggle keep their dot and label off.
      if (rec.type === 'comet' && !cometsVisible) {
        rec.sprite.visible = false;
        rec.label.style.visibility = 'hidden';
        continue;
      }
      // Probes hidden by the Probes toggle, or outside their recorded span,
      // keep their dot and label off.
      if (rec.type === 'probe' && (!probesVisible || !rec.exists)) {
        rec.sprite.visible = false;
        rec.label.style.visibility = 'hidden';
        continue;
      }

      const dist = rec.worldPos.distanceTo(camera.position);
      const displayR = modes.bodyRadius(rec.radiusKm);
      const projectedPx = dist > 0 ? (displayR / (dist * fovFactor)) * (h / 2) : h;

      // Distance-scaled sprite dots keep bodies findable at true scale.
      // Bodies flagged alwaysDot (comets, which have no radius datum) keep
      // their dot in both modes.
      if ((accurate || rec.alwaysDot) && projectedPx < DOT_SHOW_BELOW_PX) {
        const worldPerPx = (2 * dist * fovFactor) / h;
        const s = DOT_PX * worldPerPx;
        rec.sprite.scale.set(s, s, 1);
        rec.sprite.visible = true;
      } else {
        rec.sprite.visible = false;
      }

      // Labels: project to screen space; hide behind the camera.
      tmpCam.copy(rec.worldPos).applyMatrix4(camera.matrixWorldInverse);
      if (tmpCam.z >= 0) {
        rec.onScreen = false;
      } else {
        tmpCam.copy(rec.worldPos).project(camera);
        rec.screenX = (tmpCam.x * 0.5 + 0.5) * w;
        rec.screenY = (-tmpCam.y * 0.5 + 0.5) * h;
        rec.onScreen =
          rec.screenX > -80 && rec.screenX < w + 80 &&
          rec.screenY > -40 && rec.screenY < h + 40;
      }

      let show = rec.onScreen;
      if (show && rec.type === 'moon') {
        const parentRec = bodies.get(rec.parent);
        const dx = rec.screenX - parentRec.screenX;
        const dy = rec.screenY - parentRec.screenY;
        if (
          parentRec.onScreen &&
          Math.hypot(dx, dy) < LABEL_MOON_MIN_PX
        ) {
          show = false;
        }
      }

      if (show) {
        rec.label.style.visibility = 'visible';
        rec.label.style.transform = `translate(${rec.screenX}px, ${rec.screenY}px) translate(-50%, -160%)`;
      } else {
        rec.label.style.visibility = 'hidden';
      }
      rec.label.classList.toggle('active', rec.name === activeName);
    }
  }

  // Scratch objects for the per-frame orientation quaternion.
  const tmpBodyX = new THREE.Vector3();
  const tmpBodyY = new THREE.Vector3();
  const tmpBodyZ = new THREE.Vector3();
  const tmpOrient = new THREE.Matrix4();

  // Ecliptic frame -> scene frame, the same convention modes.js documents:
  // (x, y, z)_ecliptic maps to (x, z, -y)_scene.
  function setFromEcliptic(target, v) {
    target.set(v.x, v.z, -v.y);
  }

  // Advance the orrery to Julian date j; dtSimSeconds is the simulated time
  // step for the sidereal spin animation of bodies without WGCCRE elements
  // (modelled bodies take their absolute orientation from rotation.js, no
  // integration involved). Sprites and labels are updated separately by
  // updateOverlay, which the caller runs after the camera has settled for
  // the frame (after OrbitControls damping).
  function update(j, dtSimSeconds) {
    for (const rec of bodies.values()) {
      if (rec.type === 'planet') {
        const pAu = planetPosition(rec.elements, j);
        rec.posAu = pAu;
        const v = modes.planetToScene(pAu);
        rec.group.position.set(v.x, v.y, v.z);
        rec.moonSys.position.copy(rec.group.position);
        rec.worldPos.copy(rec.group.position);
        if (rec.orbitJd === null || Math.abs(j - rec.orbitJd) > ORBIT_REFRESH_DAYS) {
          updatePlanetOrbitLine(rec, j);
        }
      } else if (rec.type === 'moon') {
        const parentRec = bodies.get(rec.parent);
        const aKm = parseFloat(rec.moon.semi_major_axis_km);
        const pKm = moonPosition(rec.moon, j);
        // Model position in au: the parent's heliocentric position plus the
        // moon's parent-centred vector converted km -> au (the IAU au
        // definition in modes.js), independent of the display offset law.
        rec.posAu = {
          x: parentRec.posAu.x + pKm.x / AU_KM,
          y: parentRec.posAu.y + pKm.y / AU_KM,
          z: parentRec.posAu.z + pKm.z / AU_KM,
        };
        const v = modes.moonToScene(pKm, aKm, parentRec.radiusKm, rec.radiusKm);
        rec.group.position.set(v.x, v.y, v.z);
        rec.worldPos.copy(parentRec.group.position).add(rec.group.position);
      } else if (rec.type === 'comet') {
        const pAu = rec.positionAu(j);
        rec.posAu = pAu;
        const v = modes.planetToScene(pAu);
        rec.group.position.set(v.x, v.y, v.z);
        rec.worldPos.copy(rec.group.position);
      } else if (rec.type === 'probe') {
        // The position function returns null outside the craft's recorded
        // span: the craft then does not exist in the scene (no marker), and
        // update leaves its last position untouched behind the hidden group.
        const pAu = rec.positionAu(j);
        rec.exists = pAu !== null;
        rec.group.visible = probesVisible && rec.exists && planetaryVisible;
        if (pAu !== null) {
          rec.posAu = pAu;
          const v = modes.planetToScene(pAu);
          rec.group.position.set(v.x, v.y, v.z);
          rec.worldPos.copy(rec.group.position);
        }
      } else {
        rec.worldPos.set(0, 0, 0); // the Sun, heliocentric origin
      }

      if (rec.hasWgccre) {
        // True orientation: body-fixed +x is the prime meridian direction,
        // +z the north pole. The mesh's local +y is its pole and the
        // indicator meridian passes over local +x, so the basis maps local
        // (x, y, z) to body (x, z, -y), matching the ecliptic-to-scene axis
        // convention. Both source vectors are orthonormal by construction,
        // so the cross product completes a proper rotation.
        const o = rotationModel.orientationAt(rec.name, j);
        setFromEcliptic(tmpBodyX, o.meridian);
        setFromEcliptic(tmpBodyY, o.pole);
        tmpBodyZ.crossVectors(tmpBodyX, tmpBodyY);
        tmpOrient.makeBasis(tmpBodyX, tmpBodyY, tmpBodyZ);
        rec.tiltGroup.quaternion.setFromRotationMatrix(tmpOrient);
      } else if (rec.mesh) {
        // No WGCCRE closed-form elements for this body in rotation.json:
        // arbitrary-phase sidereal spin. Comets have no mesh and no spin.
        rec.mesh.rotation.y += rec.spinRate * dtSimSeconds;
      }
    }
  }

  // Register a comet as a followable heliocentric body (comets.js supplies
  // the propagation from the comets.json or skymap.json osculating
  // elements). positionAu(jd)
  // returns the heliocentric J2000 ecliptic position in au; orbitPositionsAu
  // is called once with the sample count and returns that many ecliptic
  // positions covering the full orbit. Comets carry no radius datum, so they
  // render as distance-scaled dots in both modes (alwaysDot), never as
  // scaled spheres; the dot colour is presentational.
  function addComet({ name, positionAu, orbitPositionsAu, colourHex }) {
    if (bodies.has(name)) throw new Error(`Duplicate body name: ${name}`);

    const group = new THREE.Group();
    group.visible = cometsVisible;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTexture,
        color: new THREE.Color(colourHex),
        transparent: true,
        depthTest: false,
      })
    );
    sprite.renderOrder = 5;
    sprite.visible = false;
    sprite.userData.bodyName = name;
    group.add(sprite);
    scene.add(group);

    const label = document.createElement('div');
    label.className = 'body-label';
    label.textContent = name;
    labelLayer.appendChild(label);

    const orbitPointsAu = orbitPositionsAu(ORBIT_SEGMENTS);
    if (!Array.isArray(orbitPointsAu) || orbitPointsAu.length !== ORBIT_SEGMENTS) {
      throw new Error(`addComet ${name}: expected ${ORBIT_SEGMENTS} orbit samples`);
    }

    const rec = {
      name,
      type: 'comet',
      parent: null,
      radiusKm: 0, // no radius datum in skymap.json; the dot is the marker
      spinRate: 0,
      hasWgccre: false,
      axes: null,
      group,
      tiltGroup: null,
      mesh: null,
      sprite,
      label,
      worldPos: new THREE.Vector3(),
      posAu: { x: 0, y: 0, z: 0 },
      screenX: 0,
      screenY: 0,
      onScreen: false,
      orbitLine: makeOrbitLine(planetOrbitMat),
      orbitJd: null,
      moonSys: null,
      elements: null,
      moon: null,
      alwaysDot: true,
      positionAu,
      orbitPointsAu,
    };
    rec.orbitLine.visible = cometsVisible;
    scene.add(rec.orbitLine);
    updateCometOrbitLine(rec);
    bodies.set(name, rec);
    return rec;
  }

  // Register a spacecraft as a followable body driven by sampled trajectory
  // data (probes.js supplies positionAu, which returns the heliocentric
  // J2000 ecliptic position in au at a Julian date, or null while the
  // simulated time is outside the craft's recorded span; the marker then
  // does not exist rather than showing an extrapolated position). Probes
  // carry no radius datum, so like comets they render as distance-scaled
  // dots in both modes (alwaysDot); the dot colour is presentational.
  // probes.js draws the trajectory line itself, so there is no orbit line
  // here.
  function addProbe({ name, positionAu, colourHex }) {
    if (bodies.has(name)) throw new Error(`Duplicate body name: ${name}`);

    const group = new THREE.Group();
    group.visible = false; // update() shows it while the craft exists
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTexture,
        color: new THREE.Color(colourHex),
        transparent: true,
        depthTest: false,
      })
    );
    sprite.renderOrder = 5;
    sprite.visible = false;
    sprite.userData.bodyName = name;
    group.add(sprite);
    scene.add(group);

    const label = document.createElement('div');
    label.className = 'body-label';
    label.textContent = name;
    labelLayer.appendChild(label);

    const rec = {
      name,
      type: 'probe',
      parent: null,
      radiusKm: 0, // no radius datum; the dot is the marker
      spinRate: 0,
      hasWgccre: false,
      axes: null,
      group,
      tiltGroup: null,
      mesh: null,
      sprite,
      label,
      worldPos: new THREE.Vector3(),
      posAu: { x: 0, y: 0, z: 0 },
      screenX: 0,
      screenY: 0,
      onScreen: false,
      orbitLine: null,
      orbitJd: null,
      moonSys: null,
      elements: null,
      moon: null,
      alwaysDot: true,
      positionAu,
      exists: false,
    };
    bodies.set(name, rec);
    return rec;
  }

  // Show or hide the rotation axis and prime meridian indicators of every
  // body that has a WGCCRE orientation model.
  function setAxesVisible(visible) {
    for (const rec of bodies.values()) {
      if (rec.axes) rec.axes.visible = visible;
    }
  }

  function getWorldPosition(name, out) {
    const rec = bodies.get(name);
    if (!rec) throw new Error(`Unknown body: ${name}`);
    return out.copy(rec.worldPos);
  }

  function displayRadius(name) {
    const rec = bodies.get(name);
    if (!rec) throw new Error(`Unknown body: ${name}`);
    return modes.bodyRadius(rec.radiusKm);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  function render() {
    renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    bodies,
    maxAu,
    update,
    updateOverlay,
    render,
    refreshOrbits,
    applyMode,
    getWorldPosition,
    displayRadius,
    setAxesVisible,
    setPlanetaryVisible,
    setCometsVisible,
    setProbesVisible,
    addComet,
    addProbe,
  };
}
