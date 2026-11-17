# Undergrowth First Playable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable version of Undergrowth, a phone-first, deterministic, terrain-control tactics game. It has 5 hand-made levels, a campaign map, a trading post and replayable levels, ships as a static PWA on GitHub Pages at `jakecp.github.io/undergrowth/`, and is linked from the launcher.

**Architecture:** A pure rules engine (`js/engine/`) turns `(BattleState, Move)` into a new `BattleState`, plus a list of events describing what happened. Campaign logic (`js/campaign/`) handles saves, the shop and unlocks. Levels are plain ES-module data (`data/`). A thin SVG/DOM UI layer (`js/ui/`) renders state and turns taps into `Move`s. The engine never touches the DOM. Undo is a stack of earlier states. A preview is `applyMove(...)` run on the current state and its `events` read back.

**Tech Stack:** Plain JavaScript ES modules, no build step. SVG for the board. `node --test` with `node:assert/strict`. JSDoc types checked by `tsc --checkJs` (TypeScript is a dev dependency only). GitHub Actions CI. `rsvg-convert` (installed at `/opt/homebrew/bin`) for icons. Headless Chrome for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-14-tactics-game-design.md` (in the launcher repo `~/JakeCP.github.io`; Task 1 copies it and this plan into the game repo).

## Global Constraints

- The game repo is a new local repo at `~/undergrowth`, default branch `main`. **Do not create the GitHub repo, push, or enable Pages until Task 12, and only after Jake says yes.**
- Plain ES modules, `index.html` at the repo root, `.nojekyll`, no build step, no runtime dependencies. `typescript` is the only devDependency.
- No trackers, analytics, cookies, third-party requests or accounts. Fonts are self-hosted.
- All URLs in HTML, the manifest and `sw.js` are relative (`./`), because the site is served under `/undergrowth/`.
- **No randomness anywhere in `js/engine/`.** No `Math.random` or `Date` calls; `grep -rn "Math.random\|Date" js/engine` must print nothing. Cosmetic variation in the UI uses a position hash, not `Math.random`.
- The engine is pure: `createBattle` and `applyMove` never mutate their inputs. Internal helpers may mutate a draft that `applyMove` has already cloned.
- Board: 8×8 tiles in every first-playable level. Coordinates are `[x, y]` tuples. `tiles[y][x]`. Direction order is always N, E, S, W.
- Look (from the spec): paper `#f4efe6`, ink `#2a2620`, water `#9fb3b8`, animals green `#3f6b3a` (ring `#27461f`), bots rust `#9a4a22` (ring `#5e2a10`), grass `#6f8f4e`, stubble `#b9a77f`, paving `#9a9690`. Stamps are solid discs with the glyph rendered **white** through an SVG colour-matrix filter (`0 0 0 0 1 / 0 0 0 0 1 / 0 0 0 0 1 / 0 0 0 1 0`). Bodies are a 10px round-capped stroke plus an r=6 dot per segment. Bot intents are a dashed ink line from the bot's head to a hatched target tile.
- Light theme only (`color-scheme: light`). The game is a paper map. This is my call, and dark mode is a later nicety.
- Phone first: it must fit a 320px-wide portrait viewport with no horizontal scroll. Tap targets for buttons are at least 44px. Board tiles scale with width.
- No China-themed styling or characters. No names, art or text from Spybotics, Into the Breach or Captain Planet.
- Save key `undergrowth.save`, versioned JSON (`version: 1`). Every `localStorage` access is wrapped in try/catch.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HLB5DLYAQXzzvPgwv4w1u5
  ```

## Review Focus

1. **A corrupt, old or missing save, or `localStorage` that throws** (private mode, storage full). The game must start with fresh progress and never show a blank screen. Tests are in Task 7.
2. **Taps arriving when they shouldn't:** during the bots' turn, after the battle ends, or a double-tap on confirm. The UI must ignore them, and `applyMove` must throw on any move after `outcome` is set rather than corrupting state. Tests are in Tasks 6 and 9.
3. **A bot wiped out partway through the bots' turn** (hit by an earlier bot's action). Its own intent must not resolve, and it must not move or plan. Test is in Task 5.
4. **Pushes at the edges:** off the board edge, back into the pushed band's own body, a push onto an objective or pickup (pushes never capture or collect), and pushing a trapped band. Tests are in Task 3.
5. **A 320px-wide phone in portrait.** The board, action bar and buttons all fit with no horizontal scroll, and the end-turn button is reachable with one thumb. The screenshot check is in Task 9; recheck it in Task 10.

---

## File Structure

```
~/undergrowth/
  index.html                 app shell: <main id="app">, loads css + js/app.js
  manifest.webmanifest, sw.js, .nojekyll, .gitignore, package.json, jsconfig.json, README.md
  .github/workflows/test.yml
  css/game.css
  fonts/eb-garamond.woff2, fonts/eb-garamond-italic.woff2, fonts/EBGaramond-OFL.txt
  icons/src/icon.svg, icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png, icons/apple-touch-icon.png, favicon.svg
  js/engine/types.js         JSDoc typedefs only
  js/engine/grid.js          coordinates, directions, bounds
  js/engine/terrain.js       terrain rules, terrain transforms, level legend
  js/engine/units.js         band/bot type data, tiers, priority list
  js/engine/band.js          stepping, reachability, damage, push
  js/engine/actions.js       player action targets + resolution
  js/engine/bots.js          bot intents, movement, bots' turn
  js/engine/battle.js        parseGrid, createBattle, applyMove, outcome, rewards
  js/campaign/progress.js    save format, load/save/migrate, victory
  js/campaign/shop.js        catalogue, prices, buy
  js/campaign/campaign.js    unlock logic
  js/ui/svg.js               tiny element helper
  js/ui/text.js              pure strings: describeIntent, describeEvents, goalText
  js/ui/board.js             renderBoard, tileFromEvent
  js/ui/battle-view.js       battle interaction controller
  js/ui/map-view.js, js/ui/deploy-view.js, js/ui/shop-view.js, js/ui/result-view.js
  js/app.js                  boot, screen switching, saving, SW registration
  data/levels/l01.js … l05.js, data/levels/index.js, data/campaign.js
  tests/helpers.mjs and tests/*.test.mjs
  docs/superpowers/specs/…, docs/superpowers/plans/…
```

## Shared Types (Task 1 writes these in `js/engine/types.js`; every task uses them)

```js
/** @typedef {[number, number]} Pos */                       // [x, y]
/** @typedef {'N'|'E'|'S'|'W'} Dir */
/** @typedef {'open'|'forest'|'stubble'|'paving'|'water'|'hole'|'dam'|'stones'} TerrainKind */
/** @typedef {{kind: TerrainKind, variant: 'grass'|'flowers'|'mushrooms'|null, under: 'water'|'hole'|null}} Tile */
/** @typedef {'us'|'bots'} Side */
/** @typedef {'attack'|'dig'|'build'|'mow'|'saw'|'pave'} Effect */
/** @typedef {{id: string, label: string, effect: Effect, damage: number, minRange: number, maxRange: number, pattern: 'single'|'line3', push: number}} ActionDef */
/** @typedef {{minLen: number, name: string, grants: ActionDef[]}} Tier */
/** @typedef {{id: string, name: string, side: Side, glyph: string, speed: number, flies: boolean, startLen: number, maxLenCap: number, actions: ActionDef[], tiers: Tier[], price: number|null, recruitBase: number}} BandType */
/** @typedef {{actionId: string, dx: number, dy: number}} Intent */
/** @typedef {{id: string, type: string, side: Side, cells: Pos[], maxLen: number, moved: boolean, acted: boolean, trapped: boolean, intent: Intent|null}} Band */
/** @typedef {{at: Pos, kind: 'permit'|'stake', captured: boolean}} Objective */
/** @typedef {'capture'|'clear'|'rescue'} Goal */
/** @typedef {{kind: 'move', band: string, path: Pos[]} | {kind: 'act', band: string, action: string, target: Pos} | {kind: 'end'}} Move */
/** @typedef {{kind: 'moved', band: string, to: Pos} | {kind: 'falls', band: string} | {kind: 'bumped', band: string, other: string|null}} PushOutcome */
/** @typedef {{kind: 'move', band: string, path: Pos[]} | {kind: 'damage', band: string, amount: number, wiped: boolean} | {kind: 'terrain', at: Pos, from: TerrainKind, to: TerrainKind} | {kind: 'push', outcome: PushOutcome} | {kind: 'capture', at: Pos} | {kind: 'pickup', at: Pos} | {kind: 'freed', band: string} | {kind: 'intent', band: string, intent: Intent|null}} BattleEvent */
/** @typedef {{levelId: string, width: number, height: number, tiles: Tile[][], bands: Band[], pickups: Pos[], objectives: Objective[], goal: Goal, turn: number, turnLimit: number|null, forestStart: number, pickupsTaken: number, outcome: 'won'|'lost'|null, events: BattleEvent[]}} BattleState */
/** @typedef {{type: string, at: Pos}} Deployment */
/** @typedef {{type: string, cells: Pos[]}} Placement */
/** @typedef {{id: string, name: string, blurb: string, goal: Goal, maxBands: number, turnLimit: number|null, grid: string[], bots: Placement[], trapped: Placement[], firstClearSeeds: number, assumes: Record<string, number>, solution: {deploy: Deployment[], moves: Move[]}}} Level */
/** @typedef {{version: 1, seeds: number, bands: Record<string, {maxLen: number}>, cleared: Record<string, boolean>}} Progress */
/** @typedef {{pickups: number, objectives: number, forest: number, firstClear: number, total: number}} Reward */
```

---

### Task 1: Repo scaffold, tooling, grid helpers

**Files:**
- Create: `~/undergrowth/{package.json, jsconfig.json, .gitignore, .nojekyll, README.md, .github/workflows/test.yml}`
- Create: `js/engine/types.js` (the Shared Types block above, then `export {};`)
- Create: `js/engine/grid.js`
- Test: `tests/grid.test.mjs`
- Copy: the spec and this plan into `docs/superpowers/specs/` and `docs/superpowers/plans/`

**Interfaces:**
- Produces (`grid.js`): `DIR_ORDER: Dir[]` = `['N','E','S','W']`; `DIRS: Record<Dir, Pos>` = N `[0,-1]`, E `[1,0]`, S `[0,1]`, W `[-1,0]`; `add(p: Pos, d: Pos): Pos`; `eq(a: Pos, b: Pos): boolean`; `key(p: Pos): string` (`"x,y"`); `inBounds(s: {width:number,height:number}, p: Pos): boolean`; `manhattan(a: Pos, b: Pos): number`; `dirBetween(from: Pos, to: Pos): Dir|null` (non-null only when the two share a row or column and differ); `neighbours(s, p): Pos[]` (in-bounds, N/E/S/W order).

- [ ] **Step 1: Scaffold.** `mkdir ~/undergrowth && cd ~/undergrowth && git init -b main`. Write:
  - `package.json`: `{"name":"undergrowth","private":true,"type":"module","scripts":{"test":"node --test","typecheck":"tsc -p jsconfig.json"},"devDependencies":{"typescript":"^5"}}`, then `npm install`.
  - `jsconfig.json`: `allowJs`, `checkJs`, `noEmit`, `strict: true`, `target`/`module` `es2022`, `moduleResolution: "bundler"`, `lib: ["es2022","dom"]`, `include: ["js","data"]`.
  - `.gitignore`: `node_modules/`, `.DS_Store`, `.superpowers/`.
  - An empty `.nojekyll`.
  - A one-paragraph `README.md`.
  - `.github/workflows/test.yml`, modelled on `~/augury/.github/workflows/test.yml`: on push/PR, ubuntu, Node 22, `npm ci`, `node --test`, `npx tsc -p jsconfig.json`.
- [ ] **Step 2: Write failing tests** in `tests/grid.test.mjs`:
  ```js
  assert.deepEqual(add([2,3], DIRS.N), [2,2]);
  assert.equal(key([4,7]), '4,7');
  assert.equal(inBounds({width:8,height:8}, [8,0]), false);
  assert.equal(dirBetween([1,1],[1,4]), 'S');
  assert.equal(dirBetween([1,1],[2,2]), null);
  assert.equal(dirBetween([1,1],[1,1]), null);
  assert.deepEqual(neighbours({width:8,height:8}, [0,0]), [[1,0],[0,1]]);  // E then S
  ```
- [ ] **Step 3:** Run `node --test tests/grid.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement `grid.js` with JSDoc types from `types.js` (`/** @typedef {import('./types.js').Pos} Pos */`).
- [ ] **Step 5:** Run `node --test && npx tsc -p jsconfig.json`. Expected: tests pass and tsc prints nothing.
- [ ] **Step 6:** Copy the spec and plan from `~/JakeCP.github.io/docs/superpowers/` into the same paths here, then commit: `git add -A && git commit -m "Scaffold Undergrowth: tooling, CI, grid helpers"` (plus the trailer).

