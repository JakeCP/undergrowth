// Dev script: turns the PNG character portraits in assets/portraits/
// into square WebP files of 512 px or less beside them, and keeps the
// game's portrait list and the service worker's precache list in step
// with what is on disk. Sibling of scripts/textures.mjs, sharing its
// PNG/WebP header readers and its APP_VERSION bump.
//
//   node scripts/portraits.mjs
//
// Put the PNG sources in assets/portraits/, named after the character:
//   <id>.png          ants, badger, beaver, bear, owl, bees, fox,
//                     hedgehog, harvester, saw, planter, shopkeeper
//   <id>-<mood>.png   mood: happy, surprised, sad, angry, scared,
//                     shrewd, greedy (the last two are the shopkeeper's
//                     shop moods)
//   <id>-blink.png    the plain portrait with its eyes closed; not a mood
//                     (see "blink frames" below)
// An obvious variant of that name ("Fox Surprised.png",
// "hedgehog_angry.png") is renamed to the convention; a file the script
// cannot place is reported and skipped, never guessed at. A source that
// is not square is centre-cropped, never stretched. Each figure is then
// moved down, at the same scale, until it stands on the bottom edge (see
// "seating the figure" below), so a scene's text box and the unit card
// meet it across its whole chest. PNG sources are
// git-ignored; only the WebP files are committed. A character with no
// portrait keeps its stamp (js/ui/portraits.js), so portraits can land
// one at a time.
//
// It converts with `cwebp` and measures with `dwebp` (brew install
// webp); sips on this Mac cannot write WebP. When anything shipped has changed it also bumps
// APP_VERSION in sw.js and refreshes precache-hash.txt, as
// tests/pwa.test.mjs expects. Running it twice in a row changes
// nothing. This script itself is never precached.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pngSize, webpSize, bumpVersion } from './textures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORTRAIT_DIR = 'assets/portraits';
export const LIST_FILE = 'js/ui/portrait-list.js';
/** Every character that can have a portrait: the band types, the two
 *  planned starters, and the shopkeeper. */
/** @type {readonly string[]} */
export const KNOWN_IDS = Object.freeze([
  'ants', 'badger', 'beaver', 'bear', 'owl', 'bees',
  'fox', 'hedgehog', 'harvester', 'saw', 'planter', 'shopkeeper',
]);
/** The moods a portrait can show. `shrewd` and `greedy` were drawn for
 *  Hazel in the trading post (js/ui/shop-view.js); any character may have
 *  them. */
/** @type {readonly string[]} */
export const MOODS = Object.freeze(['happy', 'surprised', 'sad', 'angry', 'scared', 'shrewd', 'greedy']);
/** The side of a portrait, in pixels, at most. */
export const MAX_SIZE = 512;
/** All portraits together should stay under this many bytes. */
export const BUDGET_BYTES = 2 * 1024 * 1024;
/** WebP quality: 65. At 80 the base and mood portraits together came
 *  to 1664 KB, over budget; the portraits show at 64 px at most, so the
 *  softer encode is not visible. */
export const QUALITY = 65;
/** The blink frame of a plain portrait: `<id>-blink`. Not a mood. */
export const BLINK = 'blink';

/** WebP alpha quality: 80. The portraits are transparent cutouts, and
 *  lossless alpha (100) was close to half of each file: with it the
 *  cutouts came to about 1.6 MB, over budget. At 80 the edges look the
 *  same at the size a scene shows them. */
export const ALPHA_QUALITY = 80;

/**
 * The canonical portrait id for a source file name: `<id>`,
 * `<id>-<mood>` or `<id>-blink`, or null when the name cannot be placed. Case, spaces
 * and underscores are normalised ("Fox Surprised.png" and
 * "hedgehog_angry.png" both land); anything else — an unknown
 * character, an unknown mood, extra words, a non-PNG file — is refused
 * so it gets reported rather than guessed at.
 * @param {string} fileName
 * @returns {string|null}
 */
