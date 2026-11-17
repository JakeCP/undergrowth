// Dev helper: a small PNG reader and writer and the pixel work
// scripts/ui-assets.mjs does on the painted interface kit before it is
// encoded as WebP. Plain Node (zlib), no image library: the machine has
// cwebp but nothing that reads pixels.
//
// Images are {width, height, data}, data RGBA, 8 bits a channel, rows top
// to bottom. Never shipped and never precached.
import zlib from 'node:zlib';

/** @typedef {{width: number, height: number, data: Uint8ClampedArray}} Rgba */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads a PNG: 8 bits a channel, grey, grey with alpha, RGB, RGBA or a
 * palette, not interlaced (what the image tools write).
 * @param {Buffer} buffer
 * @returns {Rgba}
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  /** @type {Buffer|null} */
  let palette = null;
  /** @type {Buffer|null} */
  let trns = null;
  /** @type {Buffer[]} */
  const idat = [];
  while (at < buffer.length) {
    const len = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported (8 only)`);
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) throw new Error(`PNG colour type ${colorType} is not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      out[i] = v & 255;
    }
    prev = out;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (colorType === 6) {
      data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = rows[s + 3];
    } else if (colorType === 2) {
      data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = 255;
    } else if (colorType === 0) {
      data[d] = data[d + 1] = data[d + 2] = rows[s]; data[d + 3] = 255;
    } else if (colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = rows[s]; data[d + 3] = rows[s + 1];
    } else {
      const i = rows[s];
      if (palette === null) throw new Error('palette PNG without PLTE');
      data[d] = palette[i * 3]; data[d + 1] = palette[i * 3 + 1]; data[d + 2] = palette[i * 3 + 2];
      data[d + 3] = trns !== null && i < trns.length ? trns[i] : 255;
    }
  }
  return { width, height, data };
}

/** @type {Uint32Array|null} */
let crcTable = null;

/**
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} body
 * @returns {Buffer}
 */
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * Writes an RGBA PNG (or RGB when `opaque`).
 * @param {Rgba} img
 * @param {{opaque?: boolean}} [opts]
 * @returns {Buffer}
 */
export function encodePng(img, opts = {}) {
  const channels = opts.opaque === true ? 3 : 4;
  const stride = img.width * channels;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < img.width; x += 1) {
      const s = (y * img.width + x) * 4;
      const d = y * (stride + 1) + 1 + x * channels;
      raw[d] = img.data[s]; raw[d + 1] = img.data[s + 1]; raw[d + 2] = img.data[s + 2];
      if (channels === 4) raw[d + 3] = img.data[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Cleans a painted cut-out's edge, in place, in four steps:
 *  1. Pixels fainter than `floor` (of 255) go fully transparent: the
 *     speckles of nearly invisible red and yellow the image tool left in
 *     the empty area.
 *  2. Islands of visible pixels much smaller than the piece itself (under
 *     `island` of its largest island's area) go too: the specks that were
 *     stronger than the floor.
 *  3. One pixel of halo is trimmed: every visible pixel that touches a
 *     transparent one goes.
 *  4. What is left at the soft edge takes the colour of the solid paint
 *     beside it (within `reach` pixels), so no coloured fringe shows on a
 *     dark or a light ground; an edge pixel with no solid paint near it
 *     goes.
 * @param {Rgba} img
 * @param {{floor?: number, island?: number, reach?: number, solid?: number}} [opts]
 * @returns {{faint: number, islands: number, halo: number, recoloured: number, dropped: number}}
 */
export function cleanCutout(img, opts = {}) {
  const floor = opts.floor ?? 40;
  const island = opts.island ?? 0.002;
  const reach = opts.reach ?? 4;
  const solid = opts.solid ?? 250;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const report = { faint: 0, islands: 0, halo: 0, recoloured: 0, dropped: 0 };
  const clear = (/** @type {number} */ p) => { data[p * 4] = 0; data[p * 4 + 1] = 0; data[p * 4 + 2] = 0; data[p * 4 + 3] = 0; };

  for (let p = 0; p < n; p += 1) {
    if (data[p * 4 + 3] > 0 && data[p * 4 + 3] < floor) { clear(p); report.faint += 1; }
  }

  // Islands, 8-connected.
  const label = new Int32Array(n).fill(-1);
  /** @type {number[]} */
  const sizes = [];
  const stack = new Int32Array(n);
  for (let p = 0; p < n; p += 1) {
    if (data[p * 4 + 3] === 0 || label[p] !== -1) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = p;
    label[p] = id;
    while (top > 0) {
      const q = stack[--top];
      size += 1;
      const qx = q % w;
      const qy = (q - qx) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = qy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = qx + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          const r = ny * w + nx;
          if (label[r] !== -1 || data[r * 4 + 3] === 0) continue;
          label[r] = id;
          stack[top++] = r;
        }
      }
    }
    sizes.push(size);
  }
  const largest = sizes.reduce((m, s) => Math.max(m, s), 0);
  const keep = sizes.map((s) => s >= largest * island);
  for (let p = 0; p < n; p += 1) {
    if (label[p] !== -1 && !keep[label[p]]) { clear(p); report.islands += 1; }
  }

  // One pixel of halo.
  const visible = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) visible[p] = data[p * 4 + 3] > 0 ? 1 : 0;
  for (let p = 0; p < n; p += 1) {
    if (!visible[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      || !visible[p - 1] || !visible[p + 1] || !visible[p - w] || !visible[p + w];
    if (edge) { clear(p); report.halo += 1; }
  }

  // The soft edge takes the solid paint's colour beside it.
  const src = new Uint8ClampedArray(data);
  for (let p = 0; p < n; p += 1) {
    const a = src[p * 4 + 3];
    if (a === 0 || a >= solid) continue;
    const x = p % w;
    const y = (p - x) / w;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let dy = -reach; dy <= reach; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -reach; dx <= reach; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = (ny * w + nx) * 4;
        if (src[q + 3] < solid) continue;
        r += src[q]; g += src[q + 1]; b += src[q + 2];
        count += 1;
      }
    }
    if (count === 0) { clear(p); report.dropped += 1; continue; }
    data[p * 4] = Math.round(r / count);
    data[p * 4 + 1] = Math.round(g / count);
    data[p * 4 + 2] = Math.round(b / count);
    report.recoloured += 1;
  }
  return report;
}

