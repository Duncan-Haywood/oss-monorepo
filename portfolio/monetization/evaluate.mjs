#!/usr/bin/env node
// Monetization and go-to-market evaluation of the portfolio's ventures.
//
//   node portfolio/monetization/evaluate.mjs            # table of scenarios
//   node portfolio/monetization/evaluate.mjs --check    # validate the file (CI-friendly, exit 1 on problems)
//   node portfolio/monetization/evaluate.mjs --queue    # what to evaluate next
//   node portfolio/monetization/evaluate.mjs --json     # computed rows as JSON
//
// The routine half (traffic per category, revenue arithmetic, coverage) is
// computed here so no run has to redo it by hand; the judgment half (buyer,
// mechanism, price, GTM) lives in evaluations.json, written by agents.
// Read README.md for what the numbers mean and what they do not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Merchant-of-record fee on the free tier, read from the provider pricing pages
// on 2026-10-31 (docs/reports/2026-10-31-payout-rail-next-steps.md): 5% + 50c,
// identical for Polar, Lemon Squeezy and Paddle.
export const MOR_FEE = { pct: 0.05, fixed: 0.5 };
// GitHub Sponsors takes no fee on personal sponsorships (card processing aside);
// treated as zero here, which slightly overstates the donation net.
export const DONATION_FEE = { pct: 0, fixed: 0 };

export const GATES = ['none', 'payout-rail', 'funding-sponsors-live', 'owner-partner', 'owner-application'];

export function netPerSale(price, unit) {
  const fee = unit === 'donation' ? DONATION_FEE : MOR_FEE;
  return Math.max(0, price * (1 - fee.pct) - fee.fixed);
}

// Revenue in the first twelve months from `visitors` per month, for one
// mechanism. One-time and donation: each month's converts pay once. Monthly:
// subscribers accumulate and churn, and each active subscriber pays monthly.
// Annual: each convert pays the annual price once in year one.
export function yearOne(visitors, m) {
  const buyers = visitors * m.conversion;
  const net = netPerSale(m.price_usd, m.unit);
  if (m.unit === 'monthly') {
    let active = 0;
    let total = 0;
    for (let month = 0; month < 12; month += 1) {
      active = active * (1 - (m.monthly_churn ?? 0.05)) + buyers;
      total += active * net;
    }
    return total;
  }
  if (m.unit === 'flat') return m.price_usd > 0 ? net * (m.expected_count_per_year ?? 0) : 0;
  return buyers * 12 * net;
}

// Human page loads per slug from the first-party counter, scaled to 30 days
// over the days the file covers. Breakdown keys (with a colon) are skipped.
export function measuredTraffic(visitsFile = path.join(ROOT, 'portfolio/usage/site-visits.json')) {
  let days = {};
  try {
    days = JSON.parse(fs.readFileSync(visitsFile, 'utf8')).days ?? {};
  } catch {
    return { perSlug: new Map(), dayCount: 0, total: 0, first: null, last: null };
  }
  const keys = Object.keys(days).sort();
  const perSlug = new Map();
  let total = 0;
  for (const day of keys) {
    for (const [k, n] of Object.entries(days[day])) {
      if (k.includes(':')) continue;
      const slug = k.split('/')[0];
      perSlug.set(slug, (perSlug.get(slug) ?? 0) + n);
      total += n;
    }
  }
  // Scale by calendar span, not by the number of keys: days with no loads are
  // absent from the file, and dividing by keys would overstate the rate.
  let span = keys.length;
  if (keys.length >= 2) span = Math.round((Date.parse(keys.at(-1)) - Date.parse(keys[0])) / 86400000) + 1;
  const scale = span ? 30 / span : 0;
  for (const [k, v] of perSlug) perSlug.set(k, v * scale);
  return { perSlug, dayCount: span, total: total * scale, first: keys[0] ?? null, last: keys.at(-1) ?? null };
}

