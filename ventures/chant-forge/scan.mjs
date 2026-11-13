// Read the notes off a scanned page of square chant notation, so a GABC
// transcription can be checked against the printed book by machine.
//
// Built for clean 20th-century Vatican/Solesmes printing (black four-line
// staff, square heads): find the staves, take the staff lines out, find
// square heads by their height and width, and give each head a staff
// position relative to the clef line. Then align the scan's sequence with
// the GABC's (an edit distance with free ends in the GABC), so a page that
// shows only part of a piece is placed where it belongs.
//
// What it does not read: slanted strokes (the porrectus' first two notes),
// the clef's type (c or f is taken from the GABC), accidentals, rhythmic
// signs and the text. Those come out as gaps in the alignment, which is why
// the report gives the disagreements to look at by eye rather than a verdict.
// No dependencies: the page comes in as a binary PGM (ffmpeg or ImageMagick
// convert any JPEG to one).

export function readPgm(buf) {
  let pos = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (buf[pos] === 0x23) { // comment
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      continue;
    }
    let s = '';
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) s += String.fromCharCode(buf[pos++]);
    tokens.push(s);
  }
  pos++; // single whitespace after maxval
  const [magic, w, h, maxv] = tokens;
  if (magic !== 'P5') throw new Error('not a binary PGM (P5)');
  const width = Number(w), height = Number(h), max = Number(maxv);
  if (max > 255) throw new Error('16-bit PGM not supported');
  const data = new Uint8Array(buf.buffer, buf.byteOffset + pos, width * height);
  return { width, height, data: Uint8Array.from(data) };
}

// Ink threshold halfway between the dark and light modes of the histogram.
function threshold(img) {
  const hist = new Array(256).fill(0);
  for (const v of img.data) hist[v]++;
  // Otsu
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

export function binarize(img, t = threshold(img)) {
  const { width, height } = img;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = img.data[i] <= t ? 1 : 0;
  // printed heads carry small white flecks; fill vertical gaps of up to
  // three pixels so a fleck does not cut a head in two
  for (let x = 0; x < width; x++) {
    let last = -10;
    for (let y = 0; y < height; y++) {
      if (!ink[y * width + x]) continue;
      if (y - last > 1 && y - last <= 4) for (let k = last + 1; k < y; k++) ink[k * width + x] = 1;
      last = y;
    }
  }
  return { width, height, ink };
}

// Staff lines: rows whose ink covers at least `minCover` of the page width,
// merged into lines, then grouped four at a time with even spacing.
export function findStaves(bin, { minCover = 0.45, linesPerStaff = 4 } = {}) {
  const { width, height, ink } = bin;
  const rowInk = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let c = 0;
    for (let x = 0; x < width; x++) c += ink[y * width + x];
    rowInk[y] = c;
  }
  const lines = [];
  for (let y = 0; y < height; y++) {
    if (rowInk[y] < minCover * width) continue;
    const start = y;
    while (y + 1 < height && rowInk[y + 1] >= minCover * width) y++;
    lines.push({ top: start, bottom: y, y: (start + y) / 2 });
  }
  const staves = [];
  for (let i = 0; i + linesPerStaff - 1 < lines.length; i++) {
    const group = lines.slice(i, i + linesPerStaff);
    const gaps = group.slice(1).map((l, k) => l.y - group[k].y);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean < 6 || gaps.some((g) => Math.abs(g - mean) > 0.2 * mean)) continue;
    // horizontal extent: where the middle lines carry ink
    const extent = staffExtent(bin, group);
    staves.push({ lines: group, space: mean, top: group[0].y, bottom: group[linesPerStaff - 1].y, ...extent });
    i += linesPerStaff - 1;
  }
  return staves;
}

function staffExtent(bin, lines) {
  const { width, ink } = bin;
  const covered = new Uint8Array(width);
  for (const l of lines) {
    for (let x = 0; x < width; x++) {
      let any = 0;
      for (let y = l.top - 2; y <= l.bottom + 2; y++) any |= ink[y * width + x];
      covered[x] += any;
    }
  }
  // the longest stretch where every line has ink (gaps of a few pixels
  // allowed): a page frame's vertical rule crosses the lines but is not staff
  let best = [0, -1], start = -1, miss = 0;
  for (let x = 0; x <= width; x++) {
    const on = x < width && covered[x] >= lines.length;
    if (on) { if (start < 0) start = x; miss = 0; }
    else if (start >= 0 && ++miss > 4) {
      const end = x - miss;
      if (end - start > best[1] - best[0]) best = [start, end];
      start = -1; miss = 0;
    }
  }
  const [left, right] = best;
  return { left, right };
}

