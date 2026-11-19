// The "new version" notice. The service worker (sw.js) installs a new
// version in the background and takes the open page over at once
// (skipWaiting + clients.claim), but the page keeps running the code it
// loaded until it is reloaded. So when a new worker takes over a page an
// older one already controlled, a small notice offers to refresh now.
// It never reloads by itself: a battle in progress would be lost.
//
// A browser looks for a new sw.js only when a page loads, and a phone
// keeps a tab open for days, so the worker is also asked to check again
// whenever the page comes back into view.

/**
 * The parts of navigator.serviceWorker this uses.
 * @typedef {{
 *   controller: object|null,
 *   addEventListener: (type: string, fn: () => void) => void,
 *   register: (url: string) => Promise<{update: () => Promise<unknown>}>,
 * }} WorkerContainer
 */

/**
 * The parts of document this uses.
 * @typedef {{
 *   body: {appendChild: (node: any) => unknown},
 *   createElement: (tag: string) => any,
 *   visibilityState?: string,
 *   addEventListener: (type: string, fn: () => void) => void,
 * }} NoticeDocument
 */

/** What the notice says. */
export const UPDATE_TEXT = 'A new version of Undergrowth is ready.';
/** Its button. */
export const UPDATE_BUTTON = 'Refresh now';

/**
 * Registers the service worker, checks for a new version whenever the
 * page comes back into view, and shows the notice when a new version
 * takes over this page. Does nothing where there are no service workers.
 * @param {{sw?: WorkerContainer|undefined, doc?: NoticeDocument, reload?: () => void, url?: string}} [deps]
 * @returns {void}
 */
export function watchForUpdates(deps = {}) {
  const sw = 'sw' in deps ? deps.sw : globalThis.navigator?.serviceWorker;
  const doc = deps.doc ?? /** @type {NoticeDocument} */ (/** @type {unknown} */ (globalThis.document));
  const reload = deps.reload ?? (() => globalThis.location.reload());
  if (sw === undefined || sw === null) return;
  // A first visit has no worker yet: the one it installs takes the page
  // over too, and that is not a new version.
  let controlled = sw.controller !== null && sw.controller !== undefined;
  /** @type {any} */
  let notice = null;
  sw.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (notice === null) notice = showNotice(doc, reload);
  });
  /** @type {{update: () => Promise<unknown>}|null} */
  let registration = null;
  try {
    sw.register(deps.url ?? 'sw.js')
      .then((reg) => { registration = reg; })
      .catch(() => {});
  } catch {
    return;
  }
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible' || registration === null) return;
    registration.update().catch(() => {});
  });
}

/**
 * The notice: a wooden strip along the top of the screen with the news
 * and a Refresh now button.
 * @param {NoticeDocument} doc
 * @param {() => void} reload
 * @returns {any}
 */
function showNotice(doc, reload) {
  const box = doc.createElement('div');
  box.className = 'update-notice ui-panel--wood';
  box.setAttribute('role', 'status');
  const text = doc.createElement('p');
  text.className = 'update-notice__text';
  text.textContent = UPDATE_TEXT;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'update-notice__btn ui-btn ui-btn--primary ui-btn--small';
  button.textContent = UPDATE_BUTTON;
  button.addEventListener('click', () => reload());
  box.appendChild(text);
  box.appendChild(button);
  doc.body.appendChild(box);
  return box;
}
