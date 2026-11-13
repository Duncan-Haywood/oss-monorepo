// Song sections for a chant arrangement: where the intro, the verses, the drops and the
// outro fall, in whole bars, so the genre templates can change energy between them.
//
// Chant gives the structure for free. A double bar (::) ends a verse of a strophic hymn,
// a whole antiphon, or one pass of --repeat, so each double bar closes a section. Intro
// and outro bars (no chant over them) are their own sections. Sections shorter than
// `minBars` are merged into the one before, so a Te Deum with 28 double bars does not
// flicker. The first chant section is a "verse" (lower energy) when there is more than
// one; the last is always a "drop" (full energy); the ones between alternate,
// counted back from the last. A section
// that leads into a drop ends on a one-bar "build" (genre.mjs writes it).
//
// Long pieces (four or more chant sections, e.g. a six-verse hymn) turn the verse before
// the last drop into a "breakdown": drums and bass out, the choir alone, then a soft chord
// swelling into the build, so the last drop has something to land on after three or more
// verse/drop turns. `breakdown: false` keeps it a verse; `true` forces it from three.
//
// Pure function, no dependencies. Bars are counted from 0 at the start of the file.

export const ENERGIES = ['intro', 'verse', 'breakdown', 'drop', 'outro'];

// sectionPlan({ events, pulsesPerBar, intro, outro, minBars }) -> [{ name, energy, start, bars, build }]
// `events` are the chant events as cli.mjs passes them (after --fit, --halftime, --repeat,
// but WITHOUT the intro and outro rest bars; give those as counts).
export function sectionPlan({ events, pulsesPerBar = 8, intro = 0, outro = 0, minBars = 4, breakdown = 'auto' }) {
  if (![true, false, 'auto'].includes(breakdown)) throw new Error(`breakdown must be true, false or 'auto', got ${breakdown}`);
  if (!(pulsesPerBar > 0)) throw new Error('pulsesPerBar must be positive');
  for (const [k, v] of [['intro', intro], ['outro', outro]]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a whole number of bars, got ${v}`);
  }
  if (!Number.isInteger(minBars) || minBars < 1) throw new Error('minBars must be a positive whole number');

  // Bar index where each chant section starts: 0, then the bar of the first note after each double bar.
  let t = 0;
  const cuts = [0];
  let afterDouble = false;
  for (const e of events) {
    if (e.type === 'note' && afterDouble) {
      cuts.push(Math.floor(t / pulsesPerBar + 1e-9));
      afterDouble = false;
    }
    if (e.type === 'bar' && e.kind === 'double') afterDouble = true;
    t += e.pulses || 0;
  }
  const chantBars = Math.max(1, Math.ceil(t / pulsesPerBar - 1e-9));
  const starts = [...new Set(cuts)].filter((b) => b < chantBars).sort((a, b) => a - b);

  // Merge sections shorter than minBars into the previous one (the first absorbs forward).
  let spans = starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : chantBars }));
  const merged = [];
  for (const sp of spans) {
    const prev = merged[merged.length - 1];
    if (prev && (sp.end - sp.start < minBars || prev.end - prev.start < minBars)) prev.end = sp.end;
    else merged.push({ ...sp });
  }
  // a short tail left after the loop joins the section before it
  if (merged.length > 1 && merged[merged.length - 1].end - merged[merged.length - 1].start < minBars) {
    const tail = merged.pop();
    merged[merged.length - 1].end = tail.end;
  }
  spans = merged;

  const out = [];
  if (intro > 0) out.push({ name: 'Intro', energy: 'intro', start: 0, bars: intro, build: false });
  const n = spans.length;
  spans.forEach((sp, i) => {
    // the last chant section is a drop and (with two or more) the first a verse; counting
    // back from the last, the ones between alternate drop / verse, so an odd count opens
    // on two verses rather than dropping straight out of the intro
    const energy = i === n - 1 ? 'drop' : i === 0 ? 'verse' : (n - 1 - i) % 2 === 0 ? 'drop' : 'verse';
    out.push({ name: '', energy, start: intro + sp.start, bars: sp.end - sp.start, build: false });
  });
  const minSections = breakdown === true ? 3 : 4;
  if (breakdown !== false && n >= minSections) {
    // the chant section before the last drop is a verse (alternation counted back from the last)
    const k = out.findLastIndex((s) => s.energy === 'drop') - 1;
    if (k >= 0 && out[k].energy === 'verse' && out[k].bars >= 3) { out[k].energy = 'breakdown'; out[k].name = 'Breakdown'; }
  }
  if (outro > 0) out.push({ name: 'Outro', energy: 'outro', start: intro + chantBars, bars: outro, build: false });

  // number the verses and drops, and mark the builds into each drop
  const count = { verse: 0, drop: 0 };
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (s.energy === 'verse' || s.energy === 'drop') s.name = `${s.energy === 'verse' ? 'Verse' : 'Drop'} ${++count[s.energy]}`;
    const next = out[i + 1];
    s.build = Boolean(next && next.energy === 'drop' && s.energy !== 'drop' && s.bars >= 2);
  }
  return out;
}

// The section a bar falls in (or null past the end).
export function sectionAt(plan, bar) {
  for (const s of plan) if (bar >= s.start && bar < s.start + s.bars) return s;
  return null;
}
