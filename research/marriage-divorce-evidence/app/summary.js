// "Summary across lenses": for one couple, every scorable lens's own estimate at each horizon it
// supports (mean and model range), its held-out skill, how well the couple fits its data, and
// its population percentile; then a plain-language synthesis that says where the lenses agree
// or disagree and which is most relevant to this couple. Numbers are NEVER pooled across
// lenses: their outcomes, populations and horizons differ. Pure functions; tests/summary.test.mjs.
import { refusals, project, stepAt, lensHorizons, primaryHorizon, typicality, lensSkill, adapterFor, isRateLens } from './couple.js';
import { referenceFor, populationComparison } from './population.js';

// Held-out skill for this couple's own group when the lens publishes one (HCMST reports it for
// married and unmarried couples separately; its pooled C-index is inflated by telling new and
// unmarried couples apart from long marriages, which says little about a married couple).
const GROUP_OF = {
  hcmst_couples: (a, b, couple) => (couple.status ? (String(couple.status).startsWith('Married') ? 'Married at wave 1' : 'Unmarried at wave 1') : null),
};
export function skillForCouple(bundle, a, b, couple) {
  const skill = lensSkill(bundle);
  const pick = GROUP_OF[bundle.id];
  if (!skill || !pick) return skill;
  const group = pick(a, b, couple);
  const g = group && (bundle.models || []).find((m) => m.key === skill.key)?.heldout?.by_group?.[group];
  if (!g || !Number.isFinite(g.c_index)) return skill;
  return { ...skill, c: g.c_index, cCi: g.c_index_ci || null, group: group.replace(/ at wave 1$/, '').toLowerCase() + ' couples', cPooled: skill.c };
}

export function summariseLens(lens, a, b, couple) {
  const bundle = lens.bundle;
  const base = { id: lens.summary.id, label: lens.summary.label, outcome: adapterFor(bundle).outcome || lens.summary.target, kind: adapterFor(bundle).kind || 'rate' };
  if (!lens.summary.scorable) return { ...base, status: 'not_scorable', reason: 'listed only: its inputs are not on the form, or its outcome is not divorce' };
  const why = refusals(bundle, a, b, couple);
  if (why.length) return { ...base, status: 'abstain', reason: why[0] };
  const hs = lensHorizons(bundle);
  const p = project(bundle, a, b, couple, Math.max(...hs));
  const horizons = hs.map((h) => {
    const y = stepAt(p, h);
    const upto = p.filter((z) => z.elapsed <= h + 0.01);
    return { h, mean: y.meanSurvival, min: y.minSurvival, max: y.maxSurvival, survival: y.survival, inSupport: upto.every((z) => z.inSupport) };
  });
  const t = typicality(bundle, a, b, couple);
  const cmp = referenceFor(bundle) ? populationComparison(bundle, a, b, couple) : null;
  const ph = primaryHorizon(bundle);
  const prow = cmp && !cmp.refused ? cmp.horizons.find((r) => Math.abs(r.horizon - ph) < 0.02) || cmp.horizons[cmp.horizons.length - 1] : null;
  return {
    ...base,
    status: 'ok',
    horizons,
    primary: ph,
    skill: skillForCouple(bundle, a, b, couple),
    fit: { ood: t ? t.percentile : null, given: t ? 1 - t.neutralised.length / (bundle.ood.numeric.length + bundle.ood.categorical.length) : null, abstainAbove: bundle.ood?.abstain_above_percentile ?? null, inSupport: horizons.every((x) => x.inSupport), outside: p.filter((z) => !z.inSupport).length },
    percentile: prow ? { horizon: prow.horizon, quantity: cmp.quantity, ...prow.overall } : null,
    // Every horizon's overall percentile (keyed by horizon; 0 = the annual rate now), for tables
    // that let the reader pick the horizon (scenarios.js).
    percentiles: cmp && !cmp.refused ? { quantity: cmp.quantity, at: Object.fromEntries(cmp.horizons.map((r) => [r.horizon, r.overall])) } : null,
    rate: isRateLens(bundle),
  };
}

