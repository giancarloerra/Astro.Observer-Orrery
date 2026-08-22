// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Giancarlo Erra
// ui.js
//
// Wires the static markup in index.html: bottom control bar (play/pause,
// speed, date input clamped to the JPL validity range with an inline notice
// when the clamp engages, Now button, scale mode toggle, axes indicator
// toggle, Comets and Probes toggles, About - Help panel toggle), the body
// list used to fly the camera to a body (with a Milky Way entry that swaps
// to the galactic context view, a System entry that resets the
// overview, comets under a divider shown only while the Comets toggle is on,
// and spacecraft under a Probes divider shown only while the Probes toggle
// is on, dimmed while the simulated time is outside their recorded span),
// the info card for the selected body (text and live values supplied by
// main.js), the usage bullets rendered into both the About - Help panel and
// the first-arrival card, and the optional photo strip fed from photos.json.
// Pure DOM; no three.js here.

const DATE_MIN = '1800-01-01';
const DATE_MAX = '2050-12-31';

// The usage bullets. This is the only copy: renderUsageList puts the same
// items in the About - Help panel and in the first-arrival card, so the two
// cannot drift. Each line states a control the code actually implements:
// OrbitControls with its default bindings (left drag orbit, wheel or middle
// drag dolly, right drag pan, one finger orbit, two fingers dolly and pan),
// the scene and list selection that flies to a body and follows it, the
// System entry and the Escape key that reset the overview, the Milky Way
// entry that swaps to the galactic context view, and the time controls of
// the bottom bar.
const USAGE_STEPS = [
  'Drag to orbit the view; right-drag or two-finger drag to pan.',
  'Scroll, pinch or middle-drag to zoom.',
  'Click a planet or moon, or pick it from the {Bodies} list, to open its data and follow it.',
  'Click a followed body again to stop following; the camera stays where it is.',
  '{Solar System} in the {Bodies} list returns to the whole planetary system. {Escape} does the same.',
  '{Milky Way}, above {Solar System}, shows where the solar system sits in the galaxy; {Solar System} or {Escape} returns to the planets.',
  '{Pause}, {Speed}, {Date} and {Now} move the model through time.',
  '{Easy} compresses distances and enlarges bodies so the system stays navigable. {Accurate} is true scale, where the emptiness is the point.',
];

