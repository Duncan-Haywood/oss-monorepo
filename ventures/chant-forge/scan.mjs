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
// `staffV1: true` gives the finder as it was before 2026-11-14 (no line
// trimming, no outer-pair spacing, no median-spacing check), for
// eval/thick-line-check.mjs.
export function findStaves(bin, { minCover = 0.2, linesPerStaff = 4, staffV1 = false, staffJoin = true } = {}) {
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
    const [top, bottom] = staffV1 ? [start, y] : trimLine(bin, start, y);
    lines.push({ top, bottom, y: (top + bottom) / 2 });
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
      if (d > 120 * (linesPerStaff - 1)) break;
      const idx = [i, j];
      for (let k = 2; k < linesPerStaff && d <= 120; k++) {
        const tol = Math.max(2, 0.12 * d);
        const m = lines.findIndex((l) => Math.abs(l.y - (lines[i].y + k * d)) <= tol);
        if (m < 0) break;
        idx.push(m);
      }
      if (idx.length === linesPerStaff && d <= 120) cands.push({ idx, d });
      // the same test with i and j as the outer lines: on a tilted page one
      // line's centre can sit a few pixels off, and the spacing taken from
      // the outer pair is three times less sensitive to it than the
      // first pair's (eval/thick-line-check.md, leaf 582)
      const D = d / (linesPerStaff - 1);
      if (staffV1 || D < 6) continue;
      const o = [i];
      for (let k = 1; k < linesPerStaff - 1; k++) {
        const m = lines.findIndex((l) => Math.abs(l.y - (lines[i].y + k * D)) <= Math.max(2, 0.12 * D));
        if (m < 0) break;
        o.push(m);
      }
      if (o.length === linesPerStaff - 1) cands.push({ idx: [...o, j], d: D });
    }
  }
  // tightest spacing first: real staves beat chance alignments of a page
  // rule with lines of other staves
  cands.sort((p, q) => p.d - q.d);
  for (const c of cands) {
    if (c.idx.some((k) => used.has(k))) continue;
    const group = c.idx.map((k) => lines[k]);
    const mean = (group[linesPerStaff - 1].y - group[0].y) / (linesPerStaff - 1);
    const extent = staffExtent(bin, group, { join: staffJoin && !staffV1 });
    if (extent.right - extent.left < 8 * mean) continue;
    c.idx.forEach((k) => used.add(k));
    staves.push({ lines: group, space: mean, top: group[0].y, bottom: group[linesPerStaff - 1].y, ...extent });
  }
  staves.sort((p, q) => p.top - q.top);
  // one page prints one size of staff: a "staff" far tighter than the
  // page's median is rows of text that happen to be evenly spaced
  const sp = staves.map((s) => s.space).sort((p, q) => p - q);
  const median = sp[Math.floor(sp.length / 2)];
  return staffV1 ? staves : staves.filter((s) => s.space >= 0.7 * median);
}

// A staff line crowded with heads (a long recitation on one line) has rows
// just above and below it where the heads alone cover a fifth of the page,
// so findStaves took them as part of the line: on leaf 747 of the 1908
// Graduale a 6 px line came out 19 px thick, and readStaff, which drops line
// rows unless ink crosses them, wiped out every head sitting on it
// (eval/thick-line-check.md). A head is at most a staff space wide; a line
// row is ink in runs of hundreds of pixels. So the band is trimmed from
// both ends to the rows whose ink in runs of LINE_MIN_RUN of the page width
// or longer is at least LINE_TRIM of the band's best row, plus one row. Head-only rows
// have none; a line's faint edge rows have 5% or more of its best row, and
// must stay in the line, or descending rhombi touching it join up.
export const LINE_MIN_RUN = 0.04;
export const LINE_TRIM = 0.02;
export function trimLine(bin, top, bottom) {
  const { width, ink } = bin;
  const minRun = Math.max(8, Math.round(LINE_MIN_RUN * width));
  const long = [];
  for (let y = top; y <= bottom; y++) {
    let c = 0, run = 0;
    for (let x = 0; x <= width; x++) {
      if (x < width && ink[y * width + x]) { run++; continue; }
      if (run >= minRun) c += run;
      run = 0;
    }
    long.push(c);
  }
  const best = Math.max(...long);
  if (!best) return [top, bottom];
  let a = 0, b = long.length - 1;
  while (a < b && long[a] < LINE_TRIM * best) a++;
  while (b > a && long[b] < LINE_TRIM * best) b--;
  // one row more each side, inside the band: a worn line's edge row can be
  // ink in short pieces only (leaf 425 staff 2), and masking one head row
  // costs nothing (a head on the line keeps ink above and below the mask)
  return [top + Math.max(0, a - 1), top + Math.min(long.length - 1, b + 1)];
}

