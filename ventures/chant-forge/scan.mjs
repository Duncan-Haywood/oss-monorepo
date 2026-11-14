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
// A porrectus stroke is read as its two ends. Each head is also called a
// rhombus, a quilisma or a square (headShape), and a liquescent's small
// note, hung off its head on a short stem, is read too (liquescentTail).
// What it does not read: the clef's type (c or f is taken from the GABC), accidentals, rhythmic
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
export function findStaves(bin, { minCover = 0.2, linesPerStaff = 4 } = {}) {
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
  // A staff is `linesPerStaff` lines at an even spacing. Other ink-heavy
  // rows (a page rule, a heavy line of text) may sit between candidates,
  // so look for the evenly spaced set rather than taking lines in fours.
  const staves = [];
  const used = new Set();
  const cands = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const d = lines[j].y - lines[i].y;
      if (d < 6) continue;
      if (d > 120) break;
      const idx = [i, j];
      for (let k = 2; k < linesPerStaff; k++) {
        const tol = Math.max(2, 0.12 * d);
        const m = lines.findIndex((l) => Math.abs(l.y - (lines[i].y + k * d)) <= tol);
        if (m < 0) break;
        idx.push(m);
      }
      if (idx.length === linesPerStaff) cands.push({ idx, d });
    }
  }
  // tightest spacing first: real staves beat chance alignments of a page
  // rule with lines of other staves
  cands.sort((p, q) => p.d - q.d);
  for (const c of cands) {
    if (c.idx.some((k) => used.has(k))) continue;
    const group = c.idx.map((k) => lines[k]);
    const mean = (group[linesPerStaff - 1].y - group[0].y) / (linesPerStaff - 1);
    const extent = staffExtent(bin, group);
    if (extent.right - extent.left < 8 * mean) continue;
    c.idx.forEach((k) => used.add(k));
    staves.push({ lines: group, space: mean, top: group[0].y, bottom: group[linesPerStaff - 1].y, ...extent });
  }
  staves.sort((p, q) => p.top - q.top);
  return staves;
}

