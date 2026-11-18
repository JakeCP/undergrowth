# Snake rules in the lab (design)

Size: a small change.

## Intent

Jake wants bodies to work as they did in Lego Spybotics, and as in the game
Snake, because a body you can't cross is what makes moving a strategic
choice. Today the lab's `snakeBodies` trial rule moves bodies correctly,
but the bots don't plan for it, and the rule can't be switched off on the
lab levels that build it in. An audit (2026-11-17) found the planning gap:
on l03 with the rule on, the planter-bot stalls behind its own neck, which
is why boring players start winning l02 and l03.

The rule, in Jake's words and example: a head may only step onto a free
tile beside it, never onto its own body. If the band is below its maximum
length, the step grows a new segment and the tail stays; if it is at its
maximum, every segment slides up one and the tail's tile is left empty.

## Goals

- **Bots plan within the rule.** A bot considers only the tiles its head
  can legally land on this turn (never its own body), and picks the one
  best for its goal. "Best" is measured with its own body clearing behind
  it as it moves, so it no longer treats its body as a permanent wall.
  Bots don't need to be clever beyond that: no multi-turn look-ahead.
- **One switch in the lab**, "Snake bodies", ticked by default, that turns
  the rule on or off for every level played from the lab: the test levels
  and the campaign levels listed there. It overrides a level's own setting
  in both directions.
- **Plain wording.** The tick box and each level row describe the rule as
  it plays, e.g. "Snake bodies: a head can't step onto its own body. The
  body slides after it, or grows behind it when the band is short." Levels
  built for the rule say so ("Built for snake bodies") rather than listing
  it as a rule that is always on.

## Non-goals

- The campaign outside the lab does not change. With the rule off,
  everything plays exactly as now and the campaign replay tests still pin
  the bots' plans.
- Growth rules don't change: animals still grow when fresh from camp or in
  the wood, and the Coil still doesn't mend. (Jake's example says a short
  band grows as it moves; under this design that happens only where it
  already does. Changing growth would be its own trial rule.)
- No re-recording of campaign lines, and no change to which levels the
  rule is built into.

## Anti-goals

- Bots that pass through their own bodies, or show a plan they can't
  follow.
- A planner slow enough to be felt: plans are remade after every move, and
  the bench and the solver run it thousands of times.

## Approaches

1. **Chosen: plan with the body clearing behind it.** The onward route is
   found with each of the bot's own body tiles counted as free from the
   step its tail end will have left it (the tail end first; later if the
   bot is growing). Shortest routes then match the rule. About the same
   cost as today.
2. Only stop counting the neck as a wall. Simpler, but bots would plan
   routes their bodies can't take and change their minds the next turn.
3. A full search over every body shape for a few turns. Exact, but too
   slow for a planner that runs after every move.

## Decided

- Approach 1, chosen by Jake.
- The lab switch: one tick box, on by default, both ways, all lab-played
  levels.
- A full-length head may step onto the tile its own tail leaves that same
  step, as in Snake (the engine already allows this).

## Left to the builder

- The exact wording of the tick box and the level-row line.
- How the lab stores the switch (it stays unsaved, as the ticks are now).
- Updating the tests that pin the old label or the old routing, and adding
  one for the l03 neck stall.
- Re-running the bench (campaign and `--lab`, with and without the rule)
  and reporting the before and after tables; re-checking the lab levels'
  recorded lines (t03 to t07 are built for the rule).
