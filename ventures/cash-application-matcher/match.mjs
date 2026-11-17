// Cash application: decide which open invoices each incoming payment pays.
//
// The method follows how an accounts-receivable clerk works a bank statement:
//   1. read the remittance text for invoice numbers;
//   2. recognise the customer from the payer name the bank shows;
//   3. find the open invoices of that customer whose amounts add up to the
//      payment, allowing an early-payment discount the terms grant
//      ("2/10 net 30": 2% off when paid within 10 days of the invoice date)
//      and a small short-pay the user accepts as a bank charge;
//   4. when several combinations add up, prefer the oldest invoices (FIFO),
//      and say the choice was ambiguous;
//   5. only then fall back to an exact amount with no name or reference.
// Every proposal carries the method, a confidence and a sentence a person can
// check. Nothing is posted anywhere: the output is a review list.

const DAY_MS = 86400000;

/** Parse early-payment terms such as "2/10 net 30", "2% 10 Net 30", "1/15 N45". */
export function parseTerms(terms) {
  const s = String(terms ?? '').toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*%?\s*\/\s*(\d+)/) || s.match(/(\d+(?:\.\d+)?)\s*%\s*(\d+)\s*(?:days?)?\s*,?\s*n(?:et)?/);
  if (!m) return null;
  const pct = Number(m[1]);
  const days = Number(m[2]);
  if (!(pct > 0 && pct < 20) || !(days >= 0 && days <= 120)) return null;
  return { bp: Math.round(pct * 100), days };
}

/** Discount in cents for an invoice of `amount` cents at `bp` basis points. */
export const discountCents = (amount, bp) => Math.round((amount * bp) / 10000);

// ---- customer names -------------------------------------------------------

const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'bv', 'nv', 'srl', 'spa', 'pty', 'pte', 'lp', 'llp', 'pc', 'the', 'and', 'of', 'kg', 'oy', 'ab', 'as']);
const BANK_NOISE = new Set(['ach', 'credit', 'wire', 'transfer', 'payment', 'pmt', 'pymt', 'deposit', 'dep', 'incoming', 'in', 'from', 'ccd', 'ppd', 'ctx', 'web', 'orig', 'co', 'name', 'id', 'trf', 'sepa', 'ct', 'bacs', 'fps', 'faster', 'payments', 'eft', 'rtp', 'zelle', 'online', 'mobile', 'remote', 'check', 'chk', 'cheque']);

// Abbreviations banks and ERPs use for the same word.
const ABBREV = { st: 'street', str: 'street', ave: 'avenue', rd: 'road', mfg: 'manufacturing', mfr: 'manufacturing', intl: 'international', int: 'international', natl: 'national', assoc: 'associates', assn: 'association', svc: 'services', svcs: 'services', serv: 'services', bros: 'brothers', ctr: 'center', centre: 'center', mgmt: 'management', mgt: 'management', dist: 'distribution', distr: 'distribution', grp: 'group', hldgs: 'holdings', ind: 'industries', inds: 'industries', tech: 'technologies', techs: 'technologies', sys: 'systems', med: 'medical', hosp: 'hospital', univ: 'university', dept: 'department', mtn: 'mountain', ft: 'fort', mt: 'mount', n: 'north', s: 'south', e: 'east', w: 'west' };

export function nameTokens(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => ABBREV[t] || t)
    .filter((t) => t && !SUFFIXES.has(t) && !BANK_NOISE.has(t) && !/^\d+$/.test(t));
}

const tokenMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/**
 * 0..1 similarity of a bank payer string to a customer name. Shares of the
 * customer's distinctive tokens that the payer string carries, with prefix
 * matching for the truncation banks apply ("ACME MANUFACTURI").
 */
export function nameScore(payer, customer) {
  const p = nameTokens(payer);
  const c = nameTokens(customer);
  if (!p.length || !c.length) return 0;
  let hit = 0;
  for (const t of c) if (p.some((u) => tokenMatch(t, u))) hit++;
  const joinedP = p.join('');
  const joinedC = c.join('');
  let score = hit / c.length;
  // "ACMEMFG" vs "Acme Mfg": compare with spaces removed.
  if (score < 1 && joinedC.length >= 5 && (joinedP.includes(joinedC) || (joinedP.length >= 5 && joinedC.includes(joinedP)))) score = Math.max(score, 0.9);
  // A single shared token of a one-word payer against a long name is weaker.
  if (hit === 1 && c.length === 1 && p.length > 3) score = Math.min(score, 0.75);
  return score;
}