function staffExtent(bin, lines) {
  const { width, ink } = bin;
  const covered = new Uint8Array(width);
  for (const l of lines) {
    for (let x = 0; x < width; x++) {
      let any = 0;
      for (let y = l.top - 4; y <= l.bottom + 4; y++) any |= ink[y * width + x];
      covered[x] += any;
    }
  }
  // the longest stretch where every line has ink (gaps of a few pixels
  // allowed): a page frame's vertical rule crosses the lines but is not staff
  let best = [0, -1], start = -1, miss = 0;
  for (let x = 0; x <= width; x++) {
    const on = x < width && covered[x] >= lines.length - 1;
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
  const y0 = Math.max(0, Math.round(staff.top - 2.1 * s));
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
    // follow the last column's centre, so a slanted porrectus stroke stays
    // one piece while it descends
    let h = open.find((o) => o.lastX >= r.x - 1 && o.lastX < r.x && Math.abs(o.cLast - c) < 0.2 * s);
    if (!h) { h = { x0: r.x, lastX: r.x, cs: [], runs: [] }; open.push(h); heads.push(h); }
    h.lastX = r.x; h.cLast = c; h.cs.push(c); h.runs.push(r);
    for (let i = open.length - 1; i >= 0; i--) if (open[i].lastX < r.x - 1) open.splice(i, 1);
  }
  const out = [];
  const posOf = (c) => Math.round((staff.bottom - c) / (s / 2));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const h of heads) {
    const w = h.lastX - h.x0 + 1;
    if (w < 0.25 * s) continue; // rhombi keep only a few full-height columns
    if (w <= 1.2 * s) {
      const c = mean(h.cs);
      const feat = headFeatures(isInk, h.x0, h.lastX, c, s, y0, y1);
      if (feat) feat.notch = notchRows(bin, h.x0, h.lastX, c, s);
      out.push({ x: (h.x0 + h.lastX) / 2, x0: h.x0, x1: h.lastX, y: c, pos: posOf(c), feat });
      continue;
    }
    // a porrectus stroke: wide, and its ends a step or more apart. Its
    // ends are the first two notes (the third is the head on its stem).
    const k = Math.max(2, Math.round(0.15 * s));
    const cA = mean(h.cs.slice(0, k)), cB = mean(h.cs.slice(-k));
    if (w > 3 * s || cB - cA < 0.4 * s) continue;
    const e = Math.round(0.5 * s);
    out.push({ x: h.x0 + e / 2, x0: h.x0, x1: h.x0 + e, y: cA, pos: posOf(cA) });
    out.push({ x: h.lastX - e / 2, x0: h.lastX - e, x1: h.lastX, y: cB, pos: posOf(cB) });
  }
  // A porrectus stroke the reader does not take as one piece (it bends,
  // or its end touches the head on its stem) comes out as a wide slanted
  // piece with its lower end as a separate head. That end, cut off by the
  // stroke, can show white notches like a quilisma's teeth. A quilisma is
  // never the continuation of a stroke, so a head whose left neighbour at
  // its height is wider than 0.8 staff spaces and ends within 0.2 spaces
  // of it is marked (eval/shape-check-report.md, "Version 2").
  for (const o of out) {
    if (!o.feat) continue;
    o.feat.afterStroke = out.some((t) => t !== o && t.x0 < o.x0 && t.x1 - t.x0 + 1 > 0.8 * s && o.x0 - t.x1 <= 0.2 * s && Math.abs(t.y - o.y) <= 0.8 * s);
  }
  // a liquescent's small note hangs off its head on a short stem
  // (liquescentTail); it is kept on the head and read after it (readPage)
  for (const o of out) {
    const t = liquescentTail(isInk, o, out, staff, y0, y1);
    if (t) o.liq = t;
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

// Shape measurements of one head, in staff spaces: the ink column through
// the head's centre in each of its columns (top a, bottom b), widened a
// column each side so the slanted edges of a rhombus are seen.
export function headFeatures(isInk, x0, x1, c, s, y0, y1) {
  const cols = [];
  const cy = Math.round(c);
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    let y = cy;
    if (!isInk(x, y)) {
      let found = false;
      for (let d = 1; d <= 0.3 * s && !found; d++) {
        if (y - d >= y0 && isInk(x, y - d)) { y -= d; found = true; } else if (y + d <= y1 && isInk(x, y + d)) { y += d; found = true; }
      }
      if (!found) continue;
    }
    let a = y, b = y;
    while (a - 1 >= y0 && isInk(x, a - 1) && cy - a < 1.2 * s) a--;
    while (b + 1 <= y1 && isInk(x, b + 1) && b - cy < 1.2 * s) b++;
    cols.push({ x, a, b });
  }
  if (!cols.length) return null;
  const hs = cols.map((q) => q.b - q.a + 1);
  const hMax = Math.max(...hs);
  const mid = hs.slice(Math.floor(hs.length / 3), Math.ceil((2 * hs.length) / 3));
  const ends = [...hs.slice(0, Math.max(1, Math.floor(hs.length / 4))), ...hs.slice(-Math.max(1, Math.floor(hs.length / 4)))];
  const avg = (v) => v.reduce((p, q) => p + q, 0) / v.length;
  return {
    w: cols.length / s,
    h: hMax / s,
    fill: avg(hs) / hMax, // 1 for a square, about 0.5 for a rhombus
    taper: avg(ends) / Math.max(1, avg(mid)),
  };
}

// A quilisma in the 1908 type is a small saw-tooth: two or three teeth
// on its upper edge with white notches between them, and a solid base. A
// square, a virga or a rhombus is one run of ink across in every row of
// its upper half. notchRows counts the rows between 0.27 staff spaces
// above the head's centre and the centre that cross two or more separate
// runs of ink, on the raw ink (staff lines left in), across the head's
// columns and one more each side. A neighbour's stem at the edge adds a
// run too, which is why one row is not enough. The rows higher than 0.27
// spaces are left out: a liquescent's small head, or the lower end of a
// note stacked above, sits there, not the head's own teeth.
export function notchRows(bin, x0, x1, c, s) {
  const { width, height, ink } = bin;
  const top = Math.round(c - 0.45 * s), bot = Math.round(c + 0.45 * s);
  const n = bot - top + 1;
  const from = top + Math.round(0.2 * n), to = top + Math.floor(n / 2);
  let rows = 0;
  for (let y = Math.max(0, from); y < Math.min(height, to); y++) {
    let runs = 0, prev = 0;
    for (let x = Math.max(0, x0 - 1); x <= Math.min(width - 1, x1 + 1); x++) {
      const v = ink[y * width + x];
      if (v && !prev) runs++;
      prev = v;
    }
    if (runs >= 2) rows++;
  }
  return rows;
}