### Task 2: Terrain, unit data, level grid parsing

**Files:**
- Create: `js/engine/terrain.js`, `js/engine/units.js`
- Create: `parseGrid` in `js/engine/battle.js` (the file starts here; later tasks add to it)
- Test: `tests/terrain.test.mjs`, `tests/units.test.mjs`

**Interfaces:**
- Produces (`terrain.js`):
  - `TERRAIN: Record<TerrainKind, {animalWalk: boolean, botWalk: boolean, flyOver: boolean, diggable: boolean}>`:

    | kind | animalWalk | botWalk | flyOver | diggable |
    |---|---|---|---|---|
    | open, stubble | ✓ | ✓ | ✓ | ✓ |
    | forest | ✓ | ✗ | ✓ | ✓ |
    | paving | ✓ | ✓ | ✓ | ✗ |
    | water, hole | ✗ | ✗ | ✓ | ✗ |
    | dam | ✓ | ✓ | ✓ | ✓ |
    | stones | ✗ | ✗ | ✗ | ✗ |

  - `canEnter(tile: Tile, side: Side, flies: boolean): boolean`: a flyer uses `flyOver`; otherwise it's `animalWalk` for `us` and `botWalk` for `bots`.
  - `isDeadly(tile: Tile, flies: boolean): boolean`: true for water or hole when not flying. Used by push.
  - Transforms. Each returns a new `Tile`, or `null` when it doesn't apply:
    - `dig`: open, stubble or forest → `hole`; dam → its `under`.
    - `build`: water or hole → `dam` with `under` set to the old kind.
    - `mow`: forest → stubble.
    - `pave`: open or stubble → paving.
    - `cut`: dam → its `under`.
    - New tiles get `variant: null` except open ground, which keeps its variant.
  - `LEGEND: Record<string, {tile: Tile, mark: 'deploy'|'permit'|'stake'|'pickup'|null}>`:
    - `.` open/grass, `,` open/flowers, `;` open/mushrooms
    - `T` forest, `_` stubble, `#` paving, `~` water, `o` hole, `=` dam (under water), `S` stones
    - `D` deploy, `P` permit, `K` stake, `*` pickup. All four sit on open/grass.
