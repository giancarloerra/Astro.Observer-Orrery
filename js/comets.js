// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// comets.js
//
// Well-known comets from data/comets.json: JPL Small-Body Database osculating
// elements propagated exactly like the photographed comets from skymap.json
// (unperturbed two-body motion fixed at the osculating epoch, kepler.js).
// comets.json is core project data and fails loudly like planets.json; there
// is no fallback and no optional path.
//
// The element parsing and the scene registration here are shared with
// skymap.js, so both files go through the identical validation (including the
// elliptical eccentricity guard) and the identical propagation.

import { cometP, cometPosition, orbitPoint } from './kepler.js';

// Comet dot tint, presentational (shared with the skymap comets).
export const COMET_DOT_COLOUR = 0x9fd6cd;

// Strict numeric read: a value must be a finite number or a string that is
// entirely numeric (Number, not parseFloat, so a trailing unit or other
// junk fails loudly instead of being silently truncated).
function strictNumber(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
  return NaN;
}

function elementNumber(elements, key, slug, file) {
  const v = strictNumber(elements[key]);
  if (!Number.isFinite(v)) {
    throw new Error(`${file} comet ${slug}: element "${key}" is not numeric`);
  }
  return v;
}

// Parse and validate one comet's osculating elements into the numeric shape
// kepler.js consumes. Only elliptical orbits are supported: the propagation
// solves the elliptical Kepler equation, so e must be below 1. file names the
// source file for the error messages ("comets.json" or "skymap.json").
// periodDays is kept for display: the source "per" element where stored,
// otherwise 360 / n (the same unit conversion the parsing applies in reverse).
export function parseCometElements(entry, slug, file) {
  if (typeof entry.elements !== 'object' || entry.elements === null) {
    throw new Error(`${file} comet ${slug} needs an "elements" object`);
  }
  const els = entry.elements;
  const e = elementNumber(els, 'e', slug, file);
  if (!(e >= 0 && e < 1)) {
    throw new Error(
      `${file} comet ${slug}: eccentricity ${e} is not inside 0 <= e < 1; only elliptical orbits are supported`
    );
  }
  let a;
  if (els.a !== undefined) a = elementNumber(els, 'a', slug, file);
  else if (els.q !== undefined) a = elementNumber(els, 'q', slug, file) / (1 - e);
  else throw new Error(`${file} comet ${slug}: needs "a" or "q"`);
  const i = elementNumber(els, 'i', slug, file);
  const om = elementNumber(els, 'om', slug, file);
  const w = elementNumber(els, 'w', slug, file);
  let n;
  if (els.n !== undefined) n = elementNumber(els, 'n', slug, file);
  else if (els.per !== undefined) n = 360 / elementNumber(els, 'per', slug, file);
  else throw new Error(`${file} comet ${slug}: needs "n" or "per" for the mean motion`);
  let tp = null;
  let ma = null;
  let epoch = null;
  if (els.tp !== undefined) {
    tp = elementNumber(els, 'tp', slug, file);
  } else if (els.ma !== undefined) {
    ma = elementNumber(els, 'ma', slug, file);
    epoch = strictNumber(entry.epoch);
    if (!Number.isFinite(epoch)) {
      throw new Error(`${file} comet ${slug}: "ma" needs the osculating "epoch"`);
    }
  } else {
    throw new Error(`${file} comet ${slug}: needs "tp" or "ma"`);
  }
  const periodDays = els.per !== undefined ? elementNumber(els, 'per', slug, file) : 360 / n;
  return { a, e, i, om, w, n, tp, ma, epoch, periodDays };
}

function reqString(entry, key, slug) {
  const v = entry[key];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`comets.json entry ${slug} needs a non-empty "${key}" string`);
  }
  return v;
}

// Shape check for data/comets.json (schema in DATA-SOURCES.md): a top-level
// "comets" object keyed by designation slug, each entry carrying designation,
// display_name and SBDB osculating elements. Anything off throws; the caller
// surfaces the error visibly. The key doubles as the comet's entry key in
// descriptions.json. Returns an ordered array of parsed records.
export function validateComets(data) {
  if (
    typeof data !== 'object' || data === null || Array.isArray(data) ||
    typeof data.comets !== 'object' || data.comets === null || Array.isArray(data.comets)
  ) {
    throw new Error('comets.json must be an object with a "comets" object keyed by designation slug');
  }
  const out = [];
  for (const [key, entry] of Object.entries(data.comets)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`comets.json entry ${key} must be an object`);
    }
    out.push({
      key,
      name: reqString(entry, 'display_name', key),
      designation: reqString(entry, 'designation', key),
      el: parseCometElements(entry, key, 'comets.json'),
    });
  }
  if (!out.length) throw new Error('comets.json carries no comets');
  return out;
}

// Register one comet with the scene as a followable body: two-body
// propagation of its parsed osculating elements and a full-orbit line, the
// exact path the photographed skymap.json comets take.
export function addCometBody(sceneApi, name, el) {
  sceneApi.addComet({
    name,
    positionAu: (j) => cometPosition(el, j),
    orbitPositionsAu(count) {
      const pts = [];
      for (let k = 0; k < count; k += 1) {
        pts.push(orbitPoint(cometP(el), (k * 360) / count));
      }
      return pts;
    },
    colourHex: COMET_DOT_COLOUR,
  });
}