export function normalizePortraitName(fileName) {
  const match = /^(.*)\.png$/i.exec(String(fileName).trim());
  if (match === null) return null;
  const stem = match[1].trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (stem === '' || /[^a-z-]/.test(stem)) return null;
  const parts = stem.split('-');
  // A trailing 'transparent' names the cutout version of a portrait:
  // 'fox-mad-transparent' is the angry fox, and 'fox-transparent' is the
  // ordinary fox. The cutouts are the ones the game wants, since a scene
  // stands them over the battlefield (Jake, 2026-11-15: "use the
  // transparents"). If both fox.png and fox-transparent.png are there,
  // run() reports that both name 'fox' and converts neither. A 'subtle' before
  // the mood ('fox-subtle-happy') names the gentler take of that mood.
  // 'mad' is the delivered name for the angry portrait.
  if (parts[parts.length - 1] === 'transparent') {
    if (parts.length < 2) return null;
    parts.pop();
  }
  if (parts[1] === 'subtle') {
    if (parts.length !== 3 || parts[2] === BLINK) return null;
    parts.splice(1, 1);
  }
  const mood = (/** @type {string} */ word) => (word === 'mad' ? 'angry' : word);
  if (parts.length === 1) return KNOWN_IDS.includes(parts[0]) ? parts[0] : null;
  if (parts.length === 2) {
    const [a, b] = parts;
    // A blink is only ever of the plain portrait, and named after it.
    if (b === BLINK) return KNOWN_IDS.includes(a) ? `${a}-${BLINK}` : null;
    if (KNOWN_IDS.includes(a) && MOODS.includes(mood(b))) return `${a}-${mood(b)}`;
    if (KNOWN_IDS.includes(b) && MOODS.includes(mood(a))) return `${b}-${mood(a)}`;
  }
  return null;
}

/**
 * The centre square of an image, and the side to write it at: the
 * shorter side, shrunk to `max` at most and never enlarged.
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{x: number, y: number, size: number, out: number}}
 */
export function squareCrop(width, height, max = MAX_SIZE) {
  const size = Math.min(width, height);
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size,
    out: Math.min(size, max),
  };
}

/**
 * The cwebp command on this machine, or null.
 * @returns {string|null}
 */
export function findConverter() {
  for (const cmd of ['cwebp', '/opt/homebrew/bin/cwebp']) {
    const probe = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
    if (probe.error === undefined && probe.status === 0) return cmd;
  }
  return null;
}

/**
 * The dwebp that comes with a cwebp (the same brew package, the same
 * folder).
 * @param {string} converter
 * @returns {string}
 */
export function decoderFor(converter) {
  return converter.replace(/cwebp$/, 'dwebp');
}

// --- seating the figure on the bottom edge -------------------------------
//
// A scene stands each cut-out on the text box, with the box hiding the
// bottom of the square (css/scene.css), and the unit card stands it the
// same way. So every figure must reach the bottom edge, at its full
// width. Two kinds of source fall short of that:
//
//  - a figure with empty rows under it (the bees, the machines, a few
//    busts that stop a few pixels short);
//  - a bust whose cut-out was made with an oval mask, so its chest
//    curves away to a narrow point at the bottom edge instead of being
//    cut straight across (hedgehog-happy, hedgehog-sad, badger-angry).
//    It touches the edge by a few pixels, so it has no empty rows, but
//    above the box its shoulders round off into the background and the
//    figure looks as if it floats over the box.
//
// The fix is the same for both: move the figure down, at the same scale,
// until its seat is on the bottom edge. What falls off the bottom was
// under the box anyway. A bust's seat is the lowest row nearly as wide
// as its chest; a whole figure (WHOLE_FIGURES) has no chest, so its seat
// is simply its lowest row.

/** Characters drawn whole, standing or hovering, rather than as a bust:
 *  their narrow lowest part (a blade, a track, a sting) is meant to be
 *  there, so only the empty rows under them are taken away. */
/** @type {readonly string[]} */
export const WHOLE_FIGURES = Object.freeze(['bees', 'harvester', 'saw', 'planter']);
/** A pixel at least this opaque (of 255) is part of the figure. */
export const OPAQUE = 128;
/** A bust's chest is looked for in this share of its height, at the bottom. */
export const SEAT_BAND = 0.25;
/** A row at least this share of the chest's width is wide enough to sit on. */
export const SEAT_SHARE = 0.8;

/**
 * @typedef {{width: number, height: number, data: Uint8Array}} Rgba
 *   pixels row by row, four bytes each (red, green, blue, alpha)
 */

/**
 * How many pixels of each row are part of the figure.
 * @param {Rgba} image
 * @returns {number[]}
 */
export function rowCoverage(image) {
  const { width, height, data } = image;
  const out = [];
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3] >= OPAQUE) n += 1;
    out.push(n);
  }
  return out;
}

/**
 * The row the figure sits on: its lowest row for a whole figure; for a
 * bust, the lowest row at least SEAT_SHARE as wide as the widest row in
 * the bottom SEAT_BAND of the figure. -1 for an empty image.
 * @param {readonly number[]} coverage  from rowCoverage
 * @param {boolean} whole  a whole figure rather than a bust
 * @returns {number}
 */
