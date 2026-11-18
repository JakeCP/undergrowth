# Snake Rules in the Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots plan within the snake-body rule, and the lab has one "Snake bodies" switch, on by default, that sets the rule both ways for every level played there.

**Architecture:** Under `snakeBodies`, `approach()` in `js/engine/bots.js` stops treating the bot's own body as a fixed wall. For each legal landing tile it already lists (`walkOptions`, which follows the rule exactly), it measures the distance to the nearest goal with a forward breadth-first search from the landing tile, where each of the bot's own body cells (as they stand after the walk) opens from the step its tail end has left it. The lab's tick state starts with `snakeBodies` on, and `levelToPlay` makes that tick decide the rule in both directions.

**Tech Stack:** plain JS ES modules, JSDoc types (`npx tsc -p jsconfig.json`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-snake-rules-design.md`

## Global Constraints

- With the rule off, nothing changes: every campaign test, replay test and pinned bot plan passes untouched.
- Deterministic: no randomness, same tie-break order as now (`closer()`).
- The lab's ticks stay unsaved (they live as long as the page).
- Tick-box label: "Snake bodies: a head can't step onto its own body. The body slides after it, or grows behind it when the band is short."
- Level-row line for a level built for the rule: "Built for snake bodies". Other own rules keep the "Its own rules: …" line.
- Type check with `npx tsc -p jsconfig.json`, not `npm run typecheck`.

## Review Focus

1. A bot whose goal is behind its neck in a one-tile corridor (the l03 stall): it must walk out and round, not stand still. Pinned in Task 1.
2. A bot boxed in by its own body and stones with truly no way out: still stays put and plans nothing (existing test `a bot boxed in by its own body…` must keep passing).
3. A wounded bot that regrows (tail stays while it grows): its body cells open later, not sooner. Pinned in Task 1.
4. The harvester's through-the-forest `route` field (used by its strike) is unchanged by the new distance. Existing harvester tests cover it.
5. Unticking snake bodies in the lab on t03 really plays without the rule (the Coil then walks over itself). Pinned in Task 2.

---

### Task 1: Bots measure distance with their body clearing behind them

**Files:**
- Modify: `js/engine/bots.js` (`approach`, new `snakeDistance`; doc comment above `approach`)
- Test: `tests/snake-bodies.test.mjs`

**Interfaces:**
- Produces: `snakeDistance(state: BattleState, bot: Band, cells: Pos[], goalKeys: Set<string>, passable: (tile: Tile) => boolean, blocked: Set<string>): number|undefined` (module-private): steps from `cells[0]` to the nearest tile in `goalKeys`, or undefined.

- [ ] **Step 1: Write the failing tests** in `tests/snake-bodies.test.mjs`, using the file's existing helpers (`makeState`, `botTurns`, `bandById`, `isPath`, `SNAKE`):
  - `rule on: a planter whose den lies behind its neck in a one-tile corridor turns out of the corridor and reaches the den` — a corridor board where the only route to the den starts by going back past the neck once the body has moved; assert the first plan's path is non-empty and that within 8 turns the planter strikes the den tile, its cells always `isPath`.
  - `rule on: l03's planter, with the rule on and nobody near, reaches striking range of a den by turn 4` — `createBattle(withRules(l03, {snakeBodies: true}), <l03's recorded deploy>, progress)`, end turns only; assert some den tile is struck (or a `damage`/`terrain` event on a den) by the bots' 4th turn, matching the rule-off behaviour.
  - `rule on: a wounded regrowing bot does not plan through body cells its tail has not yet left` — a saw-drone at 1 of 2 with its goal across a cell it will only vacate after growing; assert its planned path never enters a cell still held by its body at that step.
- [ ] **Step 2: Run** `node --test tests/snake-bodies.test.mjs` — expected: the corridor and l03 tests FAIL (the bot stands still / no den hit).
- [ ] **Step 3: Implement.** In `approach()`, when `state.rules?.snakeBodies === true`: `shunned` is just `avoid` (drop `bot.cells.slice(1, -1)`); keep computing `field` with `distanceField` (it is still returned for the harvester's route); but for each option, `dist` is `snakeDistance(state, bot, cellsAfterWalk, goalKeys, passable, blocked)`, where `cellsAfterWalk` is the bot's cells after `bandAfterStep` along `option.path`. `snakeDistance` is a layered BFS from `cells[0]`: a cell in `blocked` (other than a goal) is never entered; the bot's own cell at index `i ≥ 1` of `L = cells.length` is enterable at arrival step `t` only if `t >= (L - i) + grow`, where `grow = botGrows(bot) ? max(0, bot.maxLen - L) : 0`; a cell not enterable at its first arrival may be entered later from another neighbour (mark visited only on entry). Return the arrival step of the first goal cell popped (0 if `cells[0]` is a goal). Update the doc comment above `approach` to say the body clears behind it.
- [ ] **Step 4: Run** `node --test tests/snake-bodies.test.mjs tests/new-bots.test.mjs` — all PASS, including the existing boxed-in and facing-away tests.
- [ ] **Step 5: Run the whole suite** `npm test` and `npx tsc -p jsconfig.json`. Any lab level whose recorded line now fails (t03–t07 are built for the rule): replay it with `node scripts/solve.mjs <id> --replay`, find a new line with `node scripts/solve.mjs <id>`, and record it, keeping the level's design note true; note each re-record in the commit message. No campaign file changes.
- [ ] **Step 6: Commit** — `Under snake bodies, bots count their own body as clearing behind them`.

### Task 2: One lab switch for snake bodies, both ways, on by default

**Files:**
- Modify: `lab/lab.js` (`ticked` initial value, `levelToPlay`), `lab/lab-view.js` (`RULE_LABELS.snakeBodies`, `ownRules`, `levelRow`)
- Test: `tests/lab.test.mjs`

**Interfaces:**
- Consumes: `withRules(level, rules)` from `js/engine/battle.js` (unchanged, add-only).
- Produces: `levelToPlay(picked: Level): Level` — the ticked rules on top of the level's own, except `snakeBodies`, which is exactly the tick (on or off). `ticks()` starts as `{ snakeBodies: true }`.

- [ ] **Step 1: Write the failing tests** in `tests/lab.test.mjs` (reset ticks at the end of each test so others are unaffected):
  - `the lab starts with snake bodies ticked` — `ticks()` deep-equals `{ snakeBodies: true }` on load.
  - `the snake bodies tick decides the rule both ways` — ticked: `levelToPlay(<campaign l01>).rules.snakeBodies === true`; unticked: `levelToPlay(<lab t03>).rules.snakeBodies` is not true, and `woodOnlyGrowth` keeps its add-only behaviour.
  - `a level built for snake bodies says so in its row` — the rendered t03 row contains "Built for snake bodies" and not the old label; the tick box's label equals the new `RULE_LABELS.snakeBodies`.
  - Update the existing tick test at `tests/lab.test.mjs:141-148` for the new starting state (`{ snakeBodies: true, woodOnlyGrowth: true }` etc.).
- [ ] **Step 2: Run** `node --test tests/lab.test.mjs` — expected: the new tests FAIL.
- [ ] **Step 3: Implement** — `ticked` starts `{ snakeBodies: true }`; `levelToPlay` applies `withRules` then sets or deletes `rules.snakeBodies` from the tick; `RULE_LABELS.snakeBodies` gets the Global Constraints wording; `ownRules` leaves `snakeBodies` out and `levelRow` adds a `lab-row__rules` span "Built for snake bodies" when the level sets it. Update the comment above `levelToPlay` (it no longer says an unticked rule never takes one away, for snake bodies).
- [ ] **Step 4: Run** `npm test` and `npx tsc -p jsconfig.json` — all PASS.
- [ ] **Step 5: Commit** — `One snake bodies switch in the lab, on by default, both ways`.

### Task 3: Measure, look, merge

- [ ] **Step 1:** Bench before (integration) and after (this branch): `node scripts/bench.mjs`, `--rule snakeBodies`. Save both tables for the report. Expected: l03 no longer cleanly won by a boring player with the rule on.
- [ ] **Step 2:** Play t03 in the browser from `#lab` with the switch on and off (the worktree's own server on a free port), and screenshot the Coil's plan in each.
- [ ] **Step 3:** Merge `--no-ff` into `integration`; raise `sw.js` `APP_VERSION` past every branch's and run `npm run precache-hash` (see the integration workflow); `npm test` on integration.
