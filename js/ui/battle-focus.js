// The band in focus on the battle screen (interface pass, "the selected
// band in the desktop panel"): what the side panel's middle shows on a wide
// screen, and the compact strip under the board on a tall phone.
//
// - One of the player's bands selected: its portrait, name, the speed and
//   length pips, what it has left this turn, and its actions with their
//   number keys, the offered or chosen one marked.
// - A bot tapped, or one of the player's bands that cannot be selected (it
//   has acted, or it is trapped): the same card, with a bot's plan in the
//   one plain line the game already writes for a tapped bot.
// - Nothing: a quiet prompt.
//
// `focusInfo` and `phoneStrip` are pure; js/ui/battle-view.js draws.

/** @typedef {import('../engine/types.js').BattleState} BattleState */
/** @typedef {import('../engine/types.js').Band} Band */
/** @typedef {import('./turn-state.js').TurnState} TurnState */
/** @typedef {{filled: number, hollow: number}} Marks */
/**
 * An action as the focus card lists it. `key` is the number key that
 * chooses it ("1" to "9"), or null when nothing is chosen with a key (a
 * band with one action, whose targets show with its moves; a band that is
 * not selected). `active` marks the action a tap on a target does now:
 * the one chosen in the pop-up or the list, the attack offered after a
 * move, or a band's only action.
 * @typedef {{id: string, label: string, key: string|null, enabled: boolean, active: boolean}} FocusAction
 */
/** @typedef {TurnState|'trapped'} FocusStatus */
/**
 * @typedef {{kind: 'none', text: string}
 *   | {kind: 'band', bandId: string, typeId: string, name: string, lengthText: string, speed: Marks, length: Marks,
 *      status: FocusStatus, statusText: string, actions: FocusAction[], choosable: boolean, hint: string|null}
 *   | {kind: 'bot', bandId: string, typeId: string, name: string, lengthText: string, length: Marks, plan: string}} FocusInfo
 */

import { bandById } from '../engine/band.js';
import { BAND_TYPES, actionsFor, tierFor } from '../engine/units.js';
import { describeIntent } from './text.js';
import { bandTurnState, turnStates, TURN_STATE_TEXT } from './turn-state.js';
import { SPEED_SCALE } from './unit-info.js';

/** What a trapped band has left: nothing until a band frees it. */
export const TRAPPED_TEXT = 'Trapped: move a band next to it to free it';

/** The quiet prompts with nothing in focus. */
export const PROMPT = Object.freeze({
  begin: 'Pick one of your bands to begin.',
  pick: 'Pick a band to use it, or tap a bot to see its plan.',
  done: 'Your bands have done all they can this turn.',
});

/**
 * A band's length as pips: what is left of it filled, what it has lost
 * hollow.
 * @param {Band} band
 * @returns {Marks}
 */
export function lengthMarks(band) {
  const now = band.cells.length;
  return { filled: now, hollow: Math.max(0, band.maxLen - now) };
}

/**
 * A band type's speed as pips, out of the fastest animal's.
 * @param {string} typeId
 * @returns {Marks}
 */
export function speedMarks(typeId) {
  const speed = BAND_TYPES[typeId]?.speed ?? 0;
  return { filled: speed, hollow: Math.max(0, SPEED_SCALE - speed) };
}

/**
 * The line under the band's name while it is selected: what a tap does
 * now. Null when there is nothing to say.
 * @param {import('./battle-view.js').SelectionView} view
 * @returns {string|null}
 */
function selectionHint(view) {
  const active = view.options.find((o) => o.id === view.actionId);
  if (active !== undefined && view.targets.length > 0) return `${active.label}: tap a target`;
  const canChoose = view.mode === 'menu' && view.options.some((o) => o.enabled);
  const canMove = view.moves.size > 0;
  if (canMove && canChoose) return 'Tap a tile to move, or choose an action';
  if (canMove) return 'Tap a tile to move';
  if (canChoose) return 'Choose an action';
  return null;
}

/**
 * The quiet prompt with nothing in focus: how to begin on the first
 * turn, before anything was done; what a tap does later; and, once every
 * band is done, that the turn can end. Empty once the battle is over.
 * @param {BattleState} state
 * @returns {string}
 */
