/** @typedef {import('../engine/types.js').Level} Level */
/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {import('../engine/types.js').Deployment} Deployment */
/** @typedef {import('../engine/types.js').Pos} Pos */
/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('./menu-layout.js').CardForm} CardForm */

import { parseGrid, createBattle } from '../engine/battle.js';
import { BAND_TYPES, tierFor } from '../engine/units.js';
import { eq } from '../engine/grid.js';
import { renderBoard, tileFromEvent } from './board.js';
import { goalText, habitatCount } from './text.js';
import { setIconText } from './icons.js';
import { unitCard } from './unit-info.js';
import { renderUnitCard } from './unit-card.js';
import { panelHalf, cardPlacement, placedCount, startLabel, MAX_BOARD } from './menu-layout.js';
import { portraitSpec, headCrop, headCropStyle } from './portraits.js';
import {
  deployKey, focusKind, keyHint, keyListBox, takeKeys, cameByKey, stepToward, DEPLOY_KEY_LIST,
} from './keys.js';

// The deploy screen, brought up to the battle screen's standard: the
// same head (the level's name and Back, the goal on its parchment card,
// the counts as chips), the board, then the player's bands as a tray of
// tokens and Start as the main button. The picked band's field-guide card
// sits beside the board on a wide screen, under it on a phone with room,
// and only over the half of the board away from the deploy tiles when
// there is none (js/ui/menu-layout.js, cardPlacement). The deploy tiles
// are marked over the board in the game's own gold (css/menus.css).

