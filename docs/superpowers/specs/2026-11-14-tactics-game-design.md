# Undergrowth: a small tactics game (design)

Size: project. Working title **Undergrowth** and repo name `undergrowth`
are placeholders (my call) and easy to rename before launch.

This spec lives in the launcher repo for now. It moves into the game's own
repo when that repo is created.

## Intent

Jake wants a small turn-based tactics game he can play in his phone's
browser, linked from jakecp.github.io. It replaces the "A little game ·
coming soon" row on the launcher.

The inspirations are *Into the Breach*, *Lego Spybotics: The Nightfall
Incident* and Cartoon Network's *Captain Planet and the Robots of Zarm*.
What he wants from each:

- **Into the Breach:** turns that feel like a chess puzzle. Enemies show
  exactly what they will do, nothing is random, and each turn has a good
  answer you can find by thinking.
- **Spybotics (his favourite):** variety. A big, growing roster of very
  different units means one level can be solved several ways depending on
  what you bring. Above all, **terrain control**: some units delete tiles
  and others create them, so you carve paths and reshape the map. Also
  Spybot's rule that **a unit's length is its health**. A unit trails
  segments as it moves, and hits remove segments. Fragile hard-hitters (2–3
  segments) trade off against huge weak units (his "sumo wrestler") that
  work as battering rams and walls.
- **Zarm:** protecting nature as the theme, and terrain that matters.

This must be an **original game**. It borrows mechanics and genre, never
names, characters, art, music or levels from any of those games.

## The game in one paragraph

Forest animals are taking back land that an **illegal logging company** has
cleared, and driving out its gardening and forestry robots. Each level is
a small hand-designed map drawn like an ink-on-paper war map. You deploy a
few **bands** of animals (a band of ants, a band of badgers), march them
across the map, and dig, build and fight your way to the company's
**forged permits and survey stakes**. The bots show exactly what they will
cut or hit next turn. Every turn they keep cutting forest, so speed
matters. Between battles you spend seeds at a trading post on recruits and
new bands, and you can replay any beaten level.

## Goals

- **Puzzle-tight turns.** Fully deterministic. Every bot's next action is
  visible before you move. You can undo freely within your own turn.
- **Several ways through every level**, driven by squad choice and terrain
  manipulation.
- **Terrain control is the heart of the game.** Badgers dig tiles out,
  beavers build tiles, and bots mow and pave. The map changes shape during
  a battle.
- **Bands grow.** A band's length is its health and its size. Recruiting
  more animals raises its maximum length, and big enough bands get a new
  name (Ant Colony → Supercolony) and perhaps a new ability.
- **Phone first.** Playable with one thumb in portrait. Also works with a
  mouse on desktop.
- **A first playable**, then growth: 5 levels, about 6 animal bands, 3 bot
  types, the trading post and the campaign map. Then grow to roughly 20
  levels.

## Non-goals (for now)

- Generated or hand-drawn art. Emoji stand in for all units (see Look).
- Sound and music.
- A level editor. Revisit after the first 5 levels exist.
- A commander character. Jake liked "strategic command is the Fox and the
  Hedgehog" (a nod to Tetlock), but decided it's a mechanic on top of a
  mechanic with no link to terrain. It's parked as possible framing for
  later.
- Accounts, cloud saves, multiplayer, procedurally generated levels.

## Anti-goals (failures even if it works)

- **Any randomness in combat or bot behaviour.** No dice, no hit chances,
  no random tie-breaks.
- **A level that needs a particular unit type.** No level may require a
  band type that's only sold in the shop. Every level must be winnable
  with the three starter types (ants, badger, beaver).
- **Grinding is allowed, a little** (Jake's call, as in Spybot). A level may
  need starter bands grown bigger with recruits, which can mean replaying
  earlier levels for seeds. The seeds needed should be reachable with a
  few replays, not a slog.
- **A busy board.** The map should stay calm and readable like an ink
  sketch, with a little life in it but no clutter.
- **Recognisable borrowed material** from Spybotics, Into the Breach,
  Captain Planet or anything else.

## Constraints

- Static site on GitHub Pages at `jakecp.github.io/undergrowth/`, in its
  own repo, like Jake's other apps (`augury`, `yijing`,
  `classical-chinese`).
- Matches how those apps are built: plain JavaScript ES modules, `index.html`
  at the root, `.nojekyll`, a manifest and a service worker scoped to the
  app's own path, tests run with `node --test`, and a GitHub Actions test
  workflow.
- No trackers, analytics, third-party requests or accounts.
- Progress saves in `localStorage`, behind a versioned save format so
  later updates can migrate old saves.
- Must work offline once loaded, as a PWA like the other apps.
- A build step is acceptable to Jake if it earns its place, as long as the
  site still deploys to GitHub Pages. None is planned.
- The launcher repo (this one) must keep having **no** service worker. The
  only change here is replacing the placeholder row with a link to the game.

## Approaches considered

