// Undergrowth — offline service worker. Precaches the app shell so an
// installed copy opens with no network. Modelled on augury's sw.js:
//
// - Navigations are network-first with a cache fallback (index.html):
//   online players always get the current page; the cache is only a
//   fallback.
// - Everything else is cache-first from the versioned cache, falling
//   back to the network on a miss. Precached files are never rewritten
//   in place, so a version changes atomically when APP_VERSION changes
//   and no mixed-version module graph can be assembled.
//
// VERSIONING: bump APP_VERSION whenever any precached file changes,
// then run `npm run precache-hash` to refresh precache-hash.txt.
// (`node scripts/textures.mjs` and `node scripts/portraits.mjs` do both
// themselves when they change shipped files, which they list at the end
// of PRECACHE_URLS.)
// The browser byte-diffs sw.js, installs the new worker, precaches
// into the new cache name and — on activate — deletes every older
// cache (skipWaiting + clients.claim: no waiting-worker prompt).
const APP_VERSION = '77';
const CACHE_NAME = `undergrowth-v${APP_VERSION}`;

// Relative to the worker's scope ("./" = repo root on Pages).
// tests/pwa.test.mjs asserts every entry exists in the repo: a 404 in
// cache.addAll fails the whole install, so a typo here means no offline.
const PRECACHE_URLS = [
  './',
  'index.html',
  'css/game.css',
  'css/map.css',
  'css/menus.css',
  'css/scene.css',
  'css/title.css',
  'css/result.css',
  'css/ui.css',
  'data/campaign.js',
  'data/levels/index.js',
  'data/levels/o01.js',
  'data/levels/o02.js',
  'data/levels/l01.js',
  'data/levels/l02.js',
  'data/levels/l03.js',
  'data/levels/l04.js',
  'data/levels/l05.js',
  'data/story/common.js',
  'data/story/index.js',
  'data/story/opening.js',
  'data/story/valley.js',
  'fonts/eb-garamond-italic.woff2',
  'fonts/eb-garamond.woff2',
  'js/app.js',
  'js/campaign/campaign.js',
  'js/campaign/progress.js',
  'js/campaign/shop.js',
  'js/engine/actions.js',
  'js/engine/band.js',
  'js/engine/battle.js',
  'js/engine/dash.js',
  'js/engine/bots.js',
  'js/engine/grid.js',
  'js/engine/lanes.js',
  'js/engine/terrain.js',
  'js/engine/types.js',
  'js/engine/units.js',
  'js/engine/works.js',
  'js/story/moments.js',
  'js/story/run.js',
  'js/story/story.js',
  'js/story/types.js',
  'js/ui/anim-steps.js',
  'js/ui/battle-focus.js',
  'js/ui/battle-view.js',
  'js/ui/board-assets.js',
  'js/ui/board-pieces.js',
  'js/ui/blink.js',
  'js/ui/board.js',
  'js/ui/deploy-view.js',
  'js/ui/finale.js',
  'js/ui/icons.js',
  'js/ui/keys.js',
  'js/ui/links.js',
  'js/ui/look.js',
  'js/ui/map-assets.js',
  'js/ui/map-layout.js',
  'js/ui/map-view.js',
  'js/ui/menu-layout.js',
  'js/ui/motion-player.js',
  'js/ui/motion.js',
  'js/ui/music.js',
  'js/ui/patterns.js',
  'js/ui/piece-motion.js',
  'js/ui/pieces.js',
  'js/ui/plans.js',
  'js/ui/portrait-list.js',
  'js/ui/portraits.js',
  'js/ui/result-view.js',
  'js/ui/scene-view.js',
  'js/ui/shop-assets.js',
  'js/ui/shop-scene.js',
  'js/ui/shop-view.js',
  'js/ui/silhouettes.js',
  'js/ui/field-bake.js',
  'js/ui/sound.js',
  'js/ui/stakes.js',
  'js/ui/svg.js',
  'js/ui/text.js',
  'js/ui/texture-list.js',
  'js/ui/title-assets.js',
  'js/ui/title-scene.js',
  'js/ui/title-state.js',
  'js/ui/title-view.js',
  'js/ui/turn-banner.js',
  'js/ui/turn-state.js',
  'js/ui/ui-assets.js',
  'js/ui/ui-kit.js',
  'js/ui/unit-card.js',
  'js/ui/unit-info.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'assets/map/map-01-home-wood.webp',
  'assets/map/map-02-cut-valley.webp',
  'assets/map/markers/home-camp.webp',
  'assets/map/markers/l01-clearing-edge.webp',
  'assets/map/markers/l02-brook-bends.webp',
  'assets/map/markers/l03-dry-stone-wall.webp',
  'assets/map/markers/l04-snare-pit.webp',
  'assets/map/markers/l05-stone-yard.webp',
  'assets/map/markers/mist.webp',
  'assets/map/markers/o01-mown-strip.webp',
  'assets/map/markers/o02-ant-hill.webp',
  'assets/map/markers/sapling.webp',
  'assets/map/markers/stake.webp',
  'assets/map/markers/trading-post.webp',
  'assets/ui/den.webp',
  'assets/ui/forest.webp',
  'assets/ui/seed.webp',
  'assets/shop/shop-counter.webp',
  'assets/shop/shop-interior.webp',
  'assets/board/dam.webp',
  'assets/board/den-anthill-damaged.webp',
  'assets/board/den-anthill.webp',
  'assets/board/den-burrow-damaged.webp',
  'assets/board/den-burrow.webp',
  'assets/board/den-hive-damaged.webp',
  'assets/board/den-hive.webp',
  'assets/board/den-nest-damaged.webp',
  'assets/board/den-nest.webp',
  'assets/board/fern.webp',
  'assets/board/flowers-violet.webp',
  'assets/board/flowers-white.webp',
  'assets/board/forest-birches.webp',
  'assets/board/forest-bushes.webp',
  'assets/board/forest-mixed.webp',
  'assets/board/forest-pines.webp',
  'assets/board/hole.webp',
  'assets/board/mushrooms.webp',
  'assets/board/permit.webp',
  'assets/board/stones-1.webp',
  'assets/board/stones-2.webp',
  'assets/board/stump.webp',
  'assets/kit/action-bite.webp',
  'assets/kit/action-build.webp',
  'assets/kit/action-dig.webp',
  'assets/kit/action-maul.webp',
  'assets/kit/action-ram.webp',
  'assets/kit/action-shove.webp',
  'assets/kit/action-sting.webp',
  'assets/kit/action-strike.webp',
  'assets/kit/backdrop.webp',
  'assets/kit/button-primary.webp',
  'assets/kit/button-round.webp',
  'assets/kit/button-secondary.webp',
  'assets/kit/panel-parchment.webp',
  'assets/kit/panel-wood.webp',
  'assets/kit/result-defeat.webp',
  'assets/kit/result-victory.webp',
  'assets/kit/ribbon-green.webp',
  'assets/kit/ribbon-rust.webp',
  'assets/portraits/ants.webp',
  'assets/portraits/ants-blink.webp',
  'assets/portraits/badger.webp',
  'assets/portraits/badger-angry.webp',
  'assets/portraits/badger-blink.webp',
  'assets/portraits/badger-happy.webp',
  'assets/portraits/badger-sad.webp',
  'assets/portraits/badger-scared.webp',
  'assets/portraits/badger-surprised.webp',
  'assets/portraits/bear.webp',
  'assets/portraits/bear-angry.webp',
  'assets/portraits/bear-blink.webp',
  'assets/portraits/bear-happy.webp',
  'assets/portraits/bear-sad.webp',
  'assets/portraits/bear-scared.webp',
  'assets/portraits/bear-surprised.webp',
  'assets/portraits/beaver.webp',
  'assets/portraits/beaver-angry.webp',
  'assets/portraits/beaver-blink.webp',
  'assets/portraits/beaver-happy.webp',
  'assets/portraits/beaver-sad.webp',
  'assets/portraits/beaver-scared.webp',
  'assets/portraits/beaver-surprised.webp',
  'assets/portraits/bees.webp',
  'assets/portraits/fox.webp',
  'assets/portraits/fox-angry.webp',
  'assets/portraits/fox-blink.webp',
  'assets/portraits/fox-happy.webp',
  'assets/portraits/fox-sad.webp',
  'assets/portraits/fox-scared.webp',
  'assets/portraits/fox-surprised.webp',
  'assets/portraits/harvester.webp',
  'assets/portraits/hedgehog.webp',
  'assets/portraits/hedgehog-angry.webp',
  'assets/portraits/hedgehog-blink.webp',
  'assets/portraits/hedgehog-happy.webp',
  'assets/portraits/hedgehog-sad.webp',
  'assets/portraits/hedgehog-scared.webp',
  'assets/portraits/hedgehog-surprised.webp',
  'assets/portraits/owl.webp',
  'assets/portraits/owl-blink.webp',
  'assets/portraits/planter.webp',
  'assets/portraits/saw.webp',
  'assets/portraits/shopkeeper.webp',
  'assets/portraits/shopkeeper-blink.webp',
  'assets/portraits/shopkeeper-greedy.webp',
  'assets/portraits/shopkeeper-happy.webp',
  'assets/portraits/shopkeeper-sad.webp',
  'assets/portraits/shopkeeper-shrewd.webp',
  'assets/portraits/shopkeeper-surprised.webp',
  'assets/title/title-arch-tall.webp',
  'assets/title/title-arch-wide.webp',
  'assets/title/title-cast-ants.webp',
  'assets/title/title-cast-badger.webp',
  'assets/title/title-cast-bear.webp',
  'assets/title/title-cast-beaver.webp',
  'assets/title/title-cast-bees.webp',
  'assets/title/title-cast-heroes.webp',
  'assets/title/title-cast-owl.webp',
  'assets/title/title-theme.mp3',
  'assets/title/title-valley-cut-tall.webp',
  'assets/title/title-valley-cut-wide.webp',
  'assets/title/title-valley-mending-tall.webp',
  'assets/title/title-valley-mending-wide.webp',
  'assets/title/title-valley-regrown-tall.webp',
  'assets/title/title-valley-regrown-wide.webp',
  'assets/title/title-wordmark.webp',
  'assets/textures/bank.webp',
  'assets/textures/grass.webp',
  'assets/textures/grass-clover.webp',
  'assets/textures/grass-lush.webp',
  'assets/textures/meadow.webp',
  'assets/textures/paving.webp',
  'assets/textures/soil.webp',
  'assets/textures/stone.webp',
  'assets/textures/stubble.webp',
  'assets/textures/water.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function putIfOk(cache, request, response) {
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

// Navigations: online gets the current page, offline falls back to the
// cached request or index.html. Fallback matching ignores the search
// string so a precached path answers a versioned fetch when offline.
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    return await putIfOk(cache, request, await fetch(request));
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (fallbackUrl ? cache.match(fallbackUrl) : Response.error());
  }
}

// A media element asks for its file in byte ranges, and Safari will not
// play one that is answered with the whole file and status 200: the
// title theme would be silent in the installed game. So a request with
// a Range header is answered from the cached copy with just those
// bytes, as 206 Partial Content. A range this cannot read (several
// ranges in one header) gets the whole file.
async function ranged(request, response) {
  const header = request.headers.get('range');
  if (header === null || response.status !== 200) return response;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null || (m[1] === '' && m[2] === '')) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  // "bytes=-N" is the last N bytes; "bytes=A-" runs to the end.
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

// Everything else in scope: the versioned cache first, the network
// only on a miss. A miss is served from the network but never written
// back, so precached files cannot be half-updated in place.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return ranged(request, hit);
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no third-party requests by design

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, 'index.html'));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