export function seatRow(coverage, whole) {
  let bottom = coverage.length - 1;
  while (bottom >= 0 && coverage[bottom] === 0) bottom -= 1;
  if (bottom < 0 || whole) return bottom;
  const top = coverage.findIndex((n) => n > 0);
  const from = Math.round(bottom - (bottom - top) * SEAT_BAND);
  const chest = Math.max(...coverage.slice(from, bottom + 1));
  let seat = bottom;
  while (seat > from && coverage[seat] < SEAT_SHARE * chest) seat -= 1;
  return seat;
}

/**
 * How many rows the figure's seat is above the bottom edge: what a scene
 * would show as a gap between the figure and the text box.
 * @param {Rgba} image
 * @param {boolean} whole
 * @returns {number}
 */
export function seatGap(image, whole) {
  const seat = seatRow(rowCoverage(image), whole);
  return seat < 0 ? 0 : image.height - 1 - seat;
}

/**
 * The image moved down by `rows`, the same size: transparent rows come in
 * at the top and the bottom rows fall off.
 * @param {Rgba} image
 * @param {number} rows
 * @returns {Rgba}
 */
export function shiftDown(image, rows) {
  const { width, height, data } = image;
  const out = new Uint8Array(data.length);
  const n = Math.max(0, Math.min(height, Math.round(rows)));
  out.set(data.subarray(0, (height - n) * width * 4), n * width * 4);
  return { width, height, data: out };
}

// --- putting a mood portrait back in its character's frame ----------------
//
// A mood portrait must show its character at the same size and in the same
// place as the plain portrait, so that nothing but the face changes when
// the mood does: the shop stands Hazel's cut-out at one fixed place behind
// the counter (KEEPER_PLACE in js/ui/shop-scene.js), whatever her mood.
// Hazel's mood portraits were drawn closer than her plain one: the same
// figure, 1/0.9 times as large. MOOD_FRAMES says how to shrink such a mood
// portrait back into the plain one's frame before it is seated.

/**
 * How a character's mood portraits map onto its plain portrait: shrink the
 * (square) mood portrait to `scale` of the side and put its top left
 * corner at (`x`, `y`), as shares of the side.
 * @typedef {{scale: number, x: number, y: number}} MoodFrame
 */
/** Characters whose mood portraits are framed unlike their plain one.
 *  The shopkeeper's was measured on the 1254 px sources by matching the
 *  apron, which no expression changes, of each of her five mood portraits
 *  against the plain one: all five came out at 0.9 and (62, 125) px. */
/** @type {Readonly<Record<string, MoodFrame>>} */
export const MOOD_FRAMES = Object.freeze({
  shopkeeper: Object.freeze({ scale: 0.9, x: 62 / 1254, y: 125 / 1254 }),
});

/**
 * The frame to put a portrait into, or null: only a mood portrait of a
 * character listed in MOOD_FRAMES has one.
 * @param {string} id
 * @returns {MoodFrame|null}
 */
export function moodFrame(id) {
  if (id === baseId(id) || isBlinkId(id)) return null;
  return MOOD_FRAMES[baseId(id)] ?? null;
}

/**
 * A frame in whole pixels for a portrait `side` px square: the side to
 * shrink the mood portrait to, and where its top left corner goes.
 * @param {MoodFrame} frame
 * @param {number} side
 * @returns {{size: number, x: number, y: number}}
 */
export function framePixels(frame, side) {
  return {
    size: Math.round(frame.scale * side),
    x: Math.round(frame.x * side),
    y: Math.round(frame.y * side),
  };
}

/**
 * A transparent `side` px square with `image` laid on it, its top left
 * corner at (x, y); whatever falls outside the square is cut off.
 * @param {Rgba} image
 * @param {number} side
 * @param {number} x
 * @param {number} y
 * @returns {Rgba}
 */
export function placeOn(image, side, x, y) {
  const out = new Uint8Array(side * side * 4);
  const from = Math.max(0, -x);
  const until = Math.min(image.width, side - x);
  if (until <= from) return { width: side, height: side, data: out };
  for (let row = 0; row < image.height; row += 1) {
    const to = y + row;
    if (to < 0 || to >= side) continue;
    out.set(
      image.data.subarray((row * image.width + from) * 4, (row * image.width + until) * 4),
      (to * side + x + from) * 4,
    );
  }
  return { width: side, height: side, data: out };
}

