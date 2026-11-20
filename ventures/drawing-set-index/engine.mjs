// @ts-check
// Drawing set index: reads the text layer of a construction drawing set PDF
// and returns one row per sheet (number, title, discipline, sheet type), the
// set's own drawing index (when a cover sheet lists one) checked against the
// sheets, and a comparison of two issues of the set.
//
// How a sheet number is found: on a drawing sheet the number sits in the
// title block, in the largest type on the sheet, at the same spot on every
// sheet of the set. Callouts that cite other sheets ("A-301" in a section
// bubble) are small and scattered. So each page's ID-shaped phrases are scored
// by size and by closeness to the lower right, and then the set votes: the
// position where most pages have a large ID-shaped phrase is the title block's
// number cell. A page with nothing there falls back to its own best phrase.
//
// The title is the largest text near the number that is not the same on most
// sheets (project name, firm, address), not a date, scale or field label.
//
// Input is the run list from pdf-text.mjs extractPdfRuns: per page
// {runs: [{text, x, y, size, width, angle}], box: [x0, y0, x1, y1], rotate}.

// --- Designators (US National CAD Standard, Uniform Drawing System) -------

/** Discipline designators in the NCS's order, which is the order sheets are bound in. */
export const DISCIPLINES = [
  ['G', 'General'], ['H', 'Hazardous materials'], ['V', 'Survey / mapping'], ['B', 'Geotechnical'],
  ['C', 'Civil'], ['L', 'Landscape'], ['S', 'Structural'], ['A', 'Architectural'], ['I', 'Interiors'],
  ['Q', 'Equipment'], ['F', 'Fire protection'], ['P', 'Plumbing'], ['D', 'Process'], ['M', 'Mechanical'],
  ['E', 'Electrical'], ['W', 'Distributed energy'], ['T', 'Telecommunications'], ['R', 'Resource'],
  ['X', 'Other disciplines'], ['Z', 'Contractor / shop drawings'], ['O', 'Operations'],
];
const DISC_ORDER = new Map(DISCIPLINES.map(([k], i) => [k, i]));
const DISC_NAME = new Map(DISCIPLINES);

/** NCS sheet type, the first digit after the discipline. */
export const SHEET_TYPES = ['General', 'Plans', 'Elevations', 'Sections', 'Large-scale views', 'Details', 'Schedules and diagrams', 'User defined', 'User defined', '3D representations'];

