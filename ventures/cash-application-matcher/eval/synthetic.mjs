// A seeded synthetic benchmark for the matcher. NOT real data: invoices,
// customers and bank lines are generated here, with the scenarios an AR clerk
// meets (named invoices, bare numbers, truncated payer names, multi-invoice
// payments, early-payment discounts, bank charges, short-pays, unknown
// payers). Its job is to catch regressions and to show how precision differs
// by confidence tier; it says nothing about any real business's statement.
//
// node eval/synthetic.mjs [--seed 1] [--customers 40] [--receipts 400]
import { pathToFileURL } from 'node:url';
import { applyCash, discountCents } from '../match.mjs';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['Northwind', 'Bluebird', 'Harbor', 'Cedar', 'Maple', 'Orchid', 'Granite', 'Summit', 'Riverside', 'Lakeside', 'Pioneer', 'Atlas', 'Beacon', 'Copper', 'Evergreen', 'Falcon', 'Golden', 'Highland', 'Ironwood', 'Juniper', 'Keystone', 'Liberty', 'Meridian', 'Oakridge', 'Prairie', 'Quarry', 'Redwood', 'Silverline', 'Tidewater', 'Union', 'Valley', 'Westgate', 'Yellowstone', 'Zenith', 'Apex', 'Brightway', 'Crescent', 'Delta', 'Eastside', 'Frontier'];
const TRADES = ['Manufacturing', 'Dental', 'Logistics', 'Hardware', 'Florists', 'Bakery', 'Electric', 'Plumbing', 'Medical Group', 'Auto Parts', 'Construction', 'Services', 'Distribution', 'Foods', 'Printing'];
const SUFFIX = ['LLC', 'Inc', 'Co.', 'Corp', 'Ltd', ''];
const ABBR = { Manufacturing: 'MFG', Services: 'SVCS', Distribution: 'DIST', 'Medical Group': 'MED GRP' };

export function generate({ seed = 1, customers = 40, receipts = 400 } = {}) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const names = new Set();
  while (names.size < customers) names.add(`${pick(WORDS)} ${pick(TRADES)} ${pick(SUFFIX)}`.trim());
  const custs = [...names];
  const invoices = [];
  let num = 10000;
  const retainer = new Map();
  const newInvoice = (c, day) => {
    // Recurring same-amount invoices (retainers, subscriptions) make amounts ambiguous.
    if (!retainer.has(c)) retainer.set(c, r() < 0.4 ? Math.round(20000 + r() * 300000) : null);
    const amount = retainer.get(c) && r() < 0.6 ? retainer.get(c) : r() < 0.1 ? pick([39500, 50000, 100000, 125000]) : Math.round(5000 + r() * r() * 900000);
    const inv = { id: `INV-${++num}`, customer: c, date: day, amount, terms: r() < 0.3 ? '2/10 Net 30' : 'Net 30' };
    invoices.push(inv);
    return inv;
  };
  const start = 20400; // 2025-11-08 as a day number; only differences matter
  for (const c of custs) for (let k = 0; k < 8 + Math.floor(r() * 25); k++) newInvoice(c, start + Math.floor(r() * 60));
  const pool = invoices.slice();
  const take = (c) => {
    const mine = pool.filter((i) => i.customer === c);
    if (!mine.length) return null;
    const inv = pick(mine);
    pool.splice(pool.indexOf(inv), 1);
    return inv;
  };
  const payerName = (c) => {
    let s = c.replace(/\b(LLC|Inc|Co\.|Corp|Ltd)$/, '').trim();
    const v = r();
    if (v < 0.2) for (const [k, a] of Object.entries(ABBR)) s = s.replace(k, a);
    s = s.toUpperCase();
    if (v > 0.6) s = s.slice(0, 16);
    if (r() < 0.3) s = `ACH CREDIT ${s}`;
    return s;
  };
  const refText = (ids) => {
    const v = r();
    if (v < 0.35) return `REMIT ${ids.join(' ')}`;
    if (v < 0.6) return `INV ${ids.map((x) => x.replace('INV-', '')).join('/')}`;
    if (v < 0.75) return `PMT FOR INVOICE ${ids.map((x) => x.replace('INV-', '')).join(', ')}`;
    return `INVOICES ${ids.map((x) => x.replace('INV-', 'INV')).join(',')}`;
  };
  const rows = [];
  for (let k = 0; k < receipts; k++) {
    const c = pick(custs);
    const s = r();
    let truth = [];
    let amount = 0;
    let payer = payerName(c);
    let reference = 'ACH PAYMENT';
    let day;
    let scenario;
    const one = take(c);
    if (!one) continue;
    day = one.date + 5 + Math.floor(r() * 30);
    if (s < 0.3) { scenario = 'ref single'; truth = [one]; amount = one.amount; reference = refText([one.id]); }
    else if (s < 0.45) {
      scenario = 'ref multi';
      const more = [one];
      for (let j = 0; j < 1 + Math.floor(r() * 3); j++) { const x = take(c); if (x) more.push(x); }
      truth = more; amount = more.reduce((t, x) => t + x.amount, 0); reference = refText(more.map((x) => x.id));
      day = Math.max(...more.map((x) => x.date)) + 5 + Math.floor(r() * 20);
    } else if (s < 0.65) { scenario = 'name single'; truth = [one]; amount = one.amount; }
    else if (s < 0.75) {
      scenario = 'name multi';
      const more = [one];
      const x = take(c); if (x) more.push(x);
      truth = more; amount = more.reduce((t, y) => t + y.amount, 0);
      day = Math.max(...more.map((y) => y.date)) + 5 + Math.floor(r() * 20);
    } else if (s < 0.85) {
      scenario = 'discount';
      one.terms = '2/10 Net 30';
      truth = [one]; day = one.date + Math.floor(r() * 10); amount = one.amount - discountCents(one.amount, 200);
      if (r() < 0.5) reference = refText([one.id]);
    } else if (s < 0.9) { scenario = 'bank fee'; truth = [one]; amount = one.amount - (500 + Math.floor(r() * 2000)); }
    else if (s < 0.95) { scenario = 'unknown payer'; truth = [one]; amount = one.amount; payer = pick(['MOBILE DEPOSIT', 'REMOTE DEPOSIT', '']); reference = 'CHECK'; }
    else { scenario = 'short-pay'; truth = [one]; amount = Math.round(one.amount * (0.5 + r() * 0.4)); reference = refText([one.id]); }
    rows.push({ id: `R${k + 1}`, date: day, amount, payer, reference, truth: truth.map((x) => x.id).sort(), scenario });
  }
  return { invoices, receipts: rows };
}

