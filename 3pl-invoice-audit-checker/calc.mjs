// 3PL invoice audit checker: pure, deterministic, no I/O, no dependencies.
//
// Model (all of it is stated on the page, so the numbers can be checked by hand):
//   * Each invoice line is sorted into a rate-card category from its description
//     (or from an explicit `category` column). Unrecognised descriptions are
//     "not in the rate card".
//   * Expected amount = contract rate x the quantity the shipper's own records
//     support (WMS snapshot, order export, receiving log). With no record for a
//     category the billed quantity is taken as given and the page says so.
//   * Overcharge on a line = rate part + quantity part + arithmetic part:
//       rate      max(0, billedRate - contractRate) x billedQty
//       quantity  max(0, billedQty - recordedQty) x min(billedRate, contractRate)
//       math      max(0, amount - billedQty x billedRate)
//     capped at the line amount. Under-charges are never netted against these.
//   * A repeat of an earlier line (same description, qty, rate and amount) is a
//     duplicate: the whole repeat is recoverable and no other check runs on it.
//   * A charge with no rate-card fee behind it is recoverable in full, pending
//     a written agreement.
//   * Account minimum: the 3PL may bill only the shortfall between the minimum
//     and what the month's other (corrected) charges come to. A minimum line on
//     top of charges that already reach the minimum is billed twice.
//   * Fuel and handling surcharges are a percent of the corrected receiving,
//     pick, pack, returns and kitting charges (storage and other surcharges are
//     not in the base).

export const CATEGORIES = {
  receiving_pallet: { label: 'Receiving per pallet', card: 'receivingPerPallet', record: 'palletsReceived', section: 'Receiving / inbound schedule', recordName: 'Receiving log or ASN (pallets received)', unit: 'pallet' },
  receiving_carton: { label: 'Receiving per carton', card: 'receivingPerCarton', record: 'cartonsReceived', section: 'Receiving / inbound schedule', recordName: 'Receiving log or ASN (cartons received)', unit: 'carton' },
  storage_pallet: { label: 'Storage per pallet per month', card: 'storagePerPalletMonth', record: 'avgPalletsOnHand', section: 'Storage schedule', recordName: 'WMS inventory snapshots (daily pallet positions, averaged over the month)', unit: 'pallet' },
  storage_bin: { label: 'Storage per bin per month', card: 'storagePerBinMonth', record: 'avgBinsOnHand', section: 'Storage schedule', recordName: 'WMS inventory snapshots (daily bin positions, averaged over the month)', unit: 'bin' },
  long_term_storage: { label: 'Long-term storage surcharge', card: 'longTermStoragePerPalletMonth', record: 'longTermPallets', section: 'Storage schedule, long-term storage clause', recordName: 'WMS inventory snapshot with received-date ageing (pallets past the free-storage window)', unit: 'pallet' },
  pick_first: { label: 'Pick fee, first unit', card: 'pickFirst', record: 'ordersShipped', section: 'Pick and pack schedule', recordName: 'Order export (orders shipped in the period)', unit: 'order' },
  pick_additional: { label: 'Pick fee, each additional unit', card: 'pickAdditional', record: 'additionalUnits', section: 'Pick and pack schedule', recordName: 'Order export (units shipped minus orders shipped)', unit: 'unit' },
  pack: { label: 'Pack and materials', card: 'packPerOrder', record: 'ordersShipped', section: 'Pick and pack schedule, packaging materials', recordName: 'Order export (orders shipped in the period)', unit: 'order' },
  returns: { label: 'Returns processing', card: 'returnsPerUnit', record: 'returnsProcessed', section: 'Returns schedule', recordName: 'Returns (RMA) log from the WMS', unit: 'return' },
  kitting: { label: 'Kitting', card: 'kittingPerKit', record: 'kitsAssembled', section: 'Value-added services schedule', recordName: 'Kit work-order log', unit: 'kit' },
  minimum: { label: 'Account minimum', card: 'accountMinimum', record: null, section: 'Account minimum clause', recordName: 'The rest of the same invoice', unit: 'month' },
  fuel: { label: 'Fuel surcharge', card: 'fuelSurchargePct', record: null, section: 'Surcharge clause (fuel)', recordName: 'The corrected base charges on the same invoice', unit: 'percent' },
  handling: { label: 'Handling surcharge', card: 'handlingSurchargePct', record: null, section: 'Surcharge clause (handling)', recordName: 'The corrected base charges on the same invoice', unit: 'percent' },
};

