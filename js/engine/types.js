/** @typedef {[number, number]} Pos */                       // [x, y]
/** @typedef {'N'|'E'|'S'|'W'} Dir */
// A shot's direction: the four, or a diagonal. Walking and pushing stay four-way (Dir).
/** @typedef {Dir|'NE'|'SE'|'SW'|'NW'} ShotDir */
/** @typedef {'open'|'forest'|'stubble'|'paving'|'water'|'hole'|'dam'|'stones'|'habitat'|'habitatDamaged'} TerrainKind */
/** @typedef {{kind: TerrainKind, variant: 'grass'|'flowers'|'mushrooms'|null, under: 'water'|'hole'|null}} Tile */
/** @typedef {'us'|'bots'} Side */
// `shot`: a strike along a lane that anything solid stops (see lanes.js); it hits bands only.
// `crush`: a strike on the next tile that hits bands only; with nobody there it does nothing.
/** @typedef {'attack'|'dig'|'build'|'mow'|'saw'|'pave'|'shot'|'crush'} Effect */
// `fromTail`: the action may also be made from the band's last cell, not only its head (the badger's dig).
// `dirs`: the directions a shot may take, 4 (rows and columns) or 8 (diagonals too). Absent means 4.
/** @typedef {{id: string, label: string, effect: Effect, damage: number, minRange: number, maxRange: number, pattern: 'single'|'line3', push: number, fromTail?: boolean, dirs?: 4|8}} ActionDef */
/** @typedef {{minLen: number, name: string, grants: ActionDef[]}} Tier */
// Bot types that strike the next tile also carry `reach` (speed + 1: walk `speed` tiles, strike the next) and may be `alwaysEngaged`.
// An animal type with `passThrough` (the bees) may walk through tiles other bands stand on, so long as
// every tile it ends the move on is free. Bots never pass through, whatever their type says.
// `bristle`: the damage a bot takes when its strike hits a band of this type.
// A bot type's `mind` names the thinking it runs (see bots.js), so two types can share one.
// `regrows: false`: a bot whose wounds stay; it never grows back as it walks. Absent means it does.
/** @typedef {'hunter'|'harvester'|'planter'|'stalker'|'sentry'|'coil'} Mind */
/** @typedef {{id: string, name: string, side: Side, glyph: string, speed: number, flies: boolean, startLen: number, maxLenCap: number, actions: ActionDef[], tiers: Tier[], price: number|null, recruitBase: number, reach?: number, alwaysEngaged?: boolean, passThrough?: boolean, bristle?: number, mind?: Mind, regrows?: boolean}} BandType */
// A bot's plan: the tiles its head will walk (may be empty), then the tile it will strike.
/** @typedef {{path: Pos[], strike: Pos|null, actionId: string|null}} Plan */
// `fresh`: an animal band still on its first march out of camp. It grows on any tile until it first
// reaches full length or takes its first hit; after that it mends only in the wood (see `mendsOn`).
/** @typedef {{id: string, type: string, side: Side, cells: Pos[], maxLen: number, moved: boolean, acted: boolean, trapped: boolean, plan: Plan|null, fresh?: boolean}} Band */
/** @typedef {{at: Pos, kind: 'permit'|'stake', captured: boolean}} Objective */
/** @typedef {'capture'|'clear'|'rescue'} Goal */
/** @typedef {'habitat'|'wiped'|'turns'|'rescue'} LostReason */
/** @typedef {{kind: 'move', band: string, path: Pos[]} | {kind: 'act', band: string, action: string, target: Pos} | {kind: 'end'}} Move */
/** @typedef {{kind: 'moved', band: string, to: Pos} | {kind: 'falls', band: string, at: Pos, cause?: 'terrain'} | {kind: 'bumped', band: string, other: string|null}} PushOutcome */
/** @typedef {{kind: 'move', band: string, path: Pos[], grow?: boolean[]} | {kind: 'action', actor: string, actionId: string, from: Pos, target: Pos} | {kind: 'damage', band: string, amount: number, wiped: boolean, cells: Pos[]} | {kind: 'terrain', at: Pos, from: TerrainKind, to: TerrainKind, cause: string} | {kind: 'push', outcome: PushOutcome} | {kind: 'capture', at: Pos} | {kind: 'pickup', at: Pos} | {kind: 'freed', band: string} | {kind: 'plan', band: string, plan: Plan|null}} BattleEvent */
// Trial rules a level may switch on, to try a rule out without changing how any other
// level plays. `woodOnlyGrowth`: a band out of camp is never fresh, so it grows only on forest.
// `snakeBodies`: a band may step (or be pushed) onto its own tile only if that tile is its tail
// at that step and it does not grow on the step, so every body is one line that follows its head.
/** @typedef {{woodOnlyGrowth?: boolean, snakeBodies?: boolean}} Rules */
/** @typedef {{levelId: string, width: number, height: number, tiles: Tile[][], bands: Band[], pickups: Pos[], objectives: Objective[], goal: Goal, turn: number, turnLimit: number|null, forestStart: number, habitatStart: number, pickupsTaken: number, outcome: 'won'|'lost'|null, lostReason: LostReason|null, events: BattleEvent[], rules: Rules}} BattleState */
/** @typedef {{type: string, at: Pos}} Deployment */
/** @typedef {{type: string, cells: Pos[]}} Placement */
// What kind of den a level's habitats are drawn as (the board's pictures; no rule reads it):
// `kind` for every den, `at` overriding it for the den on one tile. Optional: without it the
// board picks a kind for each den by its position.
/** @typedef {'burrow'|'anthill'|'nest'|'hive'} DenKind */
/** @typedef {{kind: DenKind, at?: Array<{at: Pos, kind: DenKind}>}} DenKinds */
// A recorded winning line. `alternatives` holds any further approaches a level's design note claims.
// `naive` is an optional line a level's test plays to show what the lesson avoids (o01: the straight walk).
/** @typedef {{deploy: Deployment[], moves: Move[]}} Solution */
// `roster` is the few animals a test level is designed and judged for (the hidden test screen offers exactly these).
// `benchAllows` names boring players the bench is allowed to see win a deliberately unfinished test level.
// `sandbox`: a test level for meeting things, with no recorded line. The test screen lists it; the
// bench and the test levels' acceptance checks leave it out. No campaign level sets it.
/** @typedef {{id: string, name: string, blurb: string, goal: Goal, maxBands: number, turnLimit: number|null, grid: string[], bots: Placement[], trapped: Placement[], firstClearSeeds: number, assumes: Record<string, number>, solution: Solution, alternatives?: Solution[], naive?: Solution, dens?: DenKinds, rules?: Rules, roster?: string[], benchAllows?: string[], sandbox?: boolean}} Level */
// `story.seen` holds the id of every scene the player has seen. It was added
// with the opening act, with no version bump: `migrate` gives an old save
// an empty one.
/** @typedef {{version: 1, seeds: number, bands: Record<string, {maxLen: number}>, cleared: Record<string, boolean>, story: {seen: Record<string, boolean>}}} Progress */
/** @typedef {{pickups: number, objectives: number, forest: number, firstClear: number, total: number}} Reward */

export {};
