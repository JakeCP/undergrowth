# The fox's Dash (design)

Size: a small project, tried as a trial rule in the lab first. Branch
`fox-dash`, worktree `~/undergrowth-worktrees/fox-dash`, cut from
`integration`.

## Intent

The hedgehog has Bristle; the fox has only Bite 1 and speed 3, which the
ants match and the owl and the hunter beat. Jake wants the fox to have a
signature of its own: **it can dash, running further than any other walker,
but it cannot bite that turn.**

The moment Jake pictures is The Dry Stone Wall (l03): a planter-bot is
paving its way to a den, and the problem is getting there in time. The fox
dashes in front of the planter, so its strike lands on the fox and not on
the den: the fox may be spent to move a bot's target. So the dash is for
**reaching and baiting**, not for fighting.

How baiting works under the planter's rules today (`js/engine/bots.js`),
which the dash does not change. The planter heads for the nearest den it can
walk to. It turns on a band only when it is engaged (it could walk up to the
band and strike it this turn: within its reach of 3) and the band is strictly
nearer than the den. It never sees a band standing in forest. It strikes a
den before a band, and a strike on a tile a band stands on hits the band,
never the den. So the fox can save a den in two ways:

- **The lure:** end the dash out of the forest, within the planter's reach
  and nearer to it than the den, so it walks to the fox.
- **The shield:** end the dash on the den itself, as the fox does in l03.

Ending next to the den but off it does not save the den: the planter strikes
the den first.

## Goals

- One clear choice for the fox each turn: walk and bite, or dash and don't.
- Far enough to beat every walking bot to a spot: the fox dashing (5) outruns
  the hunter (4) and the saw-drone (3), and covers more than half the 8×8
  board.
- Tried in `#lab` as a trial rule, with a test level built on the baiting
  case, and judged by the bench, before it touches the campaign.

## Non-goals and anti-goals

- No change to the campaign, the shop or saves while it is a trial rule.
  With the rule off, the game is exactly as it is now.
