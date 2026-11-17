// Dev script: turns the PNG ground textures in assets/textures/ into WebP
// files of 512 px or less beside them, and keeps the game's texture list
// and the service worker's precache list in step with what is on disk.
//
//   node scripts/textures.mjs
//
// Put the PNG sources in assets/textures/, named after the texture:
//   required: grass, soil, water, stubble, paving, stone
//   optional: meadow, bank
// PNG sources are git-ignored; only the WebP files are committed. A
// terrain whose texture is missing keeps its code-drawn fallback, so the
// script says clearly which required textures are still missing (and
// exits with status 1 until they are all there).
//
// It converts with `cwebp` if that is installed (brew install webp), and
// otherwise with macOS `sips` where sips can write WebP.
//
// When anything shipped has changed it also bumps APP_VERSION in sw.js and
// refreshes precache-hash.txt, as tests/pwa.test.mjs expects. This is not
// part of the deploy: there is still no build step.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REQUIRED_TEXTURES, OPTIONAL_TEXTURES } from '../js/ui/patterns.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TEXTURE_DIR = 'assets/textures';
export const LIST_FILE = 'js/ui/texture-list.js';
export const REQUIRED = [...REQUIRED_TEXTURES];
export const OPTIONAL = [...OPTIONAL_TEXTURES];
/** The longer side of a texture, in pixels, at most. */
export const MAX_SIZE = 512;
/** All textures together should stay under about this many bytes. */
export const BUDGET_BYTES = 400 * 1024;
const QUALITY = 80;

/**
 * @param {Buffer} buffer
 * @returns {{width: number, height: number}|null} null when it is not a PNG
 */
export function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24) return null;
  if (!signature.every((byte, i) => buffer[i] === byte)) return null;
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * @param {Buffer} buffer
 * @returns {{width: number, height: number}|null} null when it is not a WebP
 */