/**
 * The box round every visible pixel, or null for an empty image.
 * @param {Rgba} img
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export function visibleBox(img) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * A new image of `width` x `height` with `img` drawn at (dx, dy); the
 * rest is transparent (or `fill`).
 * @param {Rgba} img
 * @param {number} width
 * @param {number} height
 * @param {number} dx
 * @param {number} dy
 * @returns {Rgba}
 */
export function place(img, width, height, dx, dy) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < img.height; y += 1) {
    const ty = y + dy;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < img.width; x += 1) {
      const tx = x + dx;
      if (tx < 0 || tx >= width) continue;
      const s = (y * img.width + x) * 4;
      const d = (ty * width + tx) * 4;
      data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
    }
  }
  return { width, height, data };
}

/**
 * Crops to the visible pixels with `pad` transparent pixels round them;
 * square: the shorter side is padded out so the piece sits centred in a
 * square.
 * @param {Rgba} img
 * @param {{pad?: number, square?: boolean}} [opts]
 * @returns {Rgba}
 */
export function trim(img, opts = {}) {
  const box = visibleBox(img);
  if (box === null) return img;
  const pad = opts.pad ?? 0;
  let width = box.width + pad * 2;
  let height = box.height + pad * 2;
  let dx = pad - box.x;
  let dy = pad - box.y;
  if (opts.square === true) {
    const side = Math.max(width, height);
    dx += Math.floor((side - width) / 2);
    dy += Math.floor((side - height) / 2);
    width = side;
    height = side;
  }
  return place(img, width, height, dx, dy);
}

/**
 * Shrinks by exact area averaging, in premultiplied alpha so no dark or
 * coloured rim comes in from the transparent pixels. Never enlarges.
 * @param {Rgba} img
 * @param {number} width
 * @param {number} height
 * @returns {Rgba}
 */
