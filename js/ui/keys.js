// The keys on every screen but the battle's (which has its own, in
// js/ui/battle-view.js, built the same way), and what they all share.
//
// Every screen follows one pattern: Enter does what the screen's main
// button does, Escape goes back or closes what is open on top, ? shows the
// screen's keys in the battle's small list, the arrows and W A S D move a
// selection, and a key hint shows on each button only where there is a
// mouse and a keyboard (css/game.css). A held key never repeats anything
// that buys, places, starts, ends or leaves; a key does nothing while a
// text field or a dialog (a scene) has the focus, or with Ctrl, Cmd or Alt
// held.
//
// The top half is pure: which command a key is on each screen, and which
// place an arrow moves to. The bottom half is the little DOM they share:
// the hint on a button, the list of keys, one keydown listener for the
// screen on show, and whether the player came by keyboard.

import { emblem } from './ui-kit.js';

/** @typedef {'up'|'down'|'left'|'right'} Way */
/** @typedef {{x: number, y: number}} Point */
/**
 * What has the keyboard focus: a text field, something inside a dialog,
 * a button or link the keyboard reached (Enter and Space press it by
 * themselves), or nothing in particular. A button a mouse or a finger
 * pressed has the focus too, in some browsers, but not a visible one, and
 * counts as nothing: Enter still does the screen's main action.
 * @typedef {'text'|'dialog'|'button'|'none'} FocusKind
 */
/**
 * The bits of a key event the commands read.
 * @typedef {{key: string, repeat?: boolean, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} KeyLike
 */
/**
 * One line of a list of keys. `actions`, on the line for choosing an
 * action, names the actions to choose from, each shown with its painted
 * emblem (js/ui/ui-kit.js).
 * @typedef {{keys: string, does: string, actions?: ReadonlyArray<{id: string, label: string}>}} KeyListEntry
 */

/** Arrow keys and W A S D, to the way they move. */
const WAY_KEYS = /** @type {Readonly<Record<string, Way>>} */ (Object.freeze({
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
}));

/**
 * The way an arrow key or W A S D moves, or null for any other key.
 * @param {string} key
 * @returns {Way|null}
 */
export function wayOf(key) {
  return WAY_KEYS[key] ?? null;
}

/**
 * @param {Element|null|undefined} node  the focused element
 * @returns {FocusKind}
 */
export function focusKind(node) {
  if (node === null || node === undefined) return 'none';
  const tag = node.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'text';
  if (/** @type {HTMLElement} */ (node).isContentEditable === true) return 'text';
  /** @type {Element|null} */
  let up = node;
  while (up !== null) {
    if (up.tagName === 'DIALOG' || up.getAttribute('role') === 'dialog' || up.getAttribute('aria-modal') === 'true') {
      return 'dialog';
    }
    up = up.parentElement;
  }
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || node.getAttribute('role') === 'button') {
    return focusShows(node) ? 'button' : 'none';
  }
  return 'none';
}

/**
 * Whether the focus on `node` is one the keyboard put there (it shows
 * its ring), not one left behind by a click. Where the browser cannot
 * say, it counts as shown.
 * @param {Element} node
 * @returns {boolean}
 */