// ---- invoice numbers in remittance text -----------------------------------

const key = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const digitCore = (s) => {
  const m = key(s).match(/(\d+)$/);
  if (!m) return null;
  const core = m[1].replace(/^0+/, '');
  return core.length >= 3 ? core : null;
};

export function buildReferenceIndex(invoices) {
  const byKey = new Map();
  const byCore = new Map();
  for (const inv of invoices) {
    const k = key(inv.id);
    if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(inv);
    const c = digitCore(inv.id);
    if (c) (byCore.get(c) || byCore.set(c, []).get(c)).push(inv);
  }
  return { byKey, byCore };
}

/**
 * Invoices a remittance string names. Reads whole tokens ("INV-1023"),
 * a prefix split from its number ("INV 1023"), and bare digit runs ("1023",
 * "001023"), including lists like "1023/1024, 1031". A bare number that
 * belongs to several invoices is kept only if one of them is the
 * customer's (`preferCustomers`).
 */
export function findReferences(text, index, preferCustomers = new Set()) {
  const found = new Map();
  const src = String(text ?? '');
  const tokens = src.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const add = (list) => {
    if (!list || !list.length) return;
    let pick = list;
    if (list.length > 1) {
      pick = list.filter((inv) => preferCustomers.has(inv.customer));
      if (pick.length !== 1) return;
    }
    found.set(pick[0].id, pick[0]);
  };
  for (let i = 0; i < tokens.length; i++) {
    add(index.byKey.get(tokens[i]));
    if (i + 1 < tokens.length && /^[A-Z]+$/.test(tokens[i])) add(index.byKey.get(tokens[i] + tokens[i + 1]));
  }
  for (const run of src.match(/\d{3,}/g) || []) {
    const core = run.replace(/^0+/, '');
    if (core.length >= 3) add(index.byCore.get(core));
  }
  return [...found.values()];
}

// ---- subset search --------------------------------------------------------

/** The amounts an invoice can settle for on `date`: open amount, and discounted if the terms allow. */
function options(inv, date, settings) {
  const out = [{ applied: inv.open, discount: 0 }];
  const t = inv.termsParsed;
  if (t && inv.open === inv.amount && settings.allowDiscounts) {
    const inWindow = date == null || inv.date == null || date - inv.date <= t.days + settings.discountGraceDays;
    if (inWindow) {
      const d = discountCents(inv.amount, t.bp);
      if (d > 0) out.push({ applied: inv.open - d, discount: d });
    }
  }
  return out;
}

/**
 * Subsets of `pool` (oldest first) whose settlement amounts total `target`
 * cents, or up to `feeTol` more (the payer's bank kept a fee). Returns up to
 * `limit` solutions; each is { items: [{inv, applied, discount}], fee }.
 * Depth-first with the oldest invoice tried first, so the first solution is
 * the FIFO one. Bounded by `nodeCap` visited nodes.
 */