- Produces (`units.js`):
  - `BAND_TYPES: Record<string, BandType>` with these starting numbers:

    | id | name | side | glyph | speed | flies | startLen | cap | actions | price | recruitBase |
    |---|---|---|---|---|---|---|---|---|---|---|
    | ants | Ants | us | 🐜 | 3 | – | 4 | 12 | bite (attack 1, r1) | null | 10 |
    | badger | Badger | us | 🦡 | 2 | – | 3 | 6 | dig (r1), bite (attack 1, r1) | null | 12 |
    | beaver | Beaver | us | 🦫 | 2 | – | 3 | 6 | build (r1) | null | 12 |
    | bear | Bear | us | 🐾 | 2 | – | 2 | 4 | maul (attack 3, r1), shove (attack 1, push 1, r1) | 60 | 25 |
    | owl | Owl | us | 🦉 | 4 | ✓ | 1 | 2 | strike (attack 2, r2–3) | 50 | 30 |
    | bees | Bees | us | 🐝 | 3 | – | 4 | 8 | sting (attack 1, r1, line3) | 40 | 10 |
    | harvester | Harvester | bots | 🚜 | 2 | – | 3 | 3 | mow (mow, damage 1, r1) | null | 0 |
    | saw | Saw-drone | bots | 🪚 | 3 | – | 2 | 2 | saw (saw, damage 2, r1) | null | 0 |
    | planter | Planter-bot | bots | 🤖 | 2 | – | 3 | 3 | pave (pave, damage 1, r1) | null | 0 |

    Every type's first tier is `{minLen: 1, name: <type name>, grants: []}`. Ants also get `{minLen: 6, name: 'Ant Colony', grants: [ram]}` and `{minLen: 9, name: 'Supercolony', grants: []}`, where ram is attack, damage 0, push 1, r1.
  - `STARTER_TYPES = ['ants','badger','beaver']`.
  - `TARGET_PRIORITY = ['owl','bear','beaver','badger','bees','ants']`.
  - `tierFor(typeId, maxLen): Tier` (the highest tier with `minLen <= maxLen`).
  - `actionsFor(typeId, maxLen): ActionDef[]` (base actions, then the grants of every reached tier).
  - `recruitCost(typeId, currentMaxLen): number` = `recruitBase + 5 * (currentMaxLen - startLen)`.
- Produces (`battle.js`): `parseGrid(grid: string[]): {width, height, tiles: Tile[][], deployTiles: Pos[], objectives: Objective[], pickups: Pos[]}`. Throws `Error('unknown grid char "<c>" at x,y')` or `Error('grid rows must be equal length')`.

- [ ] **Step 1: Write failing tests.**
  ```js
  // terrain
  assert.equal(canEnter(LEGEND['T'].tile, 'bots', false), false);
  assert.equal(canEnter(LEGEND['T'].tile, 'us', false), true);
  assert.equal(canEnter(LEGEND['~'].tile, 'us', true), true);
  assert.equal(canEnter(LEGEND['S'].tile, 'us', true), false);
  assert.deepEqual(dig(LEGEND['='].tile), {kind:'water', variant:null, under:null});
  assert.deepEqual(build(LEGEND['o'].tile), {kind:'dam', variant:null, under:'hole'});
  assert.equal(dig(LEGEND['#'].tile), null);
  assert.equal(mow(LEGEND['.'].tile), null);
  // units
  assert.equal(actionsFor('ants', 5).some(a => a.id === 'ram'), false);
  assert.equal(actionsFor('ants', 6).some(a => a.id === 'ram'), true);
  assert.equal(tierFor('ants', 9).name, 'Supercolony');
  assert.equal(recruitCost('ants', 4), 10);
  assert.equal(recruitCost('ants', 6), 20);
  // parseGrid
  const g = parseGrid(['DT', 'P*']);
  assert.deepEqual(g.deployTiles, [[0,0]]);
  assert.deepEqual(g.objectives, [{at:[0,1], kind:'permit', captured:false}]);
  assert.deepEqual(g.pickups, [[1,1]]);
  assert.equal(g.tiles[0][1].kind, 'forest');
  assert.throws(() => parseGrid(['.x']), /unknown grid char "x" at 1,0/);
  ```
- [ ] **Step 2:** Run `node --test`. Expected: the new tests fail.
- [ ] **Step 3:** Implement `terrain.js`, `units.js` and `parseGrid`.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: tests pass and tsc prints nothing.
- [ ] **Step 5:** Commit: `Add terrain rules, unit data and grid parsing`.

### Task 3: Band mechanics: stepping, reachability, damage, push

