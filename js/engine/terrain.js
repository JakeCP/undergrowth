/** @typedef {import('./types.js').Tile} Tile */
/** @typedef {import('./types.js').TerrainKind} TerrainKind */
/** @typedef {import('./types.js').Side} Side */

/** @type {Record<TerrainKind, {animalWalk: boolean, botWalk: boolean, flyOver: boolean, diggable: boolean}>} */
export const TERRAIN = {
  open: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
  stubble: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
  forest: { animalWalk: true, botWalk: false, flyOver: true, diggable: true },
  paving: { animalWalk: true, botWalk: true, flyOver: true, diggable: false },
  water: { animalWalk: false, botWalk: false, flyOver: true, diggable: false },
  hole: { animalWalk: false, botWalk: false, flyOver: true, diggable: false },
  dam: { animalWalk: true, botWalk: true, flyOver: true, diggable: true },
  stones: { animalWalk: false, botWalk: false, flyOver: false, diggable: false },
  habitat: { animalWalk: true, botWalk: false, flyOver: true, diggable: false },
  habitatDamaged: { animalWalk: true, botWalk: false, flyOver: true, diggable: false },
  // A raised bank of earth: a wall to everything on foot, nothing to a flier.
  // Only the badger's Dig clears it, and only under badgerEarthworks (clearBank).
  earthbank: { animalWalk: false, botWalk: false, flyOver: true, diggable: false },
  // Water or a hole filled with a shoved stone (bearShovesStones): ground for everyone.
  ford: { animalWalk: true, botWalk: true, flyOver: true, diggable: false },
};

/**
 * @param {Tile} tile
 * @param {Side} side
 * @param {boolean} flies
 * @returns {boolean}
 */
export function canEnter(tile, side, flies) {
  const terrain = TERRAIN[tile.kind];
  if (flies) return terrain.flyOver;
  return side === 'us' ? terrain.animalWalk : terrain.botWalk;
}

/**
 * @param {Tile} tile
 * @param {boolean} flies
 * @returns {boolean}
 */
export function isDeadly(tile, flies) {
  return !flies && (tile.kind === 'water' || tile.kind === 'hole');
}

/**
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function dig(tile) {
  if (tile.kind === 'open' || tile.kind === 'stubble' || tile.kind === 'forest') {
    return { kind: 'hole', variant: null, under: null };
  }
  return cut(tile);
}

/**
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function build(tile) {
  if (tile.kind === 'water' || tile.kind === 'hole') {
    return { kind: 'dam', variant: null, under: tile.kind };
  }
  return null;
}

/**
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function mow(tile) {
  if (tile.kind === 'forest') {
    return { kind: 'stubble', variant: null, under: null };
  }
  return null;
}

/**
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function pave(tile) {
  if (tile.kind === 'open' || tile.kind === 'stubble') {
    return { kind: 'paving', variant: null, under: null };
  }
  return null;
}

/**
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function cut(tile) {
  if (tile.kind === 'dam') {
    if (tile.under === null) return null;
    return { kind: tile.under, variant: null, under: null };
  }
  return null;
}

/**
 * The badger's Dig on an earth bank, under the trial rule badgerEarthworks:
 * the bank is levelled to open ground, not dug into a hole.
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function clearBank(tile) {
  if (tile.kind === 'earthbank') return { kind: 'open', variant: 'grass', under: null };
  return null;
}

/**
 * The badger's Fill (trial rule badgerEarthworks): a hole becomes open ground.
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function fill(tile) {
  if (tile.kind === 'hole') return { kind: 'open', variant: 'grass', under: null };
  return null;
}

/**
 * What a stone shoved onto this tile does (trial rule bearShovesStones):
 * 'rolls' onto open ground, stubble or paving, 'fills' water or a hole
 * (which becomes a ford), or null when it cannot go there at all.
 * Whether a band or an objective is in the way is for the caller.
 * @param {Tile} tile
 * @returns {'rolls'|'fills'|null}
 */
export function stoneLands(tile) {
  if (tile.kind === 'open' || tile.kind === 'stubble' || tile.kind === 'paving') return 'rolls';
  if (tile.kind === 'water' || tile.kind === 'hole') return 'fills';
  return null;
}

/**
 * @param {Tile} tile
 * @returns {boolean}
 */
export function isHabitat(tile) {
  return tile.kind === 'habitat' || tile.kind === 'habitatDamaged';
}

/**
 * One bot strike on a habitat: intact -> damaged -> destroyed (stubble).
 * @param {Tile} tile
 * @returns {Tile|null}
 */
export function strikeHabitat(tile) {
  if (tile.kind === 'habitat') return { kind: 'habitatDamaged', variant: null, under: null };
  if (tile.kind === 'habitatDamaged') return { kind: 'stubble', variant: null, under: null };
  return null;
}

/** @type {Record<string, {tile: Tile, mark: 'deploy'|'permit'|'stake'|'pickup'|null}>} */
export const LEGEND = {
  '.': { tile: { kind: 'open', variant: 'grass', under: null }, mark: null },
  ',': { tile: { kind: 'open', variant: 'flowers', under: null }, mark: null },
  ';': { tile: { kind: 'open', variant: 'mushrooms', under: null }, mark: null },
  T: { tile: { kind: 'forest', variant: null, under: null }, mark: null },
  _: { tile: { kind: 'stubble', variant: null, under: null }, mark: null },
  '#': { tile: { kind: 'paving', variant: null, under: null }, mark: null },
  '~': { tile: { kind: 'water', variant: null, under: null }, mark: null },
  o: { tile: { kind: 'hole', variant: null, under: null }, mark: null },
  '=': { tile: { kind: 'dam', variant: null, under: 'water' }, mark: null },
  S: { tile: { kind: 'stones', variant: null, under: null }, mark: null },
  // An earth bank: nothing on foot crosses it (badgerEarthworks lets the badger dig it away).
  B: { tile: { kind: 'earthbank', variant: null, under: null }, mark: null },
  // A ford over water: stones in the stream that anyone can walk (as bearShovesStones makes them).
  F: { tile: { kind: 'ford', variant: null, under: 'water' }, mark: null },
  H: { tile: { kind: 'habitat', variant: null, under: null }, mark: null },
  D: { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'deploy' },
  P: { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'permit' },
  K: { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'stake' },
  '*': { tile: { kind: 'open', variant: 'grass', under: null }, mark: 'pickup' },
};

for (const entry of Object.values(LEGEND)) {
  Object.freeze(entry.tile);
  Object.freeze(entry);
}
Object.freeze(LEGEND);
