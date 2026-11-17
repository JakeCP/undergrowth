/** @typedef {import('../js/campaign/campaign.js').CampaignNode} CampaignNode */
/** @typedef {import('../js/campaign/campaign.js').MapRegion} MapRegion */
/** @typedef {import('../js/campaign/campaign.js').MapPlace} MapPlace */

// The campaign map is a tall column of painted regions, stacked from the
// bottom (home) to the top. Each region is one plate, 100 units wide and
// 150 tall (the plates are 2:3); a place's x and y are in its region's
// plate, x right and y down. js/ui/map-layout.js stacks the regions and
// turns these into column positions, so a new region is a new entry
// here and a plate under assets/map/, with no code to change.

/**
 * The regions, bottom first. `plate` names the painted ground (a WebP
 * under assets/map/, made by scripts/map-assets.mjs); `river` is the
 * river's course through the region, bottom to top, in plate units.
 * @type {MapRegion[]}
 */
export const REGIONS = [
  {
    id: 'home-wood', name: 'The home wood', plate: 'map-01-home-wood',
    river: [[8, 150], [14, 124], [9, 96], [16, 66], [21, 42], [26, 22]],
  },
  {
    id: 'cut-valley', name: 'The cut valley', plate: 'map-02-cut-valley',
    river: [[34, 137], [52, 128], [74, 117], [84, 100], [88, 80], [78, 56], [86, 30], [94, 0]],
  },
];

// The opening act runs up through the home wood from the camp at its
// foot, with the trading post just off the first level. The valley
// starts where the trees give out at l01; the brook bends where the
// river does (l02) and the path climbs to the stone yard at the top.
// Every place keeps clear of the bands where two plates blend
// (tests/map-layout.test.mjs).
/** @type {CampaignNode[]} */
export const CAMPAIGN_NODES = [
  { levelId: 'o01', region: 'home-wood', x: 40, y: 108, landmark: 'o01-mown-strip', unlocks: ['o02'] },
  { levelId: 'o02', region: 'home-wood', x: 58, y: 64, landmark: 'o02-ant-hill', unlocks: ['l01'] },
  { levelId: 'l01', region: 'cut-valley', x: 50, y: 98, landmark: 'l01-clearing-edge', unlocks: ['l02', 'l03'] },
  { levelId: 'l02', region: 'cut-valley', x: 84, y: 100, landmark: 'l02-brook-bends', unlocks: ['l04'] },
  { levelId: 'l03', region: 'cut-valley', x: 22, y: 60, landmark: 'l03-dry-stone-wall', unlocks: ['l04'] },
  { levelId: 'l04', region: 'cut-valley', x: 50, y: 50, landmark: 'l04-snare-pit', unlocks: ['l05'] },
  { levelId: 'l05', region: 'cut-valley', x: 70, y: 27, landmark: 'l05-stone-yard', unlocks: [] },
];

/** Hazel's trading post, just off the first level. @type {MapPlace} */
export const TRADING_POST = { region: 'home-wood', x: 74, y: 112 };

/** Home, at the foot of the map where the path starts. @type {MapPlace} */
export const HOME_CAMP = { region: 'home-wood', x: 52, y: 138 };