**Files:**
- Create: `js/engine/band.js`, `tests/helpers.mjs`
- Test: `tests/band.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces (`tests/helpers.mjs`): `makeState(grid: string[], bands: Array<Partial<Band> & {id: string, type: string, cells: Pos[]}>, extra?: Partial<BattleState>): BattleState`.
  - Uses `parseGrid`.
  - Band defaults: `side` from `BAND_TYPES[type].side`, `maxLen = cells.length`, `moved`/`acted`/`trapped` false, `intent` null.
  - State defaults: `goal 'capture'`, `turn 1`, `turnLimit null`, `forestStart` = forest count, `pickupsTaken 0`, `outcome null`, `events []`, `levelId 'test'`.
- Produces (`band.js`). Functions marked *(draft)* mutate `state` in place and push `BattleEvent`s onto `state.events`:
  - `bandById(state, id): Band|undefined`; `occupantAt(state, p): Band|undefined` (any cell).
  - `canStep(state, band, p): boolean`. True when `p` is in bounds, `canEnter` allows it for the band's side and flying, and no *other* band occupies it. The band's own cells are allowed.
  - `stepBand(band, p): Band`. Pure. `cells = [p, ...cells.filter(c => !eq(c, p))].slice(0, maxLen)`.
  - `reachable(state, bandId): Map<string, Pos[]>`. BFS from the head up to `speed` steps via `canStep`, exploring neighbours in N/E/S/W order. Maps `key(dest)` to the shortest path (excluding the start). The start tile is excluded.
  - `damageBand(state, bandId, amount): void` *(draft)*. If `amount <= 0`, nothing happens. Otherwise drop `amount` cells from the tail. If `amount >= cells.length`, remove the band from `state.bands`. Emit `{kind:'damage', band, amount, wiped}`.
  - `pushBand(state, bandId, dir: Dir): PushOutcome` *(draft)*. Let `dest = head + DIRS[dir]`.
    1. If `dest` is in bounds and `isDeadly` for the band: remove the band and return `falls`.
    2. If `dest` is out of bounds, can't be entered, or is occupied by another band: return `bumped`. Damage the target 1; damage the other band 1 too, if there is one.
    3. Otherwise: `cells = [dest, ...cells.filter(c => !eq(c, dest))].slice(0, cells.length)` (no growth) and return `moved`.

    Pushes never capture objectives or collect pickups. A trapped band is pushed like any other. Emits `{kind:'push', outcome}` plus any damage events.

- [ ] **Step 1: Write failing tests** in `tests/band.test.mjs`:
  - `stepBand grows behind the leader up to maxLen`: ants with `cells [[0,0]]` and `maxLen 4`, stepped through `[1,0],[2,0],[3,0],[3,1]`, end at `cells` deepEqual `[[3,1],[3,0],[2,0],[1,0]]`.
  - `stepBand onto own body does not grow`: `cells [[1,0],[0,0]]` stepped to `[0,0]` gives `[[0,0],[1,0]]`.
  - `regrowth`: after `damageBand(...,2)` on a 4-long band, stepping 2 tiles brings `cells.length` back to 4, and a 3rd step keeps it at 4.
  - `reachable respects terrain and other bands`: grid `['.T~.','....','S...','....']`, ants at `[0,0]` with speed 3, and a harvester at `[1,1]`. `[...reachable(s,'ants').keys()].sort()` deepEquals `['0,1','1,0']`. The forest at `[1,0]` is fine for animals; it is boxed in by water `[2,0]`, the harvester `[1,1]` and stones `[0,2]`.
  - `reachable gives shortest paths within speed`: on an open 8×8, ants at `[0,0]` with speed 3. The path to `'2,1'` deepEquals `[[1,0],[2,0],[2,1]]` (E is explored before S), and `'3,1'` is absent.
  - `reachable for bots avoids forest`: a harvester at `[0,1]` on `['.T..','....']` doesn't have `'1,0'`.
  - `damageBand wipes at zero`: damage 5 on a 3-long band removes it and emits `{kind:'damage', band:'ants', amount:5, wiped:true}`.
  - `push moves leader, body follows without growing`: a harvester with `cells [[2,1],[3,1]]` pushed `'W'` gets `[[1,1],[2,1]]`.
  - `push into water: bot falls; owl does not`: on `['.~']`, a harvester at `[0,0]` pushed `'E'` gives outcome `{kind:'falls', band:'harvester-0'}` and the band is gone. An owl pushed the same way gives `moved`.
  - `push into stones bumps target only`; `push into another band bumps both`, where both lose 1 cell; `push off board edge bumps`.
  - `push onto objective does not capture` and `push onto pickup does not collect`: `state.objectives[0].captured === false` and `state.pickups.length === 1`.
  - `trapped band can be pushed`: a band with `trapped: true` pushed `'S'` gives `moved`.
  - `push back into own body`: `cells [[1,0],[2,0]]` pushed `'E'` gives `moved` with `cells [[2,0],[1,0]]`.
- [ ] **Step 2:** Run `node --test tests/band.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement `band.js` and `tests/helpers.mjs`.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: tests pass and tsc prints nothing.
- [ ] **Step 5:** Commit: `Add band stepping, reachability, damage and push`.

### Task 4: Player actions

**Files:**
- Create: `js/engine/actions.js`
- Test: `tests/actions.test.mjs`

**Interfaces:**
- Consumes: `band.js` and `units.js`.
- Produces:
  - `findAction(band: Band, actionId: string): ActionDef|undefined` (via `actionsFor(band.type, band.maxLen)`).
  - `actionTargets(state, bandId, actionId): Pos[]`. Tiles in a straight N/E/S/W line from the head at distance `minRange..maxRange`, in bounds, in N/E/S/W then distance order. Filters:
    - `dig`: the tile has a `dig` result, no band, no objective, no pickup.
    - `build`: the tile has a `build` result and no band.
    - attacks: any in-bounds tile.
  - `resolveAction(state, band: Band, action: ActionDef, target: Pos): void` *(draft)*.
    - `dig` and `build`: transform the tile and emit a terrain event.
    - Attack, `single` pattern: `damageBand` any band on `target`. Then, if `push > 0` and the band there survives, `pushBand` it in the direction `dirBetween(head, target)`.
    - Attack, `line3` pattern: damage every band on `target`, `target+d` and `target+2d`. Friendly fire is allowed.
    - `mow`, `saw` and `pave` (bots): damage any band on `target`, then apply that transform. Any bot action on a dam also applies `cut`. A transform that returns `null` changes nothing.

- [ ] **Step 1: Write failing tests:**
  - `dig targets exclude occupied, objective, pickup, paving, water`: badger at `[1,1]` on `['.P.','#..','~*.']`. The dig targets equal `[[2,1]]`. (The permit is at `[1,0]`, paving at `[0,1]`, the pickup at `[1,2]`.)
  - `dig turns forest into a hole; build dams a hole`: check `state.tiles[y][x]` after `resolveAction`.
  - `owl strike targets are range 2–3 straight lines only`: owl at `[3,3]` on an 8×8 open grid. The targets equal `[[3,1],[3,0],[5,3],[6,3],[3,5],[3,6],[1,3],[0,3]]`.
  - `bees sting hits three tiles in a line, friend or foe`: ants in the 2nd tile lose 1 cell, and a harvester in the 3rd loses 1.
  - `bear shove pushes a bot into a hole`: on `['..o','...']`, bear at `[0,0]`, harvester `cells [[1,0],[1,1]]`. Shove at `[1,0]`: the damage 1 leaves it at length 1, then the push E makes it fall. Assert the harvester is gone and `events.some(e => e.kind === 'push' && e.outcome.kind === 'falls')`.
  - `ram does 0 damage but pushes`: an Ant Colony (maxLen 6) ram on a harvester moves it 1 tile with no damage event.
  - `mow turns forest to stubble and damages a band on it`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `actions.js`.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: pass.
