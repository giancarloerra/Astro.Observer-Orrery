// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// rotation.js
//
// True body orientation from the IAU WGCCRE rotational elements stored in
// data/rotation.json: north pole right ascension alpha0 and declination
// delta0 (ICRF equatorial coordinates at epoch J2000.0) and prime meridian
// angle W. Each quantity is a base value plus polynomial terms in T (Julian
// centuries from J2000.0) or, for W, a linear rate in d (days from J2000.0),
// plus a sum of trigonometric terms whose arguments are the named series in
// the file (Mercury M1..M5, the Mars inline arguments, Ja..Je, J3..J8, the
// mars_M satellite series, N, N7, the lunar E1..E13) and, where the source
// prints one, a polynomial term in d. Every term present in the data is
// evaluated; nothing is truncated.
//
// Timescale: the WGCCRE expressions take TDB. The caller passes the app's
// civil-UTC Julian date straight in, approximating TDB by TT by UTC. TT-TDB
// stays below 2 ms and UTC-TT is about 69 s in 2026; at the fastest rotation
// in the file (Phobos, about 1128.8 deg/day) 69 s is about 0.9 deg of W,
// below the visual fidelity of this orrery. Noted, not corrected.
//
// Frame: alpha0/delta0 are ICRF equatorial. The app works in the J2000 mean
// ecliptic frame (see modes.js), so pole and prime meridian directions are
// rotated about the x axis (the equinox direction) by the J2000 mean
// obliquity. The obliquity value is read from rotation.json's arguments
// entry _j2000_obliquity_deg (23.43928 deg, the IAU J2000 constant; none of
// the WGCCRE source documents states one), never hardcoded here.
//
// No fallbacks: a body whose entry is null carries the source's documented
// statement that no closed-form elements exist, hasModel returns false for
// it, and orientationAt on it throws. Every entry carries a model: Earth and
// the Moon use the WGCCRE 2009 closed forms, the rest WGCCRE 2015 with its
// corrections.
// Anything malformed (unparseable expression, unknown trig function or
// argument, non-numeric coefficient) throws at load, so a broken entry can
// never silently render as a zeroed orientation.

import { J2000_JD } from './kepler.js';

const DEG = Math.PI / 180;

// Days per Julian century, as defined by rotation.json _meta.time_variables
// ("Interval in Julian centuries (36,525 days)").
const DAYS_PER_CENTURY = 36525;

function num(value, context) {
  const n = Number(value);
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(n)) {
    throw new Error(`rotation.json: non-numeric value "${value}" in ${context}`);
  }
  return n;
}

