/** @typedef {import('../engine/types.js').Progress} Progress */
/**
 * A level on the campaign map: which region of the map it is in, where
 * in that region's plate (x 0-100 right, y 0-150 down), the landmark
 * marker it shows (a name under assets/map/markers/; the stake when
 * that is missing), and the levels clearing it opens.
 * @typedef {{levelId: string, region: string, x: number, y: number, landmark?: string, unlocks: string[]}} CampaignNode
 */
/**
 * A place on the map that is not a level (the trading post, home).
 * @typedef {{region: string, x: number, y: number}} MapPlace
 */
/**
 * One painted region of the map. `plate` names its ground image;
 * `river` is the river's course through it, bottom to top, as [x, y]
 * points in plate units.
 * @typedef {{id: string, name: string, plate: string, river: ReadonlyArray<readonly [number, number]>}} MapRegion
 */

/**
 * The levels the player may play: the first node, every level a cleared
 * level unlocks, and every cleared level on the map. The last keeps a
 * save from before the opening levels able to replay what it cleared,
 * though nothing before it on the graph is cleared.
 * @param {Progress} p
 * @param {CampaignNode[]} nodes
 * @returns {Set<string>}
 */
export function unlockedLevels(p, nodes) {
  /** @type {Set<string>} */
  const out = new Set();
  if (nodes.length > 0) out.add(nodes[0].levelId);
  for (const node of nodes) {
    if (p.cleared[node.levelId]) {
      out.add(node.levelId);
      for (const levelId of node.unlocks) out.add(levelId);
    }
  }
  return out;
}