export function loadEvaluations(file = path.join(HERE, 'evaluations.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function categoryForFn() {
  const mod = await import(path.join(ROOT, 'platform/pages/build.mjs'));
  return (slug) => {
    const c = mod.categoryFor(slug);
    return (c && c.id) || String(c);
  };
}

export function ventureSlugs() {
  return fs.readdirSync(path.join(ROOT, 'ventures'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'ventures', d.name, 'VENTURE.yaml')))
    .map((d) => d.name)
    .sort();
}

export function flagshipSlugs() {
  const text = fs.readFileSync(path.join(ROOT, 'portfolio/flagships.yaml'), 'utf8');
  return [...text.matchAll(/^\s*- venture:\s*(\S+)/gm)].map((m) => m[1]);
}

// Three scenarios, each a sum over the evaluation's mechanisms:
//   now     measured traffic, only mechanisms with gate "none"
//   rail    measured traffic, plus mechanisms gated on the payout rail or Sponsors button
//   target  the evaluation's 12-month traffic target, every mechanism
// Flat-priced services (a set number of sales a year, sold by a person) count
// only in target: they need a buyer who found the product, which the measured
// traffic does not yet supply.
export function scenarios(ev, measuredMonthly) {
  const sum = (visitors, allow, flat = false) => ev.mechanisms
    .filter((m) => allow(m.gate) && (flat || m.unit !== 'flat'))
    .reduce((acc, m) => acc + yearOne(visitors, m), 0);
  return {
    now: sum(measuredMonthly, (g) => g === 'none'),
    rail: sum(measuredMonthly, (g) => g === 'none' || g === 'payout-rail' || g === 'funding-sponsors-live'),
    target: sum(ev.traffic_target_monthly.value, () => true, true),
  };
}

export function validate(data, { categories, flagships, slugs }) {
  const problems = [];
  const ids = new Set();
  const date = /^\d{4}-\d{2}-\d{2}$/;
  for (const ev of data.evaluations) {
    const where = `evaluation ${ev.id ?? '(no id)'}`;
    if (!ev.id) problems.push(`${where}: missing id`);
    if (ids.has(ev.id)) problems.push(`${where}: duplicate id`);
    ids.add(ev.id);
    if (!['category', 'venture'].includes(ev.kind)) problems.push(`${where}: kind must be category or venture`);
    if (ev.kind === 'category' && !categories.has(ev.id)) problems.push(`${where}: no catalogue category with that id`);
    if (ev.kind === 'venture' && !slugs.has(ev.id)) problems.push(`${where}: no venture with that slug`);
    if (!date.test(ev.evaluated ?? '')) problems.push(`${where}: evaluated must be YYYY-MM-DD`);
    for (const field of ['buyer', 'verdict', 'next_measurement']) {
      if (!ev[field] || String(ev[field]).trim().length < 10) problems.push(`${where}: ${field} missing or too short`);
    }
    if (!Array.isArray(ev.gtm) || ev.gtm.length < 2) problems.push(`${where}: gtm needs at least two steps`);
    const t = ev.traffic_target_monthly;
    if (!t || typeof t.value !== 'number' || t.value < 0 || !t.basis) problems.push(`${where}: traffic_target_monthly needs value and basis`);
    if (!Array.isArray(ev.mechanisms) || ev.mechanisms.length === 0) problems.push(`${where}: no mechanisms`);
    for (const m of ev.mechanisms ?? []) {
      const mw = `${where} mechanism ${m.name}`;
      if (!GATES.includes(m.gate)) problems.push(`${mw}: gate must be one of ${GATES.join(', ')}`);
      if (!['one-time', 'monthly', 'annual', 'donation', 'flat'].includes(m.unit)) problems.push(`${mw}: bad unit`);
      if (typeof m.price_usd !== 'number' || m.price_usd < 0) problems.push(`${mw}: price_usd must be a non-negative number`);
      if (m.unit !== 'flat' && (typeof m.conversion !== 'number' || m.conversion < 0 || m.conversion > 0.2)) {
        problems.push(`${mw}: conversion must be between 0 and 0.2 (a higher rate needs a measurement, not an assumption)`);
      }
      if (!m.basis) problems.push(`${mw}: basis missing (say whether price and conversion are measured or assumed)`);
    }
  }
  for (const c of categories) if (!ids.has(c)) problems.push(`category ${c} has no evaluation`);
  for (const f of flagships) if (!ids.has(f)) problems.push(`flagship ${f} has no evaluation`);
  return problems;
}