// The argument expressions in rotation.json are printed as
// "C0 + C1 d", "C0 + C1 T" or "C0 + C1 T + C2 T^2" (mars_M5).
const ARG_EXPR = /^(-?\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*([dT])(?:\s*([+-])\s*(\d+(?:\.\d+)?)\s*T\^2)?$/;

function parseArgument(name, entry) {
  if (!entry || typeof entry.expression_deg !== 'string') {
    throw new Error(`rotation.json: argument ${name} has no expression_deg`);
  }
  const m = ARG_EXPR.exec(entry.expression_deg.trim());
  if (!m) {
    throw new Error(
      `rotation.json: argument ${name} expression "${entry.expression_deg}" does not parse`
    );
  }
  const variable = m[4];
  if (entry.variable !== variable) {
    throw new Error(
      `rotation.json: argument ${name} declares variable "${entry.variable}" but its expression uses "${variable}"`
    );
  }
  return {
    c0: Number(m[1]),
    c1: (m[2] === '-' ? -1 : 1) * Number(m[3]),
    variable,
    c2: m[5] ? (m[5] === '-' ? -1 : 1) * Number(m[6]) : 0,
  };
}

// One of pole_ra / pole_dec / W: base value, optional linear rate in d (W
// only), polynomial T terms and trigonometric terms.
function parseSeries(spec, baseKey, args, context) {
  if (!spec || typeof spec !== 'object') {
    throw new Error(`rotation.json: ${context} is not an object`);
  }
  const series = {
    base: num(spec[baseKey], `${context}.${baseKey}`),
    wdot: 0,
    tTerms: [],
    dTerms: [],
    trig: [],
  };
  if (baseKey === 'w0') {
    series.wdot = num(spec.wdot_deg_per_day, `${context}.wdot_deg_per_day`);
  }
  if (!Array.isArray(spec.T_terms) || !Array.isArray(spec.trig_terms)) {
    throw new Error(`rotation.json: ${context} lacks T_terms/trig_terms arrays`);
  }
  for (const t of spec.T_terms) {
    if (!Number.isInteger(t.power) || t.power < 1) {
      throw new Error(`rotation.json: ${context} T term power "${t.power}" invalid`);
    }
    series.tTerms.push({ power: t.power, coeff: num(t.coeff, `${context} T term`) });
  }
  // Polynomial terms in d (days), per _meta.conventions.d_terms; the Moon's W
  // carries a quadratic one.
  if (spec.d_terms !== undefined) {
    if (!Array.isArray(spec.d_terms)) {
      throw new Error(`rotation.json: ${context} d_terms is not an array`);
    }
    for (const t of spec.d_terms) {
      if (!Number.isInteger(t.power) || t.power < 2) {
        throw new Error(`rotation.json: ${context} d term power "${t.power}" invalid`);
      }
      series.dTerms.push({ power: t.power, coeff: num(t.coeff, `${context} d term`) });
    }
  }
  for (const t of spec.trig_terms) {
    if (t.fn !== 'sin' && t.fn !== 'cos') {
      throw new Error(`rotation.json: ${context} trig function "${t.fn}" unknown`);
    }
    if (!args.has(t.arg)) {
      throw new Error(`rotation.json: ${context} references unknown argument "${t.arg}"`);
    }
    series.trig.push({
      coeff: num(t.coeff, `${context} trig term`),
      fn: t.fn,
      arg: t.arg,
      mult: t.arg_multiple === undefined ? 1 : num(t.arg_multiple, `${context} arg_multiple`),
    });
  }
  return series;
}

function evalArgumentDeg(arg, d, T) {
  const v = arg.variable === 'd' ? d : T;
  return arg.c0 + arg.c1 * v + arg.c2 * T * T;
}

function evalSeriesDeg(series, d, T, args) {
  let value = series.base + series.wdot * d;
  for (const t of series.tTerms) {
    value += t.coeff * Math.pow(T, t.power);
  }
  for (const t of series.dTerms) {
    value += t.coeff * Math.pow(d, t.power);
  }
  for (const t of series.trig) {
    const argDeg = evalArgumentDeg(args.get(t.arg), d, T) * t.mult;
    value += t.coeff * (t.fn === 'sin' ? Math.sin(argDeg * DEG) : Math.cos(argDeg * DEG));
  }
  return value;
}

// Unit vector in the ICRF equatorial frame for right ascension and
// declination in degrees.
export function raDecToUnit(raDeg, decDeg) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  };
}

// Rotate an ICRF equatorial vector into the J2000 mean ecliptic frame:
// rotation about the shared x axis (equinox) by the obliquity.
export function equatorialToEcliptic(v, obliquityDeg) {
  const e = obliquityDeg * DEG;
  const ce = Math.cos(e);
  const se = Math.sin(e);
  return {
    x: v.x,
    y: ce * v.y + se * v.z,
    z: -se * v.y + ce * v.z,
  };
}