- [ ] **Step 5:** Commit: `Add player and bot action resolution`.

### Task 5: Bots: intents, movement, the bots' turn

**Files:**
- Create: `js/engine/bots.js`
- Test: `tests/bots.test.mjs`

**Interfaces:**
- Consumes: `band.js` and `actions.js` (`resolveAction` for bot actions).
- Produces:
  - `intentTarget(bot: Band): Pos|null`: head + `[dx, dy]`, or null.
  - `planIntent(state, bot): Intent|null`. Looks only at the 4 adjacent tiles, in N/E/S/W order. Animal targets include trapped bands.
    - **Harvester:** the first adjacent forest. If there's none, the adjacent animal cell whose band type ranks first in `TARGET_PRIORITY` (ties by direction order). Otherwise null.
    - **Saw-drone:** the best-priority adjacent animal cell. Otherwise the first adjacent dam. Otherwise null.
    - **Planter:** the best-priority adjacent animal standing on open ground or stubble. Otherwise the first adjacent open or stubble tile. Otherwise null.
  - `goalTiles(state, bot): Pos[]`:
    - Harvester: tiles adjacent to forest.
    - Saw: tiles adjacent to any animal cell.
    - Planter: tiles within Manhattan distance 2 of any uncaptured objective. If there are none, tiles adjacent to animal cells.
  - `moveBot(state, bot): void` *(draft)*. The algorithm:
    ```
    dist = multi-source BFS from goalTiles over tiles the bot could enter by terrain alone (ignoring bands)
    options = [{dest: head, path: []}] + every entry of reachable(state, bot.id)
    best = min over options by (dist[dest] ?? Infinity, path.length, dest.y, dest.x)
    if best.path is non-empty: step along it with stepBand; emit {kind:'move'}
    ```
  - `runBotPhase(state): void` *(draft)*. In `state.bands` order:
    1. Every bot still present resolves its intent at `intentTarget` via `resolveAction`.
    2. Every bot still present moves.
    3. Every bot still present plans, setting `bot.intent` and emitting `{kind:'intent'}`.

- [ ] **Step 1: Write failing tests:**
  - `harvester prefers north forest`: forest to the N and E gives `{actionId:'mow', dx:0, dy:-1}`.
  - `intent is relative`: plan, then `pushBand(...,'E')`, and `intentTarget` moves 1 east.
  - `saw prefers owl over ants`: both adjacent, so the intent points at the owl.
  - `harvester moves toward nearest forest, ties by path length then y then x` on a grid built so two goal tiles tie on distance. Assert the exact head position afterwards.
  - `bots never enter forest during movement`.
  - `resolution happens before movement`: an animal that moved off the target tile isn't damaged, and the tile is still transformed.
  - `a bot wiped by an earlier bot's action does not act`: saw-drone A's intent hits saw-drone B (length 2, damage 2) first. B's intent targets ants, and the ants keep full length.
  - `deterministic`: `runBotPhase` on two `structuredClone`s gives `deepEqual` states.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `bots.js`.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: pass.
- [ ] **Step 5:** Commit: `Add deterministic bot intents, movement and bot turn`.

### Task 6: Battle: create, apply moves, outcome, rewards

**Files:**
- Modify: `js/engine/battle.js` (adding to `parseGrid`)
- Test: `tests/battle.test.mjs`

**Interfaces:**
- Consumes: everything in `js/engine/`.
- Produces:
  - `createBattle(level: Level, deployments: Deployment[], progress: Progress): BattleState`.
    - Throws `Error` when there are 0 deployments or more than `maxBands`, a tile isn't a deploy tile, a type is duplicated, or a type isn't in `progress.bands`.
    - Player bands: `id = type`, `cells = [at]`, `maxLen = progress.bands[type].maxLen`.
    - Trapped bands: `id = 'trapped-' + type`, `trapped: true`, `maxLen = cells.length`.
    - Bots: `id = type + '-' + index` (index across all bots), `maxLen = cells.length`.
    - Then plan every bot's intent. Set `turn 1`, `forestStart = countForest`, `events []`.
  - `applyMove(state: BattleState, move: Move): BattleState`. Pure: `structuredClone`, reset `events`, apply, check the outcome, return. Throws `Error` with a readable message on any illegal move, including any move when `outcome !== null`.
    - **move:** the band must be on side `us`, not trapped, `!moved && !acted`. The path must be 1..speed steps, each adjacent to the previous one and passing `canStep` on the evolving band. The leader stepping onto an uncaptured objective captures it. Stepping onto a pickup removes it and increments `pickupsTaken`. After the move, every trapped band with a cell orthogonally adjacent to the leader is freed: `trapped=false`, `moved=acted=true`, and a `{kind:'freed'}` event. Sets `moved`.
    - **act:** the band must be on side `us`, not trapped, and `!acted`. The action must be in `actionsFor`, and the target in `actionTargets`. Sets `acted` (and `moved`).
    - **end:** `runBotPhase`, then `turn += 1`, then reset `moved`/`acted` on `us` bands.
    - **Outcome**, checked after every move:
      - `won`: when `capture` and every objective is captured; when `clear` and no bots remain; when `rescue` and no band has `trapped: true` while at least one band whose id starts with `trapped-` is present.
      - `lost`: when no untrapped `us` band remains; when `rescue` and no band whose id starts with `trapped-` is present (it was wiped); or after `end` when `turnLimit !== null && turn > turnLimit`.
      - A win checked before the bots' turn ends the battle immediately.
  - `countForest(state): number`.
  - `rewardFor(state, level, progress): Reward` = pickups `pickupsTaken × 5`, objectives `captured × 5`, forest `countForest(state)` (1 per tile left), firstClear `progress.cleared[level.id] ? 0 : level.firstClearSeeds`, and `total` (the sum).

