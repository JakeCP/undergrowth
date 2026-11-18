/** @typedef {import('./engine/types.js').Level} Level */
/** @typedef {import('./engine/types.js').Progress} Progress */
/** @typedef {import('./story/types.js').Moment} Moment */

import { createBattle, rewardFor } from './engine/battle.js';
import { loadProgress, saveProgress, applyVictory, withSettings } from './campaign/progress.js';
import { buy } from './campaign/shop.js';
import { LEVELS } from '../data/levels/index.js';
import { mountBattle } from './ui/battle-view.js';
import { renderMap } from './ui/map-view.js';
import { renderDeploy } from './ui/deploy-view.js';
import { renderShop } from './ui/shop-view.js';
import { renderResult } from './ui/result-view.js';
import { silhouettes } from './ui/silhouettes.js';
import { fieldBake } from './ui/field-bake.js';
import { groundPattern, SURFACE_GROUND } from './ui/patterns.js';
import { createSound } from './ui/sound.js';
import { renderTitle } from './ui/title-view.js';
import { titleState } from './ui/title-state.js';
import { createMusic, trackFor } from './ui/music.js';
import { BAND_TYPES } from './engine/units.js';
import { runScenes } from './story/run.js';
import { SCENES } from '../data/story/index.js';
import { playScene } from './ui/scene-view.js';
import { watchInput, takeKeys } from './ui/keys.js';
import { applyKit, PRESSABLE } from './ui/ui-kit.js';

// The painted interface kit: every button, panel and banner is drawn
// from its painted piece where one exists (css/ui.css).
applyKit(document.documentElement);

const root = document.getElementById('app');
if (root === null) throw new Error('#app is missing');
const app = root;

let progress = loadProgress();

/**
 * Every change to the progress made by a scene goes through here, so it
 * is saved at once: a scene's gifts and its seen mark are on disk before
 * the scene is shown.
 * @param {Progress} p
 * @returns {void}
 */
function setProgress(p) {
  progress = p;
  saveProgress(progress);
}

/** @type {import('./story/run.js').RunContext} */
const story = {
  scenes: SCENES,
  getProgress: () => progress,
  setProgress,
  // A scene that cannot be shown is still given (runScenes saved it first).
  play: (scene, opts) => playScene(scene, opts).catch((err) => {
    console.error(err);
    return 'skipped';
  }),
};

/**
 * Plays the scenes due at `moment` over whatever is on screen.
 * @param {Moment} moment
 * @returns {Promise<number>}
 */
function scenesAt(moment) {
  return runScenes(moment, story);
}

/**
 * Plays the scenes due at `moment` over a screen that is still arriving
 * (the result screen): they are given and saved at once, as everywhere,
 * but each is shown only once `ready` settles, so it opens over a
 * finished, steady screen.
 * @param {Moment} moment
 * @param {Promise<void>} ready
 * @returns {Promise<number>}
 */
function scenesWhen(moment, ready) {
  return runScenes(moment, { ...story, play: (scene, opts) => ready.then(() => story.play(scene, opts)) });
}

/**
 * Plays the scenes due at `moment` over a screen that shows the progress
 * (the map, the shop), and draws that screen again if a scene gave
 * something, so the seeds and bands on it are current.
 * @param {Moment} moment
 * @param {() => void} redraw  draws the screen without asking for scenes
 * @returns {void}
 */
function scenesOver(moment, redraw) {
  const before = progress;
  void scenesAt(moment).then(() => {
    const gave = progress.seeds !== before.seeds
      || JSON.stringify(progress.bands) !== JSON.stringify(before.bands);
    if (gave) redraw();
  });
}

// Sound effects, silent unless the saved soundOn setting is on. Browsers
// only let audio start from a tap, so it is switched on at the first one.
// Which kind of input came last, and no held Enter pressing a button
// again and again (js/ui/keys.js).
watchInput();

const sound = createSound();
const music = createMusic();
document.addEventListener('pointerdown', () => {
  sound.setOn(progress.soundOn === true);
  music.setOn(progress.soundOn === true);
}, { once: true, capture: true });
// A short wooden tock when a button of the painted kit is pressed
// (css/ui.css, PRESSABLE); silent unless sound is on, like every effect.
document.addEventListener('click', (evt) => {
  const target = /** @type {Element|null} */ (evt.target instanceof Element ? evt.target : null);
  const btn = target?.closest(PRESSABLE);
  if (btn instanceof HTMLButtonElement && !btn.disabled) sound.play('press');
}, { capture: true });
// The title theme loops: it must not play on behind another app or a
// locked phone. It comes back when the game is in front again.
document.addEventListener('visibilitychange', () => {
  music.setHidden(document.visibilityState === 'hidden');
});

/**
 * @param {string} id
 * @returns {Level}
 */
function levelById(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (level === undefined) throw new Error(`unknown level "${id}"`);
  return level;
}

// The title shows once on each cold start, before the map. It does
// not come back when the player returns to the map.
function showTitle() {
  music.play(trackFor('title'));
  renderTitle(app, {
    // Who has joined and how the valley is mending, from the save.
    state: titleState(progress, LEVELS),
    hasSave: Object.values(progress.cleared).some((v) => v === true) || progress.seeds > 0,
    soundOn: progress.soundOn === true,
    onSound: (next) => {
      progress = withSettings(progress, { soundOn: next });
      saveProgress(progress);
      sound.setOn(next);
      music.setOn(next);
    },
    onStart: () => {
      music.stop();
      showMap();
    },
  });
}

function showMap() {
  drawMap();
  scenesOver({ when: 'map' }, drawMap);
}

function drawMap() {
  renderMap(app, {
    progress,
    onLevel: (id) => chooseLevel(levelById(id)),
    onShop: () => showShop(),
  });
}

