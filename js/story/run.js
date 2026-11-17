// Plays the scenes due at a moment (opening-act plan, Task 6). The scenes
// are applied to the progress, which saves it, before any is shown: so a
// band a scene gives, and the mark that it was seen, survive a reload in
// the middle of a scene, and skipping one costs nothing.
//
// No DOM here: the caller hands in how to read and save the progress and
// how to show a scene (in the game, js/ui/scene-view.js's playScene).

/** @typedef {import('./types.js').Scene} Scene */
/** @typedef {import('./types.js').Moment} Moment */
/** @typedef {import('./types.js').Pointer} Pointer */
/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {{x: number, y: number, width: number, height: number}} Rect */
/**
 * @typedef {{
 *   scenes: Scene[],
 *   getProgress: () => Progress,
 *   setProgress: (p: Progress) => void,
 *   play: (scene: Scene, opts: {resolve?: (p: Pointer) => Rect|null}) => Promise<unknown>,
 *   resolve?: (p: Pointer) => Rect|null,
 * }} RunContext
 */

import { dueScenes, applyScene } from './story.js';

/**
 * Plays every scene due at `moment`, in data order and one at a time.
 * Before the first is shown, every due scene is applied and saved in one
 * go (`setProgress`): so what a later scene of the same moment gives is
 * not lost if the game is closed during an earlier one (o02's win: the
 * ants join in the scene after the fox is convinced). Then each is
 * shown: `await play(scene, {resolve})`. A second call for the same
 * moment finds the scenes already seen and plays nothing, so two calls
 * never show a scene twice. A scene that fails to show has still been
 * given and marked seen, and the scenes after it still play.
 * @param {Moment} moment
 * @param {RunContext} ctx
 * @returns {Promise<number>} how many scenes were shown
 */
export async function runScenes(moment, ctx) {
  const due = dueScenes(ctx.scenes, moment, ctx.getProgress());
  if (due.length === 0) return 0;
  let progress = ctx.getProgress();
  for (const scene of due) progress = applyScene(progress, scene);
  ctx.setProgress(progress);
  for (const scene of due) {
    try {
      await ctx.play(scene, ctx.resolve === undefined ? {} : { resolve: ctx.resolve });
    } catch {
      // Already given and marked seen: go on to the next scene.
    }
  }
  return due.length;
}
