// The interface's small painted icons: seeds, dens and forest. Each is
// a WebP from scripts/map-assets.mjs (listed in js/ui/map-assets.js),
// set in the line of text it stands for; when an icon's file is not in
// the list, the emoji it replaced stands in.

import { MAP_ASSETS } from './map-assets.js';

/** @typedef {'seed'|'den'|'forest'} IconName */

/** The emoji each icon replaced, used while its image is missing. */
export const ICON_EMOJI = Object.freeze({ seed: '🌰', den: '🏡', forest: '🌲' });
/** What each icon says to a screen reader. */
export const ICON_ALT = Object.freeze({ seed: 'Seeds', den: 'Dens', forest: 'Forest' });

/**
 * @param {IconName} name
 * @param {Readonly<Record<string, string>>} [icons] the icon files that exist
 * @returns {string|null}
 */
export function iconSrc(name, icons = MAP_ASSETS.icons) {
  return Object.prototype.hasOwnProperty.call(icons, name) ? icons[name] : null;
}

/**
 * An icon to set in a line of text: an <img> one line tall, or the
 * emoji when there is no image.
 * @param {IconName} name
 * @param {{alt?: string, icons?: Readonly<Record<string, string>>}} [opts]
 * @returns {HTMLElement}
 */
export function icon(name, opts = {}) {
  const alt = opts.alt ?? ICON_ALT[name];
  const src = iconSrc(name, opts.icons);
  if (src === null) {
    const span = document.createElement('span');
    span.className = 'ui-icon ui-icon--emoji';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', alt);
    span.textContent = ICON_EMOJI[name];
    return span;
  }
  const img = document.createElement('img');
  img.className = 'ui-icon';
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  img.setAttribute('draggable', 'false');
  return img;
}

/**
 * Sets `target` to the icon then the text, as "🌰 12" read.
 * @param {Element} target
 * @param {IconName} name
 * @param {string|number} text
 * @param {{alt?: string, icons?: Readonly<Record<string, string>>}} [opts]
 * @returns {void}
 */
export function setIconText(target, name, text, opts) {
  target.replaceChildren(icon(name, opts), ` ${text}`);
}

/**
 * A new element of `tag` and `className` holding the icon then the text.
 * @param {string} tag
 * @param {string} className
 * @param {IconName} name
 * @param {string|number} text
 * @param {{alt?: string, icons?: Readonly<Record<string, string>>}} [opts]
 * @returns {HTMLElement}
 */
export function iconText(tag, className, name, text, opts) {
  const e = document.createElement(tag);
  e.className = className;
  setIconText(e, name, text, opts);
  return e;
}

/**
 * The icon in an SVG drawing, centred on (cx, cy) in a square of
 * `size`: an <image>, or the emoji as text when there is no image.
 * @param {Element} parent
 * @param {IconName} name
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {Readonly<Record<string, string>>} [icons]
 * @returns {Element}
 */
export function svgIcon(parent, name, cx, cy, size, icons) {
  const ns = 'http://www.w3.org/2000/svg';
  const src = iconSrc(name, icons);
  /** @type {Element} */
  let e;
  if (src === null) {
    e = document.createElementNS(ns, 'text');
    e.setAttribute('x', String(cx));
    e.setAttribute('y', String(Math.round((cy + size * 0.35) * 10) / 10));
    e.setAttribute('text-anchor', 'middle');
    e.setAttribute('font-size', String(Math.round(size * 0.8 * 10) / 10));
    e.textContent = ICON_EMOJI[name];
  } else {
    e = document.createElementNS(ns, 'image');
    e.setAttribute('href', src);
    e.setAttribute('x', String(cx - size / 2));
    e.setAttribute('y', String(cy - size / 2));
    e.setAttribute('width', String(size));
    e.setAttribute('height', String(size));
  }
  e.setAttribute('data-icon', name);
  parent.appendChild(e);
  return e;
}