- No jumping: the dash crosses nothing a walk could not.
- No new rings, boxes or dashed outlines on the board (Jake's look rules).
- A failure even if it works: a dash that is just the better move every turn
  (the bite never worth taking), or dash tiles you can't tell apart from
  walk tiles.

## Approaches

1. **Up front (chosen).** Dash is decided before the fox walks: that turn it
   runs up to 5 and cannot bite.
2. **Run on.** After its walk, the fox spends its action on 2 more tiles,
   or runs 5 at once before walking. Its point was seeing the bots' new
   plans after the walk before giving up the bite.
3. **Long legs, no button.** The fox always walks up to 5, but a walk over 3
   uses up its bite.

Jake picked up front: Undo already gives the look-then-decide that the run-on
was for, since the bots' plans redraw after any move and Undo takes it back.
The way you pick it (below) borrows from 3: the dash tiles can be tapped
straight away, as well as through a Dash button.

## The rules

All under the trial rule `foxDash`. With it off, nothing below exists.

1. **Who.** The fox only (the `fox` band type), one of the player's bands
   that is not trapped.
2. **When.** Only before the fox has walked or acted this turn. Once it has
   walked, Dash is gone for the turn (greyed in the panel); once it bites, its
   turn is over as now. It may dash even when a bite is on offer: giving up
   the bite is the choice. Nothing hides or plays down Dash then (my call).
3. **How far.** The **dash tiles** are the tiles the fox could reach in up to
   5 steps by its usual walking rules (`reachable` with 5 steps) that it
   **cannot** reach in its usual 3. Tiles within 3 stay walk tiles: dashing
   to them would only throw the bite away.
4. **What happens.** The fox walks the path to the dash tile, exactly as a
   walk does. Then its turn is over: it has walked and acted, so it cannot
   bite. It is one move in Undo, like a walk.
5. **Ground.** The same as walking: water, holes and stones stop it, dams can
   be walked, and forest, paving and stubble are open. Nothing is jumped.
6. **Other bands.** It cannot pass through any band, friend or bot, and must
   end on free ground, as now.
7. **Snake bodies.** With `snakeBodies` on as well, each step is judged
   against the body as it then stands, as for any walk (`reachableFollowing`
   with 5 steps). The body follows the head along the dash.
8. **Along the way.** Everything a walk does on its path, it does on the
   dash: it captures permits and stakes it steps on, takes seed pickups,
   grows by the normal growth rules (on any tile while fresh, otherwise in
   forest only, up to its length), and frees a trapped band its head ends
   next to.
9. **Bots.** A dash is a move: the bots' plans are made again after it, so a
   planter that now has the fox nearer than its den shows its new plan at
   once. Bot targeting is unchanged (`TARGET_PRIORITY` keeps the fox where
   it is). A bot never dashes.
10. **Turn state.** A fox that can still dash counts as able to move (a fox
    boxed in for a walk but with a dash tile is "ready"). A fox that has
    dashed is "done".

## What the player sees

- **On the board.** With the fox selected and able to dash, walk tiles keep
  their glow and bite targets look as now. The dash tiles beyond them get a
  **softer, cooler glow**: plainly the same kind of thing, plainly further
  out. You can tap a dash tile straight away, with no pop-up first: the fox
  keeps tapping the way it does today.
- **Hover / message line.** Over a dash tile, the message line says
  `Dash here: the fox can't bite this turn.`
- **Focus panel.** The fox's actions read `1 Bite` and `2 Dash`. Dash is
  lit while the fox can still dash and greyed once it has walked. Choosing
  it (the button, or key 2) shows only the dash tiles, with the hint `Dash:
  tap a tile to run to`. In that view walk tiles and bite targets are not
  shown and a tap on them does nothing, as with any chosen action today.
  Choosing it again, or Escape, goes back to the usual view. A fox that has
  dashed shows as done, like any band that has acted.
- **Unit card.** Under the trial rule, the fox's card lists a second action
  line: **Dash** `Runs up to 5 tiles instead of 3, but cannot bite that
  turn.` (the number comes from the fox's speed plus the dash's 2). Without
  the rule the card is unchanged.
- **Log.** A dash is told like a walk, with the word dash: `The fox dashes.`
  (or however the log words a walk today, with "dashes" for "moves").
- **Sound and motion.** It moves like a walk, a little quicker per step if
  that is cheap. Otherwise the walk as it is.

## The lab

- `foxDash` joins `TRIAL_RULE_IDS`, the `Rules` type and the lab's
  `RULE_LABELS` (`The fox can dash: run 5 tiles, but no bite that turn`).
- **A test level, t08 "The Long Run"**, built on the lure: a planter starts
  where no walking band can get within its reach (out of the forest, nearer
  than the den) or onto the den before the den falls, and the fox dashing
  can. The shield may be a second answer. The level's own file turns
  `foxDash` on (`rules: {foxDash: true}`). Its header comment records the
  idea, the answer, the bench and the fastest lines found, as t01 does.
  **It needs the dash** when its recorded line wins with every den whole,
  and with the rule taken off a copy the solver finds no line within 12 turns
  that keeps every den whole (my call on the threshold).
- **The bench learns to dash**, or the bench can't judge the rule: a player
  whose band can dash and has no bite target from any walk tile dashes when
  a dash tile is strictly nearer its goals than every walk tile. "Goals" and
  "nearer" are what each player already walks by (`goalsFor` and
  `distances` in `scripts/bench.mjs`). Otherwise it plays as now. With the
  rule off, every result stays the same.
- **The solver** (`scripts/solve.mjs`) should find dash moves the way it
  finds any action, so t08's fastest lines can be recorded.

## Constraints

- The engine stays pure, and `applyMove` is still the one way in. A shown
  plan must still be exactly what the bots do (the dash is a move, and plans
  are made again after every move).
- `actionsFor(typeId, maxLen)` has no state, and the rule lives on
  `state.rules`. The dash must exist only where the rule is on, everywhere
  the game lists or checks a band's actions (the engine, the focus panel, the
  unit card in battle, the bench and the solver), without making the fox's
  actions different anywhere the rule is off.
- Files under `lab/` load from the network, but `js/` is precached: the rule
  isn't felt in `#lab` until `sw.js` `APP_VERSION` is raised past every
  branch's (74 on integration now), then `npm run precache-hash`.
- Tests with `node --test`; types with `npx tsc -p jsconfig.json` (not
  `npm run typecheck`, which falsely exits 1 in agent shells).
- Not merged into integration without asking Jake.

## Left to the builder

- Whether Dash is an `ActionDef` (effect `dash`, targets the dash tiles)
  or a move with a flag (`{kind: 'move', dash: true}`). It needs one rule
  check, one turn result, and the same captures, growth and freeing as a walk
  either way.
- How the rule-aware action list is reached (a state-taking variant of
  `actionsFor`, or a filter at its callers).
- The exact glow colour, within the existing board look.
- t08's exact grid, as long as it shows the case above and the bench and
  solver say what the header claims.

## Calls I made (for Jake to check)

- The range: 5 in all (speed 3 + 2).
- Dash tiles are only the ones a walk can't reach.
- A dash grows and mends the fox like a walk, so a long run through the wood
  heals more.
- The fox stays tap-to-go (no pop-up); the Dash button is there for keys and
  for showing the dash tiles alone.
- The bench's dashing rule, above.
- The fox may dash with a bite on offer; nothing steers you away from it.
- t08 is built on the lure, and "needs the dash" means no den-whole line
  within 12 turns with the rule off.
- No change to how the planter picks its target: the lure works by the
  rules it has today.