// --- blink frames ----------------------------------------------------------
//
// `<id>-blink.png` is the character's plain portrait with its eyes closed.
// The game stacks it over the plain portrait and shows it for a moment, so
// it must land on exactly the same pixels, or the head jumps on every
// blink. So a blink is never seated on its own: it is cropped and shrunk
// exactly as the plain source is, moved by whatever offset best lines its
// silhouette up with the plain one's (the owner's pairs so far needed
// none), and moved down by the plain portrait's own seat. Only the part
// that differs (the eyes, and a soft edge round them) is kept; the rest is
// transparent, so the plain portrait under it shows through unchanged and
// each blink costs a few KB. A pair whose silhouettes still disagree after
// the best offset is refused: that character gets no blink.

/** How far, in shipped pixels, a blink's silhouette is searched for. */
export const BLINK_REACH = 6;
/** A blink is refused when more than this share of the silhouette still
 *  disagrees after the best offset. */
export const BLINK_MISMATCH = 0.002;
/** A pixel this different (of 255) from the plain portrait is part of the blink. */
export const BLINK_THRESHOLD = 6;
/** The blink patch reaches this many pixels past what changed... */
export const BLINK_GROW = 2;
/** ...then fades out over this many more. */
export const BLINK_FEATHER = 3;
/** The patch only covers pixels at least this opaque (of 255) in both. */
export const SOLID = 250;

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isBlinkId(id) {
  return id.endsWith(`-${BLINK}`);
}

/**
 * The share of the silhouette (pixels showing in either image) whose
 * opacity disagrees by more than a quarter.
 * @param {Rgba} a
 * @param {Rgba} b  the same size as `a`
 * @returns {number}
 */
export function silhouetteMismatch(a, b) {
  let either = 0;
  let differ = 0;
  for (let i = 3; i < a.data.length; i += 4) {
    if (a.data[i] === 0 && b.data[i] === 0) continue;
    either += 1;
    if (Math.abs(a.data[i] - b.data[i]) > 64) differ += 1;
  }
  return either === 0 ? 0 : differ / either;
}

/**
 * The whole-pixel offset (within `reach`) that best lines `moving`'s
 * silhouette up with `fixed`'s, and how much still disagrees there. Ties
 * go to the smaller move.
 * @param {Rgba} fixed  square
 * @param {Rgba} moving  the same size as `fixed`
 * @param {number} [reach]
 * @returns {{dx: number, dy: number, mismatch: number}}
 */
export function silhouetteOffset(fixed, moving, reach = BLINK_REACH) {
  let best = { dx: 0, dy: 0, mismatch: silhouetteMismatch(fixed, moving) };
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const mismatch = silhouetteMismatch(fixed, placeOn(moving, fixed.width, dx, dy));
      const nearer = Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy);
      if (mismatch < best.mismatch || (mismatch === best.mismatch && nearer)) best = { dx, dy, mismatch };
    }
  }
  return best;
}

/**
 * How much of the blink to keep at each pixel, 0 to 1: all of it where it
 * differs from the plain portrait and for BLINK_GROW pixels round that,
 * then fading out over BLINK_FEATHER pixels; none where either is less
 * than SOLID.
 * @param {Rgba} plain
 * @param {Rgba} blink  lined up with `plain`
 * @returns {Float32Array}
 */
export function blinkMask(plain, blink) {
  const { width, height } = plain;
  let mask = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const pa = plain.data[p + 3] / 255;
    const ba = blink.data[p + 3] / 255;
    let d = Math.abs(plain.data[p + 3] - blink.data[p + 3]);
    for (let c = 0; c < 3; c += 1) d = Math.max(d, Math.abs(plain.data[p + c] * pa - blink.data[p + c] * ba));
    if (d > BLINK_THRESHOLD) mask[i] = 1;
  }
  for (let ring = 1; ring <= BLINK_GROW + BLINK_FEATHER; ring += 1) {
    const weight = ring <= BLINK_GROW ? 1 : 1 - (ring - BLINK_GROW) / (BLINK_FEATHER + 1);
    const next = new Float32Array(mask);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x] > 0) continue;
        let near = false;
        for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1) && !near; j += 1) {
          for (let k = Math.max(0, x - 1); k <= Math.min(width - 1, x + 1) && !near; k += 1) {
            if (mask[j * width + k] > 0) near = true;
          }
        }
        if (near) next[y * width + x] = weight;
      }
    }
    mask = next;
  }
  // Only where both are solid: laid over a see-through edge (a whisker, a
  // wisp of fur) the patch would thicken it.
  for (let i = 0; i < mask.length; i += 1) {
    if (plain.data[i * 4 + 3] < SOLID || blink.data[i * 4 + 3] < SOLID) mask[i] = 0;
  }
  return mask;
}

