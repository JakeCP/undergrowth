/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {import('../campaign/shop.js').ShopItem} ShopItem */
/** @typedef {import('./portraits.js').PortraitSpec} PortraitSpec */
/** @typedef {'happy'|'sad'|'shrewd'|'greedy'} KeeperMood */
/** @typedef {import('./blink.js').Clock} Clock */

// The trading post (play-feel spec, "Changed after Jake's playtest of the
// full build"): the shop's interior with its keeper and a greeting, then
// every band the player owns and every band for hire, each on the same
// unit card as the deploy screen, with its price and what buying changes
// on the card's foot. Styles are in css/menus.css.
//
// The interior is the painted one (three layers: the back of the shop,
// Hazel's cut-out, the counter in front of her) when both pictures exist,
// else the scene drawn in code (js/ui/shop-scene.js). Her face follows
// what has just happened (keeperMood) for MOOD_MS, wherever she has a
// portrait for that mood, then goes back to her plain portrait, which
// blinks (js/ui/blink.js). Every face stands in the same place, so only
// her expression changes.

import { shopItems } from '../campaign/shop.js';
import { BAND_TYPES } from '../engine/units.js';
import { unitCard, recruitPreview, recruitText } from './unit-info.js';
import { renderUnitCard } from './unit-card.js';
import { drawShopScene, shopGreeting, shopLayers, shortGreeting } from './shop-scene.js';
import { SHOPKEEPER, shopkeeperSpec, portraitFor, blinkFor } from './portraits.js';
import { createBlinker, realClock, whenDecoded, prefersReducedMotion } from './blink.js';
import { SHOP_ASSETS } from './shop-assets.js';
import { iconText } from './icons.js';
import {
  shopKey, focusKind, keyHint, keyListBox, takeKeys, cameByKey, stepToward, focusOn, SHOP_KEY_LIST,
} from './keys.js';

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
 * What buying an item changes, in words.
 * @param {ShopItem} item
 * @param {Progress} progress
 * @returns {string}
 */
export function dealText(item, progress) {
  if (item.kind === 'recruit') return recruitText(recruitPreview(item.type, progress.bands[item.type].maxLen));
  const def = BAND_TYPES[item.type];
  return `${item.label}. They join at length ${def.startLen}.`;
}

/** Seeds in hand at which Hazel greets the player greedily. */
export const GREEDY_SEEDS = 100;
/** How long a face lasts before she goes back to her plain one, in ms. */
export const MOOD_MS = 3000;

/**
 * What has just happened in the shop, for Hazel's face.
 * @typedef {object} ShopMoment
 * @property {Progress} progress  the player's purse and bands now
 * @property {boolean} [sold]  she has just sold the player something
 * @property {boolean} [short]  the player has just tapped something they
 *   cannot afford
 * @property {boolean} [entering]  the player has just walked in and not
 *   tapped anything yet
 * @property {number} [elapsed]  ms since the moment began: the screen was
 *   drawn (the shop opened, or opened again after a sale, with her
 *   greeting as her line) or the player tapped something too dear
 */

/**
 * Hazel's mood. Every face lasts MOOD_MS from the start of the moment,
 * then she is plain (undefined), and blinks. Before that, first match
 * wins: she has just sold something, happy; the player has just tapped
 * something they cannot afford, sad; the player has walked in with
 * GREEDY_SEEDS or more and not tapped yet, greedy; the player can afford
 * at least one thing she offers, shrewd (her pitch, while her line is the
 * offer); else plain. She has no surprised face here: that portrait is
 * for scenes.
 * @param {ShopMoment} moment
 * @returns {KeeperMood|undefined}
 */
export function keeperMood(moment) {
  if ((moment.elapsed ?? 0) >= MOOD_MS) return undefined;
  if (moment.sold === true) return 'happy';
  if (moment.short === true) return 'sad';
  if (moment.entering === true && moment.progress.seeds >= GREEDY_SEEDS) return 'greedy';
  if (shopItems(moment.progress).some((i) => i.available && i.affordable)) return 'shrewd';
  return undefined;
}

/**
 * Hazel's portrait in a mood: her mood image where there is one, else
 * her plain one, else her stamp; labelled as the keeper either way.
 * @param {KeeperMood|undefined} mood
 * @param {readonly string[]} [present]
 * @returns {PortraitSpec}
 */
