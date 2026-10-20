// "Your dashboard": given your own profile, which partner traits each lens links to a lower
// risk, what-ifs for the things you could change, and non-negotiables (locked or excluded
// values) that the searches respect. Builds on couple.js (adapters' partnerTraits and
// changes, rankPartners, project) instead of re-implementing them. One lens at a time; lenses
// are never pooled. Pure functions (no DOM); tests/dashboard.test.mjs.
import { PERSON_SPEC, COUPLE_SPEC, adapterFor, refusals, project, rankPartners, scoringModels, stepAt, lensHorizons, primaryHorizon } from './couple.js';
import { couplePercentile } from './population.js';
export { couplePercentile };

export const SEARCH_CAP = 600; // partner profiles scored per lens; more traits are held fixed
export const HORIZONS = [5, 10, 20];
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// ---- Constraints (non-negotiables) -------------------------------------------------------
// { locks: ['a.degree', 'b.religion', 'couple.cohabitedFirst'], exclude: { 'b.religion': ['Never'] }, gapMax: 5 }
// A locked own field is never changed in the what-ifs; a locked partner field is held at the
// partner profile in the form. Excluded values are never searched or suggested. gapMax caps
// the absolute age gap in the partner search.
export const emptyConstraints = () => ({ locks: [], exclude: {}, gapMax: null });

function fieldSpec(name) {
  const [who, k] = name.split('.');
  if ((who === 'a' || who === 'b') && k in PERSON_SPEC) return PERSON_SPEC[k];
  if (who === 'couple' && ['cohabitedFirst', 'status', 'homeOwner'].includes(k)) return COUPLE_SPEC[k];
  return undefined;
}
const enumerated = (spec) => Array.isArray(spec) && typeof spec[0] === 'string';

export function cleanConstraints(c = {}) {
  const out = emptyConstraints();
  for (const k of c.locks || []) if (fieldSpec(k) !== undefined && !out.locks.includes(k)) out.locks.push(k);
  for (const [k, vals] of Object.entries(c.exclude || {})) {
    const spec = fieldSpec(k);
    if (!enumerated(spec)) continue;
    const ok = [...new Set(vals)].filter((v) => spec.includes(v));
    if (ok.length) out.exclude[k] = ok;
  }
  const g = Number(c.gapMax);
  if (c.gapMax !== null && c.gapMax !== undefined && c.gapMax !== '' && Number.isInteger(g) && g >= 0 && g <= 30) out.gapMax = g;
  return out;
}

// To and from URL fragment parameters (joined to the scenario's with '&'). Only known
// fields and allowed values survive decoding.
export function encodeConstraints(c) {
  const x = cleanConstraints(c);
  const q = new URLSearchParams();
  if (x.locks.length) q.set('lock', x.locks.join(','));
  for (const [k, vals] of Object.entries(x.exclude)) q.set('ex.' + k, vals.join('|'));
  if (x.gapMax !== null) q.set('gap', String(x.gapMax));
  return q.toString();
}

export function decodeConstraints(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const raw = { locks: (q.get('lock') || '').split(',').filter(Boolean), exclude: {}, gapMax: q.get('gap') };
  for (const [k, v] of q) if (k.startsWith('ex.')) raw.exclude[k.slice(3)] = v.split('|');
  return cleanConstraints(raw);
}

const isLocked = (c, name) => c.locks.includes(name);
const isExcluded = (c, name, v) => (c.exclude[name] || []).includes(v);