export const RATE_CARD_FIELDS = [
  'receivingPerPallet', 'receivingPerCarton', 'storagePerPalletMonth', 'storagePerBinMonth', 'longTermStoragePerPalletMonth',
  'pickFirst', 'pickAdditional', 'packPerOrder', 'returnsPerUnit', 'kittingPerKit', 'accountMinimum', 'fuelSurchargePct', 'handlingSurchargePct',
];
export const RECORD_FIELDS = [
  'ordersShipped', 'unitsShipped', 'palletsReceived', 'cartonsReceived', 'avgPalletsOnHand', 'avgBinsOnHand', 'longTermPallets', 'returnsProcessed', 'kitsAssembled',
];

const BASE_CATEGORIES = new Set(['receiving_pallet', 'receiving_carton', 'pick_first', 'pick_additional', 'pack', 'returns', 'kitting']);
const RATE_EPS = 0.00005;

const cents = (x) => Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100;

function optionalNumber(label, value, { max = Infinity, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  if (n < 0) throw new Error(`${label} cannot be negative.`);
  if (n > max) throw new Error(`${label} must be at most ${max}.`);
  if (integer && !Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  return n;
}

export function normalizeRateCard(raw) {
  const r = raw || {};
  const out = {};
  for (const k of RATE_CARD_FIELDS) {
    out[k] = optionalNumber(`Rate card: ${k}`, r[k], { max: k.endsWith('Pct') ? 100 : 1e7 });
    // A rate of zero means the fee is not in the contract, the same as blank.
  }
  if (!RATE_CARD_FIELDS.some((k) => out[k] !== null && out[k] > 0)) {
    throw new Error('Enter at least one fee from your rate card.');
  }
  return out;
}

export function normalizeRecords(raw) {
  const r = raw || {};
  const out = {};
  for (const k of RECORD_FIELDS) out[k] = optionalNumber(`Record: ${k}`, r[k], { max: 1e9 });
  return out;
}

function recordQty(records, key) {
  if (key === null) return null;
  if (key === 'additionalUnits') {
    if (records.unitsShipped === null || records.ordersShipped === null) return null;
    return Math.max(0, records.unitsShipped - records.ordersShipped);
  }
  return records[key];
}

// ---------------------------------------------------------------- CSV in

function splitRows(text, delimiter) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (quoted) throw new Error('The invoice has an opening quote that is never closed.');
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function money(label, raw, { allowNegative = false } = {}) {
  let t = String(raw ?? '').trim();
  if (t === '') return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, '');
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`${label} "${raw}" is not a number.`);
  const n = Number(t) * (neg ? -1 : 1);
  if (n < 0 && !allowNegative) throw new Error(`${label} "${raw}" cannot be negative.`);
  return n;
}

const HEADER_ALIASES = {
  description: ['description', 'desc', 'charge', 'item', 'service', 'line'],
  qty: ['qty', 'quantity', 'units', 'count'],
  rate: ['rate', 'unit price', 'unit rate', 'price'],
  amount: ['amount', 'total', 'extended', 'line total', 'charge amount'],
  category: ['category', 'type', 'fee type'],
};