- [ ] **Step 1: Write failing tests** with a small inline `Level`. A 4×4 grid works, since `parseGrid` accepts any rectangle.
  - `createBattle places length-1 leaders with progress maxLen and planned bot intents`.
  - `createBattle rejects`: too many bands, a non-deploy tile, an unowned type, a duplicate type. Use 4 `assert.throws`.
  - `move validation`: rejects a path longer than speed, a diagonal step, a second move for the same band, and moving a bot.
  - `move captures objective and collects pickup on the leader's path`.
  - `act after act rejected; act without moving allowed; move after act rejected`.
  - `applyMove does not mutate its input`: `structuredClone` before, then `deepEqual` after.
  - `end runs bots, increments turn, resets flags`.
  - `capture win is immediate`, `clear win`, `rescue: freeing wins`, `rescue: trapped band wiped loses`, `all bands wiped loses`, `turn limit loses`.
  - `no moves after outcome`: `assert.throws(() => applyMove(won, {kind:'end'}), /over/)`.
  - `preview via events`: the `applyMove` result's `events` for a shove include the push outcome.
  - `rewardFor`: 2 pickups, 1 objective, 3 forest, first clear 20 gives `total 38`. The same state with the level already cleared gives 18.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json && grep -rn "Math.random\|Date" js/engine`. Expected: pass, nothing from tsc, nothing from grep.
- [ ] **Step 5:** Commit: `Add battle creation, move application, outcomes and rewards`.

### Task 7: Progress, shop, campaign unlocks

**Files:**
- Create: `js/campaign/progress.js`, `js/campaign/shop.js`, `js/campaign/campaign.js`
- Test: `tests/campaign.test.mjs`

**Interfaces:**
- Produces (`progress.js`):
  - `SAVE_KEY = 'undergrowth.save'`.
  - `newProgress(): Progress` = `{version:1, seeds:0, bands:{ants:{maxLen:4}, badger:{maxLen:3}, beaver:{maxLen:3}}, cleared:{}}`.
  - `migrate(raw: unknown): Progress`. Returns a valid `version: 1` object as is, once it passes shape checks: `seeds` is a non-negative integer, every band type is known, and every `maxLen` is between `startLen` and the cap. Anything else returns `newProgress()`.
  - `loadProgress(storage?: Storage): Progress` and `saveProgress(p: Progress, storage?: Storage): void`. Both default to `globalThis.localStorage` and swallow every exception. A failed load returns `newProgress()`.
  - `applyVictory(p, levelId, reward): Progress`. Pure: `seeds += total`, `cleared[levelId] = true`.
- Produces (`shop.js`):
  - `ShopItem = {id: string, kind: 'type'|'recruit', type: string, label: string, price: number, affordable: boolean, available: boolean}`.
  - `shopItems(p): ShopItem[]`. For each not-yet-owned type with a non-null `price`, a `type:<id>` item. For each owned type, a `recruit:<id>` item priced with `recruitCost`, with `available = maxLen < cap`. Ordered owned recruits first, then types, each in `BAND_TYPES` order.
  - `buy(p, itemId): Progress`. Pure. Throws when the item isn't available or isn't affordable. Buying a type adds it at its `startLen`.
- Produces (`campaign.js`): `CampaignNode = {levelId: string, x: number, y: number, unlocks: string[]}` and `unlockedLevels(p, nodes: CampaignNode[]): Set<string>`. The first node is always unlocked, plus the `unlocks` of every cleared node.

- [ ] **Step 1: Write failing tests.** Include the Review Focus #1 cases:
  - `loadProgress` with a storage whose `getItem` throws returns `newProgress()`.
  - With `'{not json'` it returns `newProgress()`.
  - With `{version: 99}` it returns `newProgress()`.
  - With `{version:1, seeds:-5, …}` it returns `newProgress()`.
  - `saveProgress` with a `setItem` that throws doesn't throw.
  - A round trip through a fake storage preserves the progress.
  - `buy`: buying the bear deducts 60 and adds `bear: {maxLen: 2}`; buying with too few seeds throws; a recruit at the cap is unavailable.
  - `unlockedLevels`: nodes A→[B, C] with A cleared gives {A, B, C}.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: pass.
- [ ] **Step 5:** Commit: `Add save format, trading post and campaign unlocks`.

### Task 8: Five levels, campaign map data, level and replay checks

**Files:**
- Create: `data/levels/l01.js` … `l05.js` (each `export default /** @type {Level} */ ({...})`), `data/levels/index.js` (`export const LEVELS: Level[]` in campaign order), `data/campaign.js` (`export const CAMPAIGN_NODES: CampaignNode[]`, `export const TRADING_POST = {x, y}`; positions in a 0–100 space)
- Test: `tests/levels.test.mjs`

**Level brief** (the designs are the builder's; each must teach one idea and leave room for more than one approach):

| id | goal | idea it teaches | bots |
|---|---|---|---|
| l01 | capture 1 permit | moving, body growth, capturing; forest shelters you from bots | 1 harvester |
| l02 | capture 2 stakes | the beaver dams a river to make a crossing | 1 harvester, 1 saw-drone |
| l03 | capture 1 permit | the badger digs a moat to cut off a saw-drone | 1 saw-drone, 1 planter |
| l04 | rescue a trapped bear | speed under pressure; bots target the trapped band | 1 saw-drone, 2 harvesters |
| l05 | clear all bots | combining dig, block and (for a grown Ant Colony) ram into holes | 2 harvesters, 1 saw-drone, 1 planter |

Hold-out levels, which the spec allows for variety, aren't in the first playable; none of these five needs one. `maxBands` is 2 for l01 and 3 for l02–l05. `firstClearSeeds` is 20, 25, 30, 35, 40. Use `turnLimit` only where a level needs it. Campaign unlocks: l01 → l02 and l03; l02 → l04; l03 → l04; l04 → l05.

**Interfaces:**
- Consumes: `createBattle`, `applyMove`, `rewardFor`, `STARTER_TYPES`, `BAND_TYPES`, `LEGEND`, `recruitCost`, `unlockedLevels`.

- [ ] **Step 1: Write the checks first** in `tests/levels.test.mjs`. For each level:
  - `grid` is 8 rows of 8 chars, every char in `LEGEND`, at least `maxBands` deploy tiles.
  - The goal has what it needs: `capture` has ≥1 objective, `rescue` has ≥1 trapped band, `clear` has ≥1 bot.
  - Every bot and trapped type exists. Each placement's cells are distinct and orthogonally contiguous from the head, and lie on tiles that type can enter.
  - `assumes` only names `STARTER_TYPES`, each size `startLen ≤ n ≤ cap`.
  - **Replay:** build a `Progress` from `assumes` and run `createBattle(level, solution.deploy, progress)`. `solution.deploy` uses only `STARTER_TYPES`. Applying every `solution.moves` entry in order gives `outcome === 'won'`.
  - **Not trivial:** the same deploy, then only `{kind:'end'}` moves until the outcome is set or 12 turns pass, gives an outcome that isn't `'won'`.
  - **Affordable:** the recruit cost from `startLen` up to `assumes` must be ≤ the sum over earlier levels `j` of `firstClearSeeds_j + 3 × replayReward_j`. Here `replayReward_j` is `rewardFor` of level `j`'s replayed final state with `firstClear` excluded.

  For the campaign:
  - Every node's `levelId` is in `LEVELS`.
  - The first node is `LEVELS[0]`.
  - Walking unlocks from the first node reaches every level.
- [ ] **Step 2:** Run `node --test tests/levels.test.mjs`. Expected: FAIL (no levels).
- [ ] **Step 3: Design l01–l05** to the brief, recording a winning `solution` for each. Follow the look rule: mostly open ground with a few cosmetic `,` and `;`, and forest at the edges. Iterate until the replay passes. When a replay fails, print the `events` of the failing move to see why.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: pass.
- [ ] **Step 5:** Commit: `Add first five levels and campaign map with replay checks`.

### Task 9: Board renderer, text helpers, app shell

**Files:**
- Create: `index.html`, `css/game.css`, `js/ui/svg.js`, `js/ui/text.js`, `js/ui/board.js`, `js/app.js` (temporary boot: straight into l01 with its `solution.deploy`, rendering only)
- Copy: `fonts/eb-garamond.woff2`, `fonts/eb-garamond-italic.woff2`, `fonts/EBGaramond-OFL.txt` from `~/JakeCP.github.io/fonts/`
- Test: `tests/text.test.mjs`

**Interfaces:**
- Produces (`svg.js`): `el(tag: string, attrs: Record<string, string|number>, parent?: Element): SVGElement`.
- Produces (`text.js`), all pure:
  - `describeIntent(state, bot: Band): string`, e.g. `"Harvester will mow the forest to the north"` or `"Saw-drone will hit Ants to the east"`. Returns `"Harvester has nothing in reach"` when the intent is null.
  - `describeEvents(state: BattleState, events: BattleEvent[]): string[]`, one plain sentence per meaningful event, e.g. `"Harvester is pushed into the water and destroyed"`, `"Ants lose 2"`, `"Badger digs a hole"`.
  - `goalText(level): string`, e.g. `"Capture the forged permit"`, `"Capture both survey stakes"`, `"Rescue the trapped bear"`, `"Drive out every bot"`.
- Produces (`board.js`):
  - `BoardView = {selected: string|null, highlights: Pos[], highlightKind: 'move'|'target'|'deploy'|null, ghost: BattleState|null}`.
  - `TILE = 40`.
  - `renderBoard(svg: SVGSVGElement, state: BattleState, view: BoardView): void`. Clears and redraws in this order: tiles; terrain decoration (grass tufts, flowers, mushrooms, trees, water ripples, logs for dams, stubble ticks, paving lines, stones; placement picked by a hash of `x, y`); objectives (📜 permit, 📍 stake, as small ink-toned glyphs); pickups (🌰); intents; highlights; bands. When `ghost` is set, its changed bands are drawn at 40% opacity on top.
  - `tileFromEvent(svg, evt: PointerEvent): Pos|null`.
- Board markup: `<svg viewBox="0 0 320 320" width="100%">`, inside a container with `max-width: min(100vw - 16px, 520px)`.

- [ ] **Step 1: Write failing tests** in `tests/text.test.mjs` for `describeIntent` (one per bot type plus a null intent), `describeEvents` (falls, bumped, wiped, capture, freed) and `goalText` (one per goal). Use exact strings.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `text.js`, `svg.js` and `board.js`. Then `index.html`:
  - viewport `width=device-width,initial-scale=1,viewport-fit=cover`, `theme-color #f4efe6`, `<title>Undergrowth</title>`
  - `<link rel="stylesheet" href="css/game.css">`, `<main id="app"></main>`, `<script type="module" src="js/app.js">`
  - `css/game.css`: EB Garamond `@font-face`, paper background, 16px side gutters, `color-scheme: light`.
  - The temporary `app.js` renders l01 after its deploy.
