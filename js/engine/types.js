/** @typedef {[number, number]} Pos */                       // [x, y]
/** @typedef {'N'|'E'|'S'|'W'} Dir */
/** @typedef {'open'|'forest'|'stubble'|'paving'|'water'|'hole'|'dam'|'stones'|'habitat'|'habitatDamaged'} TerrainKind */
/** @typedef {{kind: TerrainKind, variant: 'grass'|'flowers'|'mushrooms'|null, under: 'water'|'hole'|null}} Tile */
/** @typedef {'us'|'bots'} Side */
/** @typedef {'attack'|'dig'|'build'|'mow'|'saw'|'pave'} Effect */
/** @typedef {{id: string, label: string, effect: Effect, damage: number, minRange: number, maxRange: number, pattern: 'single'|'line3', push: number}} ActionDef */
/** @typedef {{minLen: number, name: string, grants: ActionDef[]}} Tier */
// Bot types also carry `reach` (speed + 1: walk `speed` tiles, strike the next) and may be `alwaysEngaged`.
// An animal type with `passThrough` (the bees) may walk through tiles other bands stand on, so long as
// every tile it ends the move on is free. Bots never pass through, whatever their type says.
// `bristle`: the damage a bot takes when its strike hits a band of this type.
/** @typedef {{id: string, name: string, side: Side, glyph: string, speed: number, flies: boolean, startLen: number, maxLenCap: number, actions: ActionDef[], tiers: Tier[], price: number|null, recruitBase: number, reach?: number, alwaysEngaged?: boolean, passThrough?: boolean, bristle?: number}} BandType */
// A bot's plan: the tiles its head will walk (may be empty), then the tile it will strike.
/** @typedef {{path: Pos[], strike: Pos|null, actionId: string|null}} Plan */
/** @typedef {{id: string, type: string, side: Side, cells: Pos[], maxLen: number, moved: boolean, acted: boolean, trapped: boolean, plan: Plan|null}} Band */
/** @typedef {{at: Pos, kind: 'permit'|'stake', captured: boolean}} Objective */
/** @typedef {'capture'|'clear'|'rescue'} Goal */
/** @typedef {'habitat'|'wiped'|'turns'|'rescue'} LostReason */
/** @typedef {{kind: 'move', band: string, path: Pos[]} | {kind: 'act', band: string, action: string, target: Pos} | {kind: 'end'}} Move */
/** @typedef {{kind: 'moved', band: string, to: Pos} | {kind: 'falls', band: string, at: Pos, cause?: 'terrain'} | {kind: 'bumped', band: string, other: string|null}} PushOutcome */
/** @typedef {{kind: 'move', band: string, path: Pos[]} | {kind: 'action', actor: string, actionId: string, from: Pos, target: Pos} | {kind: 'damage', band: string, amount: number, wiped: boolean, cells: Pos[]} | {kind: 'terrain', at: Pos, from: TerrainKind, to: TerrainKind, cause: string} | {kind: 'push', outcome: PushOutcome} | {kind: 'capture', at: Pos} | {kind: 'pickup', at: Pos} | {kind: 'freed', band: string} | {kind: 'plan', band: string, plan: Plan|null}} BattleEvent */
/** @typedef {{levelId: string, width: number, height: number, tiles: Tile[][], bands: Band[], pickups: Pos[], objectives: Objective[], goal: Goal, turn: number, turnLimit: number|null, forestStart: number, habitatStart: number, pickupsTaken: number, outcome: 'won'|'lost'|null, lostReason: LostReason|null, events: BattleEvent[]}} BattleState */
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
/** @typedef {{id: string, name: string, blurb: string, goal: Goal, maxBands: number, turnLimit: number|null, grid: string[], bots: Placement[], trapped: Placement[], firstClearSeeds: number, assumes: Record<string, number>, solution: Solution, alternatives?: Solution[], naive?: Solution, dens?: DenKinds}} Level */
// `story.seen` holds the id of every scene the player has seen. It was added
// with the opening act, with no version bump: `migrate` gives an old save
// an empty one.
/** @typedef {{version: 1, seeds: number, bands: Record<string, {maxLen: number}>, cleared: Record<string, boolean>, story: {seen: Record<string, boolean>}}} Progress */
/** @typedef {{pickups: number, objectives: number, forest: number, firstClear: number, total: number}} Reward */

export {};
