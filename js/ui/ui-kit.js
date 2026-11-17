// The painted interface kit (css/ui.css): one look for every screen's
// buttons, panels and banners, drawn from the owner's painted pieces
// (scripts/ui-assets.mjs, listed in js/ui/ui-assets.js).
//
// css/ui.css draws each component in code first, then, under a class on
// <html> that says its painted piece exists, from that piece. applyKit
// sets those classes and the CSS variables holding the pieces' addresses
// once, at start; a piece missing from the list simply leaves the
// code-drawn look in place. kitStyle is the pure half, for tests.
//
// The action emblems are small painted pictures shown with an action's
// name wherever an action is offered or described: the pop-up's buttons
// in battle, the unit card's rows and the list of keys. An action with no
// emblem shows its name alone; the bots' actions have none.

import { UI_ASSETS } from './ui-assets.js';

/**
 * The pieces css/ui.css draws components from. Each one present gives
 * <html> the class `has-kit-<piece>` and the variable `--kit-<piece>`
 * (a url()). The result scenes and the emblems are pictures, used as
 * images, not here.
 * @type {readonly string[]}
 */
export const STYLED_PIECES = Object.freeze([
  'button-primary', 'button-secondary', 'button-round',
  'panel-parchment', 'panel-wood',
  'ribbon-green', 'ribbon-rust',
  'backdrop',
]);

/**
 * What gives the wooden press sound when pressed (js/app.js): the kit's
 * buttons, and the deploy tray's tokens, which sit in the kit's round
 * wooden piece.
 */
export const PRESSABLE = '.ui-btn, .ui-btn-round, .deploy-token';

/** The actions that have a painted emblem, by action id. */
export const EMBLEM_ACTIONS = Object.freeze(['bite', 'dig', 'build', 'ram', 'sting', 'maul', 'shove', 'strike']);

/**
 * @param {Readonly<Record<string, string>>} assets
 * @param {string} key
 * @returns {string|null}
 */
function has(assets, key) {
  return Object.prototype.hasOwnProperty.call(assets, key) ? assets[key] : null;
}

/**
 * The classes and CSS variables that switch css/ui.css's components to
 * their painted pieces, for the pieces in `assets`. Addresses are made
 * absolute against `base` (the page), so a variable means the same file
 * wherever a stylesheet uses it.
 * @param {Readonly<Record<string, string>>} [assets]
 * @param {string} [base]
 * @returns {{classes: string[], vars: Record<string, string>}}
 */
export function kitStyle(assets = UI_ASSETS, base = undefined) {
  /** @type {string[]} */
  const classes = [];
  /** @type {Record<string, string>} */
  const vars = {};
  for (const key of STYLED_PIECES) {
    const file = has(assets, key);
    if (file === null) continue;
    classes.push(`has-kit-${key}`);
    let href = file;
    if (base !== undefined) {
      try { href = new URL(file, base).href; } catch { href = file; }
    }
    vars[`--kit-${key}`] = `url("${href}")`;
  }
  return { classes, vars };
}

/**
 * Turns the painted look on for every piece that exists: classes and
 * variables on `root` (the page's <html>).
 * @param {{classList: {add: (c: string) => void}, style: {setProperty: (k: string, v: string) => void}}} root
 * @param {Readonly<Record<string, string>>} [assets]
 * @param {string} [base]
 * @returns {void}
 */
export function applyKit(root, assets = UI_ASSETS, base = globalThis.document?.baseURI) {
  const { classes, vars } = kitStyle(assets, base);
  for (const c of classes) root.classList.add(c);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/**
 * The emblem of an action, or null when it has none.
 * @param {string} actionId
 * @param {Readonly<Record<string, string>>} [assets]
 * @returns {string|null}
 */
export function emblemSrc(actionId, assets = UI_ASSETS) {
  if (!EMBLEM_ACTIONS.includes(actionId)) return null;
  return has(assets, `action-${actionId}`);
}

/**
 * The emblem as an image to set before the action's name, or null. It
 * says nothing to a screen reader: the name beside it does.
 * @param {string} actionId
 * @param {Readonly<Record<string, string>>} [assets]
 * @returns {HTMLElement|null}
 */
export function emblem(actionId, assets = UI_ASSETS) {
  const src = emblemSrc(actionId, assets);
  if (src === null) return null;
  const img = document.createElement('img');
  img.className = 'ui-emblem';
  img.setAttribute('src', src);
  img.setAttribute('alt', '');
  img.setAttribute('aria-hidden', 'true');
  img.setAttribute('draggable', 'false');
  img.setAttribute('data-action', actionId);
  return img;
}
