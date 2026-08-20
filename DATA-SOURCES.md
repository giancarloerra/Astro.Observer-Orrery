# Data sources

All numeric values in `data/` are copied from the sources cited below or derived from
them by documented unit conversions; none are invented. Where the cited sources publish
no value, the gap is recorded here and the affected field is null in the JSON, never
invented. Numeric values are stored as strings in the JSON files to preserve the exact
digits printed by each source, except in probes.json, whose bulk trajectory samples and
rover coordinates are JSON numbers (its section below says so); parse the strings to
float in the app. Colours are presentational.

## planets.json

Keplerian elements and per-century rates for the eight planets.

- Source: JPL Solar System Dynamics, "Approximate Positions of the Planets",
  <https://ssd.jpl.nasa.gov/planets/approx_pos.html>, Table 1, which is embedded
  directly in the page HTML inside a `pre` block.
- Validity: 1800 AD to 2050 AD, as stated on the page.
- Epoch and frame: elements are with respect to the mean ecliptic and equinox of J2000;
  T is Julian centuries past J2000.0, T = (JD_TDB - 2451545.0) / 36525.
- The page's Earth row is labelled "EM Bary" (Earth/Moon Barycenter). It is recorded
  under `name: "Earth"` with a `source_row_note` saying so.
- Source quirk: the page's column header prints "rad, rad/Cy" under the eccentricity
  column. Eccentricity is dimensionless; the JSON notes this in `units.e`.

## bodies.json

Physical data for the Sun, the eight planets and nine moons. Physical data cites the
JPL Solar System Dynamics pages and NASA/JPL Horizons API sheets below; the NASA/NSSDCA
planetary fact sheets (<https://nssdc.gsfc.nasa.gov/planetary/factsheet/>) do not
publish obliquity to orbit for the satellites carried here.

### Sources used

- Planet mean radii and sidereal rotation periods (days):
  <https://ssd.jpl.nasa.gov/planets/phys_par.html> (Mean Radius and Sidereal Rotation
  Period columns; negative rotation printed by the source for Venus and Uranus).
- Moon (satellite) mean radii: <https://ssd.jpl.nasa.gov/sats/phys_par/> (Mean Radius
  column).
- Planet obliquity to orbit, Sun data, Moon obliquity and rotation rate, satellite
  synchronous-rotation statements: NASA/JPL Horizons API per-body object data sheets,
  `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='<id>'&OBJ_DATA='YES'&MAKE_EPHEM='NO'`
  for ids 10 (Sun), 199, 299, 399, 499, 599, 699, 799, 899 (planets), 301 (Moon), 401,
  402, 501, 502, 503, 504, 606, 801 (moons).
- Titan rotation: the Horizons 606 sheet leaves its "Rotational period" field blank, so
  the synchronous-rotation statement comes from
  <https://science.nasa.gov/saturn/moons/titan/facts/> ("tidally locked in synchronous
  rotation"), with the period taken from the orbital period in
  <https://ssd.jpl.nasa.gov/sats/elem/>.

### Computed values (marked in the JSON)

- Rotation hours for planets and the Sun: source value in days multiplied by 24.
- Moon rotation hours: computed as 2 pi divided by the printed sidereal rotation rate
  (0.0000026617 rad/s, Horizons 301), converted to hours, rounded to 3 decimal places.
- Mercury axial tilt: Horizons prints "2.11' +/- 0.1'" in arcminutes; 2.11 / 60 =
  0.0352 degrees.
- Synchronous moons: rotation hours equal the orbital period from
  <https://ssd.jpl.nasa.gov/sats/elem/> multiplied by 24.

### Discrepancies between JPL pages (both values recorded)

The dedicated physical parameters pages are primary for radii; where the per-body
Horizons sheet prints a different value, the JSON carries a `radius_note`:

- Mars: phys_par prints 3389.50; Horizons 499 prints 3389.92.
- Neptune: phys_par prints 24622; Horizons 899 prints 24624.
- Moon: sats/phys_par prints 1737.4 (IAU); Horizons 301 prints 1737.53 (volumetric mean).
- Titan: sats/phys_par prints 2574.76; Horizons 606 prints 2575.5.

### Gaps recorded as null

