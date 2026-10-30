// @ts-check
// The path to a budget: how far the cheaper-build search (simplify.mjs
// budget()) gets toward a dollar figure you type, what else would close the
// gap if you accept it, and the largest shed of the same design that fits.
//
// Three parts, each priced and checked like the rest of the tool:
// - the cheaper build's own steps, with the running materials total after
//   each, and the first step that reaches the budget;
// - opt-in changes the search never makes on its own because they are a
//   choice about the shed, not a better way to build the same one (no gable
//   vents, no spare boards), each with what it gives up;
// - the same design one foot shorter or narrower at a time, the cheapest cut
//   per square foot first, until it fits the budget (or reaches 6 ft a side).
//
// Totals are materials before tax, as in the cheaper build. Nothing here
// changes the design you are editing: each is offered with its saving.

import { buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { refitOpenings } from './paretoaudit.mjs';

/**
 * Changes that save money by giving something up, with what is given up.
 * Each applies to a design that has the thing in the first place.
 * @type {{ key: string, label: string, applies: (d: any) => boolean, change: (d: any) => object, gives: string }[]}
 */
export const OPT_IN = [
  {
    key: 'vents', label: 'No gable vents', applies: (d) => d.gableVents && d.style !== 'leanTo',
    change: () => ({ gableVents: false }),
    gives: 'A shed is not a heated attic, and no code asks it for roof vents, but vents let summer heat and damp out. The soffit vents stay; a gable vent can be cut in later.',
  },
  {
    key: 'spares', label: 'No spare boards', applies: (d) => d.spares > 0,
    change: () => ({ spares: 0 }),
    gives: 'Buys exactly what the cut list uses. A miscut or a split board means another trip to the store.',
  },
];

/** Smallest side the resize goes to, inches. */
const MIN_SIDE = 72;

/**
 * Frame, price and check one design.
 * @param {any} d @param {import('./estimate.mjs').Prices} [prices]
 */
function priced(d, prices) {
  const shed = buildShed(normalize(d), prices);
  const total = estimate(shed, prices).total;
  const ok = structuralChecks(shed).ok && connectionChecks(shed).ok;
  return { design: shed.design, total, ok, warnings: shed.warnings.length };
}

/**
 * @param {any} design the design you are editing
 * @param {number} target your budget, materials before tax ($)
 * @param {{ base: { total: number }, best: { design: any, total: number, steps: { label: string, materials?: number, saving: number }[] } }} cheaper budget()'s result for the design
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function budgetPath(design, target, cheaper, prices) {
  const start = cheaper.base.total;
  // 1. The cheaper build's steps, with the running materials total.
  let run = start;
  const steps = cheaper.best.steps.map((s) => {
    run -= s.materials ?? s.saving;
    return { label: s.label, saves: s.materials ?? s.saving, total: Math.round(run * 100) / 100 };
  });
  const reachedAt = start <= target ? -1 : steps.findIndex((s) => s.total <= target + 0.005);
  // 2. Opt-in changes, each priced on top of the cheaper build, then all together.
  const from = cheaper.best;
  const fromWarnings = priced(from.design, prices).warnings;
  const extras = [];
  let all = { ...from.design };
  for (const o of OPT_IN) {
    if (!o.applies(from.design)) continue;
    const r = priced({ ...from.design, ...o.change(from.design) }, prices);
    if (!r.ok || r.warnings > fromWarnings || r.total > from.total - 0.5) continue;
    extras.push({ key: o.key, label: o.label, saves: Math.round((from.total - r.total) * 100) / 100, gives: o.gives });
    all = { ...all, ...o.change(from.design) };
  }
  const withExtras = extras.length ? priced(all, prices).total : from.total;
  // 3. The same design, smaller, from the cheaper build with the opt-in changes.
  let shrink = null;
  if (withExtras > target + 0.005) {
    let cur = { design: normalize(all), total: withExtras };
    const cuts = [];
    while (cur.total > target + 0.005) {
      const d = cur.design;
      let best = null;
      for (const k of ['length', 'width']) {
        if (d[k] - 12 < MIN_SIDE) continue;
        const next = { ...d, [k]: d[k] - 12 };
        next.openings = refitOpenings(d.openings, next.length, next.width);
        const r = priced(next, prices);
        if (!r.ok || r.warnings > fromWarnings) continue;
        // Dollars saved per square foot of floor given up.
        const rate = (cur.total - r.total) / ((d.length * d.width - next.length * next.width) / 144);
        if (r.total < cur.total - 0.5 && (!best || rate > best.rate)) best = { r, k, rate };
      }
      if (!best) break;
      cuts.push(`${best.k === 'length' ? 'length' : 'width'} to ${Math.round(best.r.design[best.k] / 12)} ft`);
      cur = { design: best.r.design, total: best.r.total };
    }
    const d = cur.design;
    shrink = cuts.length ? {
      design: d, total: cur.total, cuts, fits: cur.total <= target + 0.005,
      size: `${Math.round(Math.min(d.length, d.width) / 12)}x${Math.round(Math.max(d.length, d.width) / 12)}`,
      sqFt: (d.length * d.width) / 144,
    } : null;
  }
  return { target, start, steps, reachedAt, cheapest: from.total, extras, withExtras, shrink };
}

const esc = (/** @type {any} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (/** @type {number} */ value) => {
  const format = (/** @type {number} */ v) => `$${Math.round(v).toLocaleString('en-US')}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

/**
 * The path as HTML for the cheaper-build panel.
 * @param {ReturnType<typeof budgetPath>} p
 */
export function budgetPathHtml(p) {
  const t = money(p.target);
  if (p.start <= p.target + 0.005) return `<div class="budget-path"><h4>Your budget: ${t}</h4><p>Your design's ${money(p.start)} of materials is already within it.</p></div>`;
  let html = `<div class="budget-path"><h4>Your budget: ${t} of materials</h4>`;
  if (p.steps.length) {
    html += `<p>Your design is ${money(p.start)}. The cheaper build's steps, with the total after each:</p><ol>${p.steps.map((s, i) => `<li${i === p.reachedAt ? ' class="ok"' : ''}>${esc(s.label)}: ${money(s.total)}${i === p.reachedAt ? ` <strong>within ${t}</strong>` : ''}</li>`).join('')}</ol>`;
  }
  if (p.reachedAt >= 0) return `${html}<p>Step ${p.reachedAt + 1} brings it within your budget; the steps after it save more.</p></div>`;
  html += `<p>The cheapest same-size build the tool finds is ${money(p.cheapest)}, ${money(p.cheapest - p.target)} over.</p>`;
  if (p.extras.length) {
    html += `<p><strong>Choices that save more by giving something up</strong> (not made for you):</p><ul>${p.extras.map((x) => `<li>${esc(x.label)}: saves ${money(x.saves)}. ${esc(x.gives)}</li>`).join('')}</ul>`;
    html += `<p>With ${p.extras.length === 1 ? 'it' : 'both'}: ${money(p.withExtras)}${p.withExtras <= p.target + 0.005 ? `, <strong>within ${t}</strong>` : `, still ${money(p.withExtras - p.target)} over`}.</p>`;
  }
  if (p.shrink) {
    const s = p.shrink;
    html += s.fits
      ? `<p><strong>What fits ${t} in this design:</strong> a ${s.size} (${Math.round(s.sqFt)} sq ft) at ${money(s.total)}, cutting ${esc(s.cuts.join(', then '))}, cheapest cut per square foot first. <button type="button" data-budget-use="smaller">Add the ${s.size} to my designs</button></p>`
      : `<p><strong>Smaller does not get there either:</strong> the smallest this design goes (6 ft a side, every check passing and every door and window fitting) is a ${s.size} at ${money(s.total)}, ${money(s.total - p.target)} over. A cheaper siding or roofing, if you will change them, is the next lever.</p>`;
  }
  return `${html}<p class="muted">Materials before tax at the prices above. Estimates, not quotes; not engineered or code-checked.</p></div>`;
}