// A name in braces is a control on screen, given the control's own weight so a
// reader can match the word to the button. Built as nodes rather than markup,
// so the strings above stay plain text.
function renderUsageList(list) {
  for (const step of USAGE_STEPS) {
    const item = document.createElement('li');
    // The capturing split alternates plain text and control names, so the odd
    // positions are the names whatever the words happen to be.
    step.split(/\{([^}]+)\}/).forEach((part, i) => {
      if (part === '') return;
      if (i % 2 === 1) {
        const name = document.createElement('b');
        name.className = 'ui-name';
        name.textContent = part;
        item.appendChild(name);
      } else {
        item.appendChild(document.createTextNode(part));
      }
    });
    list.appendChild(item);
  }
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function utcDateValue(date) {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utcDisplay(date) {
  return `${utcDateValue(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function initUI({
  bodies, // ordered array of {name, type, parent}
  comets = [], // ordered array of {name}: photographed skymap comets first, then comets.json
  probes = [], // ordered array of {name} from probes.json
  showUsageCard = false, // first arrival with a storable dismissal (main.js)
  onUsageDismiss,
  onPlayToggle,
  onAxesToggle,
  onCometsToggle,
  onProbesToggle,
  onSpeedChange,
  onDateInput,
  onNow,
  onModeChange,
  onSelectBody,
  onLinkRequest, // returns the query string that reopens the current view
  onResetView,
  onGalaxyView,
}) {
  const playButton = document.getElementById('play-toggle');
  const speedSelect = document.getElementById('speed');
  const dateInput = document.getElementById('date-input');
  const nowButton = document.getElementById('now-button');
  const dateDisplay = document.getElementById('date-display');
  const modeEasy = document.getElementById('mode-easy');
  const modeAccurate = document.getElementById('mode-accurate');
  const axesToggle = document.getElementById('axes-toggle');
  const cometsToggle = document.getElementById('comets-toggle');
  const probesToggle = document.getElementById('probes-toggle');
  const infoCard = document.getElementById('info-card');
  const cardName = document.getElementById('card-name');
  const cardLive = document.getElementById('card-live');
  const cardDescText = document.getElementById('card-desc-text');
  const cardSource = document.getElementById('card-source');
  const cardNote = document.getElementById('card-note');
  const scaleBadge = document.getElementById('scale-badge');
  const infoToggle = document.getElementById('info-toggle');
  const infoPanel = document.getElementById('info-panel');
  const bodiesToggle = document.getElementById('bodies-toggle');
  const bodiesPanel = document.getElementById('bodies-panel');
  const bodiesList = document.getElementById('bodies-list');
  const usageCard = document.getElementById('usage-card');
  const clampNote = document.getElementById('clamp-note');
  const linkNote = document.getElementById('link-note');
  const linkButton = document.getElementById('link-button');
  const photoStrip = document.getElementById('photo-strip');
  const galaxyNote = document.getElementById('galaxy-note');
  const controlsBar = document.getElementById('controls');
  const topBar = document.getElementById('top-bar');
  const fatal = document.getElementById('fatal');

  // ---- usage bullets, in the panel and in the first-arrival card ----
  renderUsageList(document.getElementById('usage-list'));
  renderUsageList(document.getElementById('usage-card-list'));

  // The card is a hint over the scene, not a dialog: it takes no focus, adds
  // no focus trap and leaves everything behind it operable. showUsageCard is
  // false once a dismissal is stored, and also when localStorage cannot hold
  // one, since a card that cannot record its dismissal would return on every
  // load.
  let usageCardOpen = false;

  function dismissUsageCard() {
    if (!usageCardOpen) return false;
    usageCardOpen = false;
    usageCard.hidden = true;
    onUsageDismiss();
    return true;
  }

  document.getElementById('usage-close').addEventListener('click', dismissUsageCard);

  if (showUsageCard) {
    usageCardOpen = true;
    usageCard.hidden = false;
  }

  // ---- body list (Milky Way view entry, System reset entry, then Sun,
  // planets, moons indented) ----
  const bodyButtons = new Map();

  // Like System, an action rather than a followable body: it swaps to the
  // galactic context view (main.js owns the swap and its consequences).
  const galaxyButton = document.createElement('button');
  galaxyButton.type = 'button';
  galaxyButton.textContent = 'Milky Way';
  galaxyButton.classList.add('system');
  galaxyButton.setAttribute('aria-pressed', 'false');
  galaxyButton.addEventListener('click', () => onGalaxyView());
  bodiesList.appendChild(galaxyButton);
  bodyButtons.set('Milky Way', galaxyButton);

  // A pointer click leaves focus on the button it activated, so the next key
  // press (Escape, or any scene shortcut) raises a focus ring on an entry the
  // visitor has already finished with. Keyboard activation reports detail 0
  // and keeps its focus, which is what a keyboard visitor needs to carry on.
  bodiesList.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button && event.detail > 0) button.blur();
  });

  const systemButton = document.createElement('button');
  systemButton.type = 'button';
  systemButton.textContent = 'Solar System';
  systemButton.classList.add('system');
  systemButton.setAttribute('aria-pressed', 'false');
  systemButton.addEventListener('click', () => onResetView());
  bodiesList.appendChild(systemButton);
  bodyButtons.set('System', systemButton);

  let moonsDividerAdded = false;
  for (const body of bodies) {
    if (body.type === 'moon' && !moonsDividerAdded) {
      const divider = document.createElement('div');
      divider.className = 'list-divider';
      divider.textContent = 'Moons';
      bodiesList.appendChild(divider);
      moonsDividerAdded = true;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = body.name;
    button.setAttribute('aria-pressed', 'false');
    if (body.type === 'moon') button.classList.add('moon');
    button.addEventListener('click', () => onSelectBody(body.name));
    bodiesList.appendChild(button);
    bodyButtons.set(body.name, button);
  }

  // Comets, indented under a divider like moons under their planet: the
  // photographed skymap.json comets first, then the well-known ones from
  // comets.json (the caller passes them in that order). Positions propagate
  // osculating elements fixed at their epoch, a caveat the About panel
  // states. The section is built hidden: the Comets toggle defaults off and
  // main.js applies the boot state through setCometsListVisible before the
  // first frame.
  const cometListNodes = [];
  if (comets.length) {
    const divider = document.createElement('div');
    divider.className = 'list-divider';
    divider.textContent = 'Comets';
    divider.hidden = true;
    bodiesList.appendChild(divider);
    cometListNodes.push(divider);
    for (const comet of comets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = comet.name;
      button.setAttribute('aria-pressed', 'false');
      button.classList.add('comet');
      button.hidden = true;
      button.addEventListener('click', () => onSelectBody(comet.name));
      bodiesList.appendChild(button);
      bodyButtons.set(comet.name, button);
      cometListNodes.push(button);
    }
  }

  // Spacecraft from probes.json under a Probes divider. Built hidden like
  // the comets; the Probes toggle defaults on and main.js applies the boot
  // state through setProbesListVisible before the first frame. A craft whose
  // recorded span excludes the simulated time stays listed but dimmed and
  // inert (setProbeAvailable), matching its absence from the scene.
  const probeListNodes = [];
  if (probes.length) {
    const divider = document.createElement('div');
    divider.className = 'list-divider';
    divider.textContent = 'Probes';
    divider.hidden = true;
    bodiesList.appendChild(divider);
    probeListNodes.push(divider);
    for (const probe of probes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = probe.name;
      button.setAttribute('aria-pressed', 'false');
      button.classList.add('probe');
      button.hidden = true;
      button.addEventListener('click', () => onSelectBody(probe.name));
      bodiesList.appendChild(button);
      bodyButtons.set(probe.name, button);
      probeListNodes.push(button);
    }
  }

  // ---- control bar ----
  playButton.addEventListener('click', onPlayToggle);

  speedSelect.addEventListener('change', () => {
    onSpeedChange(parseFloat(speedSelect.value));
  });

  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    let value = dateInput.value;
    if (value < DATE_MIN) value = DATE_MIN;
    if (value > DATE_MAX) value = DATE_MAX;
    if (value !== dateInput.value) {
      // The attempted date was outside the JPL validity range: clamp it and
      // show the validity sentence next to the input until the date is back
      // strictly inside the range (see setDate below).
      dateInput.value = value;
      clampNote.hidden = false;
    }
    onDateInput(value);
  });

  nowButton.addEventListener('click', onNow);

  modeEasy.addEventListener('click', () => onModeChange('easy'));
  modeAccurate.addEventListener('click', () => onModeChange('accurate'));

  axesToggle.addEventListener('click', onAxesToggle);
  cometsToggle.addEventListener('click', onCometsToggle);
  probesToggle.addEventListener('click', onProbesToggle);

  // The Link control writes a URL that reopens what is on screen, so a view
  // worth showing someone can be sent rather than described. It is the same
  // vocabulary a page elsewhere uses, so nothing new has to be maintained.
  //
  // The clipboard is asked, never assumed: it is refused outright in an
  // insecure context and can be refused by permission anywhere. When it says
  // no the link is put on screen and selected, which is a worse experience and
  // an honest one.
  linkButton.addEventListener('click', async () => {
    const url = location.origin + location.pathname + onLinkRequest();
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      // refused by permission or policy: fall through to showing it
    }
    if (copied) {
      linkNote.textContent = 'link copied';
      linkNote.hidden = false;
      setTimeout(() => { linkNote.hidden = true; }, 2500);
    } else {
      linkNote.textContent = url;
      linkNote.hidden = false;
      const r = document.createRange();
      r.selectNodeContents(linkNote);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });

  infoToggle.addEventListener('click', () => {
    const open = infoPanel.hidden;
    infoPanel.hidden = !open;
    infoToggle.setAttribute('aria-expanded', String(open));
  });

  // The panel's close button dismisses it, the same state the ABOUT - HELP
  // reaches when clicked while the panel is open.
  document.getElementById('info-close').addEventListener('click', () => {
    infoPanel.hidden = true;
    infoToggle.setAttribute('aria-expanded', 'false');
  });

  bodiesToggle.addEventListener('click', () => {
    const open = !bodiesPanel.classList.contains('open');
    bodiesPanel.classList.toggle('open', open);
    bodiesToggle.setAttribute('aria-expanded', String(open));
  });

  let lastDateValue = null;

  // ---- panel positioning against the two bars ----
  // The photo strip sits directly above the control bar and the body list
  // starts below the top bar; both bars change height with wrapping, so the
  // offsets come from measurement, not constants.
  function positionPhotoStrip() {
    photoStrip.style.bottom = `${controlsBar.offsetHeight + 8}px`;
    // The galactic view's fine-print note sits where the photo strip does;
    // the two are never up together (the strip needs a followed body, the
    // note needs the galactic view).
    galaxyNote.style.bottom = `${controlsBar.offsetHeight + 8}px`;
    // The body list stops above the control bar so the bar's full width,
    // including the GitHub link at its right edge, stays visible.
    bodiesPanel.style.bottom = `${controlsBar.offsetHeight}px`;
  }
  new ResizeObserver(positionPhotoStrip).observe(controlsBar);
  positionPhotoStrip();

  // The info card hangs below the top bar on the left, clear of the photo
  // strip and the control bar at the bottom.
  function positionTopPanels() {
    bodiesPanel.style.top = `${topBar.offsetHeight}px`;
    infoCard.style.top = `${topBar.offsetHeight + 12}px`;
  }
  new ResizeObserver(positionTopPanels).observe(topBar);
  positionTopPanels();

  // Live-value rows of the info card; updateInfoLive rewrites only rows
  // whose text actually changed.
  let liveRows = [];

  return {
    // Hides the first-arrival card and records the dismissal; returns false
    // when it was not up, so main.js can let the Escape key fall through to
    // the view reset.
    dismissUsageCard,

    setPlaying(playing) {
      playButton.setAttribute('aria-pressed', String(playing));
      playButton.textContent = playing ? 'Pause' : 'Play';
    },

    setAxes(on) {
      axesToggle.setAttribute('aria-pressed', String(on));
    },

    setComets(on) {
      cometsToggle.setAttribute('aria-pressed', String(on));
    },

    setProbes(on) {
      probesToggle.setAttribute('aria-pressed', String(on));
    },

    // Reflect a restored speed in the select; value is always one of the
    // option values (main.js validates stored state against them).
    setSpeed(value) {
      speedSelect.value = String(value);
    },

    // Called every frame with the simulated UTC date.
    setDate(date) {
      dateDisplay.textContent = utcDisplay(date);
      const value = utcDateValue(date);
      if (!clampNote.hidden && value > DATE_MIN && value < DATE_MAX) {
        // The date moved back strictly inside the validity range; the clamp
        // notice has done its job.
        clampNote.hidden = true;
      }
      if (value !== lastDateValue && document.activeElement !== dateInput) {
        dateInput.value = value;
        lastDateValue = value;
      }
    },

    // Shown when the simulated clock reaches the edge of the validity range.
    showClampNote() {
      clampNote.hidden = false;
    },

    // Shown when a URL parameter could not be honoured. The model still runs;
    // this says which part of the link was refused, so a visitor who followed
    // a link naming a body that is not here is told, rather than shown the
    // default view as though that is what the link meant.
    showLinkNote(text) {
      linkNote.textContent = text;
      linkNote.hidden = false;
    },

    setMode(mode) {
      modeEasy.setAttribute('aria-pressed', String(mode === 'easy'));
      modeAccurate.setAttribute('aria-pressed', String(mode === 'accurate'));
      scaleBadge.hidden = mode !== 'accurate';
    },

    setActiveBody(name) {
      for (const [bodyName, button] of bodyButtons) {
        button.setAttribute('aria-pressed', String(bodyName === name));
      }
    },

    // Show or hide the Comets section of the body list (divider and
    // entries) as one unit; main.js drives it from the Comets toggle
    // together with the scene-side comet visibility.
    setCometsListVisible(on) {
      for (const el of cometListNodes) el.hidden = !on;
    },

    // Show or hide the Probes section of the body list (divider and
    // entries) as one unit; main.js drives it from the Probes toggle
    // together with the scene-side visibility.
    setProbesListVisible(on) {
      for (const el of probeListNodes) el.hidden = !on;
    },

    // Dim a listed craft while the simulated time is outside its recorded
    // span (main.js drives this each frame); a dimmed entry is disabled, so
    // a craft absent from the scene cannot be flown to.
    setProbeAvailable(name, available) {
      const button = bodyButtons.get(name);
      if (button.disabled === !available) return;
      button.disabled = !available;
    },

    // Fill and show the info card for a selection. text and source come
    // from descriptions.json; note is the probes.json mission note (null for
    // bodies without one); liveLabels name the value rows that
    // updateInfoLive fills each frame.
    showInfoCard({ name, text, source, note, liveLabels }) {
      cardName.textContent = name;
      cardDescText.textContent = text;
      cardSource.href = source;
      cardNote.textContent = note || '';
      cardNote.hidden = !note;
      cardLive.replaceChildren();
      liveRows = [];
      for (const label of liveLabels) {
        const row = document.createElement('div');
        row.className = 'card-row';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        row.append(dt, dd);
        cardLive.appendChild(row);
        liveRows.push({ dd, last: null });
      }
      cardLive.hidden = liveLabels.length === 0;
      infoCard.hidden = false;
    },

    // Called every frame while the card is open, with one string per
    // liveLabels entry, in order.
    updateInfoLive(values) {
      for (let i = 0; i < liveRows.length; i += 1) {
        if (liveRows[i].last !== values[i]) {
          liveRows[i].dd.textContent = values[i];
          liveRows[i].last = values[i];
        }
      }
    },

    hideInfoCard() {
      infoCard.hidden = true;
    },

    // The galactic view's fine-print note (static markup in index.html),
    // shown only while the view is active; main.js drives it with the swap.
    setGalaxyNoteVisible(on) {
      galaxyNote.hidden = !on;
    },

    // Rebuild the photo strip for the followed body. entry is the body's
    // record from photos.json, or null to hide the strip (body not listed,
    // photos.json absent, or nothing followed).
    updatePhotoStrip(entry) {
      photoStrip.replaceChildren();
      if (!entry) {
        photoStrip.hidden = true;
        return;
      }
      const label = document.createElement('span');
      label.className = 'strip-label';
      label.textContent = entry.label;
      photoStrip.appendChild(label);
      for (const photo of entry.images.slice(0, 5)) {
        const link = document.createElement('a');
        link.href = photo.link;
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = photo.title;
        img.src = photo.thumb;
        link.appendChild(img);
        photoStrip.appendChild(link);
      }
      const all = document.createElement('a');
      all.href = entry.gallery_link;
      all.textContent = `all ${entry.images.length}`;
      photoStrip.appendChild(all);
      photoStrip.hidden = false;
      positionPhotoStrip();
    },

    showError(message) {
      fatal.textContent = message;
      fatal.hidden = false;
    },
  };
}