- Axial tilt (obliquity to orbit) for Phobos, Deimos, Io, Europa, Ganymede, Callisto,
  Titan and Triton: not published by the cited sources; null with a note in each entry.
  The NSSDCA satellite fact sheets (joviansatfact, saturniansatfact, neptuniansatfact,
  galileanfact_table) do not publish obliquity to orbit for these satellites either.
  The Sun's 7.25 degrees is obliquity to the ecliptic, as printed by Horizons, since
  the Sun has no orbit.
- Rendered orientation does not depend on these nulls: it comes from the WGCCRE pole
  models in `rotation.json` (evaluated by `js/rotation.js`), not from the single-angle
  obliquity representation. Earth and the Moon also carry closed-form pole models in
  `rotation.json`, taken from the WGCCRE 2009 report. Deriving obliquity-to-orbit
  numbers for bodies.json from the pole models remains open work.

### Colours

`colour_hex` values are presentational only, chosen editorially, and are marked
"presentational" in the JSON. They are not sourced measurements.

## moons.json

Mean orbital elements for the nine moons.

- Source: JPL Solar System Dynamics, planetary satellite mean orbital elements,
  <https://ssd.jpl.nasa.gov/sats/elem/>. The elements are embedded in the page HTML
  (table id `sat_elem`).