- [ ] **Step 4: Verify.**
  - `node --test && npx tsc -p jsconfig.json`: pass.
  - Run `python3 -m http.server 8123` from `~/undergrowth` in the background.
  - Take headless Chrome screenshots: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=320,640 --screenshot=<scratch>/l01-320.png http://localhost:8123/`, and the same at 390×844.
  - Read both PNGs. Check: the board fits with no horizontal overflow; stamps are white silhouettes on green or rust; the harvester's intent line and hatched tile are visible; the terrain decoration is calm, not busy. Also render one test board with every unit type side by side. If any two stamps can't be told apart (the badger 🦡 and beaver 🦫 are the likely pair), change the `glyph` in `units.js` to a signature symbol, as the spec asks, and note the swap in the commit message.
- [ ] **Step 5:** Commit: `Add SVG board renderer, text helpers and app shell`.

### Task 10: Battle interaction

**Files:**
- Create: `js/ui/battle-view.js`
- Modify: `js/app.js` (temporary boot now mounts the interactive battle), `css/game.css`

**Interfaces:**
- Consumes: `renderBoard`, `tileFromEvent`, `reachable`, `actionTargets`, `actionsFor`, `tierFor`, `applyMove`, `describeIntent`, `describeEvents`, `goalText`.
- Produces: `mountBattle(root: HTMLElement, opts: {level: Level, state: BattleState, onFinish: (final: BattleState) => void, onQuit: () => void}): void`.