export function keeperSpec(mood, present) {
  const alt = shopkeeperSpec(present).alt;
  return { ...portraitFor(SHOPKEEPER.id, mood, present), alt };
}

const SCENE_LABEL = `The trading post: ${SHOPKEEPER.name} the squirrel behind the counter, shelves of seeds, a lamp`;

/**
 * The shop's picture: painted when it can be, else drawn. Returns the
 * element, a way to change Hazel's mood in place, and a way to stop her
 * blinking. In the painted shop her plain portrait blinks, when it is
 * showing and has a blink frame, unless `blinker` is null.
 * @param {KeeperMood|undefined} mood
 * @param {Readonly<{interior?: string, counter?: string}>} assets
 * @param {readonly string[]|undefined} present  the portrait ids that exist
 * @param {import('./blink.js').Blinker|null} blinker
 * @returns {{el: Element, setMood: (mood: KeeperMood|undefined) => void}}
 */
function shopPicture(mood, assets, present, blinker) {
  const layers = shopLayers(assets, keeperSpec(mood, present));
  if (layers === null) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'shop-scene');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', SCENE_LABEL);
    drawShopScene(svg, keeperSpec(mood, present));
    return {
      el: svg,
      setMood(next) {
        svg.replaceChildren();
        drawShopScene(svg, keeperSpec(next, present));
      },
    };
  }
  const box = node('div', 'shop-painted');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', SCENE_LABEL);
  /** @param {string} cls @param {string} src */
  const layer = (cls, src) => {
    const img = /** @type {HTMLImageElement} */ (node('img', `shop-painted__layer ${cls}`));
    img.alt = '';
    img.decoding = 'async';
    img.src = src;
    box.appendChild(img);
    return img;
  };
  layer('shop-painted__interior', layers.interior);
  const pct = (/** @type {number} */ n) => `${Math.round(n * 10000) / 100}%`;
  /** @param {HTMLImageElement} img */
  const place = (img) => {
    img.style.left = pct(layers.keeper.left);
    img.style.top = pct(layers.keeper.top);
    img.style.width = pct(layers.keeper.size);
  };
  const keeper = layer('shop-painted__keeper', layers.keeper.href);
  let shown = layers.keeper.href;
  place(keeper);
  keeper.dataset.mood = mood ?? '';
  // Her closed eyes: the same place and size as her face, over it, shown
  // only for a blink and only over her plain portrait.
  const plain = keeperSpec(undefined, present);
  const blinkHref = blinker === null ? null : blinkFor(plain, present);
  /** @type {HTMLImageElement|null} */
  let eyes = null;
  if (blinkHref !== null) {
    eyes = layer('shop-painted__keeper shop-painted__blink', blinkHref);
    place(eyes);
    eyes.style.opacity = '0';
    eyes.addEventListener('error', () => {
      blinker?.remove('keeper');
      eyes?.remove();
      eyes = null;
    });
  }
  layer('shop-painted__counter', layers.counter);
  const plainHref = plain.kind === 'image' ? plain.href : '';
  /** Blinks while her plain portrait shows, once both images are decoded. */
  const blinkIfPlain = () => {
    if (blinker === null) return;
    const shut = eyes;
    if (shut === null || shown !== plainHref) {
      blinker.remove('keeper');
      return;
    }
    if (blinker.has('keeper')) return;
    whenDecoded([keeper, shut]).then(() => {
      if (eyes !== shut || shown !== plainHref || blinker.has('keeper')) return;
      blinker.add('keeper', (closed) => {
        // Drawn over by another screen: stop.
        if (box.isConnected === false) blinker.stop();
        else shut.style.opacity = closed ? '1' : '0';
      });
    }, () => {});
  };
  blinkIfPlain();
  return {
    el: box,
    setMood(next) {
      const spec = keeperSpec(next, present);
      if (spec.kind === 'image' && shown !== spec.href) {
        keeper.src = spec.href;
        shown = spec.href;
      }
      keeper.dataset.mood = next ?? '';
      blinkIfPlain();
    },
  };
}