function focusShows(node) {
  if (typeof node.matches !== 'function') return true;
  try {
    return node.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * A key no screen takes: one with Ctrl, Cmd or Alt held, or any key while
 * a text field or a dialog has the focus.
 * @param {KeyLike} evt
 * @param {FocusKind} focus
 * @returns {boolean}
 */
function ignored(evt, focus) {
  if (evt.ctrlKey === true || evt.metaKey === true || evt.altKey === true) return true;
  return focus === 'text' || focus === 'dialog';
}

/** @param {string} key */
const isEnter = (key) => key === 'Enter';
/** @param {string} key */
const isSpace = (key) => key === ' ' || key === 'Spacebar';

/**
 * The keys every screen shares, before its own: Escape is 'back', ? is
 * 'help', Enter is 'main' (left to a button the keyboard reached, which
 * Enter presses by itself). None of them repeats when held. Undefined
 * when the key is not one of them, so the screen can look at it.
 * @param {KeyLike} evt
 * @param {FocusKind} focus
 * @returns {'back'|'help'|'main'|null|undefined}
 */
function shared(evt, focus) {
  const held = evt.repeat === true;
  if (evt.key === 'Escape') return held ? null : 'back';
  if (evt.key === '?') return held ? null : 'help';
  if (isEnter(evt.key)) return held || focus === 'button' ? null : 'main';
  return undefined;
}

/**
 * The title screen: Enter begins, S turns the sound on or off, ? shows
 * the keys and Escape closes them.
 * @typedef {'main'|'sound'|'help'|'back'} TitleCommand
 * @param {KeyLike} evt
 * @param {{focus: FocusKind}} ctx
 * @returns {TitleCommand|null}
 */
export function titleKey(evt, ctx) {
  if (ignored(evt, ctx.focus)) return null;
  const common = shared(evt, ctx.focus);
  if (common !== undefined) return common;
  if (evt.repeat === true) return null;
  if (evt.key === 's' || evt.key === 'S') return 'sound';
  return null;
}

/**
 * The map: the arrows and W A S D move the selection from place to
 * place (a held arrow keeps moving it); Enter marches to the selected
 * level or goes into the trading post; T goes straight to the trading
 * post; Escape lets go of the selection or closes the keys; ? shows them.
 * @typedef {Way|'main'|'shop'|'help'|'back'} MapCommand
 * @param {KeyLike} evt
 * @param {{focus: FocusKind}} ctx
 * @returns {MapCommand|null}
 */
export function mapKey(evt, ctx) {
  if (ignored(evt, ctx.focus)) return null;
  const common = shared(evt, ctx.focus);
  if (common !== undefined) return common;
  const way = wayOf(evt.key);
  if (way !== null) return way;
  if (evt.repeat === true) return null;
  if (evt.key === 't' || evt.key === 'T') return 'shop';
  return null;
}

/**
 * The deploy screen: 1 to 9 pick the 1st to 9th band in the roster; the
 * arrows and W A S D move between the deploy tiles; Space places the
 * picked band on the selected tile or takes away the band on it; Enter
 * starts the battle; Escape closes the keys or the full card, else goes
 * back to the map (the band's card in its place never takes it); ? shows
 * the keys.
 * @typedef {Way|'main'|'place'|'help'|'back'|'band1'|'band2'|'band3'|'band4'|'band5'|'band6'|'band7'|'band8'|'band9'} DeployCommand
 * @param {KeyLike} evt
 * @param {{focus: FocusKind}} ctx
 * @returns {DeployCommand|null}
 */
export function deployKey(evt, ctx) {
  if (ignored(evt, ctx.focus)) return null;
  const common = shared(evt, ctx.focus);
  if (common !== undefined) return common;
  const way = wayOf(evt.key);
  if (way !== null) return way;
  if (evt.repeat === true) return null;
  if (isSpace(evt.key)) return ctx.focus === 'button' ? null : 'place';
  if (/^[1-9]$/.test(evt.key)) return /** @type {DeployCommand} */ (`band${evt.key}`);
  return null;
}

/**
 * The trading post: the arrows and W A S D move between the things that
 * can be bought (Tab does too, as the browser's own focus); Enter buys
 * the selected one, or chooses the first when none is; Escape closes the
 * keys, else goes back to the map; ? shows the keys.
 * @typedef {Way|'main'|'help'|'back'} ShopCommand
 * @param {KeyLike} evt
 * @param {{focus: FocusKind}} ctx
 * @returns {ShopCommand|null}
 */
export function shopKey(evt, ctx) {
  if (ignored(evt, ctx.focus)) return null;
  const common = shared(evt, ctx.focus);
  if (common !== undefined) return common;
  return wayOf(evt.key);
}

/**
 * The result screen: Enter goes back to the map, R plays again, ? shows
 * the keys and Escape closes them.
 * @typedef {'main'|'replay'|'help'|'back'} ResultCommand
 * @param {KeyLike} evt
 * @param {{focus: FocusKind}} ctx
 * @returns {ResultCommand|null}
 */
export function resultKey(evt, ctx) {
  if (ignored(evt, ctx.focus)) return null;
  const common = shared(evt, ctx.focus);
  if (common !== undefined) return common;
  if (evt.repeat === true) return null;
  if (evt.key === 'r' || evt.key === 'R') return 'replay';
  return null;
}

/** The keys, as each screen's "?" list shows them. */
export const TITLE_KEY_LIST = /** @type {ReadonlyArray<KeyListEntry>} */ (Object.freeze([
  { keys: 'Enter', does: 'Begin' },
  { keys: 'S', does: 'Sound on or off' },
  { keys: '?', does: 'Show or hide these keys' },
]));

export const MAP_KEY_LIST = /** @type {ReadonlyArray<KeyListEntry>} */ (Object.freeze([
  { keys: 'Arrows, W A S D', does: 'Choose a place' },
  { keys: 'Enter', does: 'March, or go into the trading post' },
  { keys: 'T', does: 'Trading post' },
  { keys: 'Esc', does: 'Let go of the place' },
  { keys: '?', does: 'Show or hide these keys' },
]));

export const DEPLOY_KEY_LIST = /** @type {ReadonlyArray<KeyListEntry>} */ (Object.freeze([
  { keys: '1 – 9', does: 'Pick a band' },
  { keys: 'Arrows, W A S D', does: 'Move between the glowing tiles' },
  { keys: 'Space', does: 'Place the band, or take it away' },
  { keys: 'Enter', does: 'Start' },
  { keys: 'Esc', does: 'Back to the map' },
  { keys: '?', does: 'Show or hide these keys' },
]));

export const SHOP_KEY_LIST = /** @type {ReadonlyArray<KeyListEntry>} */ (Object.freeze([
  { keys: 'Arrows, Tab', does: 'Choose what to buy' },
  { keys: 'Enter', does: 'Buy it' },
  { keys: 'Esc', does: 'Back to map' },
  { keys: '?', does: 'Show or hide these keys' },
]));

export const RESULT_KEY_LIST = /** @type {ReadonlyArray<KeyListEntry>} */ (Object.freeze([
  { keys: 'Enter', does: 'Back to map' },
  { keys: 'R', does: 'Play again' },
  { keys: '?', does: 'Show or hide these keys' },
]));

/** One step of an arrow, as x and y (y grows downwards, as on screen). */
const WAY_VECTOR = /** @type {Readonly<Record<Way, Point>>} */ (Object.freeze({
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}));

/**
 * Where an arrow moves a selection among points laid out on the screen
 * (the map's places, the deploy tiles, the trading post's buttons): to
 * the point that lies most nearly that way from `from`. A point counts
 * only if it is ahead in that direction and no more than twice as far to
 * the side as it is ahead (within about 63 degrees of the arrow); of
 * those, the one with the least distance ahead plus twice the distance
 * to the side, then the nearest, then the first listed. Null when
 * nothing lies that way: the selection stays where it is.
 * @param {ReadonlyArray<Point>} points
 * @param {number} from  the index of the selected point
 * @param {Way} way
 * @returns {number|null}  the index of the point to select
 */
export function stepToward(points, from, way) {
  const here = points[from];
  if (here === undefined) return null;
  const v = WAY_VECTOR[way];
  let best = null;
  let bestScore = Infinity;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    if (i === from) continue;
    const dx = points[i].x - here.x;
    const dy = points[i].y - here.y;
    const ahead = dx * v.x + dy * v.y;
    const side = Math.abs(dx * v.y - dy * v.x);
    if (ahead <= 0 || side > ahead * 2) continue;
    const score = ahead + side * 2;
    const distance = Math.hypot(dx, dy);
    if (score < bestScore || (score === bestScore && distance < bestDistance)) {
      best = i;
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best;
}

// --- the DOM they share ---

/**
 * A key hint on a button ("Enter", "Esc", "1"). Shown only on a device
 * with a fine pointer (css/game.css), and never read out: the button
 * already says what it does.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function keyHint(text) {
  const kbd = document.createElement('kbd');
  kbd.className = 'key-hint';
  kbd.textContent = text;
  kbd.setAttribute('aria-hidden', 'true');
  return kbd;
}

/**
 * The list of keys ("?"), the battle's small dark card. `screen` puts it
 * in the middle of the window (every screen but the battle, where it
 * sits over the board). A tap on it closes it, through `onClose`.
 * @param {ReadonlyArray<KeyListEntry>} list
 * @param {{screen?: boolean, onClose: () => void}} opts
 * @returns {HTMLElement}
 */
export function keyListBox(list, opts) {
  const box = document.createElement('div');
  // On the kit's wood (css/ui.css).
  box.className = opts.screen === true ? 'battle-keys battle-keys--screen ui-panel--wood' : 'battle-keys ui-panel--wood';
  box.setAttribute('role', 'note');
  box.setAttribute('aria-label', 'Keys');
  const title = document.createElement('p');
  title.className = 'battle-keys__title';
  title.textContent = 'Keys';
  box.appendChild(title);
  const dl = document.createElement('dl');
  dl.className = 'battle-keys__list';
  for (const entry of list) {
    const dt = document.createElement('dt');
    dt.className = 'battle-keys__key';
    dt.textContent = entry.keys;
    const dd = document.createElement('dd');
    dd.className = 'battle-keys__does';
    dd.textContent = entry.does;
    if (entry.actions !== undefined && entry.actions.length > 0) {
      const names = document.createElement('span');
      names.className = 'battle-keys__actions';
      for (const action of entry.actions) {
        const name = document.createElement('span');
        name.className = 'battle-keys__action';
        const picture = emblem(action.id);
        if (picture !== null) name.appendChild(picture);
        name.append(action.label);
        names.appendChild(name);
      }
      dd.appendChild(names);
    }
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  box.appendChild(dl);
  box.addEventListener('click', () => opts.onClose());
  return box;
}

/** Stops the listener of the screen that last took the keys. @type {(() => void)|null} */
let stopLast = null;

/**
 * Gives the keys to the screen now on show: `handler` hears every
 * keydown on the page until another screen takes them, or until the
 * returned function is called. A scene's overlay catches the keys before
 * they reach here (js/ui/scene-view.js), so a screen hears nothing while
 * a scene is open over it.
 * @param {(evt: KeyboardEvent) => void} handler
 * @returns {() => void}  stops it
 */
export function takeKeys(handler) {
  stopLast?.();
  stopLast = null;
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  if (doc === undefined || typeof doc.addEventListener !== 'function') return () => {};
  /** @param {Event} evt */
  const listener = (evt) => handler(/** @type {KeyboardEvent} */ (evt));
  doc.addEventListener('keydown', listener);
  const stop = () => {
    if (typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', listener);
    if (stopLast === stop) stopLast = null;
  };
  stopLast = stop;
  return stop;
}

/** How the player last did something: a key, or a mouse or finger. */
let lastInput = /** @type {'key'|'pointer'|null} */ (null);

/**
 * True when the player's last input was a key: a screen drawn now shows
 * its keyboard selection at once, as the browser shows the focus ring.
 * @returns {boolean}
 */
export function cameByKey() {
  return lastInput === 'key';
}

/**
 * Watches the page once, for the whole game: which kind of input came
 * last (cameByKey); a held Enter on a focused button, which the browser
 * would otherwise press again and again (a purchase, a start, a leave);
 * and a button a mouse or a finger pressed, which some browsers leave
 * focused. Pressing a key then would put the keyboard's ring round it
 * and hand it Enter, though the player never chose it with the keys; so
 * it lets go of the focus once the press is done, as Safari never takes
 * it. Called once from js/app.js.
 * @returns {void}
 */
export function watchInput() {
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  if (doc === undefined || typeof doc.addEventListener !== 'function') return;
  doc.addEventListener('keydown', (evt) => {
    lastInput = 'key';
    if (evt.repeat && evt.key === 'Enter') {
      const target = /** @type {Element|null} */ (evt.target);
      const tag = target !== null && typeof target.tagName === 'string' ? target.tagName : '';
      if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') evt.preventDefault();
    }
  }, true);
  doc.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
  doc.addEventListener('click', (evt) => {
    // A click from Enter or Space (detail 0) is the keyboard's: it keeps its focus.
    if (lastInput !== 'pointer' || /** @type {MouseEvent} */ (evt).detail === 0) return;
    const focused = /** @type {HTMLElement|null} */ (doc.activeElement);
    if (focused === null || focused === doc.body || typeof focused.blur !== 'function') return;
    const tag = focused.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || focused.getAttribute('role') === 'button') focused.blur();
  });
}

/**
 * Moves the focus to `node` without the browser's own scroll, then
 * brings it into view if it is not; nothing where focus cannot be given.
 * @param {HTMLElement|null|undefined} node
 * @returns {void}
 */
export function focusOn(node) {
  if (node === null || node === undefined || typeof node.focus !== 'function') return;
  try {
    node.focus({ preventScroll: true });
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  } catch {
    // A test double or an odd browser: the tap still works.
  }
}
