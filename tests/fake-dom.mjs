// A tiny fake DOM for board tests: only what js/ui/board.js,
// js/ui/svg.js and js/ui/motion-player.js call. `installFakeDom` sets
// globalThis.document.
//
// querySelector and querySelectorAll understand only what the board's
// selectors use (js/ui/look.js): a tag name and [attr] or [attr="value"]
// tests, joined by a space (any descendant) or by " > " (a child).
// animate() records each call and returns a fake Animation.
//
// For mounting a whole screen (js/ui/battle-view.js) it also has events
// (capture, target, bubble, stopPropagation), classList, dataset, text
// nodes from append('text'), and a 320 by 320 bounding box.

/**
 * @param {string} part
 * @returns {(el: FakeEl) => boolean}
 */
function compound(part) {
  const tag = /^[a-zA-Z]+/.exec(part);
  const attrs = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((m) => [m[1], m[2]]);
  return (el) => (tag === null || el.tag === tag[0])
    && attrs.every(([k, v]) => el.attrs[k] !== undefined && (v === undefined || el.attrs[k] === v));
}

/**
 * @param {string} selector
 * @returns {Array<{child: boolean, test: (el: FakeEl) => boolean}>}  left to right; `child` is the
 *   combinator before that part
 */
function parseSelector(selector) {
  const out = [];
  let child = false;
  for (const part of selector.trim().split(/\s+/)) {
    if (part === '>') {
      child = true;
      continue;
    }
    out.push({ child, test: compound(part) });
    child = false;
  }
  return out;
}

/**
 * @param {FakeEl} el
 * @param {ReturnType<typeof parseSelector>} chain
 * @param {number} i  the part `el` must match
 * @returns {boolean}
 */
function matchesFrom(el, chain, i) {
  if (!chain[i].test(el)) return false;
  if (i === 0) return true;
  if (chain[i].child) return el.parent !== null && matchesFrom(el.parent, chain, i - 1);
  for (let up = el.parent; up !== null; up = up.parent) {
    if (matchesFrom(up, chain, i - 1)) return true;
  }
  return false;
}

/** A fake Animation: what was asked for, and whether it was cancelled. */
export class FakeAnimation {
  /** @param {FakeEl} target @param {object[]} keyframes @param {Record<string, unknown>} options */
  constructor(target, keyframes, options) {
    this.target = target;
    this.keyframes = keyframes;
    this.options = options;
    this.cancelled = false;
    this.currentTime = 0;
    /** @type {(() => void)|null} */
    this.onfinish = null;
    /** @type {(() => void)|null} */
    this.oncancel = null;
  }

  cancel() {
    this.cancelled = true;
    this.oncancel?.();
  }
}