1. **Plain JavaScript, board drawn as SVG** (chosen). A pure,
   deterministic rules module (state + move → new state) is fully
   separate from rendering, so it can be tested, undone and simulated. The
   board, stamps and ink map are SVG, which stays crisp on a phone and
   makes tiles easy to tap. Levels are text grids in data files. Type
   safety comes from JSDoc type comments checked by `tsc --checkJs` in the
   test run (TypeScript as a dev dependency only). No build step; it ships
   as plain files. Trade-off: simple slide and fade animations only, no
   engine effects.
2. **A game engine (Phaser) on canvas.** Comes with sprites, tweens, sound
   and scenes. Rejected: it's a different setup from Jake's other apps, a
   bigger download, clumsy for menus like the shop, and a poor fit for the
   ink-on-paper look.
3. **TypeScript (optionally with Effect) and a build step.** Jake asked
   about Effect. Rejected: Effect is a TypeScript library for
   failure-heavy, concurrent I/O code (retries, networking, resources).
   This game has no server, no network and no concurrency. Its core is one
   pure function, and correctness comes from pure rules, replay tests and
   level checks (below). JSDoc plus `tsc --checkJs` gives most of
   TypeScript's benefit without a build.

## Decided with Jake

### Setting and look

- Forest animals vs. the illegal logging company's gardening and forestry
  bots. It's an offensive campaign: reclaim deforested land.
- **Ink-on-paper war map.** Cream paper (the launcher's `#f4efe6` is a
  fine base), faint grid, ink-drawn terrain. Slightly lively forest
  ground: grass tufts, wildflowers, mushrooms, stones. Bot damage shows as
  mown stubble and grey paving.
- **Pieces are round seal stamps with a white silhouette.** An emoji is
  rendered pure white through an SVG colour-matrix filter on a solid
  disc: green for animals, rust for bots. The trailing body is a thick
  stroke of the same colour with a dot on each segment. Jake chose
  silhouettes because units get lost and it keeps things a bit abstract.
- **Where two animals blur together, use a signature symbol** instead of
  the animal: 🐾 paw for the bear, a tail or log for the beaver. The 🪵
  log and 🤖 robot both read as blobs in silhouette and need better
  symbols. Emoji are placeholders, so each unit type's glyph must be one
  data field that can later point to an image.
- No Chinese characters or other China-themed styling. Jake's other apps
  already cover that.
- Reference mockup (local only, not committed):
  `.superpowers/brainstorm/25754-1794710160/content/stamps-and-tiles.html`
  in the launcher repo.

### Units are bands

- A unit is a **band** of animals: the leader is the head stamp, and the
  rest trail behind as body segments. Length = number of animals = health.
- A band deploys as **just its leader** (length 1). As it moves, its body
  grows behind it, one segment per tile moved, up to its current maximum.
  (This is the "marching out of camp" picture.)
- **Damage removes segments from the tail end.** If damage is at least the
  band's current length, the band is wiped out for the rest of that
  battle. Bands are never lost permanently.