// Staff lines broken by a short white gap (STAFF_JOIN, 2026-11-18,
// eval/staff-gap-check.md). The 1908 Graduale prints some staves with
// every line broken for 5-15 px, at a bar line or mid-phrase (leaf 434
// staff 3 after "re-", leaf 489 staff 2 between its clef and the rest),
// and the longest unbroken stretch alone was read, so everything on the
// other side was lost: the cephalicus on 3421 "non" and ten notes beside
// it, or a staff's clef. Two stretches, each over minLen spaces, are now
// one staff when the gap between them is at most `gap` spaces and neither
// is a decorated initial's box (its frame crosses the lines; between the
// lines it is over `dense` inked, where a staff stretch, heads and all,
// is far under). `findStaves(bin, { staffJoin: false })` reads as before.
export const STAFF_JOIN = { gap: 0.5, minLen: 3, dense: 0.35 };
function staffExtent(bin, lines, { join = true } = {}) {
  const { width, ink } = bin;
  const covered = new Uint8Array(width);
  for (const l of lines) {
    for (let x = 0; x < width; x++) {
      let any = 0;
      for (let y = l.top - 4; y <= l.bottom + 4; y++) any |= ink[y * width + x];
      covered[x] += any;
    }
  }
  // every stretch where every line has ink (gaps of a few pixels
  // allowed): a page frame's vertical rule crosses the lines but is not staff
  const runs = [];
  let start = -1, miss = 0;
  for (let x = 0; x <= width; x++) {
    const on = x < width && covered[x] >= lines.length - 1;
    if (on) { if (start < 0) start = x; miss = 0; }
    else if (start >= 0 && ++miss > 4) {
      runs.push([start, x - miss]);
      start = -1; miss = 0;
    }
  }
  if (join && runs.length > 1) {
    const space = (lines[lines.length - 1].y - lines[0].y) / (lines.length - 1);
    // ink between the lines (line rows and 2 px either side left out)
    const between = (a, b) => {
      let n = 0, c = 0;
      for (let y = Math.round(lines[0].y); y <= Math.round(lines[lines.length - 1].y); y++) {
        if (lines.some((l) => y >= l.top - 2 && y <= l.bottom + 2)) continue;
        for (let x = a; x <= b; x++) { n++; c += ink[y * width + x]; }
      }
      return n ? c / n : 0;
    };
    const ok = (r) => r[1] - r[0] > STAFF_JOIN.minLen * space && between(r[0], r[1]) <= STAFF_JOIN.dense;
    const merged = [runs[0]];
    for (const r of runs.slice(1)) {
      const last = merged[merged.length - 1];
      if (r[0] - last[1] - 1 <= STAFF_JOIN.gap * space && ok(last) && ok(r)) last[1] = r[1];
      else merged.push(r);
    }
    runs.splice(0, runs.length, ...merged);
  }
  let best = [0, -1];
  for (const r of runs) if (r[1] - r[0] > best[1] - best[0]) best = r;
  const [left, right] = best;
  return { left, right };
}