// Build the rotation model from the parsed data/rotation.json object.
// Validates every argument expression, every coefficient and every argument
// reference up front, so a malformed file fails loudly at load, not as a
// silently wrong orientation mid-animation.
export function createRotationModel(rotationData) {
  if (!rotationData || typeof rotationData !== 'object' || !rotationData.arguments || !rotationData.bodies) {
    throw new Error('rotation.json: missing arguments or bodies');
  }

  const args = new Map();
  for (const [name, entry] of Object.entries(rotationData.arguments)) {
    if (name.startsWith('_')) continue; // metadata entries, not series arguments
    args.set(name, parseArgument(name, entry));
  }

  const obliquityEntry = rotationData.arguments._j2000_obliquity_deg;
  if (!obliquityEntry) {
    throw new Error('rotation.json: arguments._j2000_obliquity_deg is missing');
  }
  const obliquityDeg = num(obliquityEntry.value, 'arguments._j2000_obliquity_deg.value');

  // Per-body models. A body whose pole_ra, pole_dec and W are all null is
  // stored as null: the source documents publish no closed-form elements for
  // it and the entry's note says what the source recommends instead. Mixed
  // null and non-null is malformed. For Mars the top-level
  // series are the WGCCRE 2015 Table 1 model, which the entry's "use" field
  // designates (the post_2015_update block was proposed, not recommended,
  // and is not read). For Phobos the top-level W is the Correction2019
  // value, which its "use" field designates (W_as_printed_in_2015_report is
  // provenance only and is not read).
  const models = new Map();
  for (const [name, entry] of Object.entries(rotationData.bodies)) {
    const nulls = [entry.pole_ra, entry.pole_dec, entry.W].filter((s) => s === null).length;
    if (nulls === 3) {
      models.set(name, null);
      continue;
    }
    if (nulls !== 0) {
      throw new Error(`rotation.json: body ${name} mixes null and non-null series`);
    }
    models.set(name, {
      ra: parseSeries(entry.pole_ra, 'a0', args, `${name}.pole_ra`),
      dec: parseSeries(entry.pole_dec, 'd0', args, `${name}.pole_dec`),
      w: parseSeries(entry.W, 'w0', args, `${name}.W`),
    });
  }

  function modelFor(name) {
    const key = String(name).toLowerCase();
    if (!models.has(key)) return undefined;
    return models.get(key);
  }

  return {
    obliquityDeg,

    // True when rotation.json carries closed-form elements for the body.
    // False for bodies the source explicitly leaves without them (null
    // entries) and for bodies absent from the file.
    hasModel(name) {
      const m = modelFor(name);
      return m !== undefined && m !== null;
    },

    // Orientation of a body at Julian date jd (TDB approximated by TT by
    // UTC, see the header). Returns angles in degrees plus three orthonormal
    // unit vectors in the app's J2000 ecliptic frame:
    //   pole      the body's north pole (body-fixed +z),
    //   node      the ascending node Q of the body equator on the ICRF
    //             equator (RA alpha0 + 90), from which W is measured,
    //   meridian  the prime meridian direction in the body's equatorial
    //             plane (body-fixed +x): node rotated by W about the pole.
    // wDeg is the raw accumulated series value, not normalised to 0..360.
    orientationAt(name, jd) {
      if (!Number.isFinite(jd)) {
        throw new Error(`rotation.js: non-finite Julian date for ${name}`);
      }
      const m = modelFor(name);
      if (m === undefined) {
        throw new Error(`rotation.json has no entry for ${name}`);
      }
      if (m === null) {
        throw new Error(
          `rotation.json publishes no closed-form rotational elements for ${name}; see its note`
        );
      }
      const d = jd - J2000_JD;
      const T = d / DAYS_PER_CENTURY;
      const raDeg = evalSeriesDeg(m.ra, d, T, args);
      const decDeg = evalSeriesDeg(m.dec, d, T, args);
      const wDeg = evalSeriesDeg(m.w, d, T, args);

      const pole = raDecToUnit(raDeg, decDeg);
      // Node Q on the ICRF equator at RA alpha0 + 90 deg.
      const ra = raDeg * DEG;
      const node = { x: -Math.sin(ra), y: Math.cos(ra), z: 0 };
      // Prime meridian: node rotated by W about the pole, easterly
      // (right-handed about the north pole, the WGCCRE convention).
      const cw = Math.cos(wDeg * DEG);
      const sw = Math.sin(wDeg * DEG);
      const pxn = {
        x: pole.y * node.z - pole.z * node.y,
        y: pole.z * node.x - pole.x * node.z,
        z: pole.x * node.y - pole.y * node.x,
      };
      const meridian = {
        x: node.x * cw + pxn.x * sw,
        y: node.y * cw + pxn.y * sw,
        z: node.z * cw + pxn.z * sw,
      };

      return {
        raDeg,
        decDeg,
        wDeg,
        pole: equatorialToEcliptic(pole, obliquityDeg),
        node: equatorialToEcliptic(node, obliquityDeg),
        meridian: equatorialToEcliptic(meridian, obliquityDeg),
      };
    },
  };
}