// Heads on one staff. Returns [{x, y, pos}] in reading order, where pos is
// the staff position counted in steps from the bottom line (0 = bottom
// line, 1 = first space, 2 = second line, ...).
export function readStaff(bin, staff, { minH = 0.4, maxH = 0.85 } = {}) {
  const { width, ink } = bin;
  const s = staff.space;
  const y0 = Math.max(0, Math.round(staff.top - 2.6 * s));
  const y1 = Math.min(bin.height - 1, Math.round(staff.bottom + 1.7 * s));
  const lineRows = new Set();
  for (const l of staff.lines) for (let y = l.top; y <= l.bottom; y++) lineRows.add(y);
  const isInk = (x, y) => {
    if (!ink[y * width + x]) return false;
    if (!lineRows.has(y)) return true;
    // a line pixel counts as ink only where something crosses the line
    const l = staff.lines.find((q) => y >= q.top && y <= q.bottom);
    return ink[(l.top - 1) * width + x] === 1 && ink[(l.bottom + 1) * width + x] === 1;
  };
  // vertical runs per column, kept when they look like one or two heads
  const runs = [];
  for (let x = staff.left; x <= staff.right; x++) {
    let y = y0;
    while (y <= y1) {
      if (!isInk(x, y)) { y++; continue; }
      const start = y;
      while (y <= y1 && isInk(x, y)) y++;
      const len = y - start;
      if (len >= minH * s && len <= maxH * s) runs.push({ x, a: start, b: y - 1 });
      else if (len > maxH * s && len <= 1.4 * s) {
        // two heads a step apart touch: split the run in the middle
        const mid = Math.round((start + y - 1) / 2);
        runs.push({ x, a: start, b: mid }, { x, a: mid + 1, b: y - 1 });
      }
    }
  }
  // join runs in neighbouring columns with matching extent into heads
  runs.sort((p, q) => p.x - q.x || p.a - q.a);
  const open = [];
  const heads = [];
  for (const r of runs) {
    const c = (r.a + r.b) / 2;
    let h = open.find((o) => o.lastX >= r.x - 1 && Math.abs(o.c - c) < 0.25 * s);
    if (!h) { h = { x0: r.x, lastX: r.x, c, n: 0, sum: 0 }; open.push(h); heads.push(h); }
    h.lastX = r.x; h.n++; h.sum += c; h.c = h.sum / h.n;
    for (let i = open.length - 1; i >= 0; i--) if (open[i].lastX < r.x - 1) open.splice(i, 1);
  }
  const out = [];
  for (const h of heads) {
    const w = h.lastX - h.x0 + 1;
    if (w < 0.4 * s || w > 1.2 * s) continue;
    const pos = Math.round((staff.bottom - h.c) / (s / 2));
    out.push({ x: (h.x0 + h.lastX) / 2, x0: h.x0, x1: h.lastX, y: h.c, pos });
  }
  // reading order: left to right; heads sharing columns are read bottom-up
  out.sort((p, q) => p.x - q.x);
  const ordered = [];
  for (let i = 0; i < out.length;) {
    let j = i + 1;
    let right = out[i].x1;
    while (j < out.length && out[j].x0 <= right - 0.2 * s) { right = Math.max(right, out[j].x1); j++; }
    ordered.push(...out.slice(i, j).sort((p, q) => q.y - p.y));
    i = j;
  }
  return ordered;
}

// The clef is the first glyph on the staff: its two blocks sit either side
// of the clef line. Returns {line position, number of heads it used}.
export function findClef(bin, staff) {
  const { width, ink } = bin;
  const s = staff.space;
  const ya = Math.round(staff.top - 1.2 * s), yb = Math.round(staff.bottom + 1.2 * s);
  // the longest vertical run of ink in a column: the clef is a tall block
  // (about 1.7 spaces), staff lines are thin
  const longest = (x) => {
    let best = [0, -1];
    for (let y = ya; y <= yb; y++) {
      if (!ink[y * width + x]) continue;
      const a = y;
      while (y <= yb && ink[y * width + x]) y++;
      if (y - a > best[1] - best[0] + 1) best = [a, y - 1];
    }
    return best;
  };
  const tall = (x) => { const [a, b] = longest(x); return b - a + 1 >= 0.9 * s; };
  let x = Math.max(0, staff.left - Math.round(0.5 * s));
  while (x < staff.left + 3 * s && !tall(x)) x++;
  if (x >= staff.left + 3 * s) return null;
  let lo = Infinity, hi = -Infinity, x1 = x;
  for (; x1 < x + 1.4 * s && tall(x1); x1++) {
    const [a, b] = longest(x1);
    lo = Math.min(lo, a); hi = Math.max(hi, b);
  }
  x1 = Math.max(x1, Math.round(x + 0.75 * s)); // the blocks reach right of the stem
  // the c clef's two blocks sit either side of its line, so the glyph's
  // middle is the line
  const pos = 2 * Math.round((staff.bottom - (lo + hi) / 2) / s);
  return { pos, x0: x, x1 };
}