- Epoch: 2000-01-01.5 TDB for all nine moons, as printed per row.
- Reference planes, as stated by the page's frame legend and recorded per moon:
  - Moon: mean ecliptic.
  - Phobos, Deimos, Io, Europa, Ganymede, Callisto, Titan, Triton: the local Laplace
    plane (the plane in which the satellite's nodal precession is contained on average).
    The Laplace plane pole (ICRF RA/Dec) and its tilt to the planet equator are included
    per moon as printed.
- Ephemerides cited by the page per row: DE405/LE405 (Moon), MAR099 (Phobos, Deimos),
  JUP365 (Galileans), SAT441 (Titan), NEP097 (Triton).
- Triton: the source prints the period as 5.876994 days with inclination 157.3 degrees
  (greater than 90, therefore retrograde). The stored value -5.876994 applies the
  simulator's sign convention; the JSON says so in `period_sign_note`.
- The top-level `fidelity` field is "approximate: circular-inclined propagation in v1"
  so the app can label the moon orbits honestly.

## comets.json

Osculating orbital elements for five comets.

- Source: NASA/JPL Small-Body Database (SBDB) Lookup API,
  <https://ssd-api.jpl.nasa.gov/sbdb.api>, queried with `full-prec=true`. Each entry's
  `source` field carries its exact query URL.
- Entries and JPL orbit solutions: 1P/Halley (solution 75, epoch JD 2439875.5), 2P/Encke
  (K273/9, JD 2459855.5), 67P/Churyumov-Gerasimenko (K213/6, JD 2457305.5), C/1995 O1
  (Hale-Bopp) (226, JD 2459837.5), 109P/Swift-Tuttle (32, JD 2450000.5).
- Epochs are Julian day, TDB, as served by the API. The API prints `equinox: J2000` for
  every entry, and its inclination element is described as the "angle with respect to
  x-y ecliptic plane".
- Elements carried per comet: e, a, q, i, om, w, ma, tp, per, n, ad, with the units
  printed by the API (au, deg, d, deg/d; tp in JD, TDB). Values are stored as strings
  preserving the printed digits, including SBDB's leading-dot decimals.
- Only elliptical solutions (eccentricity below 1) qualify, because the app propagates
  elliptical orbits only. All five solutions are elliptical; eccentricities run from
  .6409081306555051 (67P/Churyumov-Gerasimenko) to .9949810027633206 (Hale-Bopp). No
  candidate was excluded.
- Orbit class labels in the notes come from each API response's `orbit_class` field.
- 109P/Swift-Tuttle is the parent body of the Perseid meteor shower:
  <https://science.nasa.gov/solar-system/comets/109p-swift-tuttle/>.
- 67P/Churyumov-Gerasimenko is the target of the ESA Rosetta mission:
  <https://www.esa.int/Science_Exploration/Space_Science/Rosetta>.
- The SBDB Query API counts 4072 comets in the database:
  <https://ssd-api.jpl.nasa.gov/sbdb_query.api?sb-kind=c>. Per the API documentation
  (<https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html>), a query with no output fields
  returns only the count of matching records. The count grows as comets are discovered;
  re-running the query gives the current figure. comets.json carries a curated set of
  five out of those thousands.

## rotation.json

IAU WGCCRE rotational elements (north pole right ascension and declination, prime
meridian W) for the Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune,
the Moon, Phobos, Deimos, Io, Europa, Ganymede, Callisto, Titan and Triton. Every value
is transcribed from the four documents cited below and from no other source.

### Sources

1. Archinal, B.A., et al., "Report of the IAU Working Group on Cartographic Coordinates
   and Rotational Elements: 2015", Celestial Mechanics and Dynamical Astronomy 130:22
   (2018), DOI 10.1007/s10569-017-9805-5. Cited below by the "Page N of 46" numbers
   printed on the publisher reprint.
2. Archinal, B.A., et al., "Correction to: Report of the IAU Working Group on
   Cartographic Coordinates and Rotational Elements: 2015", Celestial Mechanics and
   Dynamical Astronomy 131:61 (2019), DOI 10.1007/s10569-019-9925-1.
3. Archinal, B. and the IAU WGCCRE, "Planetary Coordinates Recommendations from the IAU
   Working Group on Cartographic Coordinates and Rotational Elements", Planetary Science
   Informatics and Data Analytics Conference, St. Louis, 2018 April 26. A slide deck;
   cited by PDF page number.
4. Archinal, B.A., A'Hearn, M.F., Bowell, E., Conrad, A., Consolmagno, G.J., Courtin,
   R., Fukushima, T., Hestroffer, D., Hilton, J.L., Krasinsky, G.A., Neumann, G.,
   Oberst, J., Seidelmann, P.K., Stooke, P., Tholen, D.J., Thomas, P.C., Williams, I.P.,
   "Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements:
   2009", Celestial Mechanics and Dynamical Astronomy 109:101-135 (2011),
   DOI 10.1007/s10569-010-9320-4. Cited by the printed journal page numbers 101 to 135.

### Pages used, per table

- 2015 report, Table 1 (Sun and planets): pp. 8 to 9. Sun, Mercury (with M1 to M5),
  Venus, Mars (inline arguments) and Jupiter (Ja to Je) on p. 8; Saturn, Uranus, Neptune
  (N) and footnotes (a) to (f) on p. 9.
- 2015 report, Table 2 (satellites): pp. 10 to 14. Phobos, Deimos and the Mars satellite
  M1 to M10 arguments, and Io, on p. 10; Europa, Ganymede, Callisto and the J1 to J8
  arguments on p. 11; Titan on p. 12; Triton on p. 13; the N series (N, N1 to N7) and
  the satellite footnotes on p. 14.
- 2015 report, Sect. 3 (lunar coordinate system): pp. 14 and 17.
- Correction (2019): corrected Phobos equations and the reproduced Table 2 excerpt on
  pp. 3 to 4; explanation of the errors on pp. 2 to 3.
- PSIDA 2018 deck: changes summary slides PDF pp. 7 to 8, Mars outlook PDF p. 12,
  proposed Konopliv-based Mars model on the backup slide PDF p. 17, Moon status PDF
  p. 18.
- 2009 report, Table 1 (Sun and planets): Earth on p. 107. The statement that the
  expressions for the Sun and Earth are for comparative purposes only is on p. 106.
- 2009 report, Table 2 (satellites): the Moon, with its arguments E1 to E13, on p. 108;
  the table's footnotes, including the Moon's precision caution (footnote (a)), on
  p. 113.

### Corrections applied from source 2

- Phobos W: the 2015 report (Table 2, p. 10) prints W0 = 34.9964842535 and a final term
  + 1.143 sin(M5). The correction (pp. 3 to 4) states W0 should read 35.18774440 and the
  final term should be negative. `rotation.json` stores the corrected W as the value to
  use and keeps the 2015 printing under `W_as_printed_in_2015_report` for provenance.
- Deimos: the 2015 report prints the declination symbol as bare delta; the correction
  (p. 4) says it should read delta zero. Typographical only; no numeric change.
- The correction also fixes a sign error in Figs. 1 and 2 of the 2015 report (the node Q
  is at 90 degrees plus alpha zero, not minus). This affects no tabulated value.

### Post-2015 updates recorded from source 3

- Mars: the deck's backup slide (PDF p. 17) carries a new Mars orientation model based
  on Konopliv et al. 2016 and NAIF PCK series expansion, with arguments MS1 to MS21. The
  deck lists it under "Outlook for Later Reports and Activities" (PDF p. 12) as a future
  recommendation, so as of that presentation it was proposed, not recommended. Both
  models are stored; `rotation.json` marks the WGCCRE 2015 Table 1 model as the one the
  app should use. Two printing anomalies on the slide (a stray plus sign before
  "sin MS7" and a missing "sin" before MS20 in the alpha zero expression) are recorded
  in `as_printed` fields.
- Moon: the deck (PDF p. 18) confirms the DE421 ME frame remained the current
  recommendation; no new values.
- No other numeric updates relevant to the eighteen bodies appear in the deck.

### Earth and the Moon: WGCCRE 2009 expressions

The 2015 report publishes no closed-form rotational elements for the Earth or the Moon,
so `rotation.json` carries the closed-form expressions of the 2009 report for both
bodies, marked `"use": "WGCCRE2009"`.

- Earth: 2009 report, Table 1, p. 107. Alpha zero = 0.00 - 0.641T, delta zero = 90.00 -
  0.557T, W = 190.147 + 360.9856235d. The 2009 report states that the expressions for
  the Sun and Earth are given to a similar precision as those of the other bodies of the
  Solar System and are for comparative purposes only (p. 106). The 2015 report removed
  the Earth expressions because their accuracy was poor and they failed near J2000.0
  (abstract, p. 2, and Table 1 footnote 2, p. 9), referring users to the IERS.
- Moon: 2009 report, Table 2, p. 108, transcribed in full: seven trigonometric terms in
  alpha zero, eight in delta zero and thirteen in W (daily rate 13.17635815 degrees per
  day), with the arguments E1 to E13 as printed on the same page. The quadratic term in
  W, minus 1.4 x 10^-12 d squared, is stored under `d_terms` with the printed notation
  kept in `coeff_as_printed`. Table 2 footnote (a) (p. 113) cautions that these formulae
  are only precise to approximately 150 m and that an ephemeris should be used for
  higher precision. The 2015 report removed the closed formulae for the same reason
  (Sect. 3, p. 14) and recommends instead the ME system with libration angles from the
  DE421 ephemeris, rotated PA to ME with Rx(-0.30 arcsec) Ry(-78.56 arcsec)
  Rz(-67.92 arcsec), then alpha zero = phi minus 90 degrees, delta zero = 90 degrees
  minus theta, W = psi (p. 17); it publishes no closed-form series.

### Conventions

- Epoch JD 2451545.0 (2000 January 1 12 h TDB); T is Julian centuries of 36,525 days, d
  is days, both from that epoch; alpha zero and delta zero are ICRF equatorial
  coordinates at epoch J2000.0 (Table 1 header, p. 8).
- Every numeric value is stored as a string preserving the printed digits, including
  trailing zeros. Mercury's W0 is printed "329.5988 +/- 0.0037"; the uncertainty is kept
  in `w0_uncertainty_as_printed`.
- The 2015 report prints two unrelated series both named M1 to M5: Mercury's (d based,
  Table 1) and the Mars satellites' (T based, Table 2). They are stored under the
  prefixes `mercury_` and `mars_` to avoid collision.
