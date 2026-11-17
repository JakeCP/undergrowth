// What the save says the title screen should show: how the valley is,
// and who stands with the fox and the hedgehog. Pure; the view
// (js/ui/title-view.js) draws it.

/** The three paintings of the valley, from freshly cut to grown back. */
export const VALLEY_STATES = Object.freeze(/** @type {const} */ (['cut', 'mending', 'regrown']));

/**
 * The bands that can join the two starters in the scene, in the order
 * the company is listed. Each has a cut-out and a spot to stand.
 */
export const COMPANY = Object.freeze(['ants', 'bees', 'beaver', 'badger', 'owl', 'bear']);

/**
 * @typedef {{valley: 'cut'|'mending'|'regrown', company: readonly string[]}} TitleState
 */

/**
 * The title of a game not yet begun.
 * @type {Readonly<TitleState>}
 */
export const NEW_TITLE_STATE = Object.freeze({ valley: 'cut', company: Object.freeze([]) });

/**
 * The title's scene for this save. The valley is freshly cut until a
 * level is cleared, mending after that, and regrown once every level
 * is; a cleared id that is not a level counts for nothing. The company
 * is every band the player owns beyond the starters, however it was got.
 * @param {{cleared: Record<string, boolean>, bands: Record<string, unknown>}} progress
 * @param {readonly {id: string}[]} levels
 * @returns {TitleState}
 */
export function titleState(progress, levels) {
  const done = levels.filter((level) => progress.cleared[level.id] === true).length;
  /** @type {TitleState['valley']} */
  let valley = 'cut';
  if (done > 0) valley = done === levels.length ? 'regrown' : 'mending';
  const company = COMPANY.filter((id) => Object.hasOwn(progress.bands, id));
  return { valley, company };
}