export function parseInvoiceCsv(text) {
  const raw = String(text ?? '');
  if (raw.trim() === '') throw new Error('Paste the invoice lines first: description, qty, rate, amount.');
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim() !== '') || '';
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows = splitRows(raw, delimiter);
  let map = { description: 0, qty: 1, rate: 2, amount: 3, category: 4 };
  let start = 0;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  if (head.some((h) => HEADER_ALIASES.description.includes(h)) && head.some((h, i) => i > 0 && [...HEADER_ALIASES.qty, ...HEADER_ALIASES.rate, ...HEADER_ALIASES.amount].includes(h))) {
    map = {};
    for (const [key, names] of Object.entries(HEADER_ALIASES)) {
      const idx = head.findIndex((h) => names.includes(h));
      if (idx >= 0) map[key] = idx;
    }
    if (map.description === undefined || map.amount === undefined) throw new Error('The header row needs at least description and amount columns.');
    start = 1;
  }
  const lines = [];
  for (let i = start; i < rows.length; i++) {
    const n = i + 1;
    const cells = rows[i];
    const cell = (key) => (map[key] === undefined ? '' : (cells[map[key]] ?? ''));
    const description = cell('description').trim();
    if (!description) throw new Error(`Invoice row ${n}: the description is empty.`);
    const amount = money(`Invoice row ${n}: amount`, cell('amount'), { allowNegative: true });
    if (amount === null) throw new Error(`Invoice row ${n}: the amount is empty.`);
    let qty = money(`Invoice row ${n}: qty`, cell('qty'), { allowNegative: true });
    let rate = money(`Invoice row ${n}: rate`, cell('rate'), { allowNegative: true });
    if (qty === null && rate !== null && rate !== 0) qty = amount / rate;
    if (qty === null) qty = 1;
    if (rate === null) rate = qty !== 0 ? amount / qty : amount;
    const category = cell('category').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (category && !CATEGORIES[category]) {
      throw new Error(`Invoice row ${n}: category "${category}" is not one of ${Object.keys(CATEGORIES).join(', ')}.`);
    }
    lines.push({ description, qty, rate, amount, category: category || null });
  }
  if (lines.length === 0) throw new Error('The invoice has a header but no lines.');
  return lines;
}

// ---------------------------------------------------------- classification