// Heads on one staff. Returns [{x, y, pos}] in reading order, where pos is
// the staff position counted in steps from the bottom line (0 = bottom
// line, 1 = first space, 2 = second line, ...).
export const STROKE_TOP_FALL = 0.4;
// A stroke broken near its top (readStaff): the short top piece falls at
// least minFall spaces, and the wide rest starts within join spaces of its
// right end's height. Set from one stroke (GregoBase 3679, leaf 721).
export const BROKEN_STROKE = { minFall: 0.15, join: 0.35 };
// Set on the twelve tuning lists (eval/fleck-check.md): a fleck is 1-4 px at
// 37 px a space; a head is 0.5-0.65 spaces wide.
export const FLECK = { gap: 0.12, dc: 0.15, minW: 0.4, maxW: 0.8, fill: 0.4, reach: 1.0 };
export function readStaff(bin, staff, { minH = 0.4, maxH = 0.85, strokeTop = true, brokenStroke = true, hookOnLine = true, oneStep = true, oneStepGap = true, fleck = true } = {}) {
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
  // A head split by a white fleck (FLECK): worn print leaves a few white
  // columns inside a square, every run in them falls under minH, and the two
  // halves are each narrower than the 0.25-space cut, so the note was lost
  // (GregoBase 3439 nae, leaf 598; eval/fleck-check.md). Two pieces that are
  // both under the cut, a gap of at most FLECK.gap spaces apart, at the same
  // height (centres within FLECK.dc spaces) and together a head's width are
  // joined into one, when every column between them is inked over FLECK.fill
  // of the head's height and the head lies within FLECK.reach spaces of the staff.
  if (fleck) {
    for (let i = 0; i < heads.length; i++) {
      const p = heads[i];
      if (!p || p.lastX - p.x0 + 1 >= 0.25 * s) continue;
      for (let j = 0; j < heads.length; j++) {
        const q = heads[j];
        if (!q || q === p || q.lastX - q.x0 + 1 >= 0.25 * s) continue;
        const gap = q.x0 - p.lastX - 1;
        if (gap < 1 || gap > FLECK.gap * s) continue;
        if (Math.abs(mean(q.cs) - mean(p.cs)) > FLECK.dc * s) continue;
        // on or near the staff: the lyric under it is set in bold letters
        // that come apart into pieces of a head's height (leaf 356, staff 8)
        const cm = mean([...p.cs, ...q.cs]);
        if (cm > staff.bottom + FLECK.reach * s || cm < staff.top - FLECK.reach * s) continue;
        const w = q.lastX - p.x0 + 1;
        if (w < FLECK.minW * s || w > FLECK.maxW * s) continue;
        // the fleck is inside the head: every column between the pieces has
        // ink over FLECK.fill of the head's height (two letters of the lyric
        // under a staff have white between them)
        const top = Math.min(...p.runs.map((r) => r.a), ...q.runs.map((r) => r.a));
        const bot = Math.max(...p.runs.map((r) => r.b), ...q.runs.map((r) => r.b));
        let filled = true;
        for (let x = p.lastX + 1; x < q.x0 && filled; x++) {
          let n = 0;
          for (let y = top; y <= bot; y++) n += isInk(x, y) ? 1 : 0;
          if (n < FLECK.fill * (bot - top + 1)) filled = false;
        }
        if (!filled) continue;
        heads[i] = { x0: p.x0, lastX: q.lastX, cs: [...p.cs, ...q.cs], runs: [...p.runs, ...q.runs], fleck: true };
        heads[j] = null;
        i--;
        break;
      }
    }
    for (let i = heads.length - 1; i >= 0; i--) if (!heads[i]) heads.splice(i, 1);
  }
  for (const h of heads) {
    const w = h.lastX - h.x0 + 1;
    if (w < 0.25 * s) continue; // rhombi keep only a few full-height columns
    if (w <= 1.2 * s) {
      const c = mean(h.cs);
      const feat = headFeatures(isInk, h.x0, h.lastX, c, s, y0, y1);
      if (feat) {
        feat.notch = notchRows(bin, h.x0, h.lastX, c, s);
        // how far the piece's centre falls from its left end to its right,
        // in staff spaces: a porrectus stroke falls, a quilisma does not
        const k = Math.max(2, Math.round(0.15 * s));
        feat.fall = (mean(h.cs.slice(-k)) - mean(h.cs.slice(0, k))) / s;
      }
      const k2 = Math.max(2, Math.round(0.15 * s));
      const ends = { a: mean(h.cs.slice(0, k2)), b: mean(h.cs.slice(-k2)) };
      out.push({ x: (h.x0 + h.lastX) / 2, x0: h.x0, x1: h.lastX, y: c, pos: posOf(c), feat, ends });
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
  // The top of a porrectus stroke cut short (eval/porrectus-top-check.md).
  // The stroke thins towards its lower end, and where its columns fall under
  // the head-height cut (minH) the piece stops. What is left can be narrower
  // than 1.2 spaces, so it was read as one head at its mean height: half way
  // down the fall, a step below the stroke's first note. A head whose centre
  // falls STROKE_TOP_FALL spaces or more from its left end to its right, and
  // that does not continue a stroke or touch another piece on its left, is
  // read at its left end. If
  // no head starts just after it below its right end (the stroke's foot, read
  // as its own piece), its right end is the stroke's second note.
  // A stroke can also break in two near its top (eval/broken-stroke-check.md):
  // a short first piece that falls under STROKE_TOP_FALL on its own, and
  // the rest of the stroke as a wide piece starting at its right edge. The
  // short piece is then read at its mean height, a step below the stroke's
  // first note (GregoBase 3679, leaf 721). A head that falls, whose right
  // edge runs into a piece wider than 0.8 spaces that starts within 0.1
  // spaces of it, at its own height (within BROKEN_STROKE.join spaces), and
  // that falls further, is read at its left end, and the wide piece at its
  // right end (the stroke's second note).
  if (strokeTop && brokenStroke) {
    for (const o of out) {
      if (!o.feat || o.feat.afterStroke || !(o.feat.fall >= BROKEN_STROKE.minFall) || o.feat.fall >= STROKE_TOP_FALL) continue;
      if (out.some((t) => t !== o && t.x0 < o.x0 && t.x1 >= o.x0 - 0.2 * s && Math.abs(t.y - o.y) <= 1.2 * s)) continue;
      const rest = out.find((t) => t !== o && t.ends && t.x1 - t.x0 + 1 > 0.8 * s && t.x0 > o.x0 &&
        Math.abs(t.x0 - o.x1) <= 0.1 * s && Math.abs(t.ends.a - o.ends.b) <= BROKEN_STROKE.join * s && t.ends.b - t.ends.a >= BROKEN_STROKE.minFall * s);
      if (!rest) continue;
      o.y = o.ends.a;
      o.pos = posOf(o.ends.a);
      o.strokeTop = true;
      o.brokenStroke = true;
      rest.y = rest.ends.b;
      rest.pos = posOf(rest.ends.b);
      rest.brokenStroke = true;
    }
  }
  const extra = [];
  for (const o of out) {
    if (!strokeTop || o.brokenStroke || !o.feat || o.feat.afterStroke || !(o.feat.fall >= STROKE_TOP_FALL)) continue;
    // a stroke's top follows its stem; a piece touching another on its left
    // is the middle of a stroke the reader broke into several pieces
    if (out.some((t) => t !== o && t.x0 < o.x0 && t.x1 >= o.x0 - 0.2 * s && Math.abs(t.y - o.y) <= 1.2 * s)) continue;
    const foot = out.some((t) => t !== o && t.x0 > o.x0 && t.x0 - o.x1 <= 0.3 * s && t.y > o.ends.b);
    const e = Math.round(0.5 * s);
    if (!foot) {
      extra.push({ x: o.x1 - e / 2, x0: o.x1 - e, x1: o.x1, y: o.ends.b, pos: posOf(o.ends.b), strokeEnd: true });
      o.x1 = Math.min(o.x1, o.x0 + e);
      o.x = (o.x0 + o.x1) / 2;
    }
    o.y = o.ends.a;
    o.pos = posOf(o.ends.a);
    o.strokeTop = true;
  }
  out.push(...extra);
  // a liquescent's small note hangs off its head on a short stem
  // (liquescentTail); it is kept on the head and read after it (readPage)
  for (const o of out) {
    const t = liquescentTail(isInk, o, out, staff, y0, y1, { onLine: hookOnLine, bin });
    if (t) o.liq = t;
  }
  // a one-step cephalicus: its small note is joined under the head's right
  // half, too short to be a tail and too small to be a head (oneStepCephalicus),
  // tried only on heads liquescentTail gave no tail
  if (oneStep) {
    for (const o of [...out]) {
      if (!o.feat || o.liq || o.strokeTop || o.brokenStroke || !out.includes(o)) continue;
      const t = oneStepCephalicus(isInk, o, staff, y0, y1, { gap: oneStepGap });
      if (!t) continue;
      o.liq = t;
      o.oneStep = true;
      // the small note (or the lower half of a run split in two) read as a head of its own
      for (let i = out.length - 1; i >= 0; i--) {
        const u = out[i];
        if (u !== o && u.x1 >= t.rx0 && u.x0 <= o.x1 + 0.1 * s && u.y - o.y >= ONE_STEP.lowFrom * s && u.y - o.y <= ONE_STEP.lowTo * s) out.splice(i, 1);
      }
    }
  }
  // Two more things a quilisma never is (eval/quilisma-stroke-check.md):
  // the top note of a stack (a quilisma is the lowest note of its neume, so
  // nothing is printed straight under it; two stacked squares with a white
  // seam between them otherwise look notched), and a head carrying a
  // liquescent tail (an epiphonus head's concave top looks like teeth).
  for (const o of out) {
    if (!o.feat) continue;
    o.feat.under = out.some((t) => t !== o && Math.abs(t.x - o.x) < 0.3 * s && t.y - o.y > 0.3 * s && t.y - o.y < 0.8 * s);
    o.feat.liq = !!o.liq;
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
//
// Version 3 (2026-11-14, eval/quilisma-stroke-check.md): a notched head is
// not a quilisma when its centre falls by QUILISMA_MAX_FALL staff spaces or
// more from its left end to its right (a piece of a porrectus stroke: every
// real quilisma on the 32 scanned pieces falls 0.01 or less, every stroke
// piece looked at 0.13 or more), when a head is printed straight under it,
// or when it carries a liquescent tail. Chosen on those 32 pieces (41 false
// calls to 16, no quilisma lost) and then tested on pieces first scanned
// after it was frozen (eval/quilisma-fresh-pages.json: 29 of 3,080 other
// heads called quilismas to 6, quilismas 47 of 55 under both versions).
export const QUILISMA_ROWS = 3;
export const QUILISMA_MAX_FALL = 0.06;
export function isQuilisma(f) {
  if (!f || f.notch < QUILISMA_ROWS || f.afterStroke) return false;
  if (f.fall >= QUILISMA_MAX_FALL || f.under || f.liq) return false;
  return true;
}
// Rhombus height floor (2026-11-14, eval/rhombus-height-check.md): a
// square whose worn print shows white flecks loses its edge columns and
// comes out narrow and tapered like a rhombus, but it is no taller than a
// square (0.56-0.61 staff spaces). A rhombus is a square on its corner and
// stands taller (all but 2 of 1,026 read on 50 pieces are 0.63 or more).
// Chosen on those 50 pieces (18 squares called rhombi to 6, 2 rhombi lost);
// tested on six pieces listed before their pages were downloaded
// (eval/rhombus-fresh-pages.json, eval/rhombus-height-report.md).
export const RHOMBUS_MIN_H = 0.62;
export function headShape(f) {
  if (!f) return null;
  if (f.w < 0.42 && f.taper < 0.8 && f.h >= RHOMBUS_MIN_H) return 'rhombus';
  if (isQuilisma(f)) return 'quilisma';
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
export const LIQ = { minLen: 0.6, maxLen: 2.4, gap: 0.2, minThick: 0.1, minEnd: 0.2, maxEnd: 0.4, onLine: 0.06, straddle: 0.08 };
export function liquescentTail(isInk, h, heads, staff, y0, y1, { onLine = true, bin = null } = {}) {
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
    // a hook (or small head) whose end sits on a staff line: the line's
    // rows count as ink only where ink runs out the far side too, so the
    // trace stopped at the line's near edge and the small note was read a
    // step too close to its head. Once the tail is accepted as it stands,
    // its end is moved on to the line's far edge (LIQ.onLine; this never
    // decides whether there is a tail, only where it ends) -- but only when
    // the small note straddles the line: in the tail's column the ink runs
    // past the line's far edge, as measured half a space to a space either
    // side, by LIQ.straddle spaces. A small note in the space beside a line
    // only touches it, and moving its end read it a step too far (8 such
    // notes on the earlier piece lists, eval/hook-on-line-check.md).
    let yR = yE;
    const l = onLine && bin ? staff.lines.find((q) => { const d = dir > 0 ? q.top - yE : yE - q.bottom; return d >= 1 && d <= Math.max(1, LIQ.onLine * s); }) : null;
    if (l) {
      // the far end of the ink in column x that crosses the line: from the
      // line's near edge, past any white rows inside the line, to where the
      // ink stops (the line's own far edge, or what hangs past it)
      const near = dir > 0 ? l.top : l.bottom, farEdge = dir > 0 ? l.bottom : l.top;
      const reach = (x) => {
        const at = (y) => bin.ink[y * bin.width + x] === 1;
        let y = near;
        while (!at(y) && dir * (farEdge - y) > 0) y += dir;
        if (!at(y)) return 0;
        while (Math.abs(y - near) < s / 2 && at(y + dir)) y += dir;
        return dir * (y - near);
      };
      const ref = [];
      for (const side of [-1, 1]) for (let d = Math.round(0.5 * s); d <= s; d += 2) ref.push(reach(bx + side * d));
      ref.sort((p, q) => p - q);
      if (reach(bx) - ref[Math.floor(ref.length / 2)] >= Math.max(2, LIQ.straddle * s)) yR = dir > 0 ? l.bottom : l.top;
    }
    const y = yR - dir * 0.25 * s, y0E = yE - dir * 0.25 * s;
    const hit = heads.some((o) => o !== h && Math.sign(o.y - h.y) === dir && Math.abs(o.y - h.y) > 0.3 * s &&
      Math.abs(o.y - y0E) < 0.4 * s && o.x0 <= bx + 0.6 * s && o.x1 >= bx - 0.3 * s);
    if (hit) continue;
    if (!best || len > best.len) best = { len, x: bx, y, pos: Math.round((staff.bottom - y) / (s / 2)) };
  }
  return best && { x: best.x, y: best.y, pos: best.pos };
}

// A one-step cephalicus (fe~ printed with the small note on the line or
// in the space just below its head): the head, a hairline stem down its
// left side, and the small note joined under the head's right half. Head
// and small note together are about a space tall, so readStaff takes them
// for one head (or splits the run into two plain heads), and the hook is
// too short for liquescentTail (GregoBase 3490 con- and 3508 et, both gf~;
// eval/one-step-cephalicus-check.md). Measured in a window ONE_STEP.from to
// ONE_STEP.to spaces below the head's centre, where a small note one step
// down sits and the head's own ink has ended:
//   - the head's right part (from ONE_STEP.split of its width) has rows
//     inked across at least half its columns, in a run noteW spaces or
//     wider (a podatus's stem is narrower; a white counter up to gap
//     spaces inside the small note is bridged), for minRows spaces or more,
//   - its left part (past the stem) is at most maxLeft inked, so it is not
//     a second full head (a podatus or two touching heads),
//   - the right part's ink stops by ONE_STEP.maxEnd spaces (not a longer
//     tail or a stem), and
//   - the head is level (its centre falls at most maxFall spaces across
//     it; a porrectus stroke's top piece falls further), and
//   - a stem at the head's left edge runs down stem spaces or more, and
//     is a hairline (stemW spaces or less across) beside the small note:
//     the upper head of a quilisma podatus has the quilisma there.
// The small note is read one step under the head.
export const ONE_STEP = { from: 0.55, to: 0.85, split: 0.45, minRows: 0.15, maxLeft: 0.3, maxEnd: 0.95, stem: 0.95, stemW: 0.2, noteW: 0.18, maxFall: 0.12, lowFrom: 0.3, lowTo: 0.9, gap: 0.1 };
export function oneStepCephalicus(isInk, h, staff, y0, y1, { gap = true } = {}) {
  const s = staff.space;
  const c = h.y, w = h.x1 - h.x0 + 1;
  if (w < 0.35 * s) return null;
  // a level head: a porrectus stroke's top piece falls to its right
  if (h.feat && Math.abs(h.feat.fall) > ONE_STEP.maxFall) return null;
  const rx0 = Math.round(h.x0 + ONE_STEP.split * w);
  const lx0 = Math.round(h.x0 + 0.15 * w);
  const ya = Math.round(c + ONE_STEP.from * s), yb = Math.min(y1, Math.round(c + ONE_STEP.to * s));
  // the longest run of ink across a row, from a little left of the right
  // part to a little past the head (a small note is wider than a stem)
  // A gap of up to ONE_STEP.gap spaces inside the run is bridged: some
  // printings draw the small note with a white counter, so only its bottom
  // rows are solid and its upper rows are two bars either side of the
  // counter (GregoBase 3478 e, 3481 cer-, 3448 in; eval/one-step-hollow-check.md).
  const gapMax = gap ? Math.round(ONE_STEP.gap * s) : 0;
  const runIn = (y, xa, xb) => {
    let best = 0, start = -1, last = -1;
    for (let x = xa; x <= xb; x++) {
      if (!isInk(x, y)) continue;
      if (start < 0 || x - last - 1 > gapMax) start = x;
      last = x;
      if (last - start + 1 > best) best = last - start + 1;
    }
    return best;
  };
  const rxa = Math.round(rx0 - 0.1 * s), rxb = Math.round(h.x1 + 0.1 * s);
  let rows = 0, left = 0, leftN = 0;
  for (let y = ya; y <= yb; y++) {
    let r = 0;
    for (let x = rx0; x <= h.x1; x++) r += isInk(x, y) ? 1 : 0;
    if (r >= 0.5 * (h.x1 - rx0 + 1) && runIn(y, rxa, rxb) >= ONE_STEP.noteW * s) rows++;
    for (let x = lx0; x < rx0; x++) { left += isInk(x, y) ? 1 : 0; leftN++; }
  }
  if (rows < ONE_STEP.minRows * s || !leftN || left / leftN > ONE_STEP.maxLeft) return null;
  // the right part's ink ends: no row inked across half of it past maxEnd
  const yEnd = Math.round(c + ONE_STEP.maxEnd * s);
  if (yEnd <= y1) {
    let r = 0;
    for (let x = rx0; x <= h.x1; x++) r += isInk(x, yEnd) ? 1 : 0;
    if (r >= 0.5 * (h.x1 - rx0 + 1)) return null;
  }
  // a stem down the head's left edge (it may be outside the piece: its
  // columns' runs are too long to be a head)
  // and a hairline: under the head, as far down as the small note, every row's
  // ink around it is at most ONE_STEP.stemW spaces across (a quilisma or a
  // lower head joined there is wider)
  let stem = false;
  for (let x = Math.round(h.x0 - 0.3 * s); x <= lx0 && !stem; x++) {
    let y = Math.round(c), gap = 0, end = y;
    while (y < y1 && y - c < 2 * s) { y++; if (isInk(x, y)) { end = y; gap = 0; } else if (++gap > 0.1 * s) break; }
    if (end - c < ONE_STEP.stem * s) continue;
    let thin = true;
    for (let y2 = ya; y2 <= yb && thin; y2++) {
      if (!isInk(x, y2)) continue;
      let a = x, b = x;
      while (isInk(a - 1, y2) && x - a < s) a--;
      while (isInk(b + 1, y2) && b - x < s && b + 1 < lx0) b++;
      if (b - a + 1 > ONE_STEP.stemW * s) thin = false;
    }
    if (thin) stem = true;
  }
  if (!stem) return null;
  const y = c + 0.5 * s;
  return { x: Math.round((rx0 + h.x1) / 2), y, pos: h.pos - 1, rx0 };
}

// The clef is the first glyph on the staff: its two blocks sit either side
// of the clef line. Returns {line position, number of heads it used}.
//
// An F clef is a square with a stem down its right side, then the C clef's
// two blocks. Where the stem and the blocks' left curve touch, their tall
// columns are one run and the glyph's middle is the F line. Where a white gap
// of a pixel or two parts them, only the stem was read before 2026-11-19, and
// its middle sits about a space below the line, so the whole staff was read
// two steps high (leaf 434 staff 3, GregoBase 3421, eval/clef-bridge-check.md).
// The run now carries on over a gap of up to CLEF_BRIDGE spaces, to columns
// whose ink stays inside the search window; `readPage(img, { clefBridge: false })`
// reads as before.
export const CLEF_BRIDGE = 0.15;
export function findClef(bin, staff, { clefBridge = true } = {}) {
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
  const gapMax = clefBridge ? Math.round(CLEF_BRIDGE * s) : 0;
  for (let c = x; c < x + 1.4 * s;) {
    if (tall(c)) {
      const [a, b] = longest(c);
      lo = Math.min(lo, a); hi = Math.max(hi, b);
      x1 = ++c;
      continue;
    }
    // across the gap only to a glyph's columns: a run reaching the window's
    // edge is a page frame or an initial's border (leaf 652 staff 2), never a clef
    let g = c;
    while (g - c < gapMax && g < x + 1.4 * s && !tall(g)) g++;
    if (g === c || g >= x + 1.4 * s || !tall(g)) break;
    const [ga, gb] = longest(g);
    if (ga <= ya || gb >= yb) break;
    c = g;
  }
  x1 = Math.max(x1, Math.round(x + 0.75 * s)); // the blocks reach right of the stem
  // the c clef's two blocks sit either side of its line, so the glyph's
  // middle is the line
  const pos = 2 * Math.round((staff.bottom - (lo + hi) / 2) / s);
  return { pos, x0: x, x1 };
}

// A C clef printed inside a staff, where a verse or a new piece changes the
// clef (`(z0::c3)` in GABC, after a double bar). findClef only looks at the
// staff's start, so before 2026-11-14 such a clef's two blocks were read as
// a podatus and every note after it was read against the old clef, two or
// more steps out (GregoBase 3437, *Adhaesi*: 16 of its 17 differences,
// eval/clef-change-check.md). The 1908 type's C clef is two blocks a third
// apart, one in each space either side of its line, joined by a curve on
// their LEFT; a podatus's two heads are joined by a stem on their RIGHT. So
// a pair of heads one above the other (centres within 0.3 spaces
// across), two steps apart, sitting in spaces (odd positions), with ink
// running unbroken from one block to the other at their left edge and not
// at their right edge, is a clef on the line between them. F clefs inside a
// staff are not read.
export function findClefChanges(bin, staff, heads) {
  const { width, ink } = bin;
  const s = staff.space;
  const joined = (x, a, b) => {
    if (x < 0 || x >= width) return false;
    for (let y = Math.round(a); y <= Math.round(b); y++) if (!ink[y * width + x]) return false;
    return true;
  };
  const out = [];
  for (const L of heads) {
    if (L.pos % 2 === 0 || L.liquescent) continue;
    for (const U of heads) {
      if (U === L || U.pos - L.pos !== 2 || Math.abs(U.x - L.x) > 0.3 * s) continue;
      const a = U.y + 0.2 * s, b = L.y - 0.2 * s; // over the gap between the blocks
      const x0 = Math.min(U.x0, L.x0), x1 = Math.max(U.x1, L.x1);
      const e = Math.round(0.25 * s);
      let left = false, right = false;
      for (let x = x0 - 3; x <= x0 + e && !left; x++) left = joined(x, a, b);
      for (let x = x1 - e; x <= x1 + 3 && !right; x++) right = joined(x, a, b);
      if (left && !right) out.push({ x0, x1, pos: L.pos + 1, blocks: [L, U] });
    }
  }
  return out.sort((p, q) => p.x0 - q.x0);
}

// A page photographed or scanned a little turned prints its staff lines
// at a slope. findStaves takes a line as rows that each hold a fifth of the
// page width in ink, so a line that drifts several of its own thicknesses
// across the staff is spread over more rows than it fills, stops being one
// band, or is measured so thick that readStaff erases the heads on it
// (leaf 424 of the 1908 Graduale: 2 of its 9 staves found,
// eval/thick-line-check.md). The slope is found the usual way for printed
// pages: shear the ink by each trial slope and keep the one whose row
// profile is sharpest (sum of squared row counts), coarse then fine.
// Ink is sampled every SKEW_STEP columns. A page is only straightened when
// the slope moves a line DESKEW_MIN_DRIFT pixels or more across the page
// (0.29 degrees at 2000 px), so a page the square reader already reads is
// read exactly as before: on drawn pages the square reader holds to 0.3-0.4
// degrees and fails from 0.5 (eval/deskew-synthetic-report.md). Below that
// straightening gains nothing and can cost: it tightens the line mask, so
// specks touching a line are no longer masked and can join a head (seen at
// 0.2 degrees with a heavy one-in-400 speckle, eval/deskew-check.md).
export const SKEW_MAX_DEG = 3;
export const SKEW_STEP = 2;
export const DESKEW_MIN_DRIFT = 10;
export function estimateSkew(bin, { maxDeg = SKEW_MAX_DEG, minDrift = DESKEW_MIN_DRIFT } = {}) {
  const { width, height, ink } = bin;
  const xs = [], ys = [];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x += SKEW_STEP) if (ink[row + x]) { xs.push(x - width / 2); ys.push(y); }
  }
  if (!xs.length) return 0;
  const pad = Math.ceil(Math.tan((maxDeg * Math.PI) / 180) * width) + 2;
  const hist = new Float64Array(height + 2 * pad);
  const score = (t) => {
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) hist[ys[i] + Math.round(xs[i] * t) + pad]++;
    let q = 0;
    for (let i = 0; i < hist.length; i++) q += hist[i] * hist[i];
    return q;
  };
  const toT = (deg) => Math.tan((deg * Math.PI) / 180);
  let best = 0, bestQ = score(0);
  // coarse: 0.1 degree steps; then 0.01 degree steps around the best
  for (let d = -maxDeg; d <= maxDeg + 1e-9; d += 0.1) {
    const q = score(toT(d));
    if (q > bestQ) { bestQ = q; best = d; }
  }
  const c = best;
  for (let d = c - 0.1; d <= c + 0.1 + 1e-9; d += 0.01) {
    const q = score(toT(d));
    if (q > bestQ) { bestQ = q; best = d; }
  }
  const t = toT(best);
  return Math.abs(t) * width >= minDrift ? t : 0;
}

// how far a point in column x of the straightened page sits below its
// place on the page as scanned (shearColumns moves column x by the opposite)
function shiftOf(x, t, width) {
  return -Math.round((x - width / 2) * t);
}

// Straighten the ink by moving each column up or down a whole number of
// pixels (a vertical shear). For the few degrees a page is turned this is a
// rotation to within cos(3 deg) = 0.9986 horizontally, and no pixel is
// resampled: every column, and so every head's vertical runs, is kept as
// printed.
export function shearColumns(bin, t) {
  const { width, height, ink } = bin;
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    const dy = Math.round((x - width / 2) * t);
    for (let y = 0; y < height; y++) {
      const ny = y + dy;
      if (ny >= 0 && ny < height && ink[y * width + x]) out[ny * width + x] = 1;
    }
  }
  return { width, height, ink: out };
}