export function score(seed = 1, opts = {}) {
  const { invoices, receipts } = generate({ seed, ...opts });
  const run = applyCash(invoices, receipts);
  const tiers = {};
  const scen = {};
  for (const x of run.results) {
    const got = x.applications.map((a) => a.invoice).sort().join('|');
    const want = x.receipt.truth.join('|');
    const ok = got === want;
    const t = (tiers[x.confidence] ||= { n: 0, right: 0 });
    t.n++; if (ok) t.right++;
    const sc = (scen[x.receipt.scenario] ||= { n: 0, right: 0, proposed: 0 });
    sc.n++; if (ok) sc.right++; if (x.applications.length) sc.proposed++;
  }
  return { tiers, scen, n: run.results.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const v = (n, d) => { const i = a.indexOf(n); return i >= 0 ? Number(a[i + 1]) : d; };
  const seeds = v('--seeds', 5);
  const agg = { tiers: {}, scen: {}, n: 0 };
  for (let s = 1; s <= seeds; s++) {
    const res = score(s, { customers: v('--customers', 40), receipts: v('--receipts', 400) });
    agg.n += res.n;
    for (const [k, t] of Object.entries(res.tiers)) { const g = (agg.tiers[k] ||= { n: 0, right: 0 }); g.n += t.n; g.right += t.right; }
    for (const [k, t] of Object.entries(res.scen)) { const g = (agg.scen[k] ||= { n: 0, right: 0, proposed: 0 }); g.n += t.n; g.right += t.right; g.proposed += t.proposed; }
  }
  const pct = (x, y) => (y ? ((100 * x) / y).toFixed(1) : '-');
  console.log(`Synthetic benchmark, seeds 1-${seeds}, ${agg.n} receipts (generated data, not real statements)\n`);
  console.log('By confidence tier: receipts, exactly right invoice set');
  for (const k of ['high', 'medium', 'review', 'none']) { const t = agg.tiers[k]; if (t) console.log(`  ${k.padEnd(7)} ${String(t.n).padStart(5)}  ${pct(t.right, t.n)}%`); }
  console.log('\nBy scenario: receipts, proposed, exactly right');
  for (const [k, t] of Object.entries(agg.scen).sort()) console.log(`  ${k.padEnd(14)} ${String(t.n).padStart(5)}  ${pct(t.proposed, t.n).padStart(5)}%  ${pct(t.right, t.n).padStart(5)}%`);
}