export function classifyDescription(description, card = {}) {
  const d = String(description).toLowerCase();
  if (/\b(minimum|min\.?\s*(monthly|account|fee|charge)|monthly\s*min)\b/.test(d)) return { category: 'minimum' };
  if (/\bfuel\b/.test(d)) return { category: 'fuel' };
  if (/long[\s-]*term|\blts\b|aged\s+inventory|over\s*(90|180|365)|(90|180|365)\+?\s*days?/.test(d)) return { category: 'long_term_storage' };
  if (/\bstorage\b|\bstor\b|\bwarehousing\b/.test(d)) {
    return { category: /\b(bin|shelf|shelving|tote)\b/.test(d) ? 'storage_bin' : 'storage_pallet' };
  }
  if (/\breturns?\b|\brma\b/.test(d)) return { category: 'returns' };
  if (/\bkit(s|ting)?\b|\bassembly\b/.test(d)) return { category: 'kitting' };
  if (/\breceiv|\binbound\b|\bunload|\bput-?away\b/.test(d)) {
    if (/\bpallet|\bplt\b/.test(d)) return { category: 'receiving_pallet' };
    if (/\bcarton|\bcase|\bctn\b|\bbox/.test(d)) return { category: 'receiving_carton' };
    const hasP = card.receivingPerPallet > 0; const hasC = card.receivingPerCarton > 0;
    if (hasP && !hasC) return { category: 'receiving_pallet' };
    if (hasC && !hasP) return { category: 'receiving_carton' };
    if (hasP && hasC) return { category: null, ambiguous: 'Receiving line does not say pallet or carton; add a category column.' };
    return { category: 'receiving_pallet' };
  }
  if (/\bpick/.test(d)) {
    return { category: /additional|addl|add'l|extra|subsequent|each\s+add|2nd|second/.test(d) ? 'pick_additional' : 'pick_first' };
  }
  if (/\bpack|\bmaterial|\bmailer|\bdunnage|\bvoid\s*fill|\bbox(es)?\b|\bcarton\b/.test(d)) return { category: 'pack' };
  if (/\bhandling\b/.test(d)) return { category: 'handling' };
  return { category: null };
}

const ISSUE_LABELS = {
  duplicate: 'Duplicate of an earlier line',
  unlisted: 'Charge not in the rate card',
  rate: 'Rate above contract',
  quantity: 'Quantity above what your records show',
  storage: 'Storage billed on more positions than average on-hand',
  math: 'Amount is more than quantity x rate',
  minimum: 'Account minimum billed on top of charges that already reach it',
  minimum_excess: 'Account minimum top-up larger than the shortfall',
  surcharge: 'Surcharge above the contracted percent of the base charges',
};

const key = (l) => `${l.description.toLowerCase().replace(/\s+/g, ' ')}|${l.qty}|${l.rate}|${l.amount}`;

// ------------------------------------------------------------------- audit

export function auditInvoice(rawInput) {
  const input = rawInput || {};
  const card = normalizeRateCard(input.rateCard);
  const records = normalizeRecords(input.records);
  const parsed = Array.isArray(input.lines) ? input.lines : parseInvoiceCsv(input.invoiceCsv);
  if (parsed.length === 0) throw new Error('The invoice has no lines.');

  const seen = new Set();
  const lines = parsed.map((p, i) => {
    const description = String(p.description ?? '').trim();
    if (!description) throw new Error(`Invoice row ${i + 1}: the description is empty.`);
    for (const f of ['qty', 'rate', 'amount']) {
      if (typeof p[f] !== 'number' || !Number.isFinite(p[f])) throw new Error(`Invoice row ${i + 1}: ${f} must be a number.`);
    }
    const cls = p.category ? { category: p.category } : classifyDescription(description, card);
    const line = {
      index: i + 1, description, qty: p.qty, rate: p.rate, amount: p.amount,
      category: cls.category, categoryLabel: cls.category ? CATEGORIES[cls.category].label : 'Not in rate card',
      contractRate: null, recordedQty: null, expectedAmount: null, overcharge: 0, issues: [], proof: [], status: 'ok', note: '',
    };
    if (cls.ambiguous) { line.status = 'needs-review'; line.note = cls.ambiguous; }
    const k = key({ ...line });
    if (line.amount > 0 && seen.has(k)) line.duplicate = true;
    seen.add(k);
    return line;
  });

  const addIssue = (line, type, dollars, detail, proof) => {
    const d = cents(dollars);
    if (d <= 0) return;
    line.issues.push({ type, label: ISSUE_LABELS[type], dollars: d, detail });
    for (const p of proof) if (!line.proof.includes(p)) line.proof.push(p);
  };
  const contractProof = (cat) => `Signed contract: ${CATEGORIES[cat].section}`;

  // Pass 1: duplicates, unlisted charges and per-unit fees.
  for (const line of lines) {
    if (line.amount < 0) { line.status = 'credit'; line.note = 'Credit; not audited.'; continue; }
    if (line.duplicate) {
      addIssue(line, 'duplicate', line.amount, `Same description, quantity, rate and amount as an earlier line.`,
        ['The invoice itself (the matching earlier line)', line.category && CATEGORIES[line.category].record ? CATEGORIES[line.category].recordName : 'Activity record for the period']);
      continue;
    }
    if (line.status === 'needs-review') continue;
    const cat = line.category;
    if (!cat || !(card[CATEGORIES[cat].card] > 0)) {
      if (cat === 'minimum' || cat === 'fuel' || cat === 'handling') {
        const noun = CATEGORIES[cat].label.toLowerCase();
        addIssue(line, 'unlisted', line.amount, `The rate card has no ${noun}.`, [`Signed contract: no ${noun} appears in the fee schedules`, 'Any written amendment or rate notice the 3PL relies on']);
      } else {
        addIssue(line, 'unlisted', line.amount, cat ? `The rate card has no ${CATEGORIES[cat].label.toLowerCase()} fee.` : 'No fee in the rate card matches this description.',
          ['Signed contract: the full rate schedule (no matching fee)', 'Any written amendment or rate notice the 3PL relies on']);
      }
      line.expectedAmount = 0;
      continue;
    }
    if (cat === 'minimum' || cat === 'fuel' || cat === 'handling') continue; // pass 2
    const meta = CATEGORIES[cat];
    const contractRate = card[meta.card];
    line.contractRate = contractRate;
    const actual = recordQty(records, meta.record);
    line.recordedQty = actual;
    const effQty = actual !== null ? actual : line.qty;
    line.expectedAmount = cents(contractRate * effQty);
    const rateOver = Math.max(0, line.rate - contractRate) * line.qty;
    const qtyOver = actual !== null ? Math.max(0, line.qty - actual) * Math.min(line.rate, contractRate) : 0;
    const mathOver = Math.max(0, line.amount - line.qty * line.rate);
    if (line.rate - contractRate > RATE_EPS) {
      addIssue(line, 'rate', rateOver, `Billed ${fmt(line.rate)} per ${meta.unit}; contract is ${fmt(contractRate)}.`, [contractProof(cat)]);
    }
    if (actual !== null && line.qty > actual) {
      const type = cat === 'storage_pallet' || cat === 'storage_bin' ? 'storage' : 'quantity';
      addIssue(line, type, qtyOver, `Billed ${trim(line.qty)} ${meta.unit}${line.qty === 1 ? '' : 's'}; your records show ${trim(actual)}.`, [meta.recordName]);
    }
    if (mathOver > 0.005) {
      addIssue(line, 'math', mathOver, `${trim(line.qty)} x ${fmt(line.rate)} is ${fmt(cents(line.qty * line.rate))}, but the line says ${fmt(line.amount)}.`, ['The invoice itself (re-multiply quantity and rate)']);
    }
  }

  const finalize = (line) => {
    const total = line.issues.reduce((s, x) => s + x.dollars, 0);
    line.overcharge = cents(Math.min(total, Math.max(0, line.amount)));
    if (line.overcharge > 0) line.status = 'overcharge';
  };
  for (const line of lines) finalize(line);

  const owed = (l) => cents(l.amount - l.overcharge);

  // Pass 2: account minimum.
  const owedExMinimum = lines.filter((l) => l.category !== 'minimum' && l.amount > 0).reduce((s, l) => s + owed(l), 0);
  for (const line of lines.filter((l) => l.category === 'minimum' && !l.duplicate && l.amount > 0 && card.accountMinimum > 0 && l.status !== 'overcharge')) {
    const topUp = Math.max(0, card.accountMinimum - owedExMinimum);
    line.contractRate = card.accountMinimum;
    line.expectedAmount = cents(topUp);
    const proof = [contractProof('minimum'), 'The rest of the same invoice (sum of the other charges)'];
    if (topUp === 0) {
      addIssue(line, 'minimum', line.amount, `Other charges come to ${fmt(cents(owedExMinimum))}, already over the ${fmt(card.accountMinimum)} minimum, so nothing is owed on top.`, proof);
    } else if (line.amount - topUp > 0.005) {
      addIssue(line, 'minimum_excess', line.amount - topUp, `Only ${fmt(cents(topUp))} is needed to reach the ${fmt(card.accountMinimum)} minimum.`, proof);
    }
    finalize(line);
  }

  // Pass 3: surcharges on the corrected base.
  const base = lines.filter((l) => BASE_CATEGORIES.has(l.category) && !l.duplicate && l.amount > 0).reduce((s, l) => s + owed(l), 0);
  for (const line of lines.filter((l) => (l.category === 'fuel' || l.category === 'handling') && !l.duplicate && l.amount > 0 && card[CATEGORIES[l.category].card] > 0 && l.status !== 'overcharge')) {
    const pct = card[CATEGORIES[line.category].card];
    const expected = cents(base * pct / 100);
    line.contractRate = pct;
    line.expectedAmount = expected;
    if (line.amount - expected > 0.005) {
      const billedPct = base > 0 ? Math.round(line.amount / base * 10000) / 100 : null;
      addIssue(line, 'surcharge', line.amount - expected,
        `${pct}% of ${fmt(cents(base))} of base charges is ${fmt(expected)}${billedPct === null ? '' : `; the line works out to ${billedPct}%`}.`,
        [contractProof(line.category), CATEGORIES[line.category].recordName]);
      finalize(line);
    }
  }

  const unverified = [];
  for (const line of lines) {
    if (line.category && CATEGORIES[line.category].record && line.recordedQty === null && line.status !== 'credit' && !line.duplicate && card[CATEGORIES[line.category].card] > 0) {
      line.note = `No ${CATEGORIES[line.category].unit} count entered, so quantity was taken as billed.`;
      if (!unverified.includes(line.category)) unverified.push(line.category);
    }
  }

  const ranked = lines.filter((l) => l.overcharge > 0).sort((a, b) => b.overcharge - a.overcharge || a.index - b.index);
  ranked.forEach((l, i) => { l.rank = i + 1; });
  const totalBilled = cents(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const credits = cents(lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  const recoverable = cents(ranked.reduce((s, l) => s + l.overcharge, 0));
  const byType = {};
  for (const l of lines) for (const x of l.issues) byType[x.type] = cents((byType[x.type] || 0) + x.dollars);
  // Issue dollars can exceed a line's capped overcharge; report byType only as issue totals.
  return {
    card, records, lines, ranked,
    totals: {
      billed: totalBilled, credits, recoverable,
      supported: cents(totalBilled - recoverable),
      recoverablePct: totalBilled > 0 ? Math.round(recoverable / totalBilled * 10000) / 100 : 0,
      flaggedLines: ranked.length,
    },
    byType,
    needsReview: lines.filter((l) => l.status === 'needs-review'),
    unverified: unverified.map((c) => CATEGORIES[c].label),
  };
}

function fmt(n) {
  const r = Math.round(n * 10000) / 10000;
  const decimals = Math.max(2, (String(r).split('.')[1] || '').length);
  return '$' + r.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function trim(n) { return String(Math.round(n * 1000) / 1000); }

// -------------------------------------------------------------- text output

export function disputeNote(result, opts = {}) {
  const o = opts || {};
  const vendor = String(o.threePl || '').trim() || 'your billing team';
  const inv = String(o.invoiceNumber || '').trim();
  const brand = String(o.brand || '').trim();
  const money2 = (n) => '$' + cents(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out = [];
  out.push(`Subject: Billing dispute${inv ? ` for invoice ${inv}` : ''}: ${money2(result.totals.recoverable)} to review`);
  out.push('');
  out.push(`Hello ${vendor === 'your billing team' ? 'team' : vendor},`);
  out.push('');
  if (result.ranked.length === 0) {
    out.push(`We compared invoice${inv ? ` ${inv}` : ''} with our rate card and our own records and found no differences. No action is needed.`);
  } else {
    out.push(`We compared invoice${inv ? ` ${inv}` : ''} (${money2(result.totals.billed)}) with the rate card in our agreement and our own records, and we believe ${result.ranked.length} line${result.ranked.length === 1 ? '' : 's'} total ${money2(result.totals.recoverable)} more than the agreement supports. Please review and issue a credit or send the supporting detail.`);
    out.push('');
    for (const l of result.ranked) {
      out.push(`${l.rank}. Line ${l.index}, "${l.description}" billed ${money2(l.amount)}: ${money2(l.overcharge)} in question`);
      for (const x of l.issues) out.push(`   - ${x.label}. ${x.detail}`);
      out.push(`   Supporting records: ${l.proof.join('; ')}.`);
    }
    out.push('');
    out.push('We are happy to share the underlying exports. If any of these charges is covered by a written amendment, please send it and we will update our records.');
  }
  if (result.unverified.length) {
    out.push('');
    out.push(`Note: we did not check quantities for ${result.unverified.join(', ')}.`);
  }
  out.push('');
  out.push('Thank you,');
  out.push(brand || '[Your name]');
  return out.join('\n');
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(result) {
  const rows = [['rank', 'line', 'description', 'category', 'qty', 'rate', 'amount', 'contract_rate', 'records_qty', 'expected_amount', 'recoverable', 'issues', 'proving_records', 'note']];
  const order = [...result.ranked, ...result.lines.filter((l) => l.overcharge === 0)];
  for (const l of order) {
    rows.push([l.rank ?? '', l.index, l.description, l.categoryLabel, l.qty, l.rate, l.amount, l.contractRate ?? '', l.recordedQty ?? '', l.expectedAmount ?? '', l.overcharge, l.issues.map((x) => x.label).join('; '), l.proof.join('; '), l.note]);
  }
  rows.push([]);
  rows.push(['total_billed', result.totals.billed]);
  rows.push(['total_recoverable', result.totals.recoverable]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ----------------------------------------------------------- shareable link

const META_KEYS = ['threePl', 'invoiceNumber', 'brand'];

export function encodeState(values) {
  const p = new URLSearchParams();
  for (const k of [...RATE_CARD_FIELDS, ...RECORD_FIELDS, ...META_KEYS]) {
    if (values[k] !== undefined && values[k] !== null && String(values[k]) !== '') p.set(k, String(values[k]));
  }
  if (typeof values.invoiceCsv === 'string' && values.invoiceCsv.trim()) p.set('invoiceCsv', values.invoiceCsv.replace(/\r\n?/g, '\n'));
  return p.toString();
}

export function decodeState(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^[#?]/, ''));
  const out = {};
  for (const k of [...RATE_CARD_FIELDS, ...RECORD_FIELDS, ...META_KEYS, 'invoiceCsv']) if (p.has(k)) out[k] = p.get(k);
  return out;
}

// Convenience: the page keeps every input flat; the audit wants them grouped.
export function auditFromFlat(values) {
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, values[k]]));
  return auditInvoice({ rateCard: pick(RATE_CARD_FIELDS), records: pick(RECORD_FIELDS), invoiceCsv: values.invoiceCsv });
}