// Scan values relative to the clef line, staff by staff. A trailing custos
// (the small guide note at the right end) is dropped.
// A staff that slopes on a page that does not. Scanned books curl near the
// spine and at the head and foot of a leaf, so one or two staves can drift
// 10-12 px across while the rest of the page lies flat: on leaf 764 of the
// 1908 Graduale staff 1 falls 11 px from left to right, staff 2 9 px, staff
// 5 none, and estimateSkew, which scores the whole page, finds no slope.
// The tilted staff's lines are then measured as bands 11-16 px thick, and
// readStaff, which drops line rows unless ink crosses them, wipes out the
// heads sitting on them (eight notes of *sunt reliquiae* lost,
// eval/staff-curl-check.md). So each staff's own rows, from half a space
// above its top line to half a space below its bottom line, are scored the
// same way, and a slope that moves a line DESKEW_MIN_DRIFT px or more across
// the page is returned, to be added to the page's.
export function staffSkew(bin, staff, { minDrift = DESKEW_MIN_DRIFT } = {}) {
  const { width, height, ink } = bin;
  const ya = Math.max(0, Math.floor(staff.top - 0.5 * staff.space));
  const yb = Math.min(height - 1, Math.ceil(staff.bottom + 0.5 * staff.space));
  const band = { width, height: yb - ya + 1, ink: ink.subarray(ya * width, (yb + 1) * width) };
  return estimateSkew(band, { minDrift });
}