/** The hint before anything is placed; it goes once a band is down. */
export const DEPLOY_HINT = 'Pick a band, then a glowing tile.';

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function html(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A roster token's face: a small round crop of the band's head from its
 * portrait, or its emoji where there is no portrait or it fails to load.
 * The ring and the fill are the same round element, so they meet.
 * @param {string} type
 * @returns {HTMLElement}
 */
export function rosterHead(type) {
  const spec = portraitSpec(type);
  const glyph = BAND_TYPES[type].glyph;
  const head = document.createElement('span');
  head.setAttribute('aria-hidden', 'true');
  if (spec.kind !== 'image') {
    head.className = 'roster-btn__glyph';
    head.textContent = glyph;
    return head;
  }
  head.className = 'roster-btn__head';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  const place = headCropStyle(headCrop(type));
  img.style.width = place.width;
  img.style.left = place.left;
  img.style.top = place.top;
  img.addEventListener('error', () => {
    head.className = 'roster-btn__glyph';
    head.replaceChildren();
    head.textContent = glyph;
  });
  img.src = spec.href;
  head.appendChild(img);
  return head;
}

/**
 * Whether the screen is wide enough for the side panel (css/menus.css
 * switches at the same width).
 * @returns {boolean}
 */
function isWide() {
  try {
    const match = globalThis.matchMedia;
    return typeof match === 'function' && match('(min-width: 720px)').matches;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{level: Level, progress: Progress, onStart: (deployments: Deployment[]) => void, onBack: () => void}} opts
 * @returns {void}
 */
export function renderDeploy(root, opts) {
  const { level, progress } = opts;
  root.replaceChildren();

  const { deployTiles, width, height } = parseGrid(level.grid);
  const rosterTypes = Object.keys(BAND_TYPES).filter((t) => progress.bands[t] !== undefined);
  /** @param {string} type */
  const lengthOf = (type) => progress.bands[type].maxLen;
  /** @param {string} type */
  const nameOf = (type) => tierFor(type, lengthOf(type)).name;

  /** @type {Deployment[]} */
  let placed = [];
  // The first band starts picked, so its card is up from the first look.
  /** @type {string|null} */
  let selectedType = rosterTypes[0] ?? null;
  // Only the card over the board can be put away (its ×); beside or under
  // the board it covers nothing.
  let panelOpen = true;
  /** A band has been placed: the hint has gone for good. */
  let everPlaced = false;
  /** The tile a band was just put on, for one small landing. @type {Pos|null} */
  let landed = null;
  // The free half of the board, the card's last resort.
  const half = panelHalf(deployTiles, width, height);
  /** Where the card is and in which form, until measured. */
  let placement = cardPlacement({ wide: false, fullH: 0, briefH: 0, half });

  const screen = html('div', 'deploy-screen');
  root.appendChild(screen);

  // The head, as on the battle screen: the level's name and Back.
  const head = html('header', 'battle-head');
  screen.appendChild(head);
  head.appendChild(html('h1', 'battle-head__title', level.name));
  const tools = html('div', 'battle-head__tools');
  head.appendChild(tools);
  const backBtn = html('button', 'quit-btn ui-btn ui-btn--secondary ui-btn--small');
  backBtn.type = 'button';
  backBtn.textContent = 'Back';
  backBtn.appendChild(keyHint('Esc'));
  backBtn.addEventListener('click', () => leave(opts.onBack));
  tools.appendChild(backBtn);

  // The goal on its parchment card, then the counts that apply before a
  // battle as chips, in the battle's own words, so nothing changes when
  // it starts: the dens to keep, the forest, and the turn limit if any.
  const goal = html('div', 'battle-goal');
  screen.appendChild(goal);
  const goalCard = html('p', 'battle-goal__card ui-panel--parchment');
  goal.appendChild(goalCard);
  goalCard.appendChild(html('span', 'battle-goal__label', 'Goal'));
  goalCard.appendChild(html('span', 'battle-goal__text', goalText(level)));
  goal.appendChild(countChips(previewState()));

  // The board's cell: the board, the tile marks and the keyboard's
  // cursor over it, and the space under it where the card goes on a
  // phone with room (on a wide screen, the side panel's card row).
  const boardArea = html('div', 'board-area');
  screen.appendChild(boardArea);
  const wrap = html('div', 'board-wrap');
  boardArea.appendChild(wrap);
  const svg = /** @type {SVGSVGElement} */ (
    document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  );
  svg.setAttribute('viewBox', '0 0 320 320');
  wrap.appendChild(svg);
  const marks = html('div', 'deploy-marks');
  marks.setAttribute('aria-hidden', 'true');
  wrap.appendChild(marks);
  // The keyboard's tile cursor over the deploy tiles (as on the battle
  // screen), hidden until a key shows it.
  const cursorBox = html('div', 'board-cursor');
  cursorBox.setAttribute('aria-hidden', 'true');
  cursorBox.hidden = true;
  wrap.appendChild(cursorBox);
  const slot = html('div', 'deploy-slot');
  boardArea.appendChild(slot);
  const slotNote = html('p', 'deploy-slot__note');
  slot.appendChild(slotNote);

  // The picked band's card. It moves between the slot and the board.
  const panel = html('aside', 'deploy-panel');
  panel.setAttribute('aria-live', 'polite');

  // The tray: the hint (then just "Your bands"), how many are down, and
  // one token per band owned.
  const tray = html('section', 'deploy-tray ui-panel--wood');
  tray.setAttribute('aria-label', 'Your bands');
  screen.appendChild(tray);
  const trayHead = html('div', 'deploy-tray__head');
  tray.appendChild(trayHead);
  const hint = html('p', 'deploy-tray__hint');
  trayHead.appendChild(hint);
  const countLine = html('p', 'deploy-tray__count');
  countLine.setAttribute('aria-live', 'polite');
  trayHead.appendChild(countLine);
  const roster = html('div', 'roster');
  tray.appendChild(roster);
  /** @type {Map<string, HTMLButtonElement>} */
  const tokens = new Map();
  for (const [index, type] of rosterTypes.entries()) {
    const token = html('button', 'roster-btn deploy-token');
    token.type = 'button';
    const disc = html('span', 'deploy-token__disc');
    disc.setAttribute('aria-hidden', 'true');
    disc.appendChild(rosterHead(type));
    token.appendChild(disc);
    token.appendChild(html('span', 'deploy-token__name', nameOf(type)));
    const len = html('span', 'deploy-token__len', String(lengthOf(type)));
    len.setAttribute('aria-hidden', 'true');
    token.appendChild(len);
    const tick = html('span', 'deploy-token__tick');
    tick.setAttribute('aria-hidden', 'true');
    token.appendChild(tick);
    if (index < 9) token.appendChild(keyHint(String(index + 1)));
    token.addEventListener('click', () => pick(type));
    roster.appendChild(token);
    tokens.set(type, token);
  }

  // Start, the main button, saying what is missing while it cannot.
  const actions = html('div', 'screen-actions deploy-bar');
  screen.appendChild(actions);
  const startBtn = html('button', '');
  startBtn.type = 'button';
  startBtn.className = 'ui-btn ui-btn--primary';
  startBtn.classList.add('ui-btn--large', 'deploy-start');
  startBtn.addEventListener('click', () => start());
  actions.appendChild(startBtn);

  /** The screen has been left, to the battle or back to the map. */
  let left = false;
  /** The keyboard's tile cursor, or null while it is hidden. @type {Pos|null} */
  let cursor = null;
  /** The list of keys ("?"), when open. @type {HTMLElement|null} */
  let keysBox = null;
  /** The full card over the screen, when open, and what had the focus. @type {{box: HTMLElement, back: Element|null}|null} */
  let sheet = null;

  /**
   * The counts as chips: the den and forest icons with "3/3", as the
   * battle's chips read on its first turn, and the turn limit if any.
   * @param {BattleState} state
   * @returns {HTMLElement}
   */
  function countChips(state) {
    const chips = html('div', 'battle-goal__chips');
    const dens = habitatCount(state);
    if (dens !== '') {
      const chip = html('span', 'battle-chip battle-chip--den');
      const label = html('span', 'battle-goal__habitats');
      setIconText(label, 'den', dens);
      label.setAttribute('aria-label', `Dens to keep standing: ${state.habitatStart}`);
      chip.appendChild(label);
      chips.appendChild(chip);
    }
    if (state.forestStart > 0) {
      const chip = html('span', 'battle-chip battle-chip--forest');
      const label = html('span', 'forest-label');
      setIconText(label, 'forest', `${state.forestStart}/${state.forestStart}`);
      label.setAttribute('aria-label', `Forest: ${state.forestStart} tiles`);
      chip.appendChild(label);
      chips.appendChild(chip);
    }
    if (level.turnLimit !== null) {
      const chip = html('span', 'battle-chip battle-chip--turn');
      const hourglass = html('span', 'icon icon--turn');
      hourglass.setAttribute('aria-hidden', 'true');
      chip.appendChild(hourglass);
      chip.appendChild(html('span', 'turn-label', `${level.turnLimit} turns`));
      chips.appendChild(chip);
    }
    return chips;
  }

  /**
   * Leaves the screen, once.
   * @param {() => void} then
   */
  function leave(then) {
    if (left) return;
    left = true;
    stopKeys();
    sizeObserver?.disconnect();
    closeSheet();
    then();
  }

  /** Start, by tap or Enter, when there is a band to start with. */
  function start() {
    if (!startLabel(placed.length, level.maxBands).ready) return;
    const deployments = placed.map((d) => ({ type: d.type, at: /** @type {Pos} */ ([d.at[0], d.at[1]]) }));
    leave(() => opts.onStart(deployments));
  }

  /**
   * @returns {BattleState}
   */
  function previewState() {
    if (placed.length > 0) return createBattle(level, placed, progress);
    const firstType = rosterTypes[0];
    const tile = deployTiles[0];
    const state = createBattle(level, [{ type: firstType, at: tile }], progress);
    state.bands = state.bands.filter((b) => b.id !== firstType);
    return state;
  }

  /**
   * The next band to place after one is placed: the first one not yet on
   * the board, while there is room for it.
   * @returns {string|null}
   */
  function nextUnplaced() {
    if (placed.length >= level.maxBands) return null;
    return rosterTypes.find((t) => !placed.some((d) => d.type === t)) ?? null;
  }

  /** @param {string} type */
  const isPlaced = (type) => placed.some((d) => d.type === type);
  /** The picked band can go on a free tile: it is on the board already (it moves), or there is room. */
  const canPlacePicked = () => selectedType !== null && (isPlaced(selectedType) || placed.length < level.maxBands);

  /**
   * A band's card in a form, as the panel shows it: the brief one has a
   * button to the full card, and over the board a × to put it away.
   * @param {string} type
   * @param {CardForm} form
   * @param {{hide: boolean}} extras
   * @returns {HTMLElement}
   */
  function buildCard(type, form, extras) {
    const card = renderUnitCard(unitCard(type, lengthOf(type)), form === 'brief' ? { compact: true } : { next: false });
    if (form === 'brief') {
      const more = html('button', 'deploy-panel__more', 'Full card');
      more.type = 'button';
      more.setAttribute('aria-label', `The full card for ${nameOf(type)}`);
      more.addEventListener('click', (evt) => {
        evt.stopPropagation();
        openSheet(type);
      });
      card.appendChild(more);
      // Anywhere on the brief card opens the full one, for a thumb.
      card.addEventListener('click', () => openSheet(type));
    }
    if (extras.hide) {
      const hide = html('button', 'deploy-panel__hide ui-btn-round', '×');
      hide.type = 'button';
      hide.setAttribute('aria-label', 'Hide the band card');
      hide.addEventListener('click', (evt) => {
        evt.stopPropagation();
        closeCard();
      });
      // In the card's corner, so it goes wherever the card does.
      card.appendChild(hide);
    }
    return card;
  }

  function renderPanel() {
    const where = placement.place;
    const over = where === 'over';
    panel.className = `deploy-panel deploy-panel--${over ? half ?? 'below' : where} deploy-panel--${placement.form}`;
    const home = over ? wrap : slot;
    if (panel.parentElement !== home) home.appendChild(panel);
    panel.replaceChildren();
    const show = selectedType !== null && (!over || panelOpen);
    panel.hidden = !show;
    panel.classList.toggle('is-open', show);
    // Beside or under the board, a quiet word when no band is picked.
    slotNote.hidden = show || over;
    slotNote.textContent = placed.length >= placedCount(0, level.maxBands, rosterTypes.length).room
      ? 'All set. Pick a band to move it, or start.'
      : 'Tap a band to see its card.';
    if (!show || selectedType === null) return;
    panel.appendChild(buildCard(selectedType, placement.form, { hide: over }));
  }

  function renderMarks() {
    marks.replaceChildren();
    const ready = canPlacePicked();
    for (const tile of deployTiles) {
      const holder = placed.find((d) => eq(d.at, tile));
      const mark = html('div', 'deploy-mark');
      if (holder !== undefined) {
        mark.classList.add('is-held');
        if (holder.type === selectedType) mark.classList.add('is-picked');
      } else {
        mark.classList.add(ready ? 'is-ready' : 'is-idle');
      }
      // A band just put down: one ring spreads from its tile.
      if (landed !== null && eq(landed, tile)) mark.appendChild(html('span', 'deploy-mark__ring'));
      mark.dataset.tile = `${tile[0]},${tile[1]}`;
      mark.style.left = `${(tile[0] * 100) / width}%`;
      mark.style.top = `${(tile[1] * 100) / height}%`;
      mark.style.width = `${100 / width}%`;
      mark.style.height = `${100 / height}%`;
      marks.appendChild(mark);
    }
  }

  function renderTray() {
    const count = placedCount(placed.length, level.maxBands, rosterTypes.length);
    for (const [type, token] of tokens) {
      const picked = type === selectedType;
      const down = isPlaced(type);
      token.classList.toggle('is-selected', picked);
      token.classList.toggle('is-placed', down);
      // No room left for it: it reads as resting, but still shows its card.
      token.classList.toggle('is-out', !down && count.left === 0);
      token.setAttribute('aria-pressed', picked ? 'true' : 'false');
      token.setAttribute('aria-label', `${nameOf(type)}, length ${lengthOf(type)}${down ? ', on the board' : ''}`);
    }
    countLine.textContent = count.line;
    countLine.classList.toggle('is-full', count.left === 0);
    hint.replaceChildren();
    hint.classList.toggle('is-hint', !everPlaced);
    if (everPlaced) {
      hint.textContent = 'Your bands';
    } else {
      hint.textContent = DEPLOY_HINT;
      hint.appendChild(html('span', 'deploy-tray__keys', ' Press ? for the keys.'));
    }
  }

  function render() {
    renderBoard(svg, previewState(), {
      selected: selectedType !== null && isPlaced(selectedType) ? selectedType : null,
      // The deploy tiles are marked over the board (renderMarks).
      highlights: [],
      highlightKind: null,
      ghost: null,
      marks: false,
    });
    renderMarks();
    renderTray();
    const { label, ready } = startLabel(placed.length, level.maxBands);
    startBtn.textContent = label;
    if (ready) startBtn.appendChild(keyHint('Enter'));
    startBtn.disabled = !ready;
    renderPanel();
    drawCursor();
    landed = null;
  }

  /**
   * Picks a band from the roster and shows its card.
   * @param {string} type
   */
  function pick(type) {
    selectedType = type;
    panelOpen = true;
    render();
    // On a phone the tray slides: a band picked by its key comes into view.
    const token = /** @type {HTMLElement|undefined} */ (tokens.get(type));
    if (token !== undefined && typeof token.scrollIntoView === 'function') {
      token.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function closeCard() {
    panelOpen = false;
    render();
  }

  // --- the full card, over the whole screen; any tap or Escape closes it ---

  /** @param {string} type */
  function openSheet(type) {
    closeSheet();
    const doc = /** @type {Document|undefined} */ (globalThis.document);
    const box = html('div', 'deploy-sheet');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `${nameOf(type)}: the full card`);
    const inner = html('div', 'deploy-sheet__inner');
    box.appendChild(inner);
    const card = renderUnitCard(unitCard(type, lengthOf(type)), { next: false });
    const close = html('button', 'deploy-sheet__close ui-btn-round', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the card');
    card.appendChild(close);
    inner.appendChild(card);
    box.addEventListener('click', () => closeSheet());
    box.addEventListener('keydown', (evt) => {
      const key = /** @type {KeyboardEvent} */ (evt).key;
      if (key !== 'Escape') return;
      evt.preventDefault();
      evt.stopPropagation();
      closeSheet();
    });
    screen.appendChild(box);
    sheet = { box, back: doc?.activeElement ?? null };
    // The focus goes in, so the keys are the card's while it is open.
    if (typeof close.focus === 'function') close.focus();
  }

  function closeSheet() {
    if (sheet === null) return;
    const { box, back } = sheet;
    sheet = null;
    box.remove();
    const target = /** @type {HTMLElement|null} */ (back);
    if (!left && target !== null && typeof target.focus === 'function' && target.isConnected !== false) target.focus();
  }

  svg.addEventListener('pointerup', (evt) => {
    const pos = tileFromEvent(svg, evt);
    // A pointer is in use: the keyboard's cursor gets out of the way.
    cursor = null;
    drawCursor();
    if (pos === null) return;
    tapTile(pos);
  });

  /**
   * What a tap on a tile does, from a finger or from Space on the cursor:
   * take away the band placed there, or place the picked band there.
   * @param {Pos} pos
   */
  function tapTile(pos) {
    const placedAt = placed.find((d) => eq(d.at, pos));
    if (placedAt !== undefined) {
      placed = placed.filter((d) => d.type !== placedAt.type);
      if (selectedType === null) selectedType = placedAt.type;
      render();
      return;
    }
    if (selectedType === null) return;
    if (!deployTiles.some((t) => eq(t, pos))) return;
    const type = selectedType;
    const at = /** @type {Pos} */ ([pos[0], pos[1]]);
    if (isPlaced(type)) {
      placed = placed.map((d) => (d.type === type ? { type, at } : d));
    } else {
      if (placed.length >= level.maxBands) return;
      placed = [...placed, { type, at }];
      selectedType = nextUnplaced();
    }
    everPlaced = true;
    landed = at;
    render();
  }

  // --- where the card goes: measured, then cardPlacement decides ---

  /**
   * The tallest card of the roster in each form at this width, laid out
   * off screen in a panel like the real one.
   * @param {number} w
   * @returns {{fullH: number, briefH: number}}
   */
  function cardHeights(w) {
    const box = html('div', 'deploy-panel deploy-panel--measure');
    box.setAttribute('aria-hidden', 'true');
    box.style.width = `${Math.floor(w)}px`;
    screen.appendChild(box);
    let fullH = 0;
    let briefH = 0;
    for (const type of rosterTypes) {
      box.className = 'deploy-panel deploy-panel--measure deploy-panel--full';
      box.replaceChildren(buildCard(type, 'full', { hide: false }));
      fullH = Math.max(fullH, box.offsetHeight);
      box.className = 'deploy-panel deploy-panel--measure deploy-panel--brief';
      box.replaceChildren(buildCard(type, 'brief', { hide: false }));
      briefH = Math.max(briefH, box.offsetHeight);
    }
    box.remove();
    return { fullH, briefH };
  }

  function relayout() {
    if (left) return;
    const wide = isWide();
    let next;
    if (wide) {
      const w = slot.clientWidth;
      // The card's room: the slot less the gap at its top.
      let gap = 0;
      try {
        gap = parseFloat(getComputedStyle(slot).paddingTop) || 0;
      } catch {
        gap = 0;
      }
      const sideH = slot.clientHeight - gap;
      next = w > 0 ? cardPlacement({ wide, sideH, ...cardHeights(w), half }) : cardPlacement({ wide, fullH: 0, briefH: 0, half });
    } else {
      const areaW = boardArea.clientWidth;
      const areaH = boardArea.clientHeight;
      next = areaW > 0 && areaH > 0
        ? cardPlacement({ wide, areaW, areaH, ...cardHeights(Math.min(areaW, MAX_BOARD)), half })
        : cardPlacement({ wide, fullH: 0, briefH: 0, half });
    }
    // A phone's tray slides sideways when its tokens do not fit (css/menus.css).
    roster.classList.toggle('is-sliding', !wide && roster.scrollWidth > roster.clientWidth + 1);
    if (next.place === placement.place && next.form === placement.form && next.slot === placement.slot) return;
    placement = next;
    applyPlacement();
    renderPanel();
  }

  function applyPlacement() {
    for (const where of ['side', 'below', 'over']) {
      screen.classList.toggle(`deploy-screen--${where}`, placement.place === where);
    }
    screen.style.setProperty('--slot-h', `${placement.slot}px`);
  }

  /** @type {ResizeObserver|null} */
  let sizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(() => relayout());
    sizeObserver.observe(screen);
  }
  // A late web font changes the cards' heights.
  const fonts = /** @type {{fonts?: {ready?: Promise<unknown>}}|undefined} */ (/** @type {unknown} */ (globalThis.document))?.fonts;
  fonts?.ready?.then(() => relayout(), () => {});

  // --- the keyboard (js/ui/keys.js, deployKey) ---

  const tilePoints = deployTiles.map(([x, y]) => ({ x, y }));

  /** Where the cursor first shows: the first free deploy tile, else the first. @returns {Pos|null} */
  function cursorStart() {
    const free = deployTiles.find((tile) => !placed.some((d) => eq(d.at, tile)));
    return free ?? deployTiles[0] ?? null;
  }

  /** The cursor over its tile, in percent of the board, so it follows a resize. */
  function drawCursor() {
    cursorBox.hidden = cursor === null;
    if (cursor === null) return;
    cursorBox.style.left = `${(cursor[0] * 100) / width}%`;
    cursorBox.style.top = `${(cursor[1] * 100) / height}%`;
    cursorBox.style.width = `${100 / width}%`;
    cursorBox.style.height = `${100 / height}%`;
  }

  /** @param {'up'|'down'|'left'|'right'} way */
  function moveCursor(way) {
    const at = cursor;
    if (at === null) {
      cursor = cursorStart();
    } else {
      const from = deployTiles.findIndex((tile) => eq(tile, at));
      const to = stepToward(tilePoints, from, way);
      if (to !== null) cursor = deployTiles[to];
    }
    drawCursor();
  }

  function toggleKeys() {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    keysBox = keyListBox(DEPLOY_KEY_LIST, { screen: true, onClose: toggleKeys });
    screen.appendChild(keysBox);
  }

  const doc = /** @type {Document|undefined} */ (globalThis.document);
  const stopKeys = takeKeys((evt) => {
    if (left) return;
    const command = deployKey(evt, { focus: focusKind(doc?.activeElement) });
    if (command === null) return;
    evt.preventDefault();
    if (command === 'help') toggleKeys();
    else if (command === 'back') {
      // What is open on top closes first; the card in its place never
      // takes Escape, so one press leaves.
      if (keysBox !== null) toggleKeys();
      else if (sheet !== null) closeSheet();
      else leave(opts.onBack);
    } else if (command === 'main') start();
    else if (command === 'place') {
      if (cursor === null) moveCursor('up');
      else tapTile(cursor);
    } else if (command === 'up' || command === 'down' || command === 'left' || command === 'right') {
      moveCursor(command);
    } else {
      const type = rosterTypes[Number(command.slice('band'.length)) - 1];
      if (type !== undefined) pick(type);
    }
  });

  if (cameByKey()) cursor = cursorStart();
  applyPlacement();
  render();
  relayout();
}