const side = (pc) => (pc < 40 ? 'below' : pc > 60 ? 'above' : 'near');
const SHORT = {
  nlsy79_couples: 'NLSY79 couples', nlsy79_individuals: 'NLSY79 individuals', nlsy79_first_marriage: 'NLSY79 first marriages', nlsy97_first_marriage: 'NLSY97 first marriages',
  nsfg2002_first_marriage: 'NSFG 2002', nsfg2002_family: 'NSFG 2002 model family', nsfg_pooled_first_marriage: 'NSFG 1995–2023 (wife’s report)', nsfg_pooled_both_sexes: 'NSFG 1995–2023 (each spouse)',
  gss_panel_marriages: 'GSS panels', hcmst_couples: 'HCMST couples', newlywed_la_couples: 'Los Angeles newlyweds', canada_gss_first_marriage: 'Statistics Canada GSS',
  sipp_first_marriage: 'SIPP first marriages', sipp_prospective_couples: 'SIPP couples', acs_one_year_divorce: 'ACS one-year',
};
export const shortName = (label, id) => SHORT[id] || String(label).split(/[:(]/)[0].trim();
const pName = (pc) => (pc.below ? `below p${pc.percentile}` : pc.above ? `above p${pc.percentile}` : `p${Math.round(pc.percentile)}`);

// A relevance score used only to ORDER lenses for this couple (never to weight numbers):
// inside the data, typical of the lens's people, and skilful held out.
export function relevance(s) {
  if (s.status !== 'ok') return -Infinity;
  let r = 0;
  const reasons = [];
  if (s.fit.inSupport) { r += 2; reasons.push('every horizon shown is inside its data'); } else reasons.push(`${s.fit.outside} projected step${s.fit.outside > 1 ? 's are' : ' is'} outside its data`);
  if (Number.isFinite(s.fit.ood)) {
    // Judged only on the inputs given: a lens where most inputs were not asked earns less credit.
    r += 1.5 * (1 - s.fit.ood / 100) * s.fit.given;
    reasons.push(`on the ${Math.round(100 * s.fit.given)}% of its inputs you gave, this couple is more typical than ${Math.round(100 - s.fit.ood)}% of its surveyed people`);
  } else reasons.push('it has no typicality check');
  const c = s.skill?.c;
  if (Number.isFinite(c)) { r += 2 * (c - 0.5); reasons.push(`held-out C-index ${c.toFixed(2)}${s.skill.group ? ` among ${s.skill.group} (${s.skill.cPooled.toFixed(2)} pooled)` : ''}`); } else if (Number.isFinite(s.skill?.gain)) { r += s.skill.gain / 50; reasons.push(`held-out gain ${s.skill.gain.toFixed(1)}%`); }
  return { score: r, reasons };
}

export function synthesise(rows) {
  const ok = rows.filter((r) => r.status === 'ok');
  const lines = [];
  if (!ok.length) return { lines: ['No lens can score this couple; each one’s reason is in the table.'], ranked: [] };
  // Agreement on RELATIVE risk: each lens's percentile within its own surveyed population.
  const withPc = ok.filter((r) => r.percentile && Number.isFinite(r.percentile.percentile));
  if (withPc.length >= 2) {
    const groups = { below: [], near: [], above: [] };
    for (const r of withPc) groups[side(r.percentile.percentile)].push(r);
    const n = withPc.length;
    const phrase = (g, words) => `${g.length} put${g.length === 1 ? 's' : ''} this couple ${words} (${g.map((r) => `${shortName(r.label, r.id)}: ${pName(r.percentile)}${r.percentile.quantity === 'annual_rate' ? ' of the annual rate now' : ''}${r.fit.inSupport ? '' : ', extrapolated'}`).join('; ')})`;
    const parts = [];
    if (groups.below.length) parts.push(phrase(groups.below, 'at lower risk than most of their surveyed people'));
    if (groups.near.length) parts.push(phrase(groups.near, 'near the middle'));
    if (groups.above.length) parts.push(phrase(groups.above, 'at higher risk than most'));
    const agree = [groups.below, groups.near, groups.above].filter((g) => g.length).length === 1;
    lines.push(`${agree ? 'The lenses agree' : 'The lenses disagree'} on where this couple sits within each lens’s own population. Of ${n} lenses with a population reference, ${parts.join('; ')}.`);
  } else if (withPc.length === 1) {
    lines.push(`Only one scoring lens has a population reference (${withPc[0].label.split(' (')[0]}: ${pName(withPc[0].percentile)}), so there is nothing to compare it with.`);
  }
  // Disagreement among a lens's own models.
  const wide = ok.map((r) => ({ r, h: r.horizons.find((x) => x.h === r.primary) })).filter(({ h }) => h && h.max - h.min > 0.1);
  if (wide.length) lines.push(`Inside ${wide.map(({ r }) => shortName(r.label, r.id)).join(', ')}, the models themselves differ by more than 10 points at the main horizon; read those numbers as rough.`);
  // Most relevant.
  const ranked = ok.map((r) => ({ r, rel: relevance(r) })).sort((x, y) => y.rel.score - x.rel.score);
  const top = ranked[0];
  lines.push(`Most relevant to this couple: ${shortName(top.r.label, top.r.id)} — ${top.rel.reasons.join('; ')}. Its outcome: ${top.r.outcome}`);
  if (ranked.length > 1) lines.push(`Next: ${ranked.slice(1, 3).map(({ r, rel }) => `${shortName(r.label, r.id)} (${rel.reasons[0]})`).join('; ')}.`);
  const out = rows.filter((r) => r.status === 'abstain').length;
  if (out) lines.push(`${out} lens${out > 1 ? 'es give' : ' gives'} no number for this couple; the reasons are in the table, and answering the questions they name may change that.`);
  lines.push('The lenses measure different outcomes (legal divorce, any separation, the end of an unmarried relationship, a one-year incidence) over different horizons, so their numbers are shown side by side and never averaged. Any literature-based adjustment below is separate and labelled.');
  return { lines, ranked: ranked.map(({ r, rel }) => ({ id: r.id, score: rel.score, reasons: rel.reasons })) };
}

export function summariseAll(lenses, a, b, couple) {
  const rows = lenses.map((l) => summariseLens(l, a, b, couple));
  return { rows, synthesis: synthesise(rows) };
}