export function resize(img, width, height) {
  if (width >= img.width && height >= img.height) return img;
  const sx = img.width / width;
  const sy = img.height / height;
  /**
   * The source spans each target cell covers, with their weights.
   * @param {number} count @param {number} scale @param {number} limit
   */
  const spans = (count, scale, limit) => {
    /** @type {Array<Array<[number, number]>>} */
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = i * scale;
      const b = Math.min(limit, (i + 1) * scale);
      /** @type {Array<[number, number]>} */
      const cell = [];
      for (let s = Math.floor(a); s < b; s += 1) {
        const wgt = Math.min(b, s + 1) - Math.max(a, s);
        if (wgt > 0) cell.push([s, wgt]);
      }
      out.push(cell);
    }
    return out;
  };
  const cols = spans(width, sx, img.width);
  const rowsOf = spans(height, sy, img.height);
  const data = new Uint8ClampedArray(width * height * 4);
  // Horizontal pass into a float buffer, premultiplied.
  const mid = new Float64Array(width * img.height * 4);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0; let total = 0;
      for (const [s, wgt] of cols[x]) {
        const q = (y * img.width + s) * 4;
        const alpha = img.data[q + 3] / 255;
        r += img.data[q] * alpha * wgt; g += img.data[q + 1] * alpha * wgt; b += img.data[q + 2] * alpha * wgt;
        a += alpha * wgt;
        total += wgt;
      }
      const d = (y * width + x) * 4;
      mid[d] = r / total; mid[d + 1] = g / total; mid[d + 2] = b / total; mid[d + 3] = a / total;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0; let total = 0;
      for (const [s, wgt] of rowsOf[y]) {
        const q = (s * width + x) * 4;
        r += mid[q] * wgt; g += mid[q + 1] * wgt; b += mid[q + 2] * wgt; a += mid[q + 3] * wgt;
        total += wgt;
      }
      a /= total;
      const d = (y * width + x) * 4;
      if (a <= 0) continue;
      data[d] = Math.round(r / total / a);
      data[d + 1] = Math.round(g / total / a);
      data[d + 2] = Math.round(b / total / a);
      data[d + 3] = Math.round(a * 255);
    }
  }
  return { width, height, data };
}

/**
 * Makes a nearly tileable painting tile with no seam, without mirroring
 * it (a mirror shows as a pattern of reflections). A copy of the painting
 * shifted by half its size has the painting's own middle at its edges, so
 * its edges meet with no seam; it shows through near the edges, fading
 * out over `band` of the size towards the middle, where the painting
 * itself shows. Opaque images only.
 * @param {Rgba} img
 * @param {number} [band] the fade's width, as a fraction of the size
 * @returns {Rgba}
 */
export function seamlessTile(img, band = 0.14) {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(w * h * 4);
  const bx = Math.max(1, w * band);
  const by = Math.max(1, h * band);
  /** @param {number} t */
  const ease = (t) => (t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let y = 0; y < h; y += 1) {
    const my = ease(Math.min(y, h - 1 - y) / by);
    const sy = (y + (h >> 1)) % h;
    for (let x = 0; x < w; x += 1) {
      const m = my * ease(Math.min(x, w - 1 - x) / bx);
      const sx = (x + (w >> 1)) % w;
      const a = (y * w + x) * 4;
      const b = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c += 1) data[a + c] = Math.round(img.data[a + c] * m + img.data[b + c] * (1 - m));
      data[a + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/**
 * How badly a tile's opposite edges disagree: the mean difference
 * (0-255) between its last and first columns and its last and first
 * rows, against the mean difference between neighbouring columns and
 * rows inside it. A seamless tile scores about 1; a seam well over 2.
 * @param {Rgba} img
 * @returns {number}
 */
export function seamScore(img) {
  const { width: w, height: h, data } = img;
  /** @param {number} p @param {number} q */
  const diff = (p, q) => (Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2])) / 3;
  let edge = 0;
  let inner = 0;
  let count = 0;
  for (let y = 0; y < h; y += 1) {
    edge += diff((y * w + w - 1) * 4, (y * w) * 4);
    inner += diff((y * w + (w >> 1)) * 4, (y * w + (w >> 1) - 1) * 4);
    count += 1;
  }
  for (let x = 0; x < w; x += 1) {
    edge += diff(((h - 1) * w + x) * 4, x * 4);
    inner += diff(((h >> 1) * w + x) * 4, (((h >> 1) - 1) * w + x) * 4);
    count += 1;
  }
  return inner === 0 ? (edge === 0 ? 1 : Infinity) : edge / inner;
}
