// @ts-check
// The worked example on shed-plans-with-cut-list.html quotes the tool's own
// output. Every number on it tagged data-fact="key" comes from here, and
//   node workedfacts.mjs --write
// rewrites those numbers (and the "N pieces from M boards" in the page's
// description and in llms.txt) from the engine. The site build runs the same
// refresh through make-size-pages.mjs, so the published page cannot drift
// even when the committed copy is a step behind; marketing.test.mjs still
// fails on a stale committed copy so it gets refreshed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { fmtIn } from './lumber.mjs';
import { PRODUCTS } from './products.mjs';
import { boardPrice } from './prices.mjs';

export const WORKED_PAGE = 'shed-plans-with-cut-list.html';

const money = (n) => {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

export function workedFacts() {
  const classic = buildShed(PRESETS['8x12 classic']());
  const est = estimate(classic);
  const len = (shed, kind) => fmtIn(shed.members.find((m) => m.kind === kind).length);
  const low = buildShed(defaultDesign());
  const d = low.design;
  const at3 = buildShed(normalize({ ...d, pitch: 3, maxPeak: 0, autoWall: false, autoPitch: false, autoOverhang: false }));
  const checks = structuralChecks(low);
  const size = (o) => `${fmtIn(o.width)} x ${fmtIn(o.height)}`;
  return {
    pieces: String(est.pieces),
    boards: String(est.boards),
    cutSheetCost: money(est.cutSheetCost),
    lumberCost: money(est.lumberCost),
    lowerBound: money(est.lowerBound),
    total: money(est.total),
    ...Object.fromEntries(est.lumber.flatMap((l) => [
      [`qty:${l.material}`, String(l.result.boards.length)],
      [`len:${l.material}`, [...new Set(l.result.boards.map((b) => b.stock / 12))].sort((x, y) => x - y).map((ft) => `${ft}'`).join(', ')],
    ])),
    joist: len(classic, 'floor joist'),
    rafter: len(classic, 'rafter'),
    jack: fmtIn(Math.max(...classic.members.filter((m) => m.kind === 'jack stud').map((m) => m.length))),
    p2x4x8: money(boardPrice('2x4', 8).price),
    p2x4x16: money(boardPrice('2x4', 16).price),
    minWindow: money(Math.min(...PRODUCTS.filter((p) => p.kind === 'window').map((p) => p.price))),
    minDoor: money(Math.min(...PRODUCTS.filter((p) => p.kind === 'door').map((p) => p.price))),
    wall: fmtIn(d.wallHeight),
    pitch: `${d.pitch}/12`,
    overhang: fmtIn(d.overhang),
    peak: fmtIn(low.dims.peak, { feet: true }),
    lowPeak: fmtIn(at3.dims.peak, { feet: true }),
    defaultRafter: len(low, 'rafter'),
    overhangBudget: money(low.overhangChoice.budget),
    overhangNext: fmtIn(low.overhangChoice.next.overhang),
    overhangNextAdds: money(low.overhangChoice.next.adds),
    beam: `${Math.round(checks.rows.find((r) => /Ridge beam$/.test(r.member)).ratio * 100)}%`,
    snow: String(checks.loads.snow),
    classicStud: fmtIn(classic.dims.studLen),
    classicDoor: size(classic.design.openings.find((o) => o.kind === 'door')),
    classicWindow: size(classic.design.openings.find((o) => o.kind === 'window')),
    plumb: fmtIn(classic.dims.plumbH),
    lowDoor: fmtIn(d.openings.find((o) => o.kind === 'door').height),
    waste8: fmtIn(96 - classic.dims.studLen),
    waste16: fmtIn(192 - 2 * (classic.dims.studLen + classic.design.kerf)),
    _studCheaperAlone: 2 * boardPrice('2x4', 8).price < boardPrice('2x4', 16).price,
    skid: `${Math.round(checks.rows.find((r) => r.member === 'Skids on blocks').ratio * 100)}%`,
    soil: `${Math.round(checks.rows.find((r) => r.member === 'Blocks on the soil').ratio * 100)}%`,
    anchors: `${Math.round(checks.rows.find((r) => r.member === 'Ground anchors (overturning and sliding)').ratio * 100)}%`,
    _othersUnder30: checks.rows.filter((r) => !/Ridge beam$|^Skids on blocks$|^Blocks on the soil$|^Ground anchors/.test(r.member) && r.governs !== 'span rating').every((r) => r.ratio < 0.3),
    _unpriced: est.unpriced.length,
  };
}

/**
 * The page with every data-fact span set to the current fact. Keys the facts
 * do not know are left as they are (the test reports them).
 * @param {string} html
 * @param {Record<string, any>} f
 */
export function refreshHtml(html, f = workedFacts()) {
  return html
    .replace(/(data-fact="([^"]+)">)([^<]*)</g, (all, open, key) => (key in f && !key.startsWith('_') ? `${open}${f[key]}<` : all))
    .replace(/\b\d+ pieces from \d+ boards\b/g, `${f.pieces} pieces from ${f.boards} boards`);
}

/** llms.txt with the worked example's piece and board counts. @param {string} text @param {Record<string, any>} f */
export const refreshLlms = (text, f = workedFacts()) => text.replace(/\b\d+ pieces from \d+ boards\b/g, `${f.pieces} pieces from ${f.boards} boards`);

/**
 * Rewrite the worked page and llms.txt beside this file. Returns the files changed.
 * @param {string} [dir]
 */
export function writeFacts(dir = fileURLToPath(new URL('.', import.meta.url))) {
  const f = workedFacts();
  const changed = [];
  for (const [file, fn] of /** @type {[string, (s: string, f: any) => string][]} */ ([[WORKED_PAGE, refreshHtml], ['llms.txt', refreshLlms]])) {
    const path = `${dir.replace(/\/?$/, '/')}${file}`;
    const before = readFileSync(path, 'utf8');
    const after = fn(before, f);
    if (after !== before) { writeFileSync(path, after); changed.push(file); }
  }
  return changed;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write')) {
    const changed = writeFacts();
    console.log(changed.length ? `refreshed ${changed.join(', ')}` : 'worked-example facts already current');
  } else {
    console.log(JSON.stringify(workedFacts(), null, 1));
  }
}