// ---- Partner search space ----------------------------------------------------------------
// The lens's partner traits after constraints, capped at `cap` profiles: traits are added in
// the adapter's priority order and any trait that would push the grid past the cap is held
// at the partner profile in the form (and listed, so the page can say so).
export function partnerSpace(bundle, me, partnerRef, couple, constraints = emptyConstraints(), { cap = SEARCH_CAP } = {}) {
  const ad = adapterFor(bundle);
  const c = cleanConstraints(constraints);
  const traits = (ad.partnerTraits ? ad.partnerTraits(me) : []).map((t) => {
    const name = 'b.' + t.key;
    const refVal = t.gap ? num(partnerRef.age) - num(me.age) : partnerRef[t.key];
    let values = t.values.slice();
    let held = null;
    if (isLocked(c, name)) { values = [refVal]; held = 'locked'; }
    if (t.gap && c.gapMax !== null) values = values.filter((g) => Math.abs(g) <= c.gapMax);
    if (!t.gap) values = values.filter((v) => !isExcluded(c, name, v));
    return { ...t, name, refVal, values, held };
  });
  const conflicts = traits.filter((t) => !t.values.length).map((t) => t.label);
  const total = traits.reduce((s, t) => s * Math.max(1, t.values.length), 1);
  let size = 1;
  for (const t of traits) {
    if (t.held || t.values.length <= 1) continue;
    if (size * t.values.length > cap) {
      t.values = [t.values.includes(t.refVal) ? t.refVal : t.values[0]];
      t.held = 'speed';
    } else size *= t.values.length;
  }
  const list = [];
  if (!conflicts.length) {
    const rec = (i, p) => {
      if (i === traits.length) { list.push(finishPartner(p, partnerRef, me, couple)); return; }
      const t = traits[i];
      for (const v of t.values) rec(i + 1, { ...p, ...applyTrait(t, v, me) });
    };
    rec(0, { ...partnerRef });
  }
  return { traits, list, total, size: list.length, conflicts, heldForSpeed: traits.filter((t) => t.held === 'speed').map((t) => t.label) };
}

function applyTrait(t, v, me) {
  if (t.gap) return { age: num(me.age) + v };
  return t.patch ? t.patch(v) : { [t.key]: v };
}

// Keep the derived first-marriage age consistent with the age and marriage history searched.
function finishPartner(p, ref, me, couple) {
  const q = { ...p };
  const ym = num(couple.yearsMarried) || 0;
  if (!q.priorMarriage) q.firstMarriageAge = num(q.age) - ym;
  else q.firstMarriageAge = ref.priorMarriage ? ref.firstMarriageAge : null;
  return q;
}

export function describeTraits(space, p, me) {
  return space.traits.filter((t) => !t.held || t.held === 'locked').map((t) => {
    const v = t.gap ? num(p.age) - num(me.age) : p[t.key];
    if (t.gap) return `age ${p.age} (${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)})`;
    if (t.show) return t.show(v);
    if (t.key === 'wages') return `wages $${Number(v).toLocaleString('en-US')}`;
    return `${t.label.toLowerCase()}: ${String(v).toLowerCase()}`;
  }).join(', ');
}

// Profiles whose model range overlaps the best one's form one "statistically
// indistinguishable" tier; the page never names a single ideal partner.
export function topTier(ranked) {
  const tier = ranked.filter((r) => r.indistinguishable);
  if (!tier.length) return null;
  const means = tier.map((r) => r.meanSurvival);
  return { count: tier.length, of: ranked.length, meanLo: Math.min(...means), meanHi: Math.max(...means), lo: Math.min(...tier.map((r) => r.minSurvival)), hi: Math.max(...tier.map((r) => r.maxSurvival)) };
}