// A sheet identifier: one to three letters, an optional separator, one to
// four digits, an optional decimal or dash part, an optional suffix letter.
// A-101, A101, A1.01, S-100, M-002, G0.01, A-100-A, AD-201, FP-101.
export const ID_RE = /^([A-Z]{1,3})(?: ?[-.] ?| )?(\d{1,4})((?:[.-]\d{1,3})?)((?:[-.]?[A-Z])?)$/;
const LABEL_PREFIX = /^(?:sheet|sheet\s*(?:no|number|#)|dwg\s*(?:no|#)?|drawing\s*(?:no|number|#)?)\.?\s*[:#]?\s*/i;

/** A canonical form for matching (A-101, A101 and A 101 are one sheet). */
export function canonicalId(id) {
  const m = ID_RE.exec(String(id).trim().replace(/^_+/, '').toUpperCase());
  if (!m) return String(id).trim().toUpperCase();
  return m[1] + m[2] + m[3].replace(/^-/, '.') + m[4].replace(/^[-.]/, '');
}

export function parseId(text) {
  // A leading underscore is how some offices keep a sheet out of Revit's
  // sheet list while still printing it ("_S100").
  const t = String(text).replace(LABEL_PREFIX, '').trim().replace(/^_+/, '').toUpperCase();
  const m = ID_RE.exec(t);
  if (!m) return null;
  const letters = m[1];
  const disc = letters[0];
  const typeDigit = m[2].length >= 2 ? Number(m[2][0]) : null;
  return {
    id: t,
    canonical: canonicalId(t),
    discipline: DISC_NAME.get(disc) || null,
    disciplineCode: letters,
    sheetType: typeDigit !== null && DISC_NAME.has(disc) ? SHEET_TYPES[typeDigit] : null,
  };
}

// --- Page geometry --------------------------------------------------------

function dominantAngle(runs) {
  const w = new Map();
  for (const r of runs) {
    const a = ((Math.round((r.angle || 0) / 90) * 90) % 360 + 360) % 360;
    w.set(a, (w.get(a) || 0) + r.text.trim().length);
  }
  let best = 0, bw = -1;
  for (const [a, n] of w) if (n > bw) { best = a; bw = n; }
  return best;
}

/**
 * Turn a page's runs into phrases in reading coordinates: X to the right and Y
 * down, in points, on the sheet as it is read (text upright). Only runs in the
 * page's main text direction are kept; vertical notes are dropped.
 */
export function pagePhrases(page) {
  const runs = (page.runs || []).filter((r) => r.text && r.text.trim());
  const [x0, y0, x1, y1] = page.box || [0, 0, 612, 792];
  const W = x1 - x0, H = y1 - y0;
  const a = dominantAngle(runs);
  const map = {
    0: (x, y) => [x - x0, y1 - y],
    90: (x, y) => [y - y0, x - x0],
    180: (x, y) => [x1 - x, y - y0],
    270: (x, y) => [y1 - y, x1 - x],
  }[a];
  const width = a === 0 || a === 180 ? W : H, height = a === 0 || a === 180 ? H : W;
  const items = [];
  for (const r of runs) {
    const ra = ((Math.round((r.angle || 0) / 90) * 90) % 360 + 360) % 360;
    if (ra !== a) continue;
    const [X, Y] = map(r.x, r.y);
    const w = r.exact ? r.width : (r.size || 10) * 0.5 * r.text.length;
    items.push({ text: r.text, X, Y, size: r.size || 10, w });
  }
  items.sort((p, q) => p.Y - q.Y || p.X - q.X);
  // Lines: runs whose baselines agree to a third of the size.
  const lines = [];
  for (const it of items) {
    let line = null;
    for (let k = lines.length - 1; k >= 0 && k >= lines.length - 6; k--) {
      const l = lines[k];
      if (Math.abs(l.Y - it.Y) <= Math.max(0.5, 0.3 * Math.min(l.size, it.size))) { line = l; break; }
    }
    if (line) line.items.push(it); else lines.push({ Y: it.Y, size: it.size, items: [it] });
  }
  // Phrases: neighbours on a line with a gap under about one em and sizes within 20%.
  const phrases = [];
  for (const l of lines) {
    l.items.sort((p, q) => p.X - q.X);
    let cur = null;
    for (const it of l.items) {
      const gap = cur ? it.X - (cur.X + cur.w) : Infinity;
      const same = cur && Math.abs(it.size - cur.size) <= 0.2 * Math.max(it.size, cur.size);
      if (cur && same && gap < 0.9 * it.size && gap > -0.5 * it.size) {
        const sep = gap > 0.15 * it.size && !cur.text.endsWith(' ') && !it.text.startsWith(' ') ? ' ' : '';
        cur.text += sep + it.text;
        cur.w = Math.max(cur.w, it.X + it.w - cur.X);
      } else {
        if (cur) phrases.push(cur);
        cur = { ...it };
      }
    }
    if (cur) phrases.push(cur);
  }
  for (const p of phrases) {
    p.text = p.text.replace(/\s+/g, ' ').trim();
    p.u = (p.X + p.w / 2) / width;
    p.v = p.Y / height;
  }
  // Rules (cell borders) in the same reading coordinates.
  const hRules = [], vRules = [];
  for (const [ax, ay, bx, by] of page.rules || []) {
    const [X1, Y1] = map(ax, ay), [X2, Y2] = map(bx, by);
    if (Math.abs(Y1 - Y2) < 0.5) hRules.push({ Y: Y1, X1: Math.min(X1, X2), X2: Math.max(X1, X2) });
    else if (Math.abs(X1 - X2) < 0.5) vRules.push({ X: X1, Y1: Math.min(Y1, Y2), Y2: Math.max(Y1, Y2) });
  }
  return { phrases: phrases.filter((p) => p.text), width, height, hRules, vRules };
}

/** True when a horizontal rule runs between two stacked phrases. */
function ruledApart(pp, a, b) {
  const [up, down] = a.Y <= b.Y ? [a, b] : [b, a];
  const lo = up.Y + 0.15 * up.size, hi = down.Y - 0.75 * down.size;
  if (hi <= lo) return false;
  const x1 = Math.max(up.X, down.X), x2 = Math.min(up.X + up.w, down.X + down.w);
  const mid = x2 > x1 ? (x1 + x2) / 2 : (up.X + up.w / 2 + down.X + down.w / 2) / 2;
  return (pp.hRules || []).some((r) => r.Y > lo && r.Y < hi && r.X1 <= mid && r.X2 >= mid);
}

// --- Sheet number -------------------------------------------------------

function positionPrior(u, v) {
  if (u > 0.7 && v > 0.6) return 1;
  if (u > 0.85 || v > 0.88) return 0.6;
  return 0.1;
}

function candidates(pp) {
  const sizes = pp.phrases.map((p) => p.size).sort((a, b) => b - a);
  const top = sizes[0] || 1;
  const out = [];
  for (const p of pp.phrases) {
    let id = parseId(p.text);
    let inlineTitle = null;
    if (!id) {
      // One line carrying both: "04/20/2018 - FLOOR PLAN - BASEMENT - (A100)".
      const m = /^(.*\S)\s*[-–]?\s*\(([A-Z]{1,3}[-. ]?\d{1,4}(?:[.-]\d{1,3})?(?:[-.]?[A-Z])?)\)\s*$/.exec(p.text);
      if (m && (id = parseId(m[2]))) inlineTitle = m[1].replace(/^\s*(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[-–]\s*/, '').replace(/\s*[-–]\s*$/, '').trim();
    }
    if (!id) {
      // A plot stamp run into the number: "9/1/2014 10:52:32 PM -A-301".
      const m = /^(.*?)\s*-?\s*([A-Z]{1,3}[-. ]?\d{1,4}(?:[.-]\d{1,3})?(?:[-.]?[A-Z])?)$/.exec(p.text);
      if (m && DATE_RE.test(m[1].replace(/\s*-\s*$/, '').trim())) id = parseId(m[2]);
    }
    if (!id) continue;
    if (!/\d/.test(id.id) || id.id.length > 12) continue;
    const score = (p.size / top) * positionPrior(p.u, p.v);
    out.push({ ...id, phrase: p, score, inlineTitle });
  }
  return out.sort((a, b) => b.score - a.score);
}

const CELL = 0.03;

/**
 * Index a set: one entry per page.
 * @param {{runs: any[], box: number[], rotate?: number}[]} pages
 * @param {{file?: string}} [opts]
 */
export function indexSet(pages, opts = {}) {
  const pps = pages.map(pagePhrases);
  const cands = pps.map(candidates);
  // Vote for the number cell: each page adds its best score at each cell.
  const votes = new Map();
  cands.forEach((cs) => {
    const best = new Map();
    for (const c of cs) {
      if (c.score < 0.15) continue;
      const key = `${Math.round(c.phrase.u / CELL)},${Math.round(c.phrase.v / CELL)}`;
      if (!best.has(key) || best.get(key) < c.score) best.set(key, c.score);
    }
    for (const [k, s] of best) votes.set(k, (votes.get(k) || 0) + s);
  });
  // A cell's vote includes its eight neighbours (a number centred on a
  // longer or shorter ID moves its centre a little).
  let cell = null, cellVote = 0;
  for (const k of votes.keys()) {
    const [i, j] = k.split(',').map(Number);
    let s = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) s += votes.get(`${i + di},${j + dj}`) || 0;
    if (s > cellVote) { cell = [i * CELL, j * CELL]; cellVote = s; }
  }
  const sheets = [];
  const counts = new Map();
  pps.forEach((pp) => { const seen = new Set(); for (const p of pp.phrases) { const t = norm(p.text); if (!seen.has(t)) { seen.add(t); counts.set(t, (counts.get(t) || 0) + 1); } } });
  pps.forEach((pp, i) => {
    const cs = cands[i];
    let pick = null, how = 'none';
    if (cell && pages.length > 1) {
      const near = cs.filter((c) => Math.abs(c.phrase.u - cell[0]) <= 2 * CELL && Math.abs(c.phrase.v - cell[1]) <= 2 * CELL);
      if (near.length) { pick = near.sort((a, b) => b.score - a.score)[0]; how = 'title-block'; }
    }
    if (!pick && cs.length && cs[0].score >= 0.3) { pick = cs[0]; how = pages.length > 1 ? 'own-page' : 'title-block'; }
    const title = !pick ? '' : pick.inlineTitle != null ? pick.inlineTitle : findTitle(pp, pick.phrase, counts, pages.length);
    sheets.push({
      page: i + 1,
      file: pages[i].file || opts.file || '',
      filePage: pages[i].filePage || i + 1,
      number: pick ? pick.id : '',
      canonical: pick ? pick.canonical : '',
      title,
      discipline: pick ? pick.discipline || '' : '',
      sheetType: pick ? pick.sheetType || '' : '',
      found: how,
      textPhrases: pp.phrases.length,
      signature: pick ? signature(pp, pick.phrase, counts, pages.length) : [],
    });
  });
  const known = new Set(sheets.filter((s) => s.number).map((s) => s.canonical));
  const di = findDrawingIndex(pps, known);
  return { sheets, drawingIndex: di ? { page: di.page, rows: di.rows } : null, pageCount: pages.length };
}

// Title-block text repeated on (nearly) every sheet: firm, project, address.
function isBoiler(text, counts, pageCount) {
  return pageCount >= 3 && (counts.get(norm(text)) || 0) >= Math.max(3, Math.ceil(pageCount * 0.75));
}

function norm(t) { return String(t).toLowerCase().replace(/\s+/g, ' ').trim(); }

// --- Title --------------------------------------------------------------

const DATE_TAIL = /\s*[-–,]?\s*(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)?\s*$/i;
const DATE_RE = /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)?$/i;
const LABEL_RE = /^(?:sheet(?: (?:no|number|title|name))?|drawing(?: (?:no|number|title))?|dwg(?: no)?|title|date|scale|drawn(?: by)?|checked(?: by)?|approved(?: by)?|designed(?: by)?|project(?: (?:no|number|name|#))?|job(?: (?:no|number|#))?|no|rev(?:ision)?s?|issue[ds]?|description|by|seal|stamp|owner|client|architect|engineer|consultant|key ?plan|north|of|issued for|revisions?|comm(?:ission)?(?: no)?|file|plot(?:ted)?(?: date)?|author|checker|designer|copyright|for construction|not for construction)\.?\s*[:#]?$/i;
const SCALE_RE = /(?:\d\s*\/\s*\d+\s*["”]\s*=|=\s*1['’]|\bscale\b|\bn\.?t\.?s\.?\b|^1\s*:\s*\d+$|^as (?:noted|indicated)$)/i;

function isTitleText(t) {
  t = t.replace(DATE_TAIL, '');
  if (t.length < 3 || !/[a-z]{2}/i.test(t)) return false;
  if (DATE_RE.test(t) || LABEL_RE.test(t) || SCALE_RE.test(t)) return false;
  if (parseId(t)) return false;
  if (/^(?:www\.|https?:)|@|\(\d{3}\)|\d{3}[-.]\d{3}[-.]\d{4}/i.test(t)) return false;
  if (/^(?:page )?\d+\s*(?:of|\/)\s*\d+$/i.test(t)) return false;
  // A street address or a placeholder is the project's, not the sheet's.
  if (/\b[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b/.test(t) || /^\d+[A-Z]?\s+(?:[NSEW]\.?\s+)?[\w.' ]*\b(?:st|street|ave|avenue|rd|road|ln|lane|dr|drive|blvd|boulevard|way|ct|court|pl|place|hwy|highway|pkwy|parkway|cir|circle|ter|terrace)\b\.?(?:\s|,|$)/i.test(t) || /\benter (?:address|project)\b/i.test(t)) return false;
  // Revision and issue table rows: "05.03.2017 Issue for Permit", "Issue for Bid".
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s/.test(t) || /^(?:issued?|re-?issued?|revised) for\b/i.test(t)) return false;
  return true;
}

function findTitle(pp, num, counts, pageCount) {
  const R = 0.3 * Math.max(pp.width, pp.height);
  const boiler = (p) => isBoiler(p.text, counts, pageCount);
  const dist = (p) => Math.hypot(p.X + p.w / 2 - (num.X + num.w / 2), p.Y - num.Y);
  const pool = pp.phrases.filter((p) => p !== num && dist(p) <= R && isTitleText(p.text) && !boiler(p) && (p.u > 0.6 || p.v > 0.8));
  if (!pool.length) return '';
  const maxSize = Math.max(...pool.map((p) => p.size));
  const seed = pool.reduce((best, p) => {
    const s = p.size / maxSize - 0.6 * dist(p) / R;
    return !best || s > best.s ? { p, s } : best;
  }, null).p;
  // Grow the title through stacked lines of the same size that overlap it.
  const group = [seed];
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pool) {
      if (group.includes(p) || Math.abs(p.size - seed.size) > 0.15 * seed.size) continue;
      const touch = group.some((g) => {
        const dy = Math.abs(p.Y - g.Y);
        if (dy > 1.8 * seed.size || dy <= 0.3 * seed.size) return false;
        const tol = seed.size;
        const aligned = Math.abs(p.X - g.X) < tol || Math.abs(p.X + p.w / 2 - (g.X + g.w / 2)) < tol || Math.abs(p.X + p.w - (g.X + g.w)) < tol;
        return aligned && !ruledApart(pp, p, g);
      });
      if (touch) { group.push(p); grew = true; }
    }
  }
  group.sort((a, b) => a.Y - b.Y || a.X - b.X);
  return group.map((p) => p.text.replace(DATE_TAIL, '')).join(' ').replace(/\s+[-–]\s*$/, '').trim();
}

// The sheet's own text, without the title block's boilerplate: what the
// comparison of two issues looks at.
function signature(pp, num, counts, pageCount) {
  const out = [];
  for (const p of pp.phrases) {
    if (p === num) continue;
    if (!parseId(p.text) && isBoiler(p.text, counts, pageCount)) continue;
    // Plot stamps and issue dates change on every print; they are not a
    // change to the drawing.
    const t = norm(p.text.replace(DATE_TAIL, ''));
    if (!t || DATE_RE.test(t) || /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?$/i.test(t)) continue;
    out.push(t);
  }
  return out.sort();
}

// --- The set's own drawing index (cover sheet list) ----------------------

/**
 * A drawing index is a column of four or more sheet IDs at one X, each with
 * a title to its right on the same line.
 */
export function findDrawingIndex(pps, known = null) {
  let best = null;
  pps.forEach((pp, i) => {
    const ids = pp.phrases.map((p) => ({ p, id: parseId(p.text) })).filter((x) => x.id);
    const cols = [];
    for (const x of ids) {
      const c = cols.find((c) => Math.abs(c.X - x.p.X) <= 0.6 * x.p.size && Math.abs(c.size - x.p.size) <= 0.2 * x.p.size);
      if (c) c.rows.push(x); else cols.push({ X: x.p.X, size: x.p.size, rows: [x] });
    }
    for (const c of cols) {
      const rows = [];
      for (const { p, id } of c.rows.sort((a, b) => a.p.Y - b.p.Y)) {
        const right = pp.phrases.filter((q) => q !== p && Math.abs(q.Y - p.Y) <= 0.4 * p.size && q.X > p.X + p.w && q.X - (p.X + p.w) < 30 * p.size && /[a-z]{2}/i.test(q.text) && !parseId(q.text)).sort((a, b) => a.X - b.X);
        if (!right.length) continue;
        rows.push({ number: id.id, canonical: id.canonical, title: right[0].text });
      }
      const distinct = new Set(rows.map((r) => r.canonical)).size;
      if (distinct < 4 || distinct !== rows.length) continue;
      // A schedule column of marks (A1, A2 ... beam types) is not an index:
      // at least half the rows must be sheets this set carries.
      const hits = known ? rows.filter((r) => known.has(r.canonical)).length : rows.length;
      if (hits < Math.max(3, rows.length / 2)) continue;
      if (!best || hits > best.hits) best = { page: i + 1, rows, hits };
    }
  });
  return best;
}

// --- Checks on one set ---------------------------------------------------

function wordsOf(t) { return norm(t).replace(/[^a-z0-9&]+/g, ' ').trim(); }

// An index column is often too narrow for the whole title, so one title
// that starts with the other counts as the same.
function sameTitle(a, b) {
  const x = wordsOf(a), y = wordsOf(b);
  return x === y || (x.length >= 6 && y.startsWith(x)) || (y.length >= 6 && x.startsWith(y));
}

/** Findings a document controller would act on before issuing the set. */
export function checkSet(index) {
  const findings = [];
  const byNum = new Map();
  for (const s of index.sheets) {
    if (!s.number) { findings.push({ kind: 'no-number', page: s.page, message: s.textPhrases ? `Page ${s.page}: no sheet number found in a title block.` : `Page ${s.page}: no text layer (a scan or a picture), so no sheet number could be read.` }); continue; }
    if (!byNum.has(s.canonical)) byNum.set(s.canonical, []);
    byNum.get(s.canonical).push(s);
  }
  for (const [, list] of byNum) if (list.length > 1) findings.push({ kind: 'duplicate', page: list[1].page, message: `${list[0].number} appears on pages ${list.map((s) => s.page).join(', ')}.` });
  const numbered = index.sheets.filter((s) => s.number);
  // Order: within a discipline, numbers should rise; a discipline should be
  // one run of pages. (Which discipline comes first varies by office, so the
  // NCS discipline order is used for sorting the index, not as a finding.)
  const lastOf = new Map();
  let prevDisc = null;
  const closed = new Set();
  for (const s of numbered) {
    const d = parseId(s.number)?.disciplineCode || '';
    const last = lastOf.get(d);
    if (last && compareIds(last.number, s.number) > 0) findings.push({ kind: 'order', page: s.page, message: `${s.number} (page ${s.page}) comes after ${last.number} (page ${last.page}); within a discipline the numbers usually rise.` });
    if (d !== prevDisc) {
      if (closed.has(d)) findings.push({ kind: 'split', page: s.page, message: `${s.number} (page ${s.page}): the ${parseId(s.number)?.discipline || d} sheets are split into more than one run of pages.` });
      if (prevDisc !== null) closed.add(prevDisc);
      prevDisc = d;
    }
    lastOf.set(d, s);
  }
  const di = index.drawingIndex;
  if (di) {
    const listed = new Map(di.rows.map((r) => [r.canonical, r]));
    for (const r of di.rows) {
      const s = byNum.get(r.canonical);
      if (!s) findings.push({ kind: 'index-missing', page: di.page, message: `The drawing index on page ${di.page} lists ${r.number} (${r.title}), but no sheet in the set carries that number.` });
      else if (s[0].title && !sameTitle(s[0].title, r.title)) findings.push({ kind: 'index-title', page: s[0].page, message: `${r.number}: the index says "${r.title}", the sheet says "${s[0].title}".` });
    }
    for (const s of numbered) if (!listed.has(s.canonical) && s.page !== di.page) findings.push({ kind: 'index-unlisted', page: s.page, message: `${s.number} (page ${s.page}) is not in the drawing index on page ${di.page}.` });
  }
  return findings;
}

/** NCS binding order: discipline order, then the number. */
export function compareIds(a, b) {
  const pa = parseId(a), pb = parseId(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const da = DISC_ORDER.get(pa.disciplineCode[0]) ?? 99, db = DISC_ORDER.get(pb.disciplineCode[0]) ?? 99;
  if (da !== db) return da - db;
  if (pa.disciplineCode !== pb.disciplineCode) return pa.disciplineCode.localeCompare(pb.disciplineCode);
  return pa.canonical.localeCompare(pb.canonical, 'en', { numeric: true });
}

// --- Two issues compared --------------------------------------------------

/**
 * Compare an earlier and a later issue by sheet number. A sheet's text is
 * compared as a multiset of phrases, so a moved note is not a change; the
 * linework is not compared.
 */
export function compareSets(older, newer) {
  const map = (ix) => { const m = new Map(); for (const s of ix.sheets) if (s.number && !m.has(s.canonical)) m.set(s.canonical, s); return m; };
  const a = map(older), b = map(newer);
  const rows = [];
  for (const [k, s] of b) {
    const o = a.get(k);
    if (!o) { rows.push({ number: s.number, status: 'added', oldTitle: '', newTitle: s.title, oldPage: '', newPage: s.page, added: [], removed: [] }); continue; }
    const { added, removed } = multisetDiff(o.signature, s.signature);
    const titleChanged = wordsOf(o.title) !== wordsOf(s.title);
    const status = titleChanged ? 'retitled' : added.length || removed.length ? 'text changed' : 'same text';
    rows.push({ number: s.number, status, oldTitle: o.title, newTitle: s.title, oldPage: o.page, newPage: s.page, added, removed });
  }
  for (const [k, o] of a) if (!b.has(k)) rows.push({ number: o.number, status: 'removed', oldTitle: o.title, newTitle: '', oldPage: o.page, newPage: '', added: [], removed: [] });
  rows.sort((x, y) => compareIds(x.number, y.number));
  return rows;
}

function multisetDiff(a, b) {
  const count = new Map();
  for (const t of a) count.set(t, (count.get(t) || 0) + 1);
  const added = [];
  for (const t of b) { const n = count.get(t) || 0; if (n > 0) count.set(t, n - 1); else added.push(t); }
  const removed = [];
  for (const [t, n] of count) for (let i = 0; i < n; i++) removed.push(t);
  return { added, removed };
}

// --- Output -------------------------------------------------------------

function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; }

export function indexCsv(index) {
  const head = ['Page', 'File', 'Sheet number', 'Sheet title', 'Discipline', 'Sheet type', 'Found by'];
  const rows = index.sheets.map((s) => [s.page, s.file, s.number, s.title, s.discipline, s.sheetType, s.found]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function compareCsv(rows) {
  const head = ['Sheet number', 'Status', 'Old title', 'New title', 'Old page', 'New page', 'Text added', 'Text removed'];
  const out = rows.map((r) => [r.number, r.status, r.oldTitle, r.newTitle, r.oldPage, r.newPage, r.added.join(' | '), r.removed.join(' | ')]);
  return [head, ...out].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function report(index, findings) {
  const lines = [];
  const found = index.sheets.filter((s) => s.number).length;
  lines.push(`${index.pageCount} pages, ${found} sheet numbers read.`);
  for (const s of index.sheets) lines.push(`  p${String(s.page).padStart(3)}  ${(s.number || '?').padEnd(10)} ${s.title}`);
  if (index.drawingIndex) lines.push(`Drawing index on page ${index.drawingIndex.page}: ${index.drawingIndex.rows.length} sheets listed.`);
  if (findings.length) { lines.push(`${findings.length} findings:`); for (const f of findings) lines.push(`  - ${f.message}`); }
  return lines.join('\n');
}