// Scan values relative to the clef line, staff by staff. A trailing custos
// (the small guide note at the right end) is dropped.
export function readPage(img, opts = {}) {
  const bin = binarize(img);
  const staves = findStaves(bin, opts);
  return staves.map((staff, k) => {
    const heads = readStaff(bin, staff, opts);
    const clef = findClef(bin, staff);
    let notes = clef ? heads.filter((h) => h.x0 > clef.x1) : heads;
    const last = notes[notes.length - 1];
    if (last && last.x1 > staff.right - 0.9 * staff.space) notes = notes.slice(0, -1);
    return {
      staff: k + 1,
      top: staff.top,
      space: staff.space,
      clefPos: clef ? clef.pos : null,
      notes: notes.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), rel: clef ? h.pos - clef.pos : null })),
    };
  });
}

// The GABC's notes as steps relative to the current clef line, with the
// syllable each belongs to. Custodes, NABC (after |) and [..] annotations
// are skipped, as in gabc.mjs.
export function gabcSteps(src) {
  const body = src.includes('%%') ? src.slice(src.indexOf('%%') + 2) : src;
  const clean = body.replace(/%[^\n]*/g, '');
  const out = [];
  let clefLine = null;
  const re = /([^()]*)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(clean))) {
    const text = m[1].replace(/<[^>]*>/g, '').trim();
    let g = m[2].split('|')[0].replace(/\[[^\]]*\]/g, '');
    const clefs = [...g.matchAll(/(?:^|[^a-m])([cf])b?([1-5])/g)];
    // a clef token is a whole group like (c4) or (cb3), or after @/ :: in a clef change
    if (/^\s*[cf]b?[1-5]\s*$/.test(g) || /::?\s*[cf]b?[1-5]/.test(g) || /@[cf]b?[1-5]/.test(g)) {
      const c = clefs[clefs.length - 1];
      if (c) clefLine = 3 + 2 * (Number(c[2]) - 1);
      if (/^\s*[cf]b?[1-5]\s*$/.test(g)) continue;
      g = g.replace(/[cf]b?[1-5]/g, '');
    }
    if (clefLine === null) clefLine = 3 + 2 * 3; // c4 assumed
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      const lower = ch.toLowerCase();
      if (!'abcdefghijklm'.includes(lower)) continue;
      // skip letters that are not pitches: custos (x+), accidentals (fx fy f#)
      if (g[i + 1] === '+') continue;
      if (g[i + 1] && 'xy#'.includes(g[i + 1])) { i++; continue; }
      out.push({ rel: 'abcdefghijklm'.indexOf(lower) - clefLine, text });
    }
  }
  return out;
}

// Align scan values (a) to GABC values (b), ends of b free: Levenshtein
// with unit costs. Returns the pairs and counts.
export function align(a, b) {
  const n = a.length, m = b.length;
  const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = 0; // free start in b
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      D[i][j] = Math.min(sub, D[i - 1][j] + 1, D[i][j - 1] + 1);
    }
  }
  let j = 0;
  for (let k = 1; k <= m; k++) if (D[n][k] < D[n][j]) j = k; // free end in b
  let i = n;
  const pairs = [];
  const endJ = j;
  while (i > 0 && j > 0) {
    if (D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) { pairs.push([i - 1, null]); i--; }
    else { pairs.push([null, j - 1]); j--; }
  }
  while (i > 0) { pairs.push([i - 1, null]); i--; }
  pairs.reverse();
  const startJ = j;
  let match = 0, sub = 0, scanOnly = 0, gabcOnly = 0;
  for (const [p, q] of pairs) {
    if (p !== null && q !== null) (a[p] === b[q] ? match++ : sub++);
    else if (p !== null) scanOnly++;
    else gabcOnly++;
  }
  return { pairs, startJ, endJ, distance: D[n][endJ], match, sub, scanOnly, gabcOnly };
}