// A rhombus (punctum inclinatum) is narrow, about a third of a staff space
// against a square's half, and tapers to points at both ends. Thresholds
// set on Dies irae, Veni Creator, Pange lingua, Te Deum and the Salve
// (68 of 68 rhombi; 0 of 1,380 squares called rhombi) and checked on the
// seven held-out GregoBase pieces (118 of 118 rhombi with measurements; 1
// of 951 squares): eval/shape-check-report.md. A head with three or more
// notched rows (notchRows) is a quilisma: set on the same five pieces (6 of
// 6 quilismas, 3 of 1,538 other heads), checked on pieces that played no
// part in it (same report). Liquescents are found separately (liquescentTail).
export const QUILISMA_ROWS = 3;
export function headShape(f) {
  if (!f) return null;
  if (f.w < 0.42 && f.taper < 0.8) return 'rhombus';
  if (f.notch >= QUILISMA_ROWS && !f.afterStroke) return 'quilisma';
  return 'square';
}

// A liquescent in the 1908 type is a small note joined to the head before
// it by a short stem at the head's right edge: the epiphonus (gh~) is a
// head with a stem rising to a small head above it, the cephalicus (fe~) a
// head with a hook hanging below its right edge. The small note is under
// the reader's minimum head height, so readStaff never finds it as a head.
// liquescentTail follows the ink up and down from the head's centre in its
// right-hand columns (gaps up to 0.2 staff spaces bridged, for breaks in
// the print and the staff lines), and calls it a liquescent tail when:
//   - it runs 0.6 to 2.4 spaces from the centre (a head's own half height
//     is about 0.3),
//   - no other head sits at its end (that is a podatus or a clivis),
//   - it is thick, 0.1 spaces or more on average past the head's edge (a
//     virga's stem is thinner), and
//   - its last 0.3 spaces are 0.2 to 0.4 spaces wide at the median row (a
//     small head or hook; a full head beside an unread note is wider).
// The small note's pitch is the staff position 0.25 spaces in from the
// tail's end. Thresholds set on the 21 pieces of eval/scan-pages.json and
// eval/shape-fresh-pages.json (51 of 57 liquescents found at the right
// pitch, 2 of 4,524 other heads given a tail) and then tested on pieces
// scanned only after they were frozen: eval/liquescent-check-report.md.
export const LIQ = { minLen: 0.6, maxLen: 2.4, gap: 0.2, minThick: 0.1, minEnd: 0.2, maxEnd: 0.4 };
export function liquescentTail(isInk, h, heads, staff, y0, y1) {
  const s = staff.space;
  const c = Math.round(h.y);
  const k = Math.max(1, Math.round(0.12 * s));
  const across = (x, y) => {
    let a = x, b = x;
    while (a - 1 > x - s && isInk(a - 1, y)) a--;
    while (b + 1 < x + s && isInk(b + 1, y)) b++;
    return b - a + 1;
  };
  let best = null;
  for (const dir of [-1, 1]) {
    let len = 0, bx = h.x1;
    for (let x = h.x1 - k; x <= h.x1 + 1; x++) {
      let y = c, gap = 0, end = c;
      while (Math.abs(y - c) < 3 * s) {
        y += dir;
        if (y < y0 || y > y1) break;
        if (isInk(x, y)) { end = y; gap = 0; } else if (++gap > LIQ.gap * s) break;
      }
      if (Math.abs(end - c) > len) { len = Math.abs(end - c); bx = x; }
    }
    if (len <= LIQ.minLen * s || len >= LIQ.maxLen * s) continue;
    const yE = c + dir * len;
    let thick = 0, nt = 0;
    for (let y = c + dir * Math.round(0.4 * s); dir * (yE - y) > 0.05 * s; y += dir) {
      if (!isInk(bx, y)) continue;
      thick += across(bx, y); nt++;
    }
    if (!nt || thick / nt < LIQ.minThick * s) continue;
    const ws = [];
    for (let d = 0; d <= Math.round(0.3 * s); d++) if (isInk(bx, yE - dir * d)) ws.push(across(bx, yE - dir * d));
    ws.sort((p, q) => p - q);
    const endW = ws.length ? ws[Math.floor(ws.length / 2)] : 0;
    if (endW < LIQ.minEnd * s || endW >= LIQ.maxEnd * s) continue;
    const y = yE - dir * 0.25 * s;
    const hit = heads.some((o) => o !== h && Math.sign(o.y - h.y) === dir && Math.abs(o.y - h.y) > 0.3 * s &&
      Math.abs(o.y - y) < 0.4 * s && o.x0 <= bx + 0.6 * s && o.x1 >= bx - 0.3 * s);
    if (hit) continue;
    if (!best || len > best.len) best = { len, x: bx, y, pos: Math.round((staff.bottom - y) / (s / 2)) };
  }
  return best && { x: best.x, y: best.y, pos: best.pos };
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
    // a liquescent's small note is read straight after its head
    notes = notes.flatMap((h) => (h.liq ? [h, { ...h.liq, liquescent: true }] : [h]));
    return {
      staff: k + 1,
      top: staff.top,
      space: staff.space,
      clefPos: clef ? clef.pos : null,
      notes: notes.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), rel: clef ? h.pos - clef.pos : null, shape: h.liquescent ? 'liquescent' : headShape(h.feat) })),
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
      out.push({ rel: 'abcdefghijklm'.indexOf(lower) - clefLine, text, group: m[2], shape: gabcShape(g, i) });
    }
  }
  return out;
}

