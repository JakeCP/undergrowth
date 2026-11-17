/** @typedef {import('../engine/types.js').Progress} Progress */
/** @typedef {{id: string, kind: 'type'|'recruit', type: string, label: string, price: number, affordable: boolean, available: boolean}} ShopItem */

import { BAND_TYPES, tierFor, recruitCost } from '../engine/units.js';
import { withArticle } from '../ui/unit-info.js';

/**
 * @param {Progress} p
 * @returns {ShopItem[]}
 */
export function shopItems(p) {
  /** @type {ShopItem[]} */
  const items = [];
  for (const typeId of Object.keys(BAND_TYPES)) {
    const owned = p.bands[typeId];
    if (owned === undefined) continue;
    const def = BAND_TYPES[typeId];
    const price = recruitCost(typeId, owned.maxLen);
    let label = `+1 ${def.name} (${owned.maxLen} → ${owned.maxLen + 1})`;
    const nextTierName = tierFor(typeId, owned.maxLen + 1).name;
    if (nextTierName !== tierFor(typeId, owned.maxLen).name) {
      label += ` — becomes ${nextTierName}`;
    }
    items.push({
      id: `recruit:${typeId}`,
      kind: 'recruit',
      type: typeId,
      label,
      price,
      affordable: p.seeds >= price,
      available: owned.maxLen < def.maxLenCap,
    });
  }
  for (const typeId of Object.keys(BAND_TYPES)) {
    if (p.bands[typeId] !== undefined) continue;
    const def = BAND_TYPES[typeId];
    if (def.price === null) continue;
    items.push({
      id: `type:${typeId}`,
      kind: 'type',
      type: typeId,
      label: `Recruit ${withArticle(def.name)} band`,
      price: def.price,
      affordable: p.seeds >= def.price,
      available: true,
    });
  }
  return items;
}

/**
 * @param {Progress} p
 * @param {string} itemId
 * @returns {Progress}
 */
export function buy(p, itemId) {
  const item = shopItems(p).find((i) => i.id === itemId);
  if (item === undefined) throw new Error(`unknown shop item: ${itemId}`);
  if (!item.available) throw new Error(`shop item unavailable: ${itemId}`);
  if (!item.affordable) throw new Error(`shop item unaffordable: ${itemId}`);
  const out = structuredClone(p);
  out.seeds -= item.price;
  if (item.kind === 'type') {
    out.bands[item.type] = { maxLen: BAND_TYPES[item.type].startLen };
  } else {
    out.bands[item.type].maxLen += 1;
  }
  return out;
}
