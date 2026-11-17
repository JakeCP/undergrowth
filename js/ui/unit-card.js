// The unit card (play-feel spec, "Changed after Jake's playtest of the
// full build"; restyled after the opening-act playtest as a page from a
// naturalist's field guide). The deploy screen and the trading post both
// use it, so a player reads the same thing when buying a band and placing
// it.
//
// On cream paper in one ink: the band's cut-out portrait standing on a
// hairline at the card's left and rising a little above its top edge
// (its stamp where it has no image), its name, one italic line on what it
// is for, its speed as pips and its length as a row of linked dots (the
// size it is now filled, the room to grow hollow; the same in words for a
// screen reader), then one row per action and per trait: a small-caps
// label and one sentence. Last, what its next growth tier adds (not on
// the deploy screen, where nothing can be bought).
//
// The compact card is the deploy screen's brief form, for a phone with
// little room: the portrait small beside the name and the marks, then
// each row on one line (css/menus.css cuts it short); the full card is a
// tap away there.
//
// The words come from js/ui/unit-info.js; this only lays them out.
// `markCounts` is pure; `renderUnitCard` draws. Styles are in
// css/menus.css.

/** @typedef {import('./unit-info.js').UnitCard} UnitCard */
/** @typedef {{filled: number, hollow: number}} Marks */

import { statsLine, SPEED_SCALE } from './unit-info.js';
import { portraitSpec, portraitFor, portraitSvg } from './portraits.js';
import { emblem } from './ui-kit.js';

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function node(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The line on the next growth tier, or null when there is none to show.
 * @param {UnitCard} card
 * @returns {string|null}
 */
export function nextTierLine(card) {
  const next = card.next;
  if (next === null || next.minLen > card.lengthMax) return null;
  const gains = next.gains.map((g) => `${g.label}: ${g.sentence}`).join(' ');
  return gains === ''
    ? `At length ${next.minLen}: becomes ${next.name}.`
    : `At length ${next.minLen}: becomes ${next.name} and learns ${gains}`;
}

/**
 * How many marks to draw for speed and length: speed out of the fastest
 * band's, and length as it is now out of the most it can grow to.
 * @param {UnitCard} card
 * @returns {{speed: Marks, length: Marks}}
 */
export function markCounts(card) {
  const speed = Math.max(0, card.speed);
  const now = Math.max(0, Math.min(card.lengthNow, card.lengthMax));
  return {
    speed: { filled: speed, hollow: Math.max(0, SPEED_SCALE - speed) },
    length: { filled: now, hollow: Math.max(0, card.lengthMax - now) },
  };
}

/**
 * The portrait standing at the card's left: the cut-out image, or the
 * stamp where there is none or the image fails to load.
 * @param {string} typeId
 * @returns {HTMLElement}
 */
function figure(typeId) {
  const wrap = node('div', 'unit-card__figure');
  wrap.setAttribute('aria-hidden', 'true');
  const spec = portraitSpec(typeId);
  if (spec.kind === 'image') {
    const img = /** @type {HTMLImageElement} */ (node('img', 'unit-card__art'));
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      wrap.replaceChildren(/** @type {any} */ (portraitSvg(portraitFor(typeId, undefined, []), 'unit-card__stamp')));
    });
    img.src = spec.href;
    wrap.appendChild(img);
  } else {
    wrap.appendChild(/** @type {any} */ (portraitSvg(spec, 'unit-card__stamp')));
  }
  return wrap;
}

/**
 * One row of marks: a small-caps label, then dots.
 * @param {string} label
 * @param {Marks} marks
 * @param {'pips'|'chain'} kind  pips stand apart; a chain's dots are linked
 * @returns {HTMLElement}
 */
function markRow(label, marks, kind) {
  const row = node('span', `unit-card__mark unit-card__mark--${kind}`);
  row.appendChild(node('span', 'unit-card__mark-label', label));
  const dots = node('span', `unit-card__dots unit-card__dots--${kind}`);
  row.appendChild(dots);
  for (let i = 0; i < marks.filled + marks.hollow; i += 1) {
    dots.appendChild(node('span', `unit-card__dot${i < marks.filled ? ' is-filled' : ''}`));
  }
  return row;
}

/**
 * One labelled row: an action or a trait.
 * @param {string} kind  'action' or 'trait'
 * @param {string} id
 * @param {string} label
 * @param {string} sentence
 * @returns {HTMLElement}
 */
function row(kind, id, label, sentence) {
  const li = node('li', `unit-card__row unit-card__row--${kind}`);
  li.dataset[kind] = id;
  // An action's label leads with its painted emblem, where it has one.
  const name = node('span', 'unit-card__label');
  const picture = kind === 'action' ? emblem(id) : null;
  if (picture !== null) name.appendChild(picture);
  name.append(label);
  li.appendChild(name);
  li.append(' ');
  li.appendChild(node('span', 'unit-card__text', sentence));
  return li;
}

/**
 * @param {UnitCard} card
 * @param {{compact?: boolean, next?: boolean}} [opts]  compact: the brief
 *   card for the deploy screen; next: false leaves out the next growth
 *   tier (the compact card never has it)
 * @returns {HTMLElement}
 */
export function renderUnitCard(card, opts = {}) {
  // On the kit's parchment (css/ui.css).
  const root = node('article', `unit-card ui-panel--parchment${opts.compact ? ' unit-card--compact' : ''}`);
  root.dataset.unit = card.typeId;

  const plate = node('div', 'unit-card__plate');
  root.appendChild(plate);
  plate.appendChild(figure(card.typeId));
  const head = node('header', 'unit-card__head');
  plate.appendChild(head);
  head.appendChild(node('h3', 'unit-card__name', card.name));
  if (card.role !== '') head.appendChild(node('p', 'unit-card__role', card.role));

  const counts = markCounts(card);
  const marks = node('p', 'unit-card__marks');
  // On the small deploy card the marks fit beside the portrait; on the
  // full card they open the rows under the line, so the name block stays
  // shorter than the portrait and the portrait rises above the card.
  if (opts.compact) head.appendChild(marks);
  else root.appendChild(marks);
  const drawn = node('span', 'unit-card__marks-drawn');
  drawn.setAttribute('aria-hidden', 'true');
  drawn.appendChild(markRow('Speed', counts.speed, 'pips'));
  drawn.appendChild(markRow('Length', counts.length, 'chain'));
  marks.appendChild(drawn);
  marks.appendChild(node('span', 'visually-hidden', statsLine(card)));

  const rows = node('ul', 'unit-card__rows');
  for (const action of card.actions) rows.appendChild(row('action', action.id, action.label, action.sentence));
  for (const trait of card.traitLines) rows.appendChild(row('trait', trait.id, trait.label, trait.sentence));
  if (rows.children.length > 0) root.appendChild(rows);

  // The deploy screen's cards leave out the next tier: nothing can be
  // bought there.
  const next = opts.compact || opts.next === false ? null : nextTierLine(card);
  if (next !== null) root.appendChild(node('p', 'unit-card__next', next));
  return root;
}