// The printed shape GABC asks for at note letter g[i]: an upper-case letter
// is a rhombus (punctum inclinatum); a following w a quilisma, ~ < > a
// liquescent, v (or V) a virga, o an oriscus, s a stropha. Plain squares
// are 'punctum'.
export function gabcShape(g, i) {
  if (g[i] !== g[i].toLowerCase()) return 'rhombus';
  for (let k = i + 1; k < g.length && !/[a-mA-M\/!, ]/.test(g[k]); k++) {
    const ch = g[k];
    if (ch === 'w') return 'quilisma';
    if (ch === '~' || ch === '<' || ch === '>') return 'liquescent';
    if (ch === 'v' || ch === 'V') return 'virga';
    if (ch === 'o' || ch === 'O') return 'oriscus';
    if (ch === 's') return 'stropha';
  }
  return 'punctum';
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

// Local alignment (free ends on both sides): for a page that also carries
// other pieces. Scores +1 a match, -1 a mismatch or gap; returns the best
// region in the same shape as align().
export function alignLocal(a, b) {
  const n = a.length, m = b.length;
  const H = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const v = Math.max(0, H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 1 : -1), H[i - 1][j] - 1, H[i][j - 1] - 1);
      H[i][j] = v;
      if (v > best) { best = v; bi = i; bj = j; }
    }
  }
  const pairs = [];
  let i = bi, j = bj;
  while (i > 0 && j > 0 && H[i][j] > 0) {
    if (H[i][j] === H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 1 : -1)) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (H[i][j] === H[i - 1][j] - 1) { pairs.push([i - 1, null]); i--; }
    else { pairs.push([null, j - 1]); j--; }
  }
  pairs.reverse();
  let match = 0, sub = 0, scanOnly = 0, gabcOnly = 0;
  for (const [p, q] of pairs) {
    if (p !== null && q !== null) (a[p] === b[q] ? match++ : sub++);
    else if (p !== null) scanOnly++;
    else gabcOnly++;
  }
  return { pairs, startJ: j, endJ: bj, startI: i, endI: bi, score: best, match, sub, scanOnly, gabcOnly };
}
