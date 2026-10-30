// A dependency-free QR code encoder: byte mode (UTF-8), error correction
// level M, versions 1 to 10 (up to 213 bytes), automatic mask selection, and
// an SVG renderer. Written for the printable flyers in print.mjs, so a phone
// camera can open the sitter's website or booking page from a bulletin board.
//
// It follows ISO/IEC 18004 as laid out in Project Nayuki's public QR code
// generator write-up (https://www.nayuki.io/page/qr-code-generator-library,
// MIT): the same block tables, Reed-Solomon over GF(256) with polynomial
// 0x11D, zigzag placement and the four mask penalty rules. qr.test.mjs checks
// the output module-for-module against matrices made by the segno library.

// Level M, indexed by version: EC codewords per block and number of blocks.
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
export const MAX_VERSION = 10;
const FORMAT_BITS_M = 0; // EC level M is 00 in the format information

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - EC_PER_BLOCK[ver] * BLOCKS[ver];

// Most bytes a version holds in byte mode: 4 mode bits + a count field + data.
export const capacity = (ver) => Math.floor((dataCodewords(ver) * 8 - 4 - countBits(ver)) / 8);

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---- Reed-Solomon over GF(256), reducing polynomial x^8+x^4+x^3+x^2+1
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
export function rsRemainder(data, degree) {
  const div = rsDivisor(degree);
  const r = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    for (let i = 0; i < degree; i++) r[i] ^= gfMul(div[i], f);
  }
  return r;
}

// ---- data codewords for one version
function countBits(ver) { return ver >= 10 ? 16 : 8; }

function dataBits(bytes, ver) {
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits(ver));
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(data, ver) {
  const nBlocks = BLOCKS[ver];
  const ecLen = EC_PER_BLOCK[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortCount = nBlocks - (raw % nBlocks);
  const shortLen = Math.floor(raw / nBlocks);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const len = shortLen - ecLen + (i < shortCount ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    const ec = rsRemainder(d, ecLen);
    if (i < shortCount) d.push(null); // keep columns aligned for interleaving
    blocks.push([...d, ...ec]);
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) for (const b of blocks) if (b[i] !== null) out.push(b[i]);
  return out;
}

// ---- matrix
function baseMatrix(ver) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = alignmentPositions(ver);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(m, fn, 0, set);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const v = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, v); set(b, a, v);
    }
  }
  return { m, fn, size };
}

function drawFormat(m, fn, mask, set) {
  const size = m.length;
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the dark module
}

function placeCodewords(m, fn, codewords) {
  const size = m.length;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < total) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
function applyMask(m, fn, k) {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
}

// The four penalty rules of ISO/IEC 18004 section 7.8.3.
export function penalty(m) {
  const size = m.length;
  let score = 0;
  // Rules 1 and 3 scan each row and column once, keeping the last seven run
  // lengths; a 1:1:3:1:1 dark-light pattern with four light modules on either
  // side (the symbol border counts as light) costs 40, as Nayuki's scan does.
  const finderCount = (h) => {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const addRun = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
  const line = (get) => {
    let s = 0;
    for (let a = 0; a < size; a++) {
      let color = false, run = 0;
      const h = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        if (get(a, b) === color) {
          run++;
          if (run === 5) s += 3;
          else if (run > 5) s++;
        } else {
          addRun(run, h);
          if (!color) s += finderCount(h) * 40;
          color = get(a, b);
          run = 1;
        }
      }
      if (color) { addRun(run, h); run = 0; }
      addRun(run + size, h);
      s += finderCount(h) * 40;
    }
    return s;
  };
  score += line((r, c) => m[r][c]);
  score += line((c, r) => m[r][c]);
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

export const utf8 = (s) => [...new TextEncoder().encode(String(s))];

// Encode text as a QR code. Returns { version, mask, size, modules } where
// modules[y][x] is true for a dark module. Pass { version, mask } to force them.
export function encode(text, opts = {}) {
  const bytes = utf8(text);
  let ver = opts.version || 0;
  if (!ver) for (let v = 1; v <= MAX_VERSION && !ver; v++) if (bytes.length <= capacity(v)) ver = v;
  if (!ver || ver > MAX_VERSION || bytes.length > capacity(ver)) {
    throw new RangeError(`${bytes.length} bytes is too long for a QR code up to version ${opts.version || MAX_VERSION} (at most ${capacity(opts.version || MAX_VERSION)}); use a shorter link`);
  }
  const codewords = interleave(dataBits(bytes, ver), ver);
  const { m, fn, size } = baseMatrix(ver);
  placeCodewords(m, fn, codewords);
  const set = (x, y, v) => { m[y][x] = v; };
  let mask = opts.mask;
  if (mask === undefined) {
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      applyMask(m, fn, k);
      drawFormat(m, fn, k, set);
      const p = penalty(m);
      if (p < best) { best = p; mask = k; }
      applyMask(m, fn, k);
    }
  }
  applyMask(m, fn, mask);
  drawFormat(m, fn, mask, set);
  return { version: ver, mask, size, modules: m };
}

// Render as SVG: one path, a 4-module quiet zone, crisp edges for print.
export function toSVG(text, { size = 160, dark = "#000", light = "#fff", label = "QR code", quiet = 4 } = {}) {
  const q = typeof text === "string" ? encode(text) : text;
  const n = q.size + quiet * 2;
  let d = "";
  q.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  const t = String(label).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" role="img" aria-label="${t}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