export function focusPrompt(state) {
  if (state.outcome !== null) return '';
  const turns = [...turnStates(state).values()];
  if (turns.length > 0 && turns.every((t) => t === 'done')) return PROMPT.done;
  if (state.turn === 1 && turns.every((t) => t === 'ready')) return PROMPT.begin;
  return PROMPT.pick;
}

/**
 * What the focus card shows.
 *
 * `view` is the selected band's (selectionView in js/ui/battle-view.js),
 * or null. `peek` is the band last tapped that could not be selected: a
 * bot, or one of the player's bands that has acted or is trapped. It
 * wins over the selection, being the more recent tap. A band that has
 * left the board shows nothing.
 * @param {BattleState} state
 * @param {import('./battle-view.js').SelectionView|null} view
 * @param {string|null} [peek]
 * @returns {FocusInfo}
 */
export function focusInfo(state, view, peek = null) {
  const none = /** @type {FocusInfo} */ ({ kind: 'none', text: focusPrompt(state) });
  if (state.outcome !== null) return none;
  const peeked = peek !== null ? bandById(state, peek) : undefined;
  const band = peeked !== undefined && peeked.cells.length > 0
    ? peeked
    : view !== null ? bandById(state, view.bandId) : undefined;
  if (band === undefined || band.cells.length === 0) return none;
  const name = tierFor(band.type, band.maxLen).name;
  const lengthText = `${band.cells.length}/${band.maxLen}`;
  if (band.side === 'bots') {
    return {
      kind: 'bot', bandId: band.id, typeId: band.type, name, lengthText,
      length: lengthMarks(band), plan: describeIntent(state, band),
    };
  }
  const selected = view !== null && view.bandId === band.id ? view : null;
  /** @type {FocusStatus} */
  const status = band.trapped ? 'trapped' : bandTurnState(state, band) ?? 'done';
  /** @type {FocusAction[]} */
  const actions = selected !== null
    ? selected.options.map((o, i) => ({
      id: o.id,
      label: o.label,
      key: selected.mode === 'menu' && i < 9 ? String(i + 1) : null,
      enabled: o.enabled,
      active: o.id === selected.actionId,
    }))
    : actionsFor(band.type, band.maxLen).map((def) => ({
      id: def.id, label: def.label, key: null, enabled: false, active: false,
    }));
  return {
    kind: 'band',
    bandId: band.id,
    typeId: band.type,
    name,
    lengthText,
    speed: speedMarks(band.type),
    length: lengthMarks(band),
    status,
    statusText: status === 'trapped' ? TRAPPED_TEXT : TURN_STATE_TEXT[status],
    actions,
    choosable: selected !== null && selected.mode === 'menu',
    hint: selected !== null ? selectionHint(selected) : null,
  };
}

// --- the phone's strip ---

/** The strip's height on a phone, in CSS px (css/battle.css reads it as --strip-h). */
export const STRIP_H = 84;
/** The message box under it, in strip mode: two lines. */
export const STRIP_LOG_H = 50;
/** The gaps above the strip and above the message box. */
export const STRIP_GAP = 6;
/** The widest the board grows on a phone (css/game.css). */
export const BOARD_MAX = 520;

/** Everything under the board in strip mode: the strip, the message box and their gaps. */
export const STRIP_ROOM = STRIP_GAP + STRIP_H + STRIP_GAP + STRIP_LOG_H;

/**
 * Whether a phone shows the strip under the board. The board's cell is
 * `width` by `height` CSS px (it takes what the other rows of the screen
 * leave). The strip shows only when it fits below a board that keeps its
 * full width: a tall phone has that much spare frame. Otherwise (360 by
 * 640, or any short screen) the board keeps the room and the strip
 * collapses into the one-line message under it. Never on a wide screen,
 * where the side panel has the room.
 * @param {{wide: boolean, width: number, height: number}} area
 * @returns {boolean}
 */
export function phoneStrip(area) {
  if (area.wide || area.width <= 0 || area.height <= 0) return false;
  return area.height - Math.min(area.width, BOARD_MAX) >= STRIP_ROOM;
}