export function findSubsets(pool, target, date, settings, { feeTol = 0, limit = 3, nodeCap = 250000 } = {}) {
  const list = pool.slice(0, settings.maxPool).map((inv) => ({ inv, opts: options(inv, date, settings) }));
  const n = list.length;
  const suffixMax = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixMax[i] = suffixMax[i + 1] + list[i].opts[0].applied;
  const sols = [];
  const chosen = [];
  let nodes = 0;
  let truncated = false;
  const walk = (i, sum) => {
    if (sols.length >= limit) return;
    if (++nodes > nodeCap) { truncated = true; return; }
    if (sum >= target && sum <= target + feeTol && chosen.length) {
      sols.push({ items: chosen.slice(), fee: sum - target });
      return;
    }
    if (i >= n || sum + suffixMax[i] < target || sum > target + feeTol) return;
    for (const o of list[i].opts) {
      if (sum + o.applied > target + feeTol) continue;
      chosen.push({ inv: list[i].inv, applied: o.applied, discount: o.discount });
      walk(i + 1, sum + o.applied);
      chosen.pop();
      if (sols.length >= limit) return;
    }
    walk(i + 1, sum);
  };
  walk(0, 0);
  // Discount and no-discount versions of the same invoice set count as one answer.
  const seen = new Set();
  const distinct = sols.filter((s) => {
    const k = s.items.map((x) => x.inv.id).sort().join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { solutions: distinct, truncated };
}

// ---- discounts taken after the window ----------------------------------

/**
 * When a payment is short by exactly the early-payment discount its invoices'
 * terms offer, but the discount window has closed, the customer took a
 * discount they had not earned. That is a decision for the clerk (allow it,
 * or bill the difference), never a bank charge to write off silently.
 * Returns a sentence describing it, or ''.
 */
function lateDiscount(items, shortfall, date) {
  let due = 0;
  const late = [];
  for (const it of items) {
    const t = it.inv.termsParsed;
    if (!t || it.discount) continue;
    due += discountCents(it.inv.amount, t.bp);
    if (date != null && it.inv.date != null) late.push(`${it.inv.id} paid ${date - it.inv.date} days after its date, ${t.bp / 100}% discount window ${t.days} days`);
  }
  if (!due || due !== shortfall) return '';
  return `The ${fmt(shortfall)} shortfall is exactly the early-payment discount the terms offer, but the window had closed${late.length ? ` (${late.join('; ')})` : ''}. Applied without the discount, so ${fmt(shortfall)} stays open: allow the late discount or ask the customer for it.`;
}

// ---- the matcher ----------------------------------------------------------

export const DEFAULT_SETTINGS = {
  feeTolerance: 2500, // cents a payer's bank may keep before a short-pay is flagged as a dispute
  allowDiscounts: true,
  discountGraceDays: 2, // payments received a couple of days after the window (mail, bank posting) still get the discount offered
  nameThreshold: 0.6,
  maxPool: 40,
};

const fmt = (c) => {
  const a = Math.abs(c);
  return `${c < 0 ? '-' : ''}${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Propose an application for every receipt.
 * invoices: [{ id, customer, date (day number|null), amount (cents), terms }]
 * receipts: [{ id, date (day number|null), amount (cents), payer, reference }]
 * Returns { results, openInvoices, summary }.
 */
export function applyCash(invoicesIn, receiptsIn, userSettings = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };
  const invoices = invoicesIn.map((inv) => ({ ...inv, open: inv.amount, termsParsed: parseTerms(inv.terms) }));
  const byDate = (a, b) => (a.date ?? 0) - (b.date ?? 0) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  invoices.sort(byDate);
  const index = buildReferenceIndex(invoices);
  const customers = [...new Set(invoices.map((i) => i.customer).filter(Boolean))];
  const receipts = receiptsIn.map((r, i) => ({ ...r, order: i })).sort(byDate);

  const results = new Map();
  const ctx = new Map();
  for (const r of receipts) {
    const scored = customers.map((c) => [c, nameScore(`${r.payer} ${r.payer ? '' : r.reference}`, c)]).filter(([, s]) => s >= settings.nameThreshold).sort((a, b) => b[1] - a[1]);
    const best = scored.length ? scored[0][1] : 0;
    const named = new Set(scored.filter(([, s]) => s >= best - 0.05).map(([c]) => c));
    const refs = findReferences(`${r.reference} ${r.payer}`, index, named);
    ctx.set(r, { named, refs, nameScore: best });
  }

  const open = (inv) => inv.open > 0;
  const commit = (r, items, method, confidence, note, extra = {}) => {
    for (const it of items) it.inv.open -= it.applied + it.discount + (it.writeoff || 0);
    const applied = items.reduce((s, it) => s + it.applied, 0);
    results.set(r, {
      receipt: r,
      applications: items.map((it) => ({ invoice: it.inv.id, customer: it.inv.customer, applied: it.applied, discount: it.discount, writeoff: it.writeoff || 0, leftOpen: it.inv.open })),
      unapplied: r.amount - applied,
      method,
      confidence,
      note,
      ...extra,
    });
  };

  // Pass 1: the remittance names invoices.
  for (const r of receipts) {
    const { refs } = ctx.get(r);
    const live = refs.filter(open).sort(byDate);
    if (!live.length) continue;
    const exact = findSubsets(live, r.amount, r.date, settings);
    if (exact.solutions.length) {
      const s = exact.solutions[0];
      const disc = s.items.filter((x) => x.discount).length;
      const all = s.items.length === live.length;
      const note = `Remittance names ${plural(live.length, 'open invoice')}; ${all ? 'the payment equals ' + (live.length === 1 ? 'it' : 'their total') : 'the payment equals ' + plural(s.items.length, 'of them') + ' (' + s.items.map((x) => x.inv.id).join(', ') + ')'}${disc ? `, after the early-payment discount on ${plural(disc, 'invoice')}` : ''}.`;
      commit(r, s.items, 'reference + amount', all ? 'high' : 'medium', note);
      continue;
    }
    const total = live.reduce((s, inv) => s + inv.open, 0);
    const short = total - r.amount;
    const lateRef = short > 0 ? lateDiscount(live.map((inv) => ({ inv, discount: 0 })), short, r.date) : '';
    if (lateRef) {
      let left = r.amount;
      const items = [];
      for (const inv of live) { const a = Math.min(inv.open, left); if (a > 0) items.push({ inv, applied: a, discount: 0 }); left -= a; }
      commit(r, items, 'reference, discount taken late', 'review', `Remittance names ${plural(live.length, 'invoice')} totalling ${fmt(total)}. ${lateRef}`);
      continue;
    }
    if (short > 0 && short <= settings.feeTolerance) {
      const items = live.map((inv) => ({ inv, applied: inv.open, discount: 0 }));
      const last = items[items.length - 1];
      last.applied -= short;
      last.writeoff = short;
      commit(r, items, 'reference + amount less fee', 'medium', `Remittance names ${plural(live.length, 'invoice')} totalling ${fmt(total)}; the payment is ${fmt(short)} short, within the ${fmt(settings.feeTolerance)} you accept as a bank charge. The shortfall is shown as a write-off on ${last.inv.id}.`);
      continue;
    }
    if (short > 0) {
      // Short-pay: apply oldest first, leave the rest open, flag it.
      let left = r.amount;
      const items = [];
      for (const inv of live) {
        if (left <= 0) break;
        const a = Math.min(inv.open, left);
        items.push({ inv, applied: a, discount: 0 });
        left -= a;
      }
      commit(r, items, 'reference, short-paid', 'review', `Remittance names ${plural(live.length, 'invoice')} totalling ${fmt(total)} but the payment is ${fmt(short)} short (${((short / total) * 100).toFixed(1)}%). Applied oldest first; the balance stays open. Ask the customer whether this is a dispute, a deduction or a missed discount.`);
      continue;
    }
    // Overpaid against the named invoices: apply them, then look for the rest.
    const items = live.map((inv) => ({ inv, applied: inv.open, discount: 0 }));
    const rest = r.amount - total;
    const { named } = ctx.get(r);
    const custs = new Set([...named, ...live.map((i) => i.customer)]);
    const pool = invoices.filter((inv) => open(inv) && custs.has(inv.customer) && !live.includes(inv));
    const more = findSubsets(pool, rest, r.date, settings);
    if (more.solutions.length === 1) {
      const all = items.concat(more.solutions[0].items);
      commit(r, all, 'reference + customer sum', 'medium', `Remittance names ${plural(live.length, 'invoice')} (${fmt(total)}); the other ${fmt(rest)} equals ${plural(more.solutions[0].items.length, 'more open invoice')} of the same customer (${more.solutions[0].items.map((x) => x.inv.id).join(', ')}).`);
    } else {
      commit(r, items, 'reference, overpaid', 'review', `Remittance names ${plural(live.length, 'invoice')} totalling ${fmt(total)}; the payment is ${fmt(rest)} more. The named invoices are applied and ${fmt(rest)} is left unapplied${more.solutions.length > 1 ? ' (several other invoice combinations add up to it)' : ''}: a credit on account, a prepayment or a payment for an invoice not in this list.`);
    }
  }

  // Pass 2: recognised customer, amounts add up.
  for (const r of receipts) {
    if (results.has(r)) continue;
    const { named } = ctx.get(r);
    if (!named.size) continue;
    const pool = invoices.filter((inv) => open(inv) && named.has(inv.customer));
    if (!pool.length) continue;
    let found = findSubsets(pool, r.amount, r.date, settings);
    let feeNote = '';
    if (!found.solutions.length && settings.feeTolerance > 0) {
      found = findSubsets(pool, r.amount, r.date, settings, { feeTol: settings.feeTolerance });
      if (found.solutions.length) feeNote = 'fee';
    }
    if (!found.solutions.length) {
      // One open invoice and a smaller payment: a partial payment on it.
      if (pool.length === 1 && r.amount < pool[0].open) {
        const inv = pool[0];
        commit(r, [{ inv, applied: r.amount, discount: 0 }], 'customer, partial payment', 'review', `Payer recognised as ${inv.customer}, whose only open invoice is ${inv.id} for ${fmt(inv.open)}. The payment covers ${((r.amount / inv.open) * 100).toFixed(1)}% of it; applied as a partial payment, ${fmt(inv.open - r.amount)} stays open. Confirm it is an instalment and not a payment for something else.`);
      }
      continue;
    }
    const s = found.solutions[0];
    const items = s.items.map((x) => ({ ...x }));
    const lateNote = s.fee ? lateDiscount(items, s.fee, r.date) : '';
    if (lateNote) {
      const last = items[items.length - 1];
      last.applied -= s.fee;
      commit(r, items, 'customer, discount taken late', 'review', `Payer recognised as ${[...new Set(items.map((x) => x.inv.customer))].join(', ')}; the payment matches ${items.map((x) => x.inv.id).join(', ')} less a discount. ${lateNote}`);
      continue;
    }
    if (s.fee) {
      const last = items[items.length - 1];
      last.applied -= s.fee;
      last.writeoff = s.fee;
    }
    const ambiguous = found.solutions.length > 1;
    const disc = items.filter((x) => x.discount).length;
    const who = [...new Set(items.map((x) => x.inv.customer))].join(', ');
    let note = `Payer recognised as ${who}; the payment equals ${items.length === 1 ? 'open invoice ' + items[0].inv.id : 'the total of ' + plural(items.length, 'open invoice') + ' (' + items.map((x) => x.inv.id).join(', ') + ')'}`;
    if (disc) note += `, after the early-payment discount on ${plural(disc, 'invoice')}`;
    if (feeNote) note += `, less ${fmt(s.fee)} kept as a bank charge (within your ${fmt(settings.feeTolerance)} tolerance)`;
    note += '.';
    if (ambiguous) note += ` Another combination of this customer's invoices adds up to the same amount, so the oldest were chosen; check the remittance before posting.`;
    const confidence = ambiguous ? 'review' : items.length === 1 && !feeNote ? 'high' : 'medium';
    commit(r, items, feeNote ? 'customer + amount less fee' : items.length === 1 ? 'customer + amount' : 'customer + sum of invoices', confidence, note, ambiguous ? { alternatives: found.solutions.length - 1 } : {});
  }

  // Pass 3: amount only.
  for (const r of receipts) {
    if (results.has(r)) continue;
    const hits = [];
    for (const inv of invoices) {
      if (!open(inv)) continue;
      for (const o of options(inv, r.date, settings)) if (o.applied === r.amount) { hits.push({ inv, ...o }); break; }
    }
    if (hits.length === 1) {
      const h = hits[0];
      commit(r, [h], 'amount only', 'review', `No invoice number in the remittance and the payer name "${r.payer || '(blank)'}" matches no customer, but exactly one open invoice (${h.inv.id}, ${h.inv.customer || 'no customer name'}) ${h.discount ? 'settles for this amount after its early-payment discount' : 'is for this amount'}. Confirm the payer before posting.`);
    } else {
      const { named, nameScore: ns } = ctx.get(r);
      let note;
      if (hits.length > 1) note = `${hits.length} open invoices are for exactly this amount (${hits.slice(0, 4).map((h) => h.inv.id).join(', ')}${hits.length > 4 ? ', ...' : ''}) and nothing in the payer name or remittance tells them apart.`;
      else if (named.size) note = `Payer looks like ${[...named].join(' or ')}, but no combination of their open invoices adds up to ${fmt(r.amount)}${settings.feeTolerance ? ` (even allowing ${fmt(settings.feeTolerance)} of bank charges)` : ''}. A partial payment, a payment for an invoice not in the list, or an older balance.`;
      else note = `No invoice number found, the payer name matches no customer${ns ? '' : ''}, and no single open invoice is for this amount. Unapplied cash: find the remittance advice.`;
      results.set(r, { receipt: r, applications: [], unapplied: r.amount, method: 'unmatched', confidence: 'none', note, candidates: hits.slice(0, 4).map((h) => h.inv.id) });
    }
  }

  const ordered = receipts.slice().sort((a, b) => a.order - b.order).map((r) => results.get(r));
  const count = (c) => ordered.filter((x) => x.confidence === c).length;
  const appliedCents = ordered.reduce((s, x) => s + x.applications.reduce((t, a) => t + a.applied, 0), 0);
  const receivedCents = ordered.reduce((s, x) => s + x.receipt.amount, 0);
  return {
    results: ordered,
    openInvoices: invoices.filter(open).map((inv) => ({ id: inv.id, customer: inv.customer, date: inv.date, amount: inv.amount, open: inv.open })),
    summary: {
      receipts: ordered.length,
      high: count('high'),
      medium: count('medium'),
      review: count('review'),
      unmatched: count('none'),
      receivedCents,
      appliedCents,
      discountCents: ordered.reduce((s, x) => s + x.applications.reduce((t, a) => t + a.discount, 0), 0),
      unappliedCents: receivedCents - appliedCents,
    },
  };
}

export { DAY_MS };
