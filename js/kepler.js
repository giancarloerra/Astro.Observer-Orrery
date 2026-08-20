// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// kepler.js
//
// Planet positions: exact implementation of the JPL "Approximate Positions of
// the Planets" algorithm (https://ssd.jpl.nasa.gov/planets/approx_pos.html),
// applied to the Table 1 Keplerian elements and per-century rates stored in
// data/planets.json. Valid 1800 AD to 2050 AD. Output is in au, in the mean
// ecliptic and equinox of J2000 frame.
//
// Moon positions: APPROXIMATE circular-inclined propagation of the JPL SSD
// mean satellite elements stored in data/moons.json (epoch 2000-01-01.5 TDB).
// Eccentricity and the secular precession of node and periapsis are ignored,
// and the stated reference planes (the local Laplace plane for every moon
// except the Moon) are approximated by the ecliptic frame of the parent. The
// UI states this caveat.
//
// The simulator clock is civil UTC; the offset between UTC and the TDB/TT
// timescale used by the sources is far below the fidelity of these
// approximate elements.

const DEG = Math.PI / 180;

// J2000.0 epoch as a Julian date (from the JPL algorithm; also the epoch of
// the moon elements, 2000-01-01.5 TDB).
export const J2000_JD = 2451545.0;

// Julian centuries per century of days (from the JPL algorithm).
const DAYS_PER_CENTURY = 36525;

// Julian date of the Unix epoch, 1970-01-01T00:00Z (calendar arithmetic, not
// an astronomy datum).
const UNIX_EPOCH_JD = 2440587.5;

const MS_PER_DAY = 86400000;

// Julian date from a JS Date (UTC).
export function jd(date) {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

// JS Date (UTC) from a Julian date.
export function dateFromJd(j) {
  return new Date((j - UNIX_EPOCH_JD) * MS_PER_DAY);
}

// Normalise an angle in degrees to the range -180..180 (JPL algorithm step
// for the mean anomaly).
export function norm180(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Propagate the six Keplerian elements of one planet to Julian date j:
// element(T) = element + rate * T, T in Julian centuries past J2000.0.
// el is one "elements" object from planets.json (values stored as strings).
export function elementsAt(el, j) {
  const T = (j - J2000_JD) / DAYS_PER_CENTURY;
  return {
    a: parseFloat(el.a_au) + parseFloat(el.a_au_rate_per_century) * T,
    e: parseFloat(el.e) + parseFloat(el.e_rate_per_century) * T,
    I: parseFloat(el.I_deg) + parseFloat(el.I_deg_rate_per_century) * T,
    L: parseFloat(el.L_deg) + parseFloat(el.L_deg_rate_per_century) * T,
    longPeri:
      parseFloat(el.long_peri_deg) +
      parseFloat(el.long_peri_deg_rate_per_century) * T,
    longNode:
      parseFloat(el.long_node_deg) +
      parseFloat(el.long_node_deg_rate_per_century) * T,
  };
}

// Solve Kepler's equation M = E - e* sin(E) in degrees by Newton iteration,
// where e* = 57.29578 e (eccentricity expressed in degrees, the constant
// printed by the JPL algorithm). Tolerance 1e-6 degrees.
export function solveKepler(Mdeg, e) {
  const eStar = 57.29578 * e;
  let E = Mdeg + eStar * Math.sin(Mdeg * DEG);
  for (let i = 0; i < 100; i += 1) {
    const dM = Mdeg - (E - eStar * Math.sin(E * DEG));
    const dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) <= 1e-6) break;
  }
  return E;
}