**Interaction model** (tap-first, one thumb):
- **Header:** the level name, `goalText`, a turn counter (`Turn 3` or `Turn 3 of 8`), and forest left (`🌲 12/15`).
- **Board:** tapping one of your bands that hasn't acted selects it. If it hasn't moved, its `reachable` tiles are highlighted. Tapping a highlighted tile moves it: `applyMove`, then push the previous state on the undo stack. Tapping a bot or trapped band shows `describeIntent` (or the band's name and length) in the info line. Tapping empty ground clears the selection.
- **Action bar** (fixed to the bottom, safe-area padded):
  - The selected band's tier name and length (`Ant Colony 5/6`).
  - One button per `actionsFor` action, plus `Undo` (disabled when the stack is empty) and `End turn`.
  - Choosing an action highlights `actionTargets`. Tapping a target shows a preview: `ghost = applyMove(state, act)`, with its `describeEvents` in an `aria-live="polite"` info line, and a `Confirm` button. Tapping the same target again also confirms.
- **End turn:** clear the undo stack. Disable all input while the bots resolve (a ~300ms step per event is fine; no animation required). Show `describeEvents` for the bots' turn.
- **When `outcome` is set:** ignore all board taps and buttons, and call `onFinish(state)` once.
- **Errors:** wrap every `applyMove` in try/catch. An illegal move shows its message in the info line and changes nothing.

- [ ] **Step 1: Write a failing test** in `tests/battle-view-logic.test.mjs` for the one piece of pure logic this file needs. Export `nextSelection(state, selected: string|null, tapped: Pos): {selected: string|null, info: string|null}` from `battle-view.js`. Assert: tapping your own unacted band selects it; tapping an acted band doesn't; tapping a bot returns its `describeIntent` text with `selected: null`; with `state.outcome` set it returns `{selected: null, info: null}`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `mountBattle` and `nextSelection`.
- [ ] **Step 4: Verify.**
  - `node --test && npx tsc -p jsconfig.json`: pass.
  - Play l01 by hand in a browser at a 390×844 viewport (using the run skill or Chrome), following `solution.moves`. It must end in a win.
  - Then replay and confirm: undo restores the previous position; a push preview shows the ghost and its sentence before confirming; double-tapping `End turn` doesn't run two bot turns; taps after the win do nothing.
  - Re-take the 320×640 screenshot: the action bar fits with no horizontal scroll.
- [ ] **Step 5:** Commit: `Add battle interaction: select, move, act with preview, undo, end turn`.

### Task 11: Campaign map, deploy, trading post, results, saving

**Files:**
- Create: `js/ui/map-view.js`, `js/ui/deploy-view.js`, `js/ui/shop-view.js`, `js/ui/result-view.js`
- Modify: `js/app.js` (replace the temporary boot), `css/game.css`

**Interfaces:**
- Produces:
  - `renderMap(root, {progress, onLevel: (id) => void, onShop: () => void})`
  - `renderDeploy(root, {level, progress, onStart: (deployments: Deployment[]) => void, onBack: () => void})`
  - `renderShop(root, {progress, onBuy: (itemId) => void, onBack: () => void})`
  - `renderResult(root, {level, final: BattleState, reward: Reward|null, onMap: () => void, onReplay: () => void})`
- `app.js` owns `progress` (`loadProgress` at boot) and the current screen:
  - map → deploy → battle → result → map or replay. The shop is reachable from the map.
  - On a win: `rewardFor`, then `applyVictory`, then `saveProgress`, then the result screen. On a buy: `buy`, then `saveProgress`, then re-render the shop.
  - Registers `sw.js` relatively (`navigator.serviceWorker?.register('sw.js')`), ignoring failures.

**Screens:**
- **Map:** the ink valley, an SVG with a meandering river path and some tree marks. Each level node is a seal: green with a white ✓ glyph when cleared, an outlined seal when unlocked, faint and not tappable when locked. Nodes are joined by dashed ink paths along `unlocks`. The trading post node is 🛖. Seeds are shown top right (`🌰 45`). A tapped node shows the level name and `goalText`, with a `March` button.
- **Deploy:** the board with deploy tiles highlighted (`highlightKind 'deploy'`). Your roster is a list of buttons showing tier name and `maxLen`. Tap a band, then a deploy tile, to place it; tap a placed band to remove it. `Start` is enabled when 1..`maxBands` bands are placed. `Back` returns to the map.
- **Shop:** seeds total, `shopItems` as rows (label, price, `Buy` disabled when unaffordable or unavailable). A recruit row shows the next tier name when buying would reach it.
- **Result:** `Victory` or `Defeat`. On a win, the reward breakdown (pickups, objectives, forest, first clear, total). `Back to map` and `Play again` buttons.

- [ ] **Step 1: Verify by playing.** No new unit tests; this layer is wiring, and its logic is tested in Task 7.
  - `node --test && npx tsc -p jsconfig.json`: pass.
  - In a 390×844 browser with cleared site data: map → l01 → deploy → win.
  - The result shows the reward. The map now shows l02 and l03 unlocked.
  - Buy a recruit at the trading post and reload the page: seeds and band size persist.
  - Replay l01: no first-clear bonus this time.
  - Set `localStorage['undergrowth.save'] = '{bad'` and reload: the game starts fresh with no error.
- [ ] **Step 2:** Re-take the 320×640 screenshots of the map, deploy, shop and result screens. Read them and check there's no horizontal overflow and the buttons are ≥44px tall.
- [ ] **Step 3:** Commit: `Add campaign map, deploy, trading post and results with saving`.

### Task 12: PWA, icons, publishing (asks Jake before going public), launcher row

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/src/icon.svg`, the PNG icons, `favicon.svg`
- Test: `tests/pwa.test.mjs` (modelled on `~/augury/tests/pwa.test.mjs`)
- Modify (launcher repo): `~/JakeCP.github.io/index.html:69-72`

**Interfaces:**
- `sw.js`:
  - `const APP_VERSION = '1';` and ``const CACHE_NAME = `undergrowth-v${APP_VERSION}`;``
  - `const PRECACHE_URLS = [...]` listing every shipped file, relative.
  - install: `addAll`, then `self.skipWaiting()`.
  - activate: `names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))`, then `self.clients.claim()`.
  - Navigations are network-first with a cache fallback. Everything else is stale-while-revalidate.
- Manifest: name `Undergrowth`, short_name `Undergrowth`, description `A small tactics game: forest animals take back cleared land.`, `start_url`/`scope` `./`, display standalone, background/theme `#f4efe6`, icons 192/512 any and 512 maskable.
- Icon: a green `#3f6b3a` seal on cream with a simple white sprout drawn as a path (no emoji, since emoji render differently per platform). The maskable variant is full-bleed green with the sprout inside the 80% safe zone. Rasterise with `rsvg-convert -w <n>`.

- [ ] **Step 1: Write the failing `tests/pwa.test.mjs`:**
  - `sw.js` parses (`node --check`).
  - The cache name matches `undergrowth-v<N>`, and both `skipWaiting` and `clients.claim` are present.
  - Every precache entry is relative and exists on disk.
  - **Every file under `js/`, `data/`, `css/` and `fonts/` is precached**, so a forgotten module can't break offline play.
  - The manifest parses, uses relative `start_url`/`scope`, and every icon exists.
  - `index.html` links the manifest, `apple-touch-icon` and `favicon.svg`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Create the icons, manifest and `sw.js`, and add the manifest and icon links to `index.html`.
- [ ] **Step 4:** Run `node --test && npx tsc -p jsconfig.json`. Expected: pass. Commit: `Make Undergrowth an installable offline PWA`.
- [ ] **Step 5: Stop and ask Jake** before anything public: "Ready to create the public GitHub repo `JakeCP/undergrowth`, push, and turn on Pages?" Only on a yes:
  - `gh repo create JakeCP/undergrowth --public --source ~/undergrowth --push`
  - `gh api -X POST repos/JakeCP/undergrowth/pages -f "source[branch]=main" -f "source[path]=/"`
  - Wait for the Pages build (`gh api repos/JakeCP/undergrowth/pages/builds/latest --jq .status` shows `built`).
  - Confirm `curl -sI https://jakecp.github.io/undergrowth/` and `…/icons/icon-192.png` both return `200`.
  - Check CI is green: `gh run list -R JakeCP/undergrowth -L 1`.
- [ ] **Step 6: Launcher row.** In `~/JakeCP.github.io/index.html`, replace the `<li><div class="soon">…</div></li>` placeholder (lines 69–72) with:
  ```html
  <li><a class="app" href="/undergrowth/">
    <span class="icon"><img src="/undergrowth/icons/icon-192.png" alt="" width="44" height="44"></span>
    <span class="text"><span class="name">Undergrowth</span><span class="blurb">A small tactics game: forest animals take back cleared land.</span></span>
  </a></li>
  ```
  Remove any `.soon` CSS that nothing uses any more. Confirm `grep -c serviceWorker index.html` is `0`. Commit: `Link Undergrowth from the launcher`. Ask Jake before pushing.