- Only arguments referenced by the eighteen bodies are transcribed. The report's J1, J2,
  S1 to S6, U1 to U16 and N1 to N6 series serve other satellites only and are left out.
  Titan's entry has no trigonometric terms as printed, so no S series argument is
  needed.
- The Moon's E1 to E13 argument names (2009 report, Table 2, p. 108) collide with no
  argument name from the other transcriptions, so the printed names are kept without a
  prefix.
- `d_terms` entries are {power, coeff} with d in days, used only where a source prints a
  polynomial term in d beyond the linear daily rate; the Moon's W is the only case.

### Use in the app

- `js/rotation.js` evaluates these elements and orients every rendered body that has
  closed-form elements (pole direction and prime meridian angle W), in place of the
  single-angle obliquity representation from bodies.json. Earth and the Moon carry the
  2009 report's closed-form elements, so all eighteen bodies have them.
- The equatorial-to-ecliptic frame conversion uses the IAU J2000 mean obliquity
  23.43928 degrees, recorded in `rotation.json`'s arguments as `_j2000_obliquity_deg`.
  None of the four source documents states an obliquity value (the 2009 report's only
  occurrence of the word "obliquity" is in the title of its Margot 2009 reference), so
  the entry is marked as the standard IAU J2000 constant, not as a transcribed WGCCRE
  value.