// Partner ranking plus a per-trait view for one lens. The per-trait view varies one trait at a
// time, holding the others at the partner profile in the form (the reference), and reports the
// change against that reference with the model range and agreement.
export function partnerDashboard(bundle, me, partnerRef, couple, constraints = emptyConstraints(), { cap = SEARCH_CAP, horizons = lensHorizons(bundle), rankAt = primaryHorizon(bundle), show = 12 } = {}) {
  const hs = [rankAt, ...horizons.filter((h) => h !== rankAt)];
  const space = partnerSpace(bundle, me, partnerRef, couple, constraints, { cap });
  const r = rankPartners(bundle, me, couple, space.list, { horizons: hs, current: partnerRef, describe: (p) => describeTraits(space, p, me) });
  for (const row of r.ranked.slice(0, show)) row.percentile = couplePercentile(bundle, me, row.partner, couple);
  const models = scoringModels(bundle);
  const refOk = !refusals(bundle, me, partnerRef, couple).length;
  const refProj = refOk ? project(bundle, me, partnerRef, couple, Math.max(...hs)) : null;
  const perTrait = space.traits.filter((t) => !t.held && t.values.length > 1).map((t) => {
    // Always show the reference value too, so every row reads against it.
    const vals = t.values.includes(t.refVal) || (t.refVal === undefined || t.refVal === '' || Number.isNaN(t.refVal)) ? t.values.slice() : [...t.values, t.refVal];
    if (typeof vals[0] === 'number') vals.sort((x, y) => x - y);
    const rows = vals.map((v) => {
      const p = finishPartner({ ...partnerRef, ...applyTrait(t, v, me) }, partnerRef, me, couple);
      const why = refusals(bundle, me, p, couple);
      const label = t.gap ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)} years (age ${p.age})` : t.show ? t.show(v) : t.key === 'wages' ? `$${Number(v).toLocaleString('en-US')}` : String(v);
      if (why.length) return { value: v, label, refused: why[0] };
      const proj = project(bundle, me, p, couple, rankAt);
      const y = stepAt(proj, rankAt);
      const r0 = refProj ? stepAt(refProj, rankAt) : null;
      const deltas = r0 ? models.map((m) => y.survival[m.key] - r0.survival[m.key]) : [];
      const delta = r0 ? y.meanSurvival - r0.meanSurvival : null;
      return {
        value: v, label, meanSurvival: y.meanSurvival, minSurvival: y.minSurvival, maxSurvival: y.maxSurvival,
        delta, agree: refProj ? deltas.filter((d) => (delta >= 0 ? d > 0 : d < 0)).length : null,
        isReference: v === t.refVal, inSupport: proj.every((z) => z.inSupport), percentile: couplePercentile(bundle, me, p, couple),
      };
    });
    return { key: t.key, label: t.label, rows };
  });
  return {
    space,
    ranking: r,
    tier: topTier(r.ranked),
    perTrait,
    reference: refProj ? (({ meanSurvival, minSurvival, maxSurvival }) => ({ meanSurvival, minSurvival, maxSurvival }))(stepAt(refProj, rankAt)) : null,
    rankAt,
    horizons: hs,
    models: models.length,
  };
}

// ---- What-ifs on your own changeable traits ---------------------------------------------
const CHANGEABILITY = {
  degree: 'changeable, over years', school: 'changeable, over years', work: 'changeable', wages: 'changeable',
  religion: 'changeable', familyIncome: 'changeable', cohabitedFirst: 'only before the wedding', age: 'only before the wedding (timing)',
  quality: 'how the relationship feels; not a switch', obsNeg: 'a behaviour (approximation of observer codes)', obsPos: 'a behaviour (approximation of observer codes)', status: 'a decision you make together', homeOwner: 'changeable, with money',
};
export const FIXED_TRAITS = ['sex', 'race-ethnicity', 'family of origin', 'earlier marriages and children', 'age today'];
const TREE_KINDS = new Set(['tree', 'forest', 'boosted']);

function patchKeys(ch) {
  return ['a', 'b', 'couple'].flatMap((w) => Object.keys(ch[w] || {}).map((k) => `${w}.${k}`));
}

// The adapter's own what-ifs for you (person 'a') and for the couple, minus anything a
// constraint forbids, each scored at every horizon: mean change in the chance of no divorce,
// the model range, how many models agree on the direction, and how many do not move at all
// (often trees that never split on that input). Ranked by the change at `rankAt` years.
export function whatIfs(bundle, a, b, couple, constraints = emptyConstraints(), { horizons = lensHorizons(bundle), rankAt = primaryHorizon(bundle) } = {}) {
  const c = cleanConstraints(constraints);
  const ad = adapterFor(bundle);
  const models = scoringModels(bundle);
  const H = Math.max(...horizons, rankAt);
  const base = project(bundle, a, b, couple, H);
  const candidates = [...ad.changes('a', a, b), ...ad.coupleChanges(couple, a, b)];
  const blocked = [];
  const allowed = candidates.filter((ch) => {
    const keys = patchKeys(ch);
    const lock = keys.find((k) => isLocked(c, k));
    const ex = keys.find((k) => { const [w, f] = k.split('.'); return isExcluded(c, k, ch[w][f]); });
    if (lock || ex) { blocked.push({ label: ch.label, why: lock ? `locked: ${lock}` : `excluded value: ${ex}` }); return false; }
    return true;
  });
  const score = (ch) => {
    const a2 = { ...a, ...(ch.a || {}) };
    const b2 = { ...b, ...(ch.b || {}) };
    const c2 = { ...couple, ...(ch.couple || {}) };
    const why = refusals(bundle, a2, b2, c2);
    if (why.length) return null;
    const p = project(bundle, a2, b2, c2, H);
    const at = {};
    for (const h of new Set([...horizons, rankAt])) {
      const deltas = models.map((m) => stepAt(p, h).survival[m.key] - stepAt(base, h).survival[m.key]);
      const delta = stepAt(p, h).meanSurvival - stepAt(base, h).meanSurvival;
      at[h] = { delta, lo: Math.min(...deltas), hi: Math.max(...deltas), agree: deltas.filter((d) => (delta >= 0 ? d > 0 : d < 0)).length, deltas };
    }
    const still = models.filter((m, i) => Math.abs(at[rankAt].deltas[i]) < 1e-12);
    return { at, unchanged: still.length, unchangedTrees: still.length > 0 && still.every((m) => TREE_KINDS.has(m.kind)), inSupport: p.filter((y) => y.elapsed <= rankAt + 0.01).every((y) => y.inSupport) };
  };
  const items = [];
  for (const ch of allowed) {
    const s = score(ch);
    if (!s) continue;
    const keys = patchKeys(ch);
    const field = keys.map((k) => k.split('.')[1]).find((f) => CHANGEABILITY[f]) || keys[0]?.split('.')[1];
    items.push({ label: ch.label, change: ch, keys, changeability: CHANGEABILITY[field] || 'changeable', models: models.length, ...s });
  }
  items.sort((x, y) => y.at[rankAt].delta - x.at[rankAt].delta);
  // "Apply all helpful changes": the best change per input among those that raise the mean and
  // that most models agree with; inputs are never changed twice.
  const picked = [];
  const used = new Set();
  for (const it of items) {
    const r = it.at[rankAt];
    if (!(r.delta > 0 && r.agree > it.models / 2)) continue;
    const fields = it.keys.map((k) => (k.endsWith('.school') ? k.replace('.school', '.degree') : k));
    if (fields.some((k) => used.has(k))) continue;
    fields.forEach((k) => used.add(k));
    picked.push(it);
  }
  let combined = null;
  if (picked.length > 1) {
    const merged = { label: 'All helpful changes together', a: {}, b: {}, couple: {} };
    for (const it of picked) for (const w of ['a', 'b', 'couple']) Object.assign(merged[w], it.change[w] || {});
    const s = score(merged);
    if (s) combined = { labels: picked.map((it) => it.label), models: models.length, ...s };
  }
  return {
    base: Object.fromEntries(horizons.map((h) => [h, { meanSurvival: stepAt(base, h).meanSurvival, minSurvival: stepAt(base, h).minSurvival, maxSurvival: stepAt(base, h).maxSurvival }])),
    items, combined, blocked, rankAt, horizons, fixed: FIXED_TRAITS,
  };
}
