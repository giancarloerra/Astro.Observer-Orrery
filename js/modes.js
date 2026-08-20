// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// modes.js
//
// Two scale modes for the scene.
//
// "easy":     compressed distances d_scene = k1 * d_au^0.45 and radii
//             r_scene = k2 * r_km^0.38, so every body is visible at once.
//             Moons are offset from their parent with the same power law but
//             pushed outside the parent's displayed radius. Consistent within
//             the whole mode.
// "accurate": true proportions. 1 au = a fixed number of scene units and all
//             radii keep their true ratio to the distances. Bodies become
//             sub-pixel at this scale, so the scene layer adds distance-scaled
//             sprite dots and labels; the UI shows a "true scale" badge.
//
// Axis convention: source coordinates are right-handed ecliptic (x toward the
// equinox, z toward ecliptic north); the scene is right-handed with y up, so
// (x, y, z)_ecliptic maps to (x, z, -y)_scene.

// 1 au in km. Exact by IAU definition (1 au = 149 597 870.7 km); a unit
// conversion, not a measured input.
export const AU_KM = 149597870.7;

// Power-law exponents for the easy mode (specified for this simulator).
const EASY_DIST_EXP = 0.45;
const EASY_RADIUS_EXP = 0.38;

// Presentational scene-tuning gains, not astronomy data.
const AU_UNITS = 100; // accurate mode: scene units per au
const EASY_DIST_GAIN = 90; // easy mode: gain on d_au^0.45
const EASY_RADIUS_GAIN = 0.05; // easy mode: gain on r_km^0.38
const EASY_MOON_GAIN = 0.012; // easy mode: gain on moon a_km^0.45
const EASY_MOON_GAP = 0.6; // easy mode: clearance outside the parent surface

function eclipticToScene(x, y, z) {
  return { x, y: z, z: -y };
}

export function createModes(initial = 'easy') {
  if (initial !== 'easy' && initial !== 'accurate') {
    throw new Error(`Unknown scale mode: ${initial}`);
  }
  let mode = initial;

  const api = {
    get mode() {
      return mode;
    },

    set(next) {
      if (next !== 'easy' && next !== 'accurate') {
        throw new Error(`Unknown scale mode: ${next}`);
      }
      mode = next;
    },

    // Displayed radius in scene units for a body of physical radius rKm.
    bodyRadius(rKm) {
      if (mode === 'easy') {
        return EASY_RADIUS_GAIN * Math.pow(rKm, EASY_RADIUS_EXP);
      }
      return (rKm / AU_KM) * AU_UNITS;
    },

    // Heliocentric ecliptic vector in au -> scene vector. In easy mode the
    // radial distance is compressed through the power law, which keeps orbit
    // lines and body positions consistent because both go through this
    // function.
    planetToScene(p) {
      const r = Math.hypot(p.x, p.y, p.z);
      let f;
      if (mode === 'easy') {
        f = r > 0 ? (EASY_DIST_GAIN * Math.pow(r, EASY_DIST_EXP)) / r : 0;
      } else {
        f = AU_UNITS;
      }
      return eclipticToScene(p.x * f, p.y * f, p.z * f);
    },

    // Displayed orbit radius in scene units for a moon with semi-major axis
    // aKm around a parent of radius parentRKm. In easy mode the offset starts
    // outside the parent's displayed surface and grows with the same power
    // law, which preserves the ordering of a parent's moons.
    moonOffset(aKm, parentRKm, moonRKm) {
      if (mode === 'easy') {
        return (
          api.bodyRadius(parentRKm) +
          api.bodyRadius(moonRKm) +
          EASY_MOON_GAP +
          EASY_MOON_GAIN * Math.pow(aKm, EASY_DIST_EXP)
        );
      }
      return (aKm / AU_KM) * AU_UNITS;
    },

    // Parent-centred moon vector in km -> parent-centred scene vector. The
    // orbits are circular in this simulator, so the vector length is always
    // the semi-major axis and the whole orbit scales uniformly.
    moonToScene(pKm, aKm, parentRKm, moonRKm) {
      const r = Math.hypot(pKm.x, pKm.y, pKm.z);
      const off = api.moonOffset(aKm, parentRKm, moonRKm);
      const f = r > 0 ? off / r : 0;
      return eclipticToScene(pKm.x * f, pKm.y * f, pKm.z * f);
    },

    // Sensible camera overview distance for the outermost orbit (maxAu is
    // taken from the data by the caller, not hardcoded here).
    overviewDistance(maxAu) {
      if (mode === 'easy') {
        return EASY_DIST_GAIN * Math.pow(maxAu, EASY_DIST_EXP) * 1.7;
      }
      return maxAu * AU_UNITS * 1.6;
    },

    // OrbitControls distance clamps per mode (presentational).
    minCameraDistance() {
      return mode === 'easy' ? 1.5 : 0.004;
    },
    maxCameraDistance(maxAu) {
      return api.overviewDistance(maxAu) * 5;
    },
  };

  return api;
}