- The WGCCRE expressions take TDB. The app passes its civil-UTC clock straight in,
  approximating TDB by TT by UTC; the offset (about 69 s in 2026) is below the visual
  fidelity of the orrery and is noted in `js/rotation.js`.

## descriptions.json

One-sentence descriptions for the Sun, the eight planets, the nine moons, seven comets
and six spacecraft. Every sentence is drawn from the single page cited in its `source`
field; every numeric value and superlative in a sentence is printed on that page. Keys:
lower-cased body names for the Sun, planets and moons; designation slugs for comets;
hyphenated mission names for craft (listed in the file's `_meta`).

- Sun: <https://science.nasa.gov/sun/facts/>
- Mercury: <https://science.nasa.gov/mercury/facts/>
- Venus: <https://science.nasa.gov/venus/facts/>
- Earth: <https://science.nasa.gov/earth/facts/>
- Mars: <https://science.nasa.gov/mars/facts/>
- Jupiter: <https://science.nasa.gov/jupiter/facts/>
- Saturn: <https://science.nasa.gov/saturn/facts/>
- Uranus: <https://science.nasa.gov/uranus/facts/>
- Neptune: <https://science.nasa.gov/neptune/facts/>
- Moon: <https://science.nasa.gov/moon/facts/>
- Phobos: <https://science.nasa.gov/mars/moons/phobos/>
- Deimos: <https://science.nasa.gov/mars/moons/deimos/>
- Io: <https://science.nasa.gov/jupiter/moons/io/>
- Europa: <https://science.nasa.gov/jupiter/moons/europa/>
- Ganymede: <https://science.nasa.gov/jupiter/moons/ganymede/>
- Callisto: <https://science.nasa.gov/jupiter/moons/callisto/>
- Titan: <https://science.nasa.gov/saturn/moons/titan/facts/>
- Triton: <https://science.nasa.gov/neptune/moons/triton/>
- 1P/Halley: <https://science.nasa.gov/solar-system/comets/1p-halley/>
- 2P/Encke: <https://science.nasa.gov/solar-system/comets/2p-encke/>
- 46P/Wirtanen: <https://science.nasa.gov/missions/hubble/hubble-takes-a-close-look-at-the-brightest-comet-of-the-year/>
  (science.nasa.gov publishes no dedicated fact page for 46P; this NASA Hubble news
  page carries the orbital period and the 2018 close-approach distance used.)
- 67P/Churyumov-Gerasimenko: <https://science.nasa.gov/solar-system/comets/67p-churyumov-gerasimenko/>
- 109P/Swift-Tuttle: <https://science.nasa.gov/solar-system/comets/109p-swift-tuttle/>
- C/1995 O1 (Hale-Bopp): <https://science.nasa.gov/solar-system/comets/c-1995-o1-hale-bopp/>
- C/2020 F3 (NEOWISE): <https://science.nasa.gov/missions/hubble/hubble-snaps-close-up-of-celebrity-comet-neowise/>
  (science.nasa.gov publishes no dedicated fact page for C/2020 F3; this NASA Hubble
  news page carries the discovery, perihelion and return-period figures used.)
- Voyager 1: <https://science.nasa.gov/mission/voyager-1/>
- Voyager 2: <https://science.nasa.gov/mission/voyager-2/>
- Cassini: <https://science.nasa.gov/mission/cassini/>
- New Horizons: <https://science.nasa.gov/mission/new-horizons/>
- Perseverance: <https://science.nasa.gov/mission/mars-2020-perseverance/>
- Curiosity: <https://science.nasa.gov/mission/msl-curiosity/>

Notes:

- The Cassini page states the arrival year (2004) and the deliberate plunge into
  Saturn but prints no explicit end date in its body text, so the Cassini sentence
  carries no end date rather than an uncited one.
- The Triton page prints "the largest of Neptune's 13 moons" while the Neptune facts
  page prints 16 known moons; the Triton sentence avoids the moon count and uses only
  facts common to its cited page.
- British spelling in the sentences is editorial; bracketed kilometre figures are the
  conversions printed by each source page.

## probes.json

Sampled heliocentric trajectories for four spacecraft, and surface coordinates for two
Mars rover sites. Trajectory samples and rover coordinates are stored as JSON numbers
rather than strings because of bulk; each parsed number round-trips to the digits served
by its source.

### Spacecraft trajectories

- Source: NASA/JPL Horizons API, <https://ssd.jpl.nasa.gov/api/horizons.api>, queried
  with EPHEM_TYPE=VECTORS, CENTER='500@10', REF_PLANE=ECLIPTIC, OUT_UNITS=AU-D,
  CSV_FORMAT=YES, VEC_TABLE=1 (position only), and COMMAND '-31' (Voyager 1), '-32'
  (Voyager 2), '-82' (Cassini), '-98' (New Horizons).
- Frame and units, as printed in each API response header: "Center body name: Sun (10)",
  "Center-site name: BODY CENTER", "Reference frame : Ecliptic of J2000.0", "Output
  units : AU-D". Each sample is [jd, x, y, z]: Julian day (TDB) and position in au.
- Coverage bounds, as reported by the API:
  - Voyager 1: no ephemeris prior to A.D. 1977-Sep-05 13:59:24.3830 TDB.
  - Voyager 2: no ephemeris prior to A.D. 1977-Aug-20 15:32:32.1830 TDB.
  - Cassini: no ephemeris prior to A.D. 1997-Oct-15 09:27:11.5724 TDB and none after
    A.D. 2017-Sep-15 11:58:00.0000 TDB, the atmospheric entry at Saturn that ended the
    mission.
  - New Horizons: no ephemeris prior to A.D. 2006-Jan-19 19:51:18.3305 TDB.
  - Vectors requests through 2050-01-01 succeed for Voyager 1, Voyager 2 and New
    Horizons, so their coverage extends at least that far. JPL revises spacecraft
    trajectory solutions, so these bounds can move; re-querying the API gives the
    current figures.
- Sampling, chosen to keep each craft under 1500 points, denser in early mission where
  the trajectory bends at planetary flybys; each entry's `sampling` field repeats its
  own scheme:
  - Voyager 1: 4 day step from 1977-09-05 14:00 TDB to 1981-01-01, then 30 day step
    (1145 samples).
  - Voyager 2: 8 day step from 1977-08-20 16:00 TDB to 1990-01-01, then 30 day step
    (1296 samples).
  - Cassini: 5 day step from 1997-10-15 10:00 TDB to 2004-07-01, then 10 day step to
    2017-09-15, plus a final point at JD 2458011.99792 (975 samples).
  - New Horizons: 6 day step from 2006-01-19 20:00 TDB, then 30 day step (1538
    samples).
  - The three still-flying craft extend to JD 2469788.5 (2050-01-01); the later
    segment is the projected trajectory the Horizons API serves for future
    dates, noted per entry in `coverage_note`.
- Mission note sources, one page per craft plus one for the Cassini end date:
  - Voyager 1: <https://science.nasa.gov/mission/voyager-1/>
  - Voyager 2: <https://science.nasa.gov/mission/voyager-2/>
  - Cassini: <https://science.nasa.gov/mission/cassini/> and
    <https://www.jpl.nasa.gov/news/nasas-cassini-spacecraft-ends-its-historic-exploration-of-saturn/>
    (the science.nasa.gov page prints no explicit end date; the JPL release prints
    15 September 2017 and the entry into Saturn's atmosphere).
  - New Horizons: <https://science.nasa.gov/mission/new-horizons/>

### mars_sites

- Rover locations: latest published end-of-drive waypoint in the NASA MMGIS waypoint
  feeds, <https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json>
  (Perseverance) and
  <https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json>
  (Curiosity), `lat` and `lon` of the final waypoint feature; the mission sol of that
  waypoint is recorded per entry. The feeds publish latitude positive north and
  longitude positive east without stating whether the latitude is areocentric or
  areographic, so `latitude_convention` is null with a note. The feeds update as the
  rovers drive; re-fetching gives the current waypoint.
- Landing sites: NASA GISS Mars24 lander list,
  <https://www.giss.nasa.gov/tools/mars24/help/landers.html> (Curiosity: 137.44 E
  4.59 S, landed 6 August 2012 UTC; Perseverance: 77.45 E 18.44 N, landed
  18 February 2021). The page states no latitude convention either.
- Crater centres, with the coordinate system stated by the source as "Planetocentric,
  +East": USGS Gazetteer of Planetary Nomenclature, Jezero
  <https://planetarynames.wr.usgs.gov/Feature/14300> (centre 18.41, 77.69) and Gale
  <https://planetarynames.wr.usgs.gov/Feature/2071> (centre -5.44, 137.70).

## galaxy.json

Milky Way structure for the galactic context view: the log-periodic spiral arm fits,
the Sun's distance from the galactic centre, and the Sun's galactic orbital speed and
period. Values are stored as strings preserving the printed digits.

### Spiral arms

- Source: Reid, M. J., et al., "Trigonometric Parallaxes of High-mass Star-forming
  Regions: Our View of the Milky Way", The Astrophysical Journal 885, 131 (2019),
  DOI 10.3847/1538-4357/ab4a11 (arXiv:1910.03357), Table 2.
- Model, as defined in the paper's Sect. 3: ln(R / R_kink) = -(beta - beta_kink) tan psi,
  where R is the galactocentric radius at galactocentric azimuth beta (radians in the
  formula), beta defined as 0 toward the Sun and increasing in the direction of Galactic
  rotation, with pitch angle psi_< at and below beta_kink and psi_> above it. Galactic
  rotation is clockwise viewed from the north Galactic pole (Fig. 1 caption).
- Carried per arm, exactly as printed in Table 2: the source count (column 2), the
  Galactic-longitude tangency (column 3), the azimuth range of the parallax data
  (column 4), beta_kink (column 5), R_kink (column 6), psi_< and psi_> (columns 7 and
  8) and the intrinsic Gaussian 1-sigma arm width at R_kink (column 9), with the
  printed uncertainties. Per the table's note, a beta_kink printed without uncertainty
  was not solved for and was assigned a value based primarily on a gap in sources;
  those uncertainties are null in the JSON. The tangency column prints "..." for the
  Local, Perseus and Outer arms; those fields are null.
- The seven arms, as named in column 1: 3-kpc(N), Norma, Sct-Cen, Sgr-Car, Local,
  Perseus, Outer.
- The table's note states the models assume R0 = 8.15 kpc; recorded in the JSON. The
  view draws each arm centreline only over its fitted azimuth range, never beyond it.
- The paper prints no dimensions for the Galactic bar (its figures show a schematic
  bar after Wegg, Gerhard & Portail 2015), so the view draws no bar rather than an
  uncited one.

### The Sun's distance from the galactic centre

- Source: GRAVITY Collaboration, "Mass distribution in the Galactic Center based on
  interferometric astrometry of multiple stellar orbits", Astronomy & Astrophysics
  657, L12 (2022), DOI 10.1051/0004-6361/202142465 (arXiv:2112.07478): "The best fit
  further yields R0 = (8277 +/- 9) pc" (statistical error).
- The arm fits above assume R0 = 8.15 kpc, so the Sun marker and the fitted Local arm
  carry a small mutual offset; the view's fine print states that distances are
  illustrative.

### The Sun's galactic orbit

- Orbital speed and period: NRAO, "Orbital Period of the Sun in the Milky Way Galaxy?",
  <https://public.nrao.edu/ask/orbital-period-of-the-sun-in-the-milky-way-galaxy/>:
  about 230 km/s, about 226 million years.
- Period, second source: NASA StarChild,
  <https://starchild.gsfc.nasa.gov/docs/StarChild/questions/question18.html>: about
  230 million years.
- The view draws no orbit line around the galactic centre: the Sun's galactic orbit
  does not close, and a closed ellipse would invent one. The arrow at the Sun marks
  the direction of rotation only.

## Verification

- Every numeric string in `data/` matches the table cited for it.
- planets.json: all values match Table 1 of the JPL approximate-positions page.
- moons.json: all values match the JPL satellite mean orbital elements table.
- comets.json: every element string, epoch and designation matches the SBDB API response
  for the query URL cited in the entry's `source` field.
- rotation.json: every numeric string (all bodies, both Mars models, both Phobos W
  variants, all 65 arguments, and the 66 Earth and Moon values including the E1 to E13
  argument constants and rates) matches the cited pages.
- probes.json: the file parses as JSON; re-fetching the Cassini entry from the Horizons
  API (both sampling spans and the final point) reproduces the stored 975 samples
  exactly.
- galaxy.json: every arm value string matches Table 2 of Reid et al. 2019 as printed
  in the arXiv:1910.03357 accepted manuscript, digit for digit for all seven arms;
  the R0 string matches the GRAVITY 2022 letter; the speed and period strings match
  the NRAO and StarChild pages.