/**
 * The blink with only the masked part kept, the rest transparent.
 * @param {Rgba} blink
 * @param {Float32Array} mask  from blinkMask
 * @returns {Rgba}
 */
export function blinkPatch(blink, mask) {
  const data = new Uint8Array(blink.data.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) continue;
    const p = i * 4;
    data[p] = blink.data[p];
    data[p + 1] = blink.data[p + 1];
    data[p + 2] = blink.data[p + 2];
    data[p + 3] = Math.round(blink.data[p + 3] * mask[i]);
  }
  return { width: blink.width, height: blink.height, data };
}

/**
 * A PAM image (what `dwebp -pam` writes and cwebp reads) as RGBA pixels.
 * @param {Buffer} buffer
 * @returns {Rgba}
 */
export function readPam(buffer) {
  const end = buffer.indexOf('ENDHDR\n');
  if (buffer.toString('latin1', 0, 3) !== 'P7\n' || end < 0) throw new Error('not a PAM image');
  const head = buffer.toString('latin1', 0, end);
  const field = (/** @type {string} */ name) => Number(new RegExp(`^${name} (\\d+)$`, 'm').exec(head)?.[1]);
  const width = field('WIDTH');
  const height = field('HEIGHT');
  if (field('DEPTH') !== 4 || field('MAXVAL') !== 255) throw new Error('only 8-bit RGBA PAM images are read');
  const start = end + 'ENDHDR\n'.length;
  return { width, height, data: new Uint8Array(buffer.subarray(start, start + width * height * 4)) };
}

/**
 * @param {Rgba} image
 * @returns {Buffer}
 */
export function writePam(image) {
  const head = `P7\nWIDTH ${image.width}\nHEIGHT ${image.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`;
  return Buffer.concat([Buffer.from(head, 'latin1'), Buffer.from(image.data)]);
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string|null} what went wrong, or null
 */
function exec(cmd, args) {
  const done = spawnSync(cmd, args, { encoding: 'utf8' });
  if (done.error !== undefined) return done.error.message;
  if (done.status !== 0) return (done.stderr || done.stdout || `exit status ${done.status}`).trim();
  return null;
}

/**
 * The source centre-cropped to a square and shrunk to `side` px,
 * losslessly, as pixels; or what went wrong.
 * @param {string} converter
 * @param {string} src
 * @param {{width: number, height: number}} from the source's size
 * @param {number} side
 * @param {string} tmp  a folder to work in
 * @returns {Rgba|string}
 */
function squareOf(converter, src, from, side, tmp) {
  const crop = squareCrop(from.width, from.height);
  const square = path.join(tmp, 'square.webp');
  const args = ['-quiet', '-lossless', '-exact'];
  if (crop.size !== from.width || crop.size !== from.height) {
    args.push('-crop', String(crop.x), String(crop.y), String(crop.size), String(crop.size));
  }
  if (side !== crop.size) args.push('-resize', String(side), String(side));
  const made = exec(converter, [...args, src, '-o', square]);
  if (made !== null) return made;
  const pam = path.join(tmp, 'square.pam');
  const decoded = exec(decoderFor(converter), ['-quiet', square, '-pam', '-o', pam]);
  if (decoded !== null) return `${decoderFor(converter)}: ${decoded}`;
  return readPam(fs.readFileSync(pam));
}

/**
 * Encodes pixels as a portrait WebP.
 * @param {string} converter
 * @param {Rgba} image
 * @param {string} dest
 * @param {string} tmp
 * @returns {string|null} what went wrong, or null
 */
function encode(converter, image, dest, tmp) {
  const pam = path.join(tmp, 'out.pam');
  fs.writeFileSync(pam, writePam(image));
  const done = exec(converter, [
    '-quiet', '-q', String(QUALITY), '-alpha_q', String(ALPHA_QUALITY), '-m', '6', pam, '-o', dest,
  ]);
  if (done !== null) return done;
  if (!fs.existsSync(dest)) return 'no file was written';
  return null;
}

/**
 * Square-crops and shrinks the source, puts it in its character's frame
 * when it has one (MOOD_FRAMES), seats its figure on the bottom edge, and
 * writes the WebP. The crop and shrink are done losslessly first, so the
 * figure is measured at the size it ships.
 * @param {string} converter
 * @param {string} src
 * @param {string} dest
 * @param {{width: number, height: number}} from the source's size
 * @param {boolean} whole  a whole figure rather than a bust
 * @param {MoodFrame|null} frame  the frame to put a mood portrait into
 * @returns {string|null} what went wrong, or null
 */