export function readPage(img, opts = {}) {
  const raw = binarize(img);
  // a tilted page is straightened first (estimateSkew, shearColumns); y
  // values are given back on the page as scanned
  const t0 = opts.deskew === false ? 0 : estimateSkew(raw);
  const bin0 = t0 ? shearColumns(raw, t0) : raw;
  const staves = findStaves(bin0, opts);
  return staves.map((staff0, k) => {
    // a staff tilted on its own (the page curls near its top or bottom
    // edge, so the whole-page slope stays under the threshold) is
    // straightened by its own slope and read from that shear
    // (staffSkew; eval/staff-curl-check.md)
    let staff = staff0, bin = bin0, t = t0;
    if (opts.deskew !== false && opts.staffDeskew !== false) {
      const r = staffSkew(bin0, staff0);
      if (r) {
        const b2 = shearColumns(raw, t0 + r);
        const mid = (staff0.top + staff0.bottom) / 2;
        const near = findStaves(b2, opts).filter((q) => Math.abs((q.top + q.bottom) / 2 - mid) < staff0.space && Math.abs(q.space - staff0.space) < 0.15 * staff0.space);
        if (near.length) { staff = near[0]; bin = b2; t = t0 + r; }
      }
    }
    const back = (x, y) => y + shiftOf(x, t, raw.width);
    const heads = readStaff(bin, staff, opts);
    const clef = findClef(bin, staff, opts);
    let notes = clef ? heads.filter((h) => h.x0 > clef.x1) : heads;
    // a clef printed inside the staff: its blocks are not notes, and the
    // notes after it are read against it (findClefChanges)
    const changes = clef && opts.clefChange !== false ? findClefChanges(bin, staff, notes) : [];
    if (changes.length) {
      const blocks = new Set(changes.flatMap((c) => c.blocks));
      notes = notes.filter((h) => !blocks.has(h));
    }
    const clefAt = (x) => { let p = clef ? clef.pos : null; for (const c of changes) if (x > c.x1) p = c.pos; return p; };
    // the custos before a clef change shows the next note in the new clef
    for (const c of changes) {
      const before = notes.filter((h) => h.x1 < c.x0);
      const cu = before[before.length - 1];
      if (cu && c.x0 - cu.x1 < 2.5 * staff.space && cu.x1 - cu.x0 < 0.45 * staff.space) notes = notes.filter((h) => h !== cu);
    }
    const last = notes[notes.length - 1];
    if (last && last.x1 > staff.right - 0.9 * staff.space) notes = notes.slice(0, -1);
    // a liquescent's small note is read straight after its head
    notes = notes.flatMap((h) => (h.liq ? [h, { ...h.liq, liquescent: true }] : [h]));
    return {
      staff: k + 1,
      top: staff.top,
      space: staff.space,
      skew: t ? Math.round(Math.atan(t) * 18000 / Math.PI) / 100 : 0,
      clefPos: clef ? clef.pos : null,
      ...(changes.length ? { clefChanges: changes.map((c) => ({ x: Math.round((c.x0 + c.x1) / 2), pos: c.pos })) } : {}),
      notes: notes.map((h) => ({ x: Math.round(h.x), y: Math.round(back(h.x, h.y)), rel: clef ? h.pos - clefAt(h.x0 ?? h.x) : null, shape: h.liquescent ? 'liquescent' : headShape(h.feat), ...(opts.features && !h.liquescent ? { feat: h.feat } : {}) })),
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
      const note = { rel: 'abcdefghijklm'.indexOf(lower) - clefLine, clefLine, text, group: m[2], shape: gabcShape(g, i) };
      out.push(note);
      // gvv / gvvv / gss / gsss: a bivirga, trivirga, distropha or tristropha
      // prints one head per shape letter, so each further letter is a note
      const rep = /^(v{2,}|s{2,})/.exec(g.slice(i + 1));
      if (rep) for (let k = 1; k < rep[0].length; k++) out.push({ ...note });
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
