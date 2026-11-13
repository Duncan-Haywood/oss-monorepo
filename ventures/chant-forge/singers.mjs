// Section ranges from a choir's own range test: one CSV row per singer with their lowest
// and highest comfortable note, and optionally the section they sing in.
//
// The presets in voicefit.mjs (--choir textbook|amateur|octave) are rules of thumb. A
// director who has run a range test knows better: a section can sing a note only when every
// singer in it reaches the note, so a section's range is the overlap of its singers' ranges,
// and the unison band is the overlap of everyone's. That makes one singer with a short range
// the limit of a whole section, so the report names who sets each end and what the section
// would reach without them (a director's real choice: excuse that singer from a few notes,
// move them, or pick a lower final).
//
// When the file gives no sections, the singers are divided for you: sorted by the middle of
// their range and cut into contiguous groups (basses lowest), choosing the cut that makes
// the narrowest section as wide as possible, then the widest total, then the most even
// group sizes. Every cut is tried, so the choice is exact for that rule.
//
// Pure functions, no file access: the CLI and the studio page both use them.
import { noteName } from './gabc.mjs';
import { suggestFinal, splitVoices, VOICINGS } from './voicefit.mjs';

const PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// "D3", "Eb4", "F#2", "bb2", "C♯3" or a MIDI number ("50"). C4 is 60, as in noteName.
export function parseNote(s) {
  const t = String(s ?? '').trim();
  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    return n <= 127 ? n : null;
  }
  const m = /^([A-Ga-g])([#♯]|b|♭)?(-?\d)$/.exec(t);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
  const n = PITCH[m[1].toLowerCase()] + acc + (Number(m[3]) + 1) * 12;
  return n >= 0 && n <= 127 ? n : null;
}

// Section names a range test sheet might use, lower-cased with spaces and dots removed.
const ALIASES = {
  tenor: 'tenor', tenors: 'tenor', t: 'tenor', t1: 'tenor', tenor1: 'tenor', firsttenor: 'tenor', firsttenors: 'tenor', '1sttenor': 'tenor', ten: 'tenor',
  tenor2: 'tenor2', t2: 'tenor2', secondtenor: 'tenor2', secondtenors: 'tenor2', '2ndtenor': 'tenor2',
  baritone: 'baritone', baritones: 'baritone', bar: 'baritone', bari: 'baritone', br: 'baritone', b1: 'baritone',
  bass: 'bass', basses: 'bass', b: 'bass', b2: 'bass', bs: 'bass',
};
export function parseSection(s) {
  const k = String(s ?? '').toLowerCase().replace(/[\s.\-_]/g, '');
  return Object.hasOwn(ALIASES, k) ? ALIASES[k] : null;
}

// Low to high: the order contiguous groups are cut in, and the order reports list sections.
export const SECTION_ORDER = ['bass', 'baritone', 'tenor2', 'tenor'];
export const SECTION_LABEL = { tenor: 'tenors', tenor2: 'second tenors', baritone: 'baritones', bass: 'basses' };

const COLUMNS = {
  name: ['name', 'singer', 'who'],
  section: ['section', 'part', 'voice', 'voicepart'],
  low: ['low', 'lowest', 'bottom', 'lownote', 'min'],
  high: ['high', 'highest', 'top', 'highnote', 'max'],
};

function splitRow(line, sep) {
  // quoted fields ("Smith, J") as a spreadsheet writes them
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// CSV (comma, semicolon or tab) with a header row naming at least `low` and `high`; `name`
// and `section` are optional. Blank lines and lines starting with # are skipped. Returns
// { singers: [{ row, name, section, low, high }], sectioned } or throws with the row number.
export function parseSingers(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ l, row: i + 1 })).filter((x) => x.l.trim() && !x.l.trim().startsWith('#'));
  if (!lines.length) throw new Error('singers file: no rows');
  const head = lines[0].l;
  const sep = head.includes('\t') ? '\t' : head.includes(';') && !head.includes(',') ? ';' : ',';
  const cols = splitRow(head, sep).map((h) => h.toLowerCase().replace(/[\s_\-]/g, ''));
  const at = {};
  for (const [k, names] of Object.entries(COLUMNS)) at[k] = cols.findIndex((c) => names.includes(c));
  if (at.low < 0 || at.high < 0) throw new Error('singers file: the header row needs a "low" and a "high" column (also optional "name" and "section")');
  const singers = [];
  for (const { l, row } of lines.slice(1)) {
    const f = splitRow(l, sep);
    const name = at.name >= 0 && f[at.name] ? f[at.name] : `row ${row}`;
    const low = parseNote(f[at.low]);
    const high = parseNote(f[at.high]);
    if (low === null) throw new Error(`singers file row ${row}: low "${f[at.low] ?? ''}" is not a note (D3, Eb4, F#2) or a MIDI number`);
    if (high === null) throw new Error(`singers file row ${row}: high "${f[at.high] ?? ''}" is not a note (D3, Eb4, F#2) or a MIDI number`);
    if (high <= low) throw new Error(`singers file row ${row}: high ${noteName(high)} is not above low ${noteName(low)}`);
    let section = null;
    if (at.section >= 0 && f[at.section]) {
      section = parseSection(f[at.section]);
      if (!section) throw new Error(`singers file row ${row}: section "${f[at.section]}" is not tenor, second tenor, baritone or bass`);
    }
    singers.push({ row, name, section, low, high });
  }
  if (!singers.length) throw new Error('singers file: a header but no singers');
  const withSection = singers.filter((s) => s.section).length;
  if (withSection && withSection < singers.length) {
    const miss = singers.find((s) => !s.section);
    throw new Error(`singers file row ${miss.row}: no section; give every singer a section, or none and let the singers be divided`);
  }
  return { singers, sectioned: withSection > 0 };
}

