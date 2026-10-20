// Before an engagement: will this dating couple marry each other, or break up first?
// Two HCMST 2009–2017 models (workstream A, #8662), one per outcome, each a probability per
// follow-up period for couples still together and unmarried at its start, combined as the
// bundles' own `how_to_combine` says: still-dating S_k = S_{k-1}(1 - m_k - b_k), married by
// period k = sum S_{j-1} m_j, broke up first = sum S_{j-1} b_j. The two models were fitted
// separately, so the split is approximate. After a wedding, a marriage lens takes over.
// Pure functions; no DOM. tests/dating.test.mjs covers it.
import { predict } from './engine.js';
import { hcmstRow, QUALITY, STATUS } from './lens-adapters.js';

// The additive models are scored; period-only is a baseline and the depth-2 trees did worse
// than it held out (marriage log-loss gain −1.6%), so neither is averaged.
export const DATING_MODEL = 'additive';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const has = (v) => v !== '' && v !== null && v !== undefined;

// Each partner who rated the relationship is a perspective (as in the HCMST couples lens).
export function datingViews(a, b) {
  return [{ who: 'a', p: a }, { who: 'b', p: b }].filter((v) => QUALITY.includes(v.p.quality));
}

// Reasons the dating models cannot speak to this couple (no number rather than a guess).
export function datingRefusals(a, b, couple) {
  const out = [];
  if (!a.sex || !b.sex) out.push('Choose both partners’ sex.');
  if (num(a.age) < 18 || num(b.age) < 18) out.push('HCMST covers adults: both partners must be 18 or older.');
  if (String(couple.status || '').startsWith('Married')) out.push('You are already married, so the question is no longer whether you marry.');
  else if (!STATUS.includes(couple.status)) out.push('Say whether you live together (“Relationship now”).');
  if (!datingViews(a, b).length) out.push('Rate the relationship (“How would you describe the quality of your relationship?”) for at least one of you: it is the models’ main input.');
  if (!has(couple.yearsTogether)) out.push('Say how many years you have been together.');
  return out;
}

// Inputs outside the HCMST data, per period (shown, not refused, as in the other lenses).
export function datingIssues(bundle, a, b, couple, k) {
  const v = datingViews(a, b)[0];
  if (!v) return [];
  const r = hcmstRow(bundle, v, a, b, couple, k);
  const s = bundle.support;
  const out = [];
  for (const [name, x] of [['mean age', r.mean_age], ['years together', r.relationship_years], ['age gap', r.age_gap]]) {
    const range = s[{ 'mean age': 'mean_age', 'years together': 'relationship_years', 'age gap': 'age_gap' }[name]];
    if (Number.isFinite(x) && range && (x < range[0] || x > range[1])) out.push(`${name} ${Math.round(x * 10) / 10} (data: ${Math.round(range[0] * 10) / 10}–${Math.round(range[1] * 10) / 10})`);
  }
  return out;
}

// The period probability of one outcome, averaged over the couple's perspectives.
function periodProb(bundle, a, b, couple, k) {
  const model = bundle.models.find((m) => m.key === DATING_MODEL);
  const views = datingViews(a, b);
  return views.reduce((s, v) => s + predict(model, hcmstRow(bundle, v, a, b, couple, k)), 0) / views.length;
}

// Cumulative chances by the end of each follow-up period, from today.
export function datingChain(mBundle, bBundle, a, b, couple) {
  const periods = mBundle.periods;
  let still = 1;
  let married = 0;
  let broke = 0;
  const steps = [];
  for (let k = 0; k < periods.length; k++) {
    const m = periodProb(mBundle, a, b, couple, k);
    const br = periodProb(bBundle, a, b, couple, k);
    // Separately fitted: if the two would exceed 1, share the period out in proportion.
    const tot = m + br;
    const sc = tot > 1 ? 1 / tot : 1;
    married += still * m * sc;
    broke += still * br * sc;
    still *= 1 - tot * sc;
    steps.push({ period: periods[k].period, years: periods[k].years_since_start_at_end, m, b: br, married, brokeUp: broke, stillTogether: still, issues: datingIssues(mBundle, a, b, couple, k) });
  }
  return { steps, married, brokeUp: broke, stillTogether: still, years: periods[periods.length - 1].years_since_start_at_end, perspectives: datingViews(a, b).length };
}

// The observed reference: what happened to all 939 couples (weighted), no model.
export function datingObserved(mBundle) {
  const g = (mBundle.cumulative_incidence || []).find((x) => x.group === 'All unmarried couples');
  return g ? { married: g['married_by_8.4y'], brokeUp: g['broke_up_by_8.4y'], couples: g.couples } : null;
}

// Hand-over to a marriage lens: of couples like this, the share who marry within the follow-up
// and are still married `afterYears` after the wedding. It multiplies two estimates from different
// surveys as if independent, so it is an approximation and labelled so.
export function handover(chain, survivalAfterWedding) {
  return Number.isFinite(survivalAfterWedding) ? chain.married * survivalAfterWedding : null;
}