// Position on the orbit for propagated elements p and eccentric anomaly E
// (degrees): heliocentric orbital-plane coordinates, then rotation through
// the argument of perihelion, the inclination and the longitude of the
// ascending node into J2000 ecliptic coordinates. Returns au.
export function orbitPoint(p, Edeg) {
  const xp = p.a * (Math.cos(Edeg * DEG) - p.e);
  const yp = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(Edeg * DEG);

  const w = (p.longPeri - p.longNode) * DEG; // argument of perihelion
  const o = p.longNode * DEG;
  const i = p.I * DEG;

  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const co = Math.cos(o);
  const so = Math.sin(o);
  const ci = Math.cos(i);
  const si = Math.sin(i);

  return {
    x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

// Heliocentric J2000 ecliptic position of a planet at Julian date j, in au.
export function planetPosition(elements, j) {
  const p = elementsAt(elements, j);
  const M = norm180(p.L - p.longPeri);
  const E = solveKepler(M, p.e);
  return orbitPoint(p, E);
}

// ---- moons: circular-inclined approximation ----

// Effective orbital period in days for the mean motion. An inclination above
// 90 degrees already encodes retrograde motion geometrically (Triton,
// 157.3 degrees in the source elements). The negative period stored in
// moons.json is a simulator sign convention for the same fact (see
// period_sign_note there); applying both would cancel out and render the
// motion prograde, so the magnitude is used when the inclination is
// retrograde.
export function moonEffectivePeriod(m) {
  const P = parseFloat(m.orbital_period_days);
  const inc = parseFloat(m.inclination_deg);
  return inc > 90 ? Math.abs(P) : P;
}

// Argument of latitude (radians) of a moon at Julian date j: the epoch phase
// (mean anomaly plus argument of periapsis) advanced by the circular mean
// motion 2 pi t / period.
export function moonAngleAt(m, j) {
  const t = j - J2000_JD; // days since epoch 2000-01-01.5 TDB
  const phase0 =
    (parseFloat(m.arg_periapsis_deg) + parseFloat(m.mean_anomaly_deg)) * DEG;
  return phase0 + (2 * Math.PI * t) / moonEffectivePeriod(m);
}

// Parent-centred position for argument of latitude u (radians) on the moon's
// circular inclined orbit: rotate (a cos u, a sin u, 0) through the
// inclination and the node. Returns km in the approximated parent ecliptic
// frame.
export function moonOrbitPoint(m, u) {
  const a = parseFloat(m.semi_major_axis_km);
  const i = parseFloat(m.inclination_deg) * DEG;
  const o = parseFloat(m.node_deg) * DEG;

  const cu = Math.cos(u);
  const su = Math.sin(u);
  const co = Math.cos(o);
  const so = Math.sin(o);
  const ci = Math.cos(i);
  const si = Math.sin(i);

  return {
    x: a * (co * cu - so * su * ci),
    y: a * (so * cu + co * su * ci),
    z: a * (su * si),
  };
}

// Parent-centred position of a moon at Julian date j, in km. Approximate by
// design; see the header comment.
export function moonPosition(m, j) {
  return moonOrbitPoint(m, moonAngleAt(m, j));
}

// ---- comets: two-body propagation of fixed osculating elements ----
//
// Used for the comets mapped in skymap.json: JPL Small-Body Database
// osculating elements (heliocentric ecliptic J2000, angles in degrees,
// distances in au, epochs as Julian days TDB) propagated as unperturbed
// two-body motion. The elements stay fixed at their osculating epoch, so
// accuracy degrades away from that epoch; the UI states this caveat. Only
// elliptical orbits (e below 1) are supported.

// Solve Kepler's equation M = E - e* sin(E) in degrees by bisection on
// f(E) = E - e* sin(E) - M, which is strictly increasing in E for e < 1
// (f' = 1 - e cos E > 0), so the root inside the bracket M -/+ e* is unique
// and the search always converges. The Newton iteration in solveKepler above
// is the JPL planetary algorithm and loses convergence as e approaches 1,
// where that derivative nears zero at perihelion; cometary eccentricities
// need the bracketed solve. Tolerance 1e-6 degrees, as in solveKepler.
export function solveKeplerBisect(Mdeg, e) {
  const eStar = 57.29578 * e;
  let lo = Mdeg - eStar;
  let hi = Mdeg + eStar;
  while (hi - lo > 1e-6) {
    const mid = (lo + hi) / 2;
    if (mid - eStar * Math.sin(mid * DEG) - Mdeg < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Orbit-shape parameters for orbitPoint from parsed comet elements
// {a, e, i, om, w} (au, degrees). orbitPoint takes the longitudes of
// perihelion and node, so longPeri = om + w.
export function cometP(el) {
  return { a: el.a, e: el.e, I: el.i, longNode: el.om, longPeri: el.om + el.w };
}

// Mean anomaly in degrees at Julian date j from the mean motion n (deg/day)
// and either the perihelion passage tp (Julian day) or the mean anomaly ma
// at the osculating epoch.
export function cometMeanAnomaly(el, j) {
  return norm180(el.tp !== null ? el.n * (j - el.tp) : el.ma + el.n * (j - el.epoch));
}

// Heliocentric J2000 ecliptic position of a comet at Julian date j, in au.
export function cometPosition(el, j) {
  return orbitPoint(cometP(el), solveKeplerBisect(cometMeanAnomaly(el, j), el.e));
}