/**
 * @param {HTMLElement} root
 * @param {{progress: Progress, onBuy: (itemId: string) => void, onBack: () => void,
 *   sold?: boolean, assets?: Readonly<{interior?: string, counter?: string}>,
 *   portraits?: readonly string[], clock?: Clock, reducedMotion?: boolean, chosen?: string}} opts
 *   sold: the screen is drawn again just after a purchase (otherwise the
 *   player has just walked in); chosen: the item just bought, whose
 *   button keeps the keyboard's selection; assets: the painted pictures that exist
 *   (js/ui/shop-assets.js); portraits: the portrait ids that exist
 *   (js/ui/portrait-list.js by default); clock: what her moods and blinks
 *   run on (the page's by default); reducedMotion: no blinking (the
 *   player's setting by default)
 * @returns {void}
 */
export function renderShop(root, opts) {
  const { progress } = opts;
  root.replaceChildren();

  const screen = node('div', 'screen shop-screen');
  root.appendChild(screen);

  const clock = opts.clock ?? realClock();
  const reduced = opts.reducedMotion ?? prefersReducedMotion();
  const blinker = reduced ? null : createBlinker(clock);
  /** @type {ShopMoment} */
  const moment = { progress, sold: opts.sold === true, short: false, entering: opts.sold !== true, elapsed: 0 };
  let since = clock.now();

  const header = node('header', 'screen-header');
  screen.appendChild(header);
  header.appendChild(node('h1', 'screen-title', 'Trading post'));
  header.appendChild(iconText('span', 'seeds', 'seed', progress.seeds));

  const front = node('figure', 'shop-front');
  screen.appendChild(front);
  const picture = shopPicture(keeperMood(moment), opts.assets ?? SHOP_ASSETS, opts.portraits, blinker);
  /** @type {unknown} */
  let timer = null;
  // Her face now, and a timer for when it next changes on its own. Once
  // the screen is gone (another one drawn over it), everything stops.
  const refresh = () => {
    if (timer !== null) clock.clearTimer(timer);
    timer = null;
    if (screen.isConnected === false) {
      blinker?.stop();
      return;
    }
    moment.elapsed = clock.now() - since;
    const mood = keeperMood(moment);
    picture.setMood(mood);
    if (mood !== undefined) timer = clock.setTimer(refresh, Math.max(0, since + MOOD_MS - clock.now()));
  };
  refresh();
  /** A new moment: her face is worked out afresh from now. */
  const begin = () => {
    since = clock.now();
    refresh();
  };
  // The first tap anywhere on the screen ends her greedy look; a tap on
  // something too dear (below) makes her sad before this runs.
  screen.addEventListener('click', () => {
    if (!moment.entering) return;
    moment.entering = false;
    refresh();
  });
  front.appendChild(/** @type {any} */ (picture.el));
  const greeting = node('figcaption', 'shop-greeting ui-panel--parchment');
  greeting.setAttribute('aria-live', 'polite');
  front.appendChild(greeting);
  /** @param {string} line */
  const say = (line) => {
    greeting.replaceChildren(node('strong', 'shop-greeting__name', SHOPKEEPER.name));
    greeting.append(` ${line}`);
  };
  say(shopGreeting(progress));

  /** The buy buttons, in order, with the item each buys. @type {Array<{id: string, btn: HTMLButtonElement}>} */
  const buyButtons = [];
  const items = shopItems(progress);
  const sections = [
    { title: 'Your bands', kind: 'recruit', button: 'Recruit +1' },
    { title: 'For hire', kind: 'type', button: 'Hire' },
  ];
  for (const section of sections) {
    const list = items.filter((i) => i.kind === section.kind);
    if (list.length === 0) continue;
    const box = node('section', 'shop-section');
    screen.appendChild(box);
    box.appendChild(node('h2', 'shop-section__title', section.title));
    const ul = node('div', 'shop-list');
    box.appendChild(ul);
    for (const item of list) {
      const maxLen = item.kind === 'recruit' ? progress.bands[item.type].maxLen : BAND_TYPES[item.type].startLen;
      const row = node('div', 'shop-item');
      row.dataset.item = item.id;
      ul.appendChild(row);
      const card = renderUnitCard(unitCard(item.type, maxLen));
      row.appendChild(card);

      const deal = node('div', 'shop-deal');
      card.appendChild(deal);
      deal.appendChild(node('p', 'shop-deal__text', dealText(item, progress)));
      if (!item.available) continue;
      const price = iconText('span', 'shop-deal__price', 'seed', item.price);
      if (!item.affordable) price.classList.add('is-short');
      deal.appendChild(price);
      // A deal the purse can pay for is the main button; one it cannot
      // is plain wood, and dead (css/ui.css).
      const look = item.affordable ? 'ui-btn--primary' : 'ui-btn--secondary';
      const btn = /** @type {HTMLButtonElement} */ (node('button', `ui-btn ${look} ui-btn--small shop-deal__buy`, section.button));
      btn.type = 'button';
      btn.setAttribute('aria-label', `${section.button}: ${item.label}, ${item.price} seeds`);
      if (item.affordable) {
        btn.addEventListener('click', () => opts.onBuy(item.id));
      } else {
        // Still tappable, so Hazel can say why not; it reads as off.
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('is-short');
        btn.classList.add('is-dead');
        btn.addEventListener('click', () => {
          moment.sold = false;
          moment.short = true;
          moment.entering = false;
          begin();
          say(shortGreeting(item.price, progress.seeds));
        });
      }
      deal.appendChild(btn);
      buyButtons.push({ id: item.id, btn });
    }
  }

  const actions = node('div', 'screen-actions');
  screen.appendChild(actions);
  let left = false;
  const back = /** @type {HTMLButtonElement} */ (node('button', 'ui-btn ui-btn--primary', 'Back to map'));
  back.type = 'button';
  back.appendChild(keyHint('Esc'));
  back.addEventListener('click', () => goBack());
  actions.appendChild(back);

  function goBack() {
    if (left) return;
    left = true;
    stopKeys();
    opts.onBack();
  }

  // --- the keyboard (js/ui/keys.js, shopKey) ---
  //
  // The selection is the focus, on one of the buy buttons: Tab moves it
  // as it always does, the arrows the way they point, and Enter presses
  // the button (a buy, or Hazel's refusal, as a tap). Enter with nothing
  // chosen, or with a focus a click left behind, shows the selection
  // first.

  /** @type {HTMLElement|null} */
  let keysBox = null;
  const toggleKeys = () => {
    if (keysBox !== null) {
      keysBox.remove();
      keysBox = null;
      return;
    }
    keysBox = keyListBox(SHOP_KEY_LIST, { screen: true, onClose: toggleKeys });
    screen.appendChild(keysBox);
  };
  const doc = /** @type {Document|undefined} */ (globalThis.document);
  /** @returns {number} the index of the focused buy button, or -1 */
  const focusedIndex = () => buyButtons.findIndex((b) => b.btn === doc?.activeElement);
  /** @param {number} i */
  const choose = (i) => {
    const target = buyButtons[i];
    if (target === undefined) return;
    // Focus again, so a focus a click left (no ring) shows its ring.
    if (doc?.activeElement === target.btn && typeof target.btn.blur === 'function') target.btn.blur();
    focusOn(target.btn);
  };
  const stopKeys = takeKeys((evt) => {
    if (left) return;
    const command = shopKey(evt, { focus: focusKind(doc?.activeElement) });
    if (command === null) return;
    evt.preventDefault();
    if (command === 'help') {
      toggleKeys();
      return;
    }
    if (command === 'back') {
      if (keysBox !== null) toggleKeys();
      else goBack();
      return;
    }
    const at = focusedIndex();
    if (at < 0 || command === 'main') {
      // Nothing chosen yet (or chosen by a click): show the selection.
      choose(Math.max(0, at));
      return;
    }
    const centres = buyButtons.map((b) => {
      const r = b.btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let to = stepToward(centres, at, command);
    // One card to a row (a phone): left and right go back and on too.
    if (to === null && command === 'left' && at > 0) to = at - 1;
    if (to === null && command === 'right' && at < buyButtons.length - 1) to = at + 1;
    if (to !== null) choose(to);
  });

  // A player who came by keyboard finds the selection on the first thing
  // for sale, or, just after a purchase, still on what they bought.
  if (cameByKey() && buyButtons.length > 0) {
    const again = opts.chosen === undefined ? -1 : buyButtons.findIndex((b) => b.id === opts.chosen);
    choose(again >= 0 ? again : 0);
  }
}