export function webpSize(buffer) {
  if (buffer.length < 16) return null;
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const format = buffer.toString('latin1', 12, 16);
  if (format === 'VP8 ' && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X' && buffer.length >= 30) {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/**
 * The size to convert to: the longer side fits `max`, the shape is kept,
 * and a small image is never enlarged.
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{width: number, height: number}}
 */
export function targetSize(width, height, max = MAX_SIZE) {
  const longer = Math.max(width, height);
  if (longer <= max) return { width, height };
  return {
    width: Math.max(1, Math.round((width * max) / longer)),
    height: Math.max(1, Math.round((height * max) / longer)),
  };
}

/**
 * Which converter this machine has: cwebp, or a sips that can write WebP.
 * @returns {'cwebp'|'sips'|null}
 */
export function findConverter() {
  const cwebp = spawnSync('cwebp', ['-version'], { encoding: 'utf8' });
  if (cwebp.error === undefined && cwebp.status === 0) return 'cwebp';
  const sips = spawnSync('sips', ['--formats'], { encoding: 'utf8' });
  if (sips.error === undefined && sips.status === 0 && /\bwebp\b.*Writable/i.test(sips.stdout)) return 'sips';
  return null;
}

/**
 * @param {'cwebp'|'sips'} converter
 * @param {string} src
 * @param {string} dest
 * @param {{width: number, height: number}} from the source's size
 * @returns {string|null} what went wrong, or null
 */
function convert(converter, src, dest, from) {
  const to = targetSize(from.width, from.height);
  /** @type {string[]} */
  let args;
  if (converter === 'cwebp') {
    args = ['-quiet', '-q', String(QUALITY), '-m', '6'];
    if (to.width !== from.width || to.height !== from.height) {
      args.push('-resize', String(to.width), String(to.height));
    }
    args.push(src, '-o', dest);
  } else {
    args = ['-s', 'format', 'webp', '-s', 'formatOptions', String(QUALITY), '-Z', String(MAX_SIZE), src, '--out', dest];
  }
  const done = spawnSync(converter, args, { encoding: 'utf8' });
  if (done.error !== undefined) return done.error.message;
  if (done.status !== 0) return (done.stderr || done.stdout || `exit status ${done.status}`).trim();
  if (!fs.existsSync(dest)) return 'no file was written';
  return null;
}

/**
 * The source of js/ui/texture-list.js for these texture names.
 * @param {string[]} names
 * @returns {string}
 */
export function textureListSource(names) {
  const items = names.map((name) => `'${name}'`).join(', ');
  return [
    '// Generated by scripts/textures.mjs: the ground textures that exist as',
    '// WebP files under assets/textures/. Do not edit by hand; run',
    '// `node scripts/textures.mjs` after adding or removing a texture.',
    '/** @type {readonly string[]} */',
    `export const TEXTURES_PRESENT = Object.freeze([${items}]);`,
    '',
  ].join('\n');
}

/**
 * sw.js with its precache list listing exactly these textures (sorted,
 * after every other entry). Other entries are left as they are.
 * @param {string} sw the source of sw.js
 * @param {string[]} names
 * @returns {string}
 */
export function syncPrecache(sw, names) {
  const block = sw.match(/(const PRECACHE_URLS = \[\n)([\s\S]*?)(\];)/);
  if (block === null || block.index === undefined) {
    throw new Error('sw.js must declare const PRECACHE_URLS = [...]');
  }
  const kept = block[2].replace(/^[ \t]*'assets\/textures\/[^']*\.webp',?[ \t]*\n/gm, '');
  const added = [...names].sort().map((name) => `  '${TEXTURE_DIR}/${name}.webp',\n`).join('');
  return sw.slice(0, block.index) + block[1] + kept + added + block[3]
    + sw.slice(block.index + block[0].length);
}

/**
 * sw.js with APP_VERSION one higher.
 * @param {string} sw the source of sw.js
 * @returns {string}
 */
export function bumpVersion(sw) {
  const match = sw.match(/const APP_VERSION = '(\d+)';/);
  if (match === null) throw new Error("sw.js must declare const APP_VERSION = '<number>'");
  return sw.replace(match[0], `const APP_VERSION = '${Number(match[1]) + 1}';`);
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
 * @typedef {object} TextureResult
 * @property {boolean} ok no errors and no required texture missing
 * @property {string[]} converted names converted from PNG on this run
 * @property {string[]} present names that exist as WebP now, sorted
 * @property {Record<string, {width: number, height: number, bytes: number}>} files
 * @property {string[]} missingRequired
 * @property {string[]} missingOptional
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {number} totalBytes
 * @property {boolean} changed a shipped file changed: bump APP_VERSION and
 *   refresh the precache hash
 */

/**
 * Converts the PNG sources under `root`, then brings the texture list and
 * the precache list in `root`'s sw.js up to date. It does not bump the
 * version or touch the precache hash; the command line does that.
 * @param {{root?: string, converter?: 'cwebp'|'sips'|null}} [options]
 *   `converter` defaults to whichever this machine has
 * @returns {TextureResult}
 */
export function run(options = {}) {
  const root = options.root ?? ROOT;
  const converter = options.converter === undefined ? findConverter() : options.converter;
  const dir = path.join(root, TEXTURE_DIR);
  const known = new Set([...REQUIRED, ...OPTIONAL]);
  /** @type {string[]} */
  const converted = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const errors = [];
  let changed = false;

  const entries = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  const sources = [];
  for (const entry of entries) {
    if (!/\.png$/i.test(entry)) continue;
    const name = entry.slice(0, -4);
    if (!known.has(name)) {
      warnings.push(`${TEXTURE_DIR}/${entry} is not a texture the game uses (${[...known].join(', ')}): skipped`);
      continue;
    }
    sources.push({ name, file: path.join(dir, entry), entry });
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
        errors.push(`${TEXTURE_DIR}/${source.entry} is not a PNG image: not converted`);
        continue;
      }
      const dest = path.join(dir, `${source.name}.webp`);
      const before = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      const problem = convert(converter, source.file, dest, size);
      if (problem !== null) {
        errors.push(`${TEXTURE_DIR}/${source.entry} could not be converted with ${converter}: ${problem}`);
        continue;
      }
      converted.push(source.name);
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
    const name = entry.slice(0, -5);
    const data = fs.readFileSync(path.join(dir, entry));
    const size = webpSize(data);
    present.push(name);
    totalBytes += data.length;
    files[name] = { width: size?.width ?? 0, height: size?.height ?? 0, bytes: data.length };
    if (size === null) {
      warnings.push(`${TEXTURE_DIR}/${entry} is not a WebP image`);
    } else if (size.width > MAX_SIZE || size.height > MAX_SIZE) {
      warnings.push(`${TEXTURE_DIR}/${entry} is ${size.width}x${size.height}: textures must be ${MAX_SIZE} px or less`);
    }
    if (!known.has(name)) {
      warnings.push(`${TEXTURE_DIR}/${entry} is not a texture the game uses: remove it, or it is cached for nothing`);
    }
  }
  if (totalBytes > BUDGET_BYTES) {
    warnings.push(
      `The textures add up to ${kb(totalBytes)}, over the ${kb(BUDGET_BYTES)} budget: `
      + 'use smaller or simpler images',
    );
  }

  if (writeIfChanged(path.join(root, LIST_FILE), textureListSource(present))) changed = true;
  const swFile = path.join(root, 'sw.js');
  if (writeIfChanged(swFile, syncPrecache(fs.readFileSync(swFile, 'utf8'), present))) changed = true;

  const missingRequired = REQUIRED.filter((name) => !present.includes(name));
  const missingOptional = OPTIONAL.filter((name) => !present.includes(name));
  return {
    ok: errors.length === 0 && missingRequired.length === 0,
    converted,
    present,
    files,
    missingRequired,
    missingOptional,
    warnings,
    errors,
    totalBytes,
    changed,
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
 * @param {TextureResult} result
 * @returns {string}
 */
export function formatReport(result) {
  const lines = [`Ground textures in ${TEXTURE_DIR}/ (WebP, ${MAX_SIZE} px or less)`];
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const label = `  ${name.padEnd(8)}`;
    const file = result.files[name];
    if (file !== undefined) {
      const how = result.converted.includes(name) ? `converted from ${name}.png` : 'already there';
      lines.push(`${label} ok        ${`${file.width}x${file.height}`.padEnd(9)} ${kb(file.bytes).padStart(9)}  ${how}`);
    } else if (REQUIRED.includes(name)) {
      lines.push(`${label} MISSING   required: add ${TEXTURE_DIR}/${name}.png and run this script again`);
    } else {
      lines.push(`${label} -         optional, not present`);
    }
  }
  lines.push(`Total: ${kb(result.totalBytes)} of the ${kb(BUDGET_BYTES)} budget.`);
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  for (const error of result.errors) lines.push(`ERROR: ${error}`);
  if (result.missingRequired.length > 0) {
    const n = result.missingRequired.length;
    lines.push(
      '',
      `MISSING required texture${n === 1 ? '' : 's'}: ${result.missingRequired.join(', ')}.`,
      'The game still runs: that terrain keeps its code-drawn fallback until the texture is added.',
    );
  }
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