// The notes every singer in a group reaches, and who sets each end.
export function overlap(group) {
  const low = Math.max(...group.map((s) => s.low));
  const high = Math.min(...group.map((s) => s.high));
  return { low, high, width: high - low };
}

// One section's report: its range, who sets the low and the high end, and how far that end
// moves if the one singer setting it is excused (no move when two singers share the limit).
export function describeSection(group) {
  const r = overlap(group);
  const out = { low: r.low, high: r.high, range: `${noteName(r.low)}-${noteName(r.high)}`, singers: group.map((s) => s.name) };
  if (r.high <= r.low) return { ...out, empty: true };
  const lowBy = group.filter((s) => s.low === r.low);
  const highBy = group.filter((s) => s.high === r.high);
  out.lowSetBy = lowBy.map((s) => s.name);
  out.highSetBy = highBy.map((s) => s.name);
  if (group.length > 1 && lowBy.length === 1) {
    const rest = Math.max(...group.filter((s) => s !== lowBy[0]).map((s) => s.low));
    if (rest < r.low) out.lowWithout = { name: lowBy[0].name, low: rest, note: noteName(rest) };
  }
  if (group.length > 1 && highBy.length === 1) {
    const rest = Math.min(...group.filter((s) => s !== highBy[0]).map((s) => s.high));
    if (rest > r.high) out.highWithout = { name: highBy[0].name, high: rest, note: noteName(rest) };
  }
  return out;
}

// Divide unsectioned singers into the given sections (any order; cut low to high). Returns
// { groups: { section: [singers] } } or null when there are fewer singers than sections or
// no cut gives every section a shared note.
export function assignSections(singers, sections) {
  const order = SECTION_ORDER.filter((s) => sections.includes(s));
  const k = order.length;
  const n = singers.length;
  if (n < k) return null;
  const sorted = [...singers].sort((a, b) => a.low + a.high - (b.low + b.high) || a.high - b.high || a.row - b.row);
  // overlap width of sorted[i..j], built incrementally: O(n^2) table
  const W = Array.from({ length: n }, () => new Array(n).fill(-Infinity));
  for (let i = 0; i < n; i++) {
    let lo = -Infinity;
    let hi = Infinity;
    for (let j = i; j < n; j++) {
      lo = Math.max(lo, sorted[j].low);
      hi = Math.min(hi, sorted[j].high);
      W[i][j] = hi - lo;
    }
  }
  let best = null;
  const better = (a, b) => (a.min !== b.min ? a.min > b.min : a.sum !== b.sum ? a.sum > b.sum : a.spread < b.spread);
  // cuts c[0] < c[1] < ... : group g is sorted[c[g-1] .. c[g]-1]
  const cuts = [];
  const walk = (g, start) => {
    if (g === k - 1) {
      const bounds = [0, ...cuts, n];
      let min = Infinity;
      let sum = 0;
      let big = 0;
      let small = Infinity;
      for (let q = 0; q < k; q++) {
        const w = W[bounds[q]][bounds[q + 1] - 1];
        if (w <= 0) return;
        min = Math.min(min, w);
        sum += w;
        const size = bounds[q + 1] - bounds[q];
        big = Math.max(big, size);
        small = Math.min(small, size);
      }
      const cand = { min, sum, spread: big - small, bounds };
      if (!best || better(cand, best)) best = cand;
      return;
    }
    for (let c = start; c <= n - (k - 1 - g); c++) {
      // prune: a first group with no shared note only gets worse as it grows
      const prev = g ? cuts[g - 1] : 0;
      if (W[prev][c - 1] <= 0) break;
      cuts.push(c);
      walk(g + 1, c + 1);
      cuts.pop();
    }
  };
  walk(0, 1);
  if (!best) return null;
  const groups = {};
  order.forEach((s, q) => { groups[s] = sorted.slice(best.bounds[q], best.bounds[q + 1]); });
  return { groups };
}