function convert(converter, src, dest, from, whole, frame) {
  const crop = squareCrop(from.width, from.height);
  const placed = frame === null ? null : framePixels(frame, crop.out);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-portrait-'));
  try {
    const shrunk = squareOf(converter, src, from, placed === null ? crop.out : placed.size, tmp);
    if (typeof shrunk === 'string') return shrunk;
    const image = placed === null ? shrunk : placeOn(shrunk, crop.out, placed.x, placed.y);
    return encode(converter, shiftDown(image, seatGap(image, whole)), dest, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * @typedef {object} BlinkDone
 * @property {string|null} problem  what went wrong, or null
 * @property {{dx: number, dy: number, mismatch: number}|null} offset  how
 *   the blink was moved to line up with the plain portrait, in shipped
 *   pixels, and the share of the silhouette that still disagrees
 * @property {boolean} refused  the two could not be lined up: no blink
 */

/**
 * Writes a blink frame for a plain portrait: cropped, shrunk and seated
 * exactly as the plain one, lined up with it, and only its eyes kept.
 * @param {string} converter
 * @param {string} plainSrc
 * @param {string} blinkSrc
 * @param {string} dest
 * @param {{width: number, height: number}} from the plain source's size
 * @param {{width: number, height: number}} blinkFrom the blink source's size
 * @param {boolean} whole  a whole figure rather than a bust
 * @returns {BlinkDone}
 */
function convertBlink(converter, plainSrc, blinkSrc, dest, from, blinkFrom, whole) {
  if (from.width !== blinkFrom.width || from.height !== blinkFrom.height) {
    return {
      problem: `it is ${blinkFrom.width}x${blinkFrom.height} and its plain portrait ${from.width}x${from.height}: they must be the same size`,
      offset: null,
      refused: true,
    };
  }
  const side = squareCrop(from.width, from.height).out;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'undergrowth-blink-'));
  try {
    const plain = squareOf(converter, plainSrc, from, side, tmp);
    if (typeof plain === 'string') return { problem: plain, offset: null, refused: false };
    const raw = squareOf(converter, blinkSrc, from, side, tmp);
    if (typeof raw === 'string') return { problem: raw, offset: null, refused: false };
    const offset = silhouetteOffset(plain, raw);
    if (offset.mismatch > BLINK_MISMATCH) return { problem: null, offset, refused: true };
    const blink = placeOn(raw, side, offset.dx, offset.dy);
    // The plain portrait's seat, not the blink's own.
    const gap = seatGap(plain, whole);
    const patch = shiftDown(blinkPatch(blink, blinkMask(plain, blink)), gap);
    return { problem: encode(converter, patch, dest, tmp), offset, refused: false };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The character behind a portrait id: 'fox-happy' is the fox.
 * @param {string} id
 * @returns {string}
 */
export function baseId(id) {
  return id.split('-')[0];
}

/**
 * The source of js/ui/portrait-list.js for these portrait ids.
 * @param {Iterable<string>} ids
 * @returns {string}
 */
export function portraitListSource(ids) {
  const sorted = [...new Set(ids)].sort();
  const items = sorted.map((id) => `'${id}'`).join(', ');
  return [
    '// Generated by scripts/portraits.mjs: the character portraits that exist',
    '// as WebP files under assets/portraits/. Do not edit by hand; run',
    '// `node scripts/portraits.mjs` after adding or removing a portrait.',
    '/** @type {readonly string[]} */',
    `export const PORTRAIT_LIST = Object.freeze([${items}]);`,
    '',
  ].join('\n');
}

/**
 * sw.js with its precache list listing exactly these portraits (sorted,
 * after every other entry). Every other entry — the ground textures
 * included — is left as it is.
 * @param {string} sw the source of sw.js
 * @param {Iterable<string>} ids
 * @returns {string}
 */
export function syncPrecache(sw, ids) {
  const block = sw.match(/(const PRECACHE_URLS = \[\n)([\s\S]*?)(\];)/);
  if (block === null || block.index === undefined) {
    throw new Error('sw.js must declare const PRECACHE_URLS = [...]');
  }
  const kept = block[2].replace(/^[ \t]*'assets\/portraits\/[^']*\.webp',?[ \t]*\n/gm, '');
  const added = [...new Set(ids)].sort().map((id) => `  '${PORTRAIT_DIR}/${id}.webp',\n`).join('');
  return sw.slice(0, block.index) + block[1] + kept + added + block[3]
    + sw.slice(block.index + block[0].length);
}

/**
 * @param {string} file
 * @param {string} content
 * @returns {boolean} true when the file had to be written
 */
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

/**
 * @typedef {object} PortraitResult
 * @property {boolean} ok no errors
 * @property {string[]} converted ids converted from PNG on this run
 * @property {string[]} present ids that exist as WebP now, sorted
 * @property {Record<string, {width: number, height: number, bytes: number}>} files
 * @property {string[]} unplaced source file names that could not be placed
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {number} totalBytes
 * @property {boolean} changed a shipped file changed: bump APP_VERSION and
 *   refresh the precache hash
 * @property {Record<string, {dx: number, dy: number, mismatch: number}>} blinks
 *   for each blink frame looked at on this run, the offset that lined it up
 *   with its plain portrait (shipped pixels) and what still disagrees
 */

/**
 * Converts the PNG sources under `root`, then brings the portrait list
 * and the precache list in `root`'s sw.js up to date. It does not bump
 * the version or touch the precache hash; the command line does that.
 * @param {{root?: string, converter?: string|null}} [options]
 *   `converter` defaults to this machine's cwebp
 * @returns {PortraitResult}
 */
export function run(options = {}) {
  const root = options.root ?? ROOT;
  const converter = options.converter === undefined ? findConverter() : options.converter;
  const dir = path.join(root, PORTRAIT_DIR);
  /** @type {string[]} */
  const converted = [];
  /** @type {string[]} */
  const unplaced = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const errors = [];
  let changed = false;
  /** @type {Record<string, {dx: number, dy: number, mismatch: number}>} */
  const blinks = {};

  const entries = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  /** @type {Array<{id: string, file: string, entry: string}>} */
  const sources = [];
  const claimed = new Map();
  for (const entry of entries) {
    if (!/\.png$/i.test(entry)) continue;
    const id = normalizePortraitName(entry);
    if (id === null) {
      unplaced.push(entry);
      continue;
    }
    const other = claimed.get(id);
    if (other !== undefined) {
      errors.push(`${PORTRAIT_DIR}/${entry} and ${PORTRAIT_DIR}/${other} both name the '${id}' portrait: keep one`);
      continue;
    }
    claimed.set(id, entry);
    sources.push({ id, file: path.join(dir, entry), entry });
  }

  if (sources.length > 0 && converter === null) {
    errors.push(
      'No WebP converter found, so the PNG sources were not converted. '
      + 'Install cwebp (brew install webp) and run this script again.',
    );
  } else if (converter !== null) {
    for (const source of sources) {
      const size = pngSize(fs.readFileSync(source.file));
      if (size === null) {
        errors.push(`${PORTRAIT_DIR}/${source.entry} is not a PNG image: not converted`);
        continue;
      }
      const dest = path.join(dir, `${source.id}.webp`);
      const before = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      const whole = WHOLE_FIGURES.includes(baseId(source.id));
      let problem = null;
      if (isBlinkId(source.id)) {
        const plainEntry = claimed.get(baseId(source.id));
        const plainSize = plainEntry === undefined ? null : pngSize(fs.readFileSync(path.join(dir, plainEntry)));
        if (plainEntry === undefined || plainSize === null) {
          errors.push(`${PORTRAIT_DIR}/${source.entry}: a blink is cut and seated exactly as its plain portrait, `
            + `so ${baseId(source.id)}.png must be there too: not converted`);
          continue;
        }
        const done = convertBlink(converter, path.join(dir, plainEntry), source.file, dest, plainSize, size, whole);
        if (done.offset !== null) blinks[source.id] = done.offset;
        if (done.refused) {
          if (fs.existsSync(dest)) fs.rmSync(dest);
          const why = done.problem ?? `${(100 * (done.offset?.mismatch ?? 1)).toFixed(2)}% of the silhouette still disagrees at the best offset`;
          warnings.push(`${PORTRAIT_DIR}/${source.entry} does not line up with ${plainEntry} (${why}): `
            + `${baseId(source.id)} gets no blink`);
          if (before !== null) changed = true;
          continue;
        }
        problem = done.problem;
      } else {
        problem = convert(converter, source.file, dest, size, whole, moodFrame(source.id));
      }
      if (problem !== null) {
        errors.push(`${PORTRAIT_DIR}/${source.entry} could not be converted with ${converter}: ${problem}`);
        continue;
      }
      converted.push(source.id);
      if (before === null || !before.equals(fs.readFileSync(dest))) changed = true;
    }
  }

  /** @type {Record<string, {width: number, height: number, bytes: number}>} */
  const files = {};
  /** @type {string[]} */
  const present = [];
  let totalBytes = 0;
  const after = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  for (const entry of after) {
    if (!entry.endsWith('.webp')) continue;
    const id = entry.slice(0, -5);
    const data = fs.readFileSync(path.join(dir, entry));
    const size = webpSize(data);
    present.push(id);
    totalBytes += data.length;
    files[id] = { width: size?.width ?? 0, height: size?.height ?? 0, bytes: data.length };
    if (size === null) {
      warnings.push(`${PORTRAIT_DIR}/${entry} is not a WebP image`);
    } else if (size.width > MAX_SIZE || size.height > MAX_SIZE) {
      warnings.push(`${PORTRAIT_DIR}/${entry} is ${size.width}x${size.height}: portraits must be ${MAX_SIZE} px or less`);
    } else if (size.width !== size.height) {
      warnings.push(`${PORTRAIT_DIR}/${entry} is ${size.width}x${size.height}: portraits must be square`);
    }
    if (normalizePortraitName(`${id}.png`) !== id) {
      warnings.push(`${PORTRAIT_DIR}/${entry} is not a portrait name the game uses (<id>, <id>-<mood> or <id>-blink): remove it, or it is cached for nothing`);
    }
  }
  present.sort();
  if (totalBytes > BUDGET_BYTES) {
    warnings.push(
      `The portraits add up to ${kb(totalBytes)}, over the ${kb(BUDGET_BYTES)} budget: `
      + 'lower QUALITY in scripts/portraits.mjs',
    );
  }

  if (writeIfChanged(path.join(root, LIST_FILE), portraitListSource(present))) changed = true;
  const swFile = path.join(root, 'sw.js');
  if (writeIfChanged(swFile, syncPrecache(fs.readFileSync(swFile, 'utf8'), present))) changed = true;

  return {
    ok: errors.length === 0,
    converted,
    present,
    files,
    unplaced,
    warnings,
    errors,
    totalBytes,
    changed,
    blinks,
  };
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * The report printed after a run.
 * @param {PortraitResult} result
 * @returns {string}
 */
export function formatReport(result) {
  const lines = [`Character portraits in ${PORTRAIT_DIR}/ (square WebP, ${MAX_SIZE} px or less, quality ${QUALITY})`];
  for (const id of result.present) {
    const file = result.files[id];
    const how = result.converted.includes(id) ? 'converted from PNG' : 'already there';
    lines.push(`  ${id.padEnd(18)} ok        ${`${file.width}x${file.height}`.padEnd(9)} ${kb(file.bytes).padStart(9)}  ${how}`);
  }
  if (result.present.length === 0) lines.push('  (none yet: every character keeps its stamp)');
  lines.push(`Total: ${kb(result.totalBytes)} of the ${kb(BUDGET_BYTES)} budget.`);
  for (const [id, o] of Object.entries(result.blinks)) {
    lines.push(`Blink ${id}: moved (${o.dx}, ${o.dy}) px to line up with ${baseId(id)}; `
      + `${(100 * o.mismatch).toFixed(2)}% of the silhouette still differs`);
  }
  for (const entry of result.unplaced) {
    lines.push(`Warning: could not place ${PORTRAIT_DIR}/${entry}: name it <id>.png, <id>-<mood>.png or <id>-blink.png `
      + `(ids: ${KNOWN_IDS.join(', ')}; moods: ${MOODS.join(', ')})`);
  }
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  for (const error of result.errors) lines.push(`ERROR: ${error}`);
  return lines.join('\n');
}

function main() {
  const result = run();
  console.log(formatReport(result));
  if (result.changed) {
    const swFile = path.join(ROOT, 'sw.js');
    const bumped = bumpVersion(fs.readFileSync(swFile, 'utf8'));
    fs.writeFileSync(swFile, bumped);
    const hashed = spawnSync(process.execPath, [path.join(ROOT, 'scripts/precache-hash.mjs')], { encoding: 'utf8' });
    const version = bumped.match(/const APP_VERSION = '(\d+)';/)?.[1];
    if (hashed.status === 0) {
      console.log(`\nShipped files changed: APP_VERSION is now ${version} and precache-hash.txt is refreshed.`);
    } else {
      console.log(`\nAPP_VERSION is now ${version}, but the precache hash could not be refreshed:`);
      console.log((hashed.stderr || hashed.stdout || '').trim());
      console.log('Run `npm run precache-hash` once that is fixed.');
      process.exitCode = 1;
    }
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