export class FakeEl {
  /** @param {string} tag */
  constructor(tag) {
    this.tag = tag;
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {FakeEl[]} */
    this.children = [];
    /** @type {FakeEl|null} */
    this.parent = null;
    this.textContent = '';
    /** @type {Record<string, any>} */
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.className = '';
    /** @type {FakeAnimation[]} */
    this.animations = [];
    /** @type {Record<string, string>} */
    this.dataset = {};
    this.disabled = false;
    /** @type {Array<{type: string, fn: Function, capture: boolean}>} */
    this.listeners = [];
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : force;
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  get childNodes() { return this.children; }

  get parentElement() { return this.parent; }

  get tagName() { return this.tag.toUpperCase(); }

  get offsetWidth() { return 0; }

  get offsetHeight() { return 0; }

  getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 320 }; }

  /** @param {string} type @param {Function} fn @param {boolean|{capture?: boolean}} [opts] */
  addEventListener(type, fn, opts) {
    const capture = opts === true || (typeof opts === 'object' && opts !== null && opts.capture === true);
    this.listeners.push({ type, fn, capture });
  }

  /**
   * Dispatches a fake event: capture listeners from the top down, then
   * the target's own, then bubbling back up.
   * @param {string} type
   * @param {Record<string, unknown>} [props]
   */
  dispatch(type, props = {}) {
    let stopped = false;
    const evt = {
      type, target: this, ...props,
      stopPropagation() { stopped = true; },
      preventDefault() {},
    };
    const path = [];
    for (let n = this; n !== null; n = n.parent) path.unshift(n);
    const run = (node, capture) => {
      for (const l of [...node.listeners]) {
        if (l.type === type && (node === this || l.capture === capture)) l.fn(evt);
      }
    };
    for (const node of path.slice(0, -1)) {
      run(node, true);
      if (stopped) return evt;
    }
    if (!(type === 'click' && this.disabled)) run(this, false);
    for (const node of path.slice(0, -1).reverse()) {
      if (stopped) return evt;
      run(node, false);
    }
    return evt;
  }

  /** @param {object[]} keyframes @param {Record<string, unknown>} options */
  animate(keyframes, options) {
    const anim = new FakeAnimation(this, keyframes, options);
    this.animations.push(anim);
    return anim;
  }

  /** @param {FakeEl} child @param {FakeEl|null} ref */
  insertBefore(child, ref) {
    if (ref === null || ref.parent !== this) return this.appendChild(child);
    child.remove();
    child.parent = this;
    this.children.splice(this.children.indexOf(ref), 0, child);
    return child;
  }

  get nextSibling() {
    if (this.parent === null) return null;
    const siblings = this.parent.children;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  /** @param {...(FakeEl|string)} nodes */
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const text = new FakeEl('#text');
        text.textContent = node;
        this.appendChild(text);
      } else {
        this.appendChild(node);
      }
    }
  }

  /** All the text under this node, as the page would show it. */
  get text() {
    return this.textContent + this.children.map((c) => c.text).join('');
  }

  /** @param {string} selector */
  querySelectorAll(selector) {
    const chain = parseSelector(selector);
    return this.all().filter((el) => matchesFrom(el, chain, chain.length - 1));
  }

  /** @param {string} selector */
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs[k] = v; }

  /** @param {string} k */
  getAttribute(k) { return this.attrs[k] ?? null; }

  /** @param {FakeEl} child */
  appendChild(child) {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parent === null) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  /** @param {...(FakeEl|string)} nodes */
  replaceChildren(...nodes) {
    for (const c of [...this.children]) c.remove();
    this.append(...nodes);
  }

  /** @returns {FakeEl[]} */
  all() {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }

  /**
   * The first descendant with this attribute (and value, if given).
   * @param {string} k
   * @param {string} [v]
   * @returns {FakeEl|undefined}
   */
  find(k, v) {
    return this.all().find((n) => n.attrs[k] !== undefined && (v === undefined || n.attrs[k] === v));
  }

  /**
   * Every descendant with this attribute (and value, if given).
   * @param {string} k
   * @param {string} [v]
   * @returns {FakeEl[]}
   */
  findAll(k, v) {
    return this.all().filter((n) => n.attrs[k] !== undefined && (v === undefined || n.attrs[k] === v));
  }
}

/** A fake 2D canvas that draws something, so silhouettes come out as images. */
function fakeCanvas() {
  const ctx = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '', globalCompositeOperation: 'source-over',
    fillText() {},
    fillRect() {},
    getImageData(_x, _y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      data[3] = 255;
      return { data, width: w, height: h };
    },
  };
  return {
    width: 0,
    height: 0,
    getContext: (kind) => (kind === '2d' ? ctx : null),
    toDataURL: () => 'data:image/png;base64,SILHOUETTE',
  };
}

/**
 * @param {{canvas?: boolean}} [opts]  canvas: whether document.createElement
 *   makes a working canvas (by default there is no createElement at all)
 * @returns {void}
 */
export function installFakeDom(opts = {}) {
  /** @type {Record<string, unknown>} */
  const doc = { createElementNS: (_ns, tag) => new FakeEl(tag) };
  if (opts.canvas) doc.createElement = (tag) => (tag === 'canvas' ? fakeCanvas() : new FakeEl(tag));
  globalThis.document = /** @type {any} */ (doc);
}