// The ranges --split-voices and fewestSections take, from groups of singers.
export function choirOf(groups) {
  const choir = {};
  for (const [s, g] of Object.entries(groups)) {
    const r = overlap(g);
    choir[s] = { low: r.low, high: r.high };
  }
  return choir;
}

// Sections and the unison band for a range test. `sections` lists the sections wanted (for
// an unsectioned file) and is ignored for a sectioned one, whose sections are those it names.
// Returns { choir, groups, unison, report, assigned } or throws with a reason a director can act on.
export function singersChoir({ singers, sectioned }, sections = ['tenor', 'bass']) {
  let groups;
  if (sectioned) {
    groups = {};
    for (const s of SECTION_ORDER) {
      const g = singers.filter((x) => x.section === s);
      if (g.length) groups[s] = g;
    }
  } else {
    const a = assignSections(singers, sections);
    if (!a) {
      const what = SECTION_ORDER.filter((s) => sections.includes(s)).map((s) => SECTION_LABEL[s]).join(', ');
      throw new Error(singers.length < sections.length
        ? `${singers.length} singers cannot make ${sections.length} sections (${what})`
        : `no way to divide these ${singers.length} singers into ${what} gives every section a note all its singers reach`);
    }
    groups = a.groups;
  }
  const report = {};
  for (const [s, g] of Object.entries(groups)) {
    report[s] = describeSection(g);
    if (report[s].empty) {
      const lo = g.find((x) => x.low === report[s].low);
      const hi = g.find((x) => x.high === report[s].high);
      throw new Error(`the ${SECTION_LABEL[s]} share no note: ${lo.name}'s low ${noteName(lo.low)} is above ${hi.name}'s high ${noteName(hi.high)}`);
    }
  }
  const all = describeSection(singers);
  const unison = all.empty ? null : { low: all.low, high: all.high };
  return { choir: choirOf(groups), groups, unison, unisonReport: all, report, assigned: !sectioned };
}

// The sections present in a sectioned file, in the voicing flags' terms.
export function sectionsOf(sc) {
  return SECTION_ORDER.filter((s) => sc.choir[s]);
}

// A plain-text report a director can read: one line per section, who limits it, and the
// unison band.
export function singersReport(sc) {
  const lines = [];
  const n = Object.values(sc.groups).reduce((a, g) => a + g.length, 0);
  lines.push(`${n} singers${sc.assigned ? ', divided by range (no sections in the file)' : ''}`);
  for (const s of [...SECTION_ORDER].reverse()) {
    const r = sc.report[s];
    if (!r) continue;
    lines.push(`${SECTION_LABEL[s]} ${r.range} (${r.singers.length}: ${r.singers.join(', ')})${limits(r)}`);
  }
  const u = sc.unisonReport;
  lines.push(u.empty ? `unison: no note every singer reaches (${u.range} is empty)` : `unison ${u.range}${limits(u)}`);
  return lines.join('\n');
}

function limits(r) {
  const parts = [];
  if (r.lowWithout) parts.push(`low set by ${r.lowWithout.name} (${r.lowWithout.note} without)`);
  if (r.highWithout) parts.push(`high set by ${r.highWithout.name} (${r.highWithout.note} without)`);
  return parts.length ? `; ${parts.join('; ')}` : '';
}

// The sections each voicing in voicefit's VOICINGS uses.
const VOICING_SECTIONS = new Map([[2, ['tenor', 'bass']], [3, ['tenor', 'baritone', 'bass']], [4, ['tenor', 'tenor2', 'baritone', 'bass']]]);

// fewestSections for a range test: unison on the band every singer reaches, then each
// voicing in turn. An unsectioned file is divided afresh for each voicing (the best two
// sections are not the best three with one more); a sectioned file is tried only as the
// voicing its sections make. Returns VOICINGS' { sections, name, flags } plus `choir`, the
// ranges that fit (sections 0 when none does).
export function fewestSectionsForSingers(events, parsed) {
  const all = overlap(parsed.singers);
  if (all.width > 0 && suggestFinal(events, { low: all.low, high: all.high }).fits) return VOICINGS[0];
  const have = parsed.sectioned ? SECTION_ORDER.filter((s) => parsed.singers.some((x) => x.section === s)) : null;
  for (const v of VOICINGS.slice(1)) {
    const want = VOICING_SECTIONS.get(v.sections);
    if (!want) continue;
    if (have && (have.length !== want.length || !want.every((s) => have.includes(s)))) continue;
    let sc;
    try { sc = singersChoir(parsed, want); } catch { continue; }
    const c = sc.choir;
    if (splitVoices(events, { tenor: c.tenor, bass: c.bass, baritone: c.baritone || null, tenor2: c.tenor2 || null }).fits) return { ...v, choir: c };
  }
  return { sections: 0, name: 'none', flags: '' };
}