- **Bands regrow by marching** (Jake's decision, after the builder check).
  Damage lowers a band's *current* length, never its maximum. Moving
  regrows it one segment per tile moved, up to the maximum, exactly as at
  deploy. A hit costs time and position, not the band for good. This is
  what lets a big band work as a battering ram: take a hit, march on,
  refill. The engine tracks current and maximum length separately.
- **Growth:** buying recruits raises a band type's maximum length. Past
  set sizes the band gets a new name (Ants → Ant Colony → Supercolony) and
  possibly a new ability. "Bigger is simply better" replaces an earlier
  idea that stretching out would weaken a band.
- Bots are bands too and follow the same body, damage and regrowth rules.
- **You own one band of each type** (my call, after the builder check).
  The shop sells new band *types* and *recruits*. Recruits raise that
  band's maximum length and move it up the growth tiers. Progression
  state is one record per owned type: maximum length, tier and unlocked
  abilities.

### Pushing

Jake's decision, after the builder check: **some units can push.** This
pairs with terrain control. The badger digs a pit, and the bear shoves a
bot into it or into the river.

- A push moves the target band's **leader** one tile directly away from
  the pusher, and its body follows as if it had moved one tile.
- A bot pushed into **water or a hole** is destroyed (bots can't swim or
  climb out). An animal that isn't flying and is pushed there is wiped out
  for the battle. No bots push in the first playable, but the rule is
  symmetric for later.
- A push into **stones, an occupied tile, or a tile the target can't
  enter** (bots can't enter forest) is blocked. The target stays put and
  both the target and whatever blocked it take 1 bump damage.
- Pushers in the first playable: the **Bear** (maul 3 *or* shove 1 with
  damage 1) and the ants once they reach **Ant Colony** size (ram: shove 1,
  no damage). Exact numbers are tunable.
- The preview shows what a push will do before you confirm it: where the
  target ends up, falls or bumps.

### Objectives

- Mixed objectives, but **most levels are "reach and capture"**: get a
  band to the company's forged permits or survey stakes. Others, for
  variety: clear all bots, rescue a trapped band (it joins you for that
  battle), and the occasional hold-out.
- **The clock is the forest.** Every bot turn, bots mow or pave some
  terrain. How much forest is left when you win feeds the seed reward.
  This keeps pressure on without making levels about defence.
- You **lose** a level only when every band is wiped out. A level may also
  set a turn limit if its puzzle needs one.

### Progression

- **Hand-designed campaign**, targeting about 20 levels. The first
  playable has 5.
- **Campaign map:** the valley in the same ink style, with levels as
  places on it. Beating one unlocks its neighbours, with some branching so
  you can choose your order.
- **Trading post (shop):** on the map and open any time between battles.
  Spend **seeds** on new band types and recruits for bands you own.
- **Seeds come from:** pickups on the battle map (collected when a band
  moves over them), captured objectives, the forest bonus, and a
  first-clear bonus.
- **Every beaten level can be replayed.** Pickups come back on each replay.
  The first-clear bonus is paid only once.

### A battle

1. **Deploy.** The level sets how many bands you may bring and which
   tiles you may start on. You choose from your roster.
2. **Your turn.** Each band may move its leader up to its speed and then
   take one action (attack, dig, build or a special). Acting ends that
   band's turn. You can undo anything in your turn until you press end
   turn.
3. **Bots' turn.** Bots carry out exactly what was shown, then move, then
   show their next actions. Nothing is random.

## My calls (Jake can overrule)

- **What the bots show (Into the Breach model).** During your turn each
  bot shows the **tile its next action will hit**, not a planned walking
  route. The action is stored *relative to the bot* (a direction and a
  distance), so **pushing a bot moves where its action lands**. Their turn
  goes: (1) resolve every shown action from the bot's current position,
  hitting whatever is on that tile then, (2) move by deterministic rules,
  (3) show new actions. You can always answer a shown threat: kill the
  bot, push it so it aims somewhere else, move out of the way, or change
  the target tile (for example, dig out the forest tile a harvester is
  about to mow, so the mow does nothing). The mockups' dashed paths become
  a short line from bot to target tile.
- **Deterministic bot movement**, by type. Harvesters head for the nearest
  forest. Saw-drones head for the nearest band. Planter-bots head for
  open ground near your objectives. Ties break in a fixed order, a
  Zarm-style priority list by band type, then position. The exact rules
  are the builder's, as long as they're deterministic and easy to explain
  in one sentence per bot type.
- **Terrain types for the first playable:**
  - **Open ground** (grass, flowers and mushrooms are cosmetic variants):
    anyone can walk here.
  - **Forest:** animals can walk here, bots cannot. This is why saving it
    matters.
  - **Stubble:** what forest becomes after it's mown. It's open ground.
  - **Paving:** open ground that can't be dug.
  - **Water:** impassable except for flyers.
  - **Hole:** what a dig leaves. Impassable except for flyers.
  - **Dam/bridge:** walkable, built over water or a hole.
  - **Stones:** impassable, can't be dug.
- **Dig and build.** A badger digs an adjacent empty tile of open ground,
  stubble or forest into a hole (digging a dam leaves water). A beaver
  builds a dam on an adjacent water or hole tile. Bots can cut dams.
- **Starting roster** (stats are a starting point to tune):

  | Band | Speed | Max length | Action |
  |---|---|---|---|
  | Ants (starter) | 3 | 4 (grows to 8+) | bite 1, adjacent. At Ant Colony size: ram (push 1) |
  | Badger (starter) | 2 | 3 | dig, or bite 1 |
  | Beaver (starter) | 2 | 3 | build |
  | Bear | 2 | 2 | maul 3, or shove (push 1, damage 1), adjacent |
  | Owl | 4, flies | 1 | strike 2, range 2–3 |
  | Bees | 3 | 4 | sting 1 in a line of 3 |

  The bots for the first playable are the Harvester (mows a forest tile,
  damage 1), the Saw-drone (fast, damage 2), and the Planter-bot (paves a
  tile, damage 1).
- **Repo and launcher.** A new repo, `undergrowth`, served at
  `/undergrowth/`, with its own manifest and scoped service worker like
  `augury`. The launcher's placeholder row is replaced with a normal app
  row once the first playable ships.

## Correctness strategy

- The rules engine is pure and deterministic. The same state plus the same
  move always gives the same result, and it has no DOM access.
- Unit tests for every rule: movement, body growth and regrowth, tail
  damage, dig and build, pushes (move, fall, bump), bot actions, bot
  movement and tie-breaks.
- **Replay tests.** Each level ships with at least one recorded winning
  move sequence that uses only the three starter types, at band sizes the
  player could afford by that point in the campaign (the level file
  declares the sizes it assumes). A test replays it on every change.
- **Level checks.** Every level file parses, deploy tiles are walkable,
  objectives are reachable, and every level has a starter-types solution
  (covered by the replay test).
- JSDoc types checked with `tsc --checkJs` in CI.

## Left to the builder

- Exact numbers: speeds, damage, prices, seed rewards, growth thresholds,
  tier names past Supercolony.
- The exact bot movement algorithm and tie-break order, within the
  constraints above.
- The five first-playable level designs, the campaign map layout, and
  which band types the shop sells first.
- File layout, level file format (text grid plus a legend and unit
  placement is the expected shape), save format, animation details, the
  touch interaction model (tap band → tap destination → tap action
  target is the obvious default), and accessibility details.
- Better symbols for the stamps that blur.
