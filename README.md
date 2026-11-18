# Undergrowth

A small, deterministic, browser-based tactics game about animal bands reclaiming land from tidy-minded machines. It is plain JavaScript ES modules with no build step and no runtime dependencies; the rules engine in `js/engine/` is pure and uses no randomness. Run the tests with `npm test` and the type check (JSDoc types, `tsc --checkJs`) with `npm run typecheck`.

## Round benchmarks

Run `npm run bench` for the campaign, then the lab, then the alt levels (Alt 1–5, `a01`–`a05`, in `lab/alt/`), or `npm run bench -- l03` for one round (any id works, `a02` too). Use `--lab` for the lab alone, `--alt` for the alt levels alone (both flags together run both), or `--rule snakeBodies` to judge the selected rounds with a trial rule enabled. Sandbox boards are excluded. The command exits with 0 when every selected round passes, 1 for a failed or empty selection, and 2 for invalid arguments.

A round passes when all three checks hold.

- **A player can win.** The engine replays a complete recorded solution using the guaranteed campaign roster or the lab roster, at the level’s assumed sizes. The report identifies the winning recording and turn.
- **Simple play finds no clean win.** Six policies try rushing the goal, chasing bots, guarding dens, camping in trees, focusing one bot, and waiting. They try every roster pick, camp assignment, and fixed band order, plus recorded shop deployments. Moving policies try both the first and last equally good walk. A win with every den whole is a **shortcut** and fails the round. A win with a den damaged is a **warning** to look at; the round still passes. A repeated position ends a deterministic run.
- **Every run is settled.** A run still unresolved after 100 turns prevents a pass.

The report also counts **turns with a tactical consequence** on the winning line: before the winning order, skipping one order, walking a different path, or retargeting an action costs a band, damages a den, or leaves a bot blocking a teammate’s winning walk next turn. It sees only what a change costs within that same turn, so a lesson that pays off later (luring a bot off a den) can score zero. It gives a designer specific decisions to playtest and never decides the verdict.