const usd = (n) => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n < 10 ? 2 : 0)}`);

async function main(argv) {
  const data = loadEvaluations();
  const categoryFor = await categoryForFn();
  const slugs = ventureSlugs();
  const bySlugCat = new Map(slugs.map((s) => [s, categoryFor(s)]));
  const categories = new Set(bySlugCat.values());
  const flagships = flagshipSlugs();
  const traffic = measuredTraffic();

  if (argv.includes('--check')) {
    const problems = validate(data, { categories, flagships, slugs: new Set(slugs) });
    if (problems.length) {
      for (const p of problems) console.error(`monetization: ${p}`);
      process.exit(1);
    }
    console.log(`monetization: ${data.evaluations.length} evaluations, every category (${categories.size}) and flagship (${flagships.length}) covered`);
    return;
  }

  const catTraffic = new Map();
  const catCount = new Map();
  for (const [s, c] of bySlugCat) {
    catTraffic.set(c, (catTraffic.get(c) ?? 0) + (traffic.perSlug.get(s) ?? 0));
    catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  const rows = data.evaluations.map((ev) => {
    const measured = ev.kind === 'category' ? (catTraffic.get(ev.id) ?? 0) : (traffic.perSlug.get(ev.id) ?? 0);
    return { id: ev.id, kind: ev.kind, ventures: ev.kind === 'category' ? catCount.get(ev.id) ?? 0 : 1, measured_monthly: measured, target_monthly: ev.traffic_target_monthly.value, ...scenarios(ev, measured), verdict: ev.verdict };
  });

  if (argv.includes('--queue')) {
    const done = new Set(data.evaluations.map((e) => e.id));
    const selfHosted = slugs.filter((s) => bySlugCat.get(s) === 'self-hosted' && !done.has(s));
    const flag = flagships.filter((f) => !done.has(f));
    const trafficked = [...traffic.perSlug.entries()].filter(([s]) => bySlugCat.has(s) && !done.has(s)).sort((a, b) => b[1] - a[1]).map(([s]) => s);
    console.log('Evaluate next (flagships, then ventures with measured visits, then self-hosted apps):');
    for (const s of [...flag, ...trafficked, ...selfHosted].slice(0, 20)) console.log(`  ${s}  (${bySlugCat.get(s)})`);
    return;
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ traffic: { window: [traffic.first, traffic.last], days: traffic.dayCount, site_monthly: traffic.total }, rows }, null, 2));
    return;
  }

  console.log(`Measured traffic: ${traffic.first}..${traffic.last} (${traffic.dayCount} days), ~${Math.round(traffic.total)} human page loads per 30 days across the whole site.`);
  console.log('Year-one net revenue to the owner, by scenario (now / payout rail on / 12-month traffic target):\n');
  console.log('| Evaluation | Kind | Ventures | Loads/mo now | Target loads/mo | Now | Rail on | Target |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows.sort((a, b) => b.target - a.target)) {
    console.log(`| ${r.id} | ${r.kind} | ${r.ventures} | ${Math.round(r.measured_monthly)} | ${r.target_monthly.toLocaleString('en-US')} | ${usd(r.now)} | ${usd(r.rail)} | ${usd(r.target)} |`);
  }
  const totals = rows.filter((r) => r.kind === 'category').reduce((a, r) => ({ now: a.now + r.now, rail: a.rail + r.rail, target: a.target + r.target }), { now: 0, rail: 0, target: 0 });
  console.log(`\nCategories summed (ventures rows overlap them, so they are not added): now ${usd(totals.now)}, rail on ${usd(totals.rail)}, target ${usd(totals.target)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