function showShop() {
  drawShop();
  scenesOver({ when: 'shop' }, drawShop);
}

/**
 * @param {boolean} [sold]  drawn again just after a purchase, so Hazel
 *   looks happy; otherwise the player has just walked in
 * @param {string} [chosen]  the item just bought, which keeps the
 *   keyboard's selection
 */
function drawShop(sold = false, chosen = undefined) {
  renderShop(app, {
    progress,
    sold,
    ...(chosen !== undefined ? { chosen } : {}),
    onBuy: (itemId) => {
      progress = buy(progress, itemId);
      saveProgress(progress);
      drawShop(true, itemId);
    },
    onBack: () => showMap(),
  });
}

/**
 * A level has been chosen: its `before` scenes play over the screen it
 * was chosen from, then the deploy screen opens, so a band a scene has
 * just given can be deployed.
 * @param {Level} level
 * @returns {void}
 */
function chooseLevel(level) {
  void scenesAt({ when: 'before', level: level.id }).then(() => showDeploy(level));
}

/**
 * @param {Level} level
 * @returns {void}
 */
function showDeploy(level) {
  renderDeploy(app, {
    level,
    progress,
    onStart: (deployments) => {
      mountBattle(app, {
        level,
        state: createBattle(level, deployments, progress),
        onFinish: (final) => {
          if (final.outcome === 'won') {
            const reward = rewardFor(final, level, progress);
            progress = applyVictory(progress, level.id, reward);
            saveProgress(progress);
            // A scene of the win opens once the result screen is steady.
            const ready = renderResult(app, {
              level,
              final,
              reward,
              onMap: () => showMap(),
              onReplay: () => chooseLevel(level),
            });
            void scenesWhen({ when: 'won', level: level.id }, ready);
          } else {
            const ready = renderResult(app, {
              level,
              final,
              reward: null,
              onMap: () => showMap(),
              onReplay: () => chooseLevel(level),
            });
            void scenesWhen({ when: 'lost', level: level.id }, ready);
          }
        },
        onQuit: () => showMap(),
        botSpeed: progress.botSpeed ?? 'normal',
        soundOn: progress.soundOn === true,
        sound,
        // The settings control on the battle screen. It calls this from
        // inside the tap, so turning sound on is allowed to start audio.
        onSettings: (next) => {
          progress = withSettings(progress, next);
          saveProgress(progress);
          sound.setOn(progress.soundOn === true);
        },
        // The story in the battle: each moment's scenes, over the board.
        // won and lost are not asked for here; onFinish plays them.
        onMoment: (moment, resolve) => runScenes(moment, { ...story, resolve }).then(() => {}),
        // The same reward onFinish pays, shown counting up over the board.
        rewardOf: (final) => rewardFor(final, level, progress),
      });
    },
    onBack: () => showMap(),
  });
}

// Draw every unit's white silhouette once, so no head on the board needs
// a live SVG filter. Without a canvas the board shows the plain glyphs.
silhouettes.prepare(Object.values(BAND_TYPES).map((def) => def.glyph));

// Bake the grass field (the plain grass and its soft patches) into one
// picture, so the board fills its grass from a single image instead of
// replaying every masked patch on each repaint (js/ui/field-bake.js).
const grassField = groundPattern(SURFACE_GROUND.grass);
if (grassField.layers.length > 0) fieldBake.prepare(grassField);

// The test ground (lab/): a developer's screen for trying any level
// under trial rules, opened by ending the address with #lab. The public
// build has no lab/ (scripts/export-public.sh) and it is never precached
// (sw.js), so it is loaded only when asked for. The paths are held here
// and handed to import() as variables, not written inside import(...),
// so tsc does not try to resolve them in a copy that has no lab/.
const LAB_HASH = '#lab';
const LAB_MODULE = '../lab/lab.js';
const LAB_LEVELS_MODULE = '../lab/levels/index.js';

/** True from the moment the test ground is asked for until it is left. */
let labShowing = false;

/**
 * Opens the test ground over whatever is on screen. If it cannot be
 * loaded (the public build), the title shows instead.
 * @returns {void}
 */
function showLab() {
  labShowing = true;
  // Nothing of the screen it replaces carries on under it: not the title
  // theme, and not that screen's keys (the list takes none of its own).
  music.stop();
  takeKeys(() => {});
  Promise.all([import(LAB_MODULE), import(LAB_LEVELS_MODULE)])
    .then(([lab, labLevels]) => {
      // Left again before it had loaded.
      if (!labShowing) return;
      lab.openLab(app, {
        levels: LEVELS,
        labLevels: labLevels.LAB_LEVELS,
        settings: () => ({ botSpeed: progress.botSpeed ?? 'normal', soundOn: progress.soundOn === true }),
        sound,
        // The battle's settings control, as in showDeploy: the only thing
        // the test ground ever saves.
        onSettings: (/** @type {import('./campaign/progress.js').Settings} */ next) => {
          progress = withSettings(progress, next);
          saveProgress(progress);
          sound.setOn(progress.soundOn === true);
        },
        onExit: () => {
          history.replaceState(null, '', location.pathname + location.search);
          leaveLab();
        },
      });
    })
    .catch((err) => {
      console.error(err);
      if (labShowing) leaveLab();
    });
}

/** Leaves the test ground for the title, as on a cold start. */
function leaveLab() {
  labShowing = false;
  showTitle();
}

window.addEventListener('hashchange', () => {
  if (location.hash === LAB_HASH) {
    if (!labShowing) showLab();
  } else if (labShowing) {
    leaveLab();
  }
});

if (location.hash === LAB_HASH) showLab();
else showTitle();

try { navigator.serviceWorker?.register('sw.js')?.catch(() => {}); } catch {}
