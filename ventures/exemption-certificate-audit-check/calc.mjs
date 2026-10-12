// Exemption and resale certificate audit check: reads a sales list and a list of the certificates
// on file, and finds the sales that were invoiced without tax on a claim of exemption but have no
// usable certificate behind them. In a sales tax audit those are the sales the auditor assesses
// first, because the seller bears the tax unless it can produce a valid certificate.
//
// What it decides: for each exempt sale, whether a certificate for that customer and state is on
// file, was dated by the sale (or later), was still in date, and covers the stated reason; the
// tax at stake at the rate you give; and which customers to chase first. What it does not decide:
// whether a state accepts a late certificate, how long a state lets a certificate live, whether a
// buyer's exemption is valid, or the look-back period an auditor may use. Those are the state's
// rules and the user's to enter. Nothing in this module touches the network or the DOM.

const DAY = 86400000;

const ALIASES = {
  invoice: ["invoice", "invoice number", "invoice no", "invoice #", "doc", "document", "order", "order number", "reference", "id"],
  date: ["date", "invoice date", "sale date", "transaction date", "ship date"],
  customer: ["customer", "customer name", "buyer", "bill to", "sold to", "name", "company", "purchaser"],
  state: ["state", "ship to state", "ship state", "destination state", "ship to", "jurisdiction", "st"],
  amount: ["amount", "sale amount", "net sales", "subtotal", "exempt amount", "exempt sales", "total", "sales"],
  tax: ["tax", "tax charged", "sales tax", "tax collected", "tax amount"],
  reason: ["exemption reason", "exempt reason", "reason", "exemption", "exempt", "tax status", "tax code", "tax class", "exemption type"],
  // certificate list
  certNo: ["certificate number", "certificate no", "certificate", "cert number", "cert no", "cert #", "exemption number", "permit number", "resale id", "registration number", "tax id"],
  certType: ["certificate type", "cert type", "type", "exemption type", "exemption reason", "reason", "use"],
  signed: ["date signed", "signed", "date received", "received", "issued", "date issued", "effective", "effective date", "date on certificate", "certificate date", "date"],
  expires: ["expires", "expiration", "expiration date", "expiry", "valid until", "valid through", "expires on", "exp date"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9#&]+/g, " ").trim();
const SUFFIX = /\b(incorporated|inc|llc|l l c|ltd|limited|corp|corporation|co|company|lp|llp|pllc|pc)\b/g;
// "Acme Supply, Inc." and "ACME SUPPLY INC" are one buyer; a name that differs by a word is not.
export const customerKey = (s) => norm(s).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false, line = 1, rowLine = 1;
  const src = String(text).replace(/^﻿/, "");
  const push = () => { row.push(cur); cur = ""; };
  const endRow = () => { push(); if (row.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells: row }); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; cur += c; }
    } else if (c === '"' && cur === "") q = true;
    else if (c === "," || c === "\t") push();
    else if (c === "\n") { endRow(); line++; rowLine = line; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) endRow();
  return rows;
}

// Money in cents. Parentheses and a leading minus are negative. null when blank, NaN when unreadable.
export function parseMoney(s) {
  let t = String(s ?? "").trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const cents = Math.round(Number(t) * 100);
  return neg ? -cents : cents;
}

// "6.25", "6.25%" or "0.0625" all mean 6.25 percent: a figure under 1 is read as a fraction.
export function parseRate(s) {
  const t = String(s ?? "").trim().replace(/%$/, "");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  if (n >= 100) return NaN;
  return n < 1 && !String(s).includes("%") ? n * 100 : n;
}

// ISO, M/D/YYYY (US order) or M/D/YY. UTC day number, null when blank, NaN when unreadable.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return Math.round(dt.getTime() / DAY);
}
export const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addYears = (n, years) => {
  const d = new Date(n * DAY);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return Math.round(d.getTime() / DAY);
};
export const dollars = (cents) => (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const BY_NAME = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [norm(v), k]));
// A state as typed ("Texas", "tx", "TX ") becomes its two-letter code; anything else is null.
export function stateCode(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const up = t.toUpperCase().replace(/[^A-Z]/g, "");
  if (STATES[up]) return up;
  return BY_NAME[norm(t)] || null;
}

// Free-text reasons from an invoicing system, folded to a few families so "Resale", "For resale"
// and "RESALE-WHSL" agree. A certificate has to cover the family the sale claimed.
export function reasonFamily(s) {
  const t = norm(s);
  if (!t) return null;
  if (/\b(no|none|taxable|n a|na|0|false)\b/.test(t) && !/exempt|resale/.test(t)) return null;
  if (/resale|resell|wholesale|reseller|retail|for sale/.test(t)) return "resale";
  if (/manufactur|production|processing|raw material|industrial|ingredient|component/.test(t)) return "manufacturing";
  if (/government|federal|municipal|state agency|city|county|school district|public/.test(t)) return "government";
  if (/non ?profit|charit|church|religious|501|educational|school|university/.test(t)) return "nonprofit";
  if (/agricult|farm|ranch|livestock|crop|ag exempt/.test(t)) return "agriculture";
  if (/contractor|construction|capital improvement|direct pay|dpm/.test(t)) return "direct-pay";
  if (/out of state|interstate|shipped out|export|delivered out|outside/.test(t)) return "interstate";
  return "other";
}
export const FAMILY_LABEL = {
  resale: "resale", manufacturing: "manufacturing", government: "government", nonprofit: "nonprofit", agriculture: "agriculture",
  "direct-pay": "direct pay / contractor", interstate: "out-of-state delivery", other: "other",
};
// Delivery outside the state is proved by shipping records, not by a buyer's certificate.
const NO_CERT_FAMILIES = new Set(["interstate"]);

function mapHeader(cells, fields) {
  const idx = {};
  const heads = cells.map(norm);
  for (const f of fields) {
    for (const n of ALIASES[f]) {
      const i = heads.indexOf(norm(n));
      if (i >= 0 && !Object.values(idx).includes(i)) { idx[f] = i; break; }
    }
  }
  return idx;
}

export const DEFAULTS = {
  asOf: null, // UTC day number the review is run on; set from the clock by the page, or by the caller
  defaultRate: 7, // percent applied to a state with no rate of its own; the user overrides it
  rates: {}, // { TX: 6.25 }
  validityYears: 0, // 0 = a certificate never lapses; otherwise years from the date signed when no expiry is given
  renewalWindowDays: 90,
};

export function readRates(text) {
  const rates = {}, findings = [];
  for (const { line, cells } of parseCsv(text || "")) {
    const st = stateCode(cells[0]);
    if (!st && norm(cells[0]) === "state") continue;
    const r = parseRate(cells[1]);
    if (!st) { findings.push({ severity: "warning", line, title: "Rate row skipped", detail: `"${cells[0]}" is not a US state. Use a two-letter code or the state name, then the combined rate.` }); continue; }
    if (r === null || Number.isNaN(r)) { findings.push({ severity: "warning", line, title: "Rate row skipped", detail: `"${cells[1] ?? ""}" is not a readable rate for ${st}.` }); continue; }
    rates[st] = r;
  }
  return { rates, findings };
}

export function readCertificates(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const findings = [], certs = [];
  const raw = parseCsv(text || "");
  if (!raw.length) return { certs, findings };
  const idx = mapHeader(raw[0].cells, ["customer", "state", "certNo", "certType", "signed", "expires"]);
  for (const need of ["customer", "state"]) {
    if (!(need in idx)) findings.push({ severity: "error", line: raw[0].line, title: `Certificate list has no ${need} column`, detail: `Add a column headed "${ALIASES[need][0]}".` });
  }
  if (findings.length) return { certs, findings };
  for (const { line, cells } of raw.slice(1)) {
    const get = (f) => (f in idx ? String(cells[idx[f]] ?? "").trim() : "");
    const customer = get("customer");
    const st = stateCode(get("state"));
    if (!customer) { findings.push({ severity: "warning", line, title: "Certificate row skipped", detail: "No customer name." }); continue; }
    if (!st) { findings.push({ severity: "warning", line, title: "Certificate row skipped", detail: `${customer}: "${get("state")}" is not a US state.` }); continue; }
    const signed = get("signed") ? parseDate(get("signed")) : null;
    if (Number.isNaN(signed)) { findings.push({ severity: "warning", line, title: "Certificate row skipped", detail: `${customer}: "${get("signed")}" is not a readable date.` }); continue; }
    let expires = get("expires") ? parseDate(get("expires")) : null;
    if (Number.isNaN(expires)) { findings.push({ severity: "warning", line, title: "Certificate expiry ignored", detail: `${customer}: "${get("expires")}" is not a readable date, so it was treated as not given.` }); expires = null; }
    let derived = false;
    if (expires === null && signed !== null && o.validityYears > 0) { expires = addYears(signed, o.validityYears); derived = true; }
    const family = reasonFamily(get("certType")) || "resale";
    certs.push({ line, customer, key: customerKey(customer), state: st, certNo: get("certNo"), family, signed, expires, expiryDerived: derived });
  }
  return { certs, findings };
}

export function readSales(text) {
  const findings = [], sales = [];
  const raw = parseCsv(text || "");
  if (!raw.length) return { sales, findings: [{ severity: "error", line: 0, title: "Nothing to read", detail: "Paste or choose a sales list with a header row, then one row per invoice." }], totalRows: 0 };
  const idx = mapHeader(raw[0].cells, ["invoice", "date", "customer", "state", "amount", "tax", "reason"]);
  for (const need of ["date", "customer", "state", "amount"]) {
    if (!(need in idx)) findings.push({ severity: "error", line: raw[0].line, title: `Sales list has no ${need} column`, detail: `Add a column headed "${ALIASES[need][0]}".` });
  }
  if (!("reason" in idx) && !("tax" in idx)) findings.push({ severity: "error", line: raw[0].line, title: "Sales list does not say which sales were exempt", detail: 'Add an "exemption reason" column (blank for taxable sales) or a "tax charged" column.' });
  if (findings.length) return { sales, findings, totalRows: raw.length - 1 };
  for (const { line, cells } of raw.slice(1)) {
    const get = (f) => (f in idx ? String(cells[idx[f]] ?? "").trim() : "");
    const customer = get("customer");
    const date = parseDate(get("date"));
    const amount = parseMoney(get("amount"));
    const st = stateCode(get("state"));
    const tax = "tax" in idx ? parseMoney(get("tax")) : null;
    const reasonText = get("reason");
    const family = reasonFamily(reasonText);
    // Exempt = a reason is given, or (with no reason column) tax was left at zero.
    const exempt = "reason" in idx ? family !== null : tax === 0;
    if (!exempt) continue;
    if (!customer || date === null || Number.isNaN(date) || amount === null || Number.isNaN(amount)) {
      findings.push({ severity: "error", line, title: "Exempt sale cannot be read", detail: `Row ${line}: customer "${customer}", date "${get("date")}" and amount "${get("amount")}" must all be present and readable.` });
      continue;
    }
    if (amount <= 0) {
      findings.push({ severity: "info", line, title: "Credit or zero sale left out", detail: `Row ${line} (${customer}) has an amount of ${dollars(amount)}; credits are not tested.` });
      continue;
    }
    if (tax !== null && !Number.isNaN(tax) && tax > 0 && "reason" in idx) {
      findings.push({ severity: "warning", line, title: "Tax was charged on a sale marked exempt", detail: `Row ${line} (${customer}) charged ${dollars(tax)} yet carries the reason "${reasonText}". It was treated as taxable and not tested.` });
      continue;
    }
    if (!st) {
      findings.push({ severity: "warning", line, title: "Sale skipped: no US state", detail: `Row ${line} (${customer}): "${get("state")}" is not a US state, and the certificate is tested by state.` });
      continue;
    }
    sales.push({ line, invoice: get("invoice") || `row ${line}`, date, customer, key: customerKey(customer), state: st, amount, family: family || "other", reasonText });
  }
  return { sales, findings, totalRows: raw.length - 1 };
}

const STATUS_ORDER = ["missing", "other-state", "expired", "late", "wrong-type", "incomplete", "covered", "not-needed"];
export const STATUS_LABEL = {
  missing: "No certificate on file",
  "other-state": "Certificate is for a different state",
  expired: "Certificate had expired",
  late: "Certificate dated after the sale",
  "wrong-type": "Certificate covers a different reason",
  incomplete: "Certificate has no number",
  covered: "Covered",
  "not-needed": "No buyer certificate expected",
};
const AT_RISK = new Set(["missing", "other-state", "expired", "late", "wrong-type"]);

// Pick the certificate that best supports a sale, and say why a weaker one fell short.
function judge(sale, certsByKey, o) {
  if (NO_CERT_FAMILIES.has(sale.family)) return { status: "not-needed", cert: null };
  const mine = certsByKey.get(sale.key) || [];
  const here = mine.filter((c) => c.state === sale.state);
  if (!here.length) return mine.length ? { status: "other-state", cert: mine[0] } : { status: "missing", cert: null };
  const sameType = here.filter((c) => c.family === sale.family || (sale.family === "other"));
  // A resale certificate is not a manufacturing certificate; a general-purpose "other" claim is let through.
  const pool = sameType.length ? sameType : here;
  const inForce = (c) => (c.signed === null || c.signed <= sale.date) && (c.expires === null || c.expires >= sale.date);
  const good = pool.filter(inForce);
  if (good.length) {
    const c = good.sort((a, b) => (b.signed ?? 0) - (a.signed ?? 0))[0];
    if (!sameType.length) return { status: "wrong-type", cert: c };
    return { status: c.certNo ? "covered" : "incomplete", cert: c };
  }
  const dated = pool.filter((c) => c.signed !== null && c.signed > sale.date);
  const lapsed = pool.filter((c) => c.expires !== null && c.expires < sale.date && (c.signed === null || c.signed <= sale.date));
  if (lapsed.length) return { status: "expired", cert: lapsed.sort((a, b) => b.expires - a.expires)[0] };
  if (dated.length) {
    const c = dated.sort((a, b) => a.signed - b.signed)[0];
    return { status: "late", cert: c, daysLate: c.signed - sale.date };
  }
  return { status: "missing", cert: null };
}

export function rateFor(state, o) {
  return state in o.rates ? o.rates[state] : o.defaultRate;
}

export function check(salesText, certText, ratesText, opts = {}) {
  const rr = readRates(ratesText);
  const o = { ...DEFAULTS, ...opts, rates: { ...(opts.rates || {}), ...rr.rates } };
  if (o.asOf === null || o.asOf === undefined) o.asOf = Math.floor(Date.now() / DAY);
  const cr = readCertificates(certText, o);
  const sr = readSales(salesText);
  const findings = [...sr.findings, ...cr.findings, ...rr.findings];

  const certsByKey = new Map();
  for (const c of cr.certs) { if (!certsByKey.has(c.key)) certsByKey.set(c.key, []); certsByKey.get(c.key).push(c); }

  const rows = sr.sales.map((s) => {
    const j = judge(s, certsByKey, o);
    const rate = rateFor(s.state, o);
    const exposureCents = AT_RISK.has(j.status) ? Math.round((s.amount * rate) / 100) : 0;
    return { ...s, status: j.status, cert: j.cert, daysLate: j.daysLate ?? null, rate, exposureCents };
  }).sort((a, b) => b.exposureCents - a.exposureCents || a.date - b.date);

  // Customers that are probably the same buyer typed two ways, where one has a certificate and the other has none.
  const sold = new Set(rows.map((r) => r.key));
  for (const key of sold) {
    if (certsByKey.has(key)) continue;
    const near = [...certsByKey.keys()].find((k) => k !== key && (k.startsWith(key) || key.startsWith(k)) && Math.min(k.length, key.length) >= 5);
    if (near) {
      const name = rows.find((r) => r.key === key).customer;
      const certName = certsByKey.get(near)[0].customer;
      findings.push({ severity: "warning", customer: name, title: "Possible name mismatch", detail: `Sales name "${name}" has no certificate, but "${certName}" does. If they are the same buyer, make the names match and run it again; an auditor matches on the buyer named on the invoice.` });
    }
  }

  const atRisk = rows.filter((r) => AT_RISK.has(r.status));
  const byCustomer = new Map();
  for (const r of rows) {
    if (!byCustomer.has(r.key)) byCustomer.set(r.key, { customer: r.customer, rows: [], salesCents: 0, atRiskCents: 0, exposureCents: 0, statuses: new Set(), states: new Set() });
    const c = byCustomer.get(r.key);
    c.rows.push(r); c.salesCents += r.amount; c.statuses.add(r.status); c.states.add(r.state);
    if (AT_RISK.has(r.status)) { c.atRiskCents += r.amount; c.exposureCents += r.exposureCents; }
  }
  const customers = [...byCustomer.values()].map((c) => ({ ...c, statuses: [...c.statuses], states: [...c.states].sort() }))
    .sort((a, b) => b.exposureCents - a.exposureCents || b.salesCents - a.salesCents);

  const byState = new Map();
  for (const r of rows) {
    if (!byState.has(r.state)) byState.set(r.state, { state: r.state, salesCents: 0, atRiskCents: 0, exposureCents: 0, rate: r.rate });
    const s = byState.get(r.state);
    s.salesCents += r.amount;
    if (AT_RISK.has(r.status)) { s.atRiskCents += r.amount; s.exposureCents += r.exposureCents; }
  }
  const states = [...byState.values()].sort((a, b) => b.exposureCents - a.exposureCents);

  const usedRateDefault = [...byState.keys()].filter((st) => !(st in o.rates));
  if (usedRateDefault.length && rows.length) {
    findings.push({ severity: "info", title: "Default rate used", detail: `No rate was given for ${usedRateDefault.sort().join(", ")}, so ${o.defaultRate}% was applied. Add the combined state and local rate for each to sharpen the exposure figure.` });
  }
  for (const r of rows) {
    if (r.status === "late") findings.push({ severity: "info", customer: r.customer, title: `Certificate came ${r.daysLate} days after the sale`, detail: `${r.invoice} (${isoDay(r.date)}): ${r.customer} signed on ${isoDay(r.cert.signed)}. Some states accept a certificate obtained within a window after the sale or on audit; many do not. Check ${r.state}'s rule before treating it as covered.` });
  }

  // Certificates close to lapsing, for the people who will be asked to renew.
  const renewals = cr.certs.filter((c) => c.expires !== null && c.expires >= o.asOf && c.expires - o.asOf <= o.renewalWindowDays)
    .sort((a, b) => a.expires - b.expires);
  const lapsedNow = cr.certs.filter((c) => c.expires !== null && c.expires < o.asOf);

  const exempt = rows.reduce((t, r) => t + r.amount, 0);
  const covered = rows.filter((r) => r.status === "covered" || r.status === "incomplete" || r.status === "not-needed").reduce((t, r) => t + r.amount, 0);
  const summary = {
    exemptSales: rows.length,
    exemptCents: exempt,
    coveredCents: covered,
    coveredPct: exempt ? Math.round((covered / exempt) * 1000) / 10 : null,
    atRiskSales: atRisk.length,
    atRiskCents: atRisk.reduce((t, r) => t + r.amount, 0),
    exposureCents: atRisk.reduce((t, r) => t + r.exposureCents, 0),
    customersToChase: customers.filter((c) => c.exposureCents > 0).length,
    certificates: cr.certs.length,
    renewalsDue: renewals.length,
    lapsed: lapsedNow.length,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    totalRows: sr.totalRows,
  };
  return { summary, rows, customers, states, renewals, lapsedNow, findings, asOf: o.asOf, options: o };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvLine = (a) => a.map(csvCell).join(",");

export function salesCsv(r) {
  const head = ["invoice", "date", "customer", "state", "amount", "reason", "status", "certificate_no", "certificate_signed", "certificate_expires", "rate_pct", "exposure"];
  return [csvLine(head), ...r.rows.map((x) => csvLine([x.invoice, isoDay(x.date), x.customer, x.state, (x.amount / 100).toFixed(2), x.reasonText, STATUS_LABEL[x.status], x.cert?.certNo ?? "", x.cert?.signed != null ? isoDay(x.cert.signed) : "", x.cert?.expires != null ? isoDay(x.cert.expires) : "", x.rate, (x.exposureCents / 100).toFixed(2)]))].join("\n") + "\n";
}

// The chase list: one line per customer with exposure, in the order to ask them.
export function chaseCsv(r) {
  const head = ["customer", "states", "invoices_at_risk", "sales_at_risk", "tax_at_stake", "what_to_ask_for"];
  const lines = r.customers.filter((c) => c.exposureCents > 0).map((c) => {
    const bad = c.rows.filter((x) => AT_RISK.has(x.status));
    const states = [...new Set(bad.map((x) => x.state))].sort();
    return csvLine([c.customer, states.join(" "), bad.length, (c.atRiskCents / 100).toFixed(2), (c.exposureCents / 100).toFixed(2), askFor(bad)]);
  });
  return [csvLine(head), ...lines].join("\n") + "\n";
}

function askFor(bad) {
  const where = (...kinds) => [...new Set(bad.filter((x) => kinds.includes(x.status)).map((x) => x.state))].sort().join(", ");
  const parts = [];
  if (where("missing", "other-state")) parts.push(`a signed exemption certificate for ${where("missing", "other-state")}`);
  if (where("expired")) parts.push(`a renewed certificate for ${where("expired")}`);
  if (where("late")) parts.push(`confirmation of the certificate's effective date for ${where("late")}`);
  if (where("wrong-type")) parts.push(`a certificate for the reason actually claimed on the invoices (${where("wrong-type")})`);
  return parts.join("; ");
}

export function requestLetter(c, seller = {}) {
  const bad = c.rows.filter((x) => AT_RISK.has(x.status)).sort((a, b) => a.date - b.date);
  const states = [...new Set(bad.map((x) => x.state))].sort();
  const lines = [
    `${seller.name || "[Your company]"}`,
    "",
    `To: ${c.customer}`,
    "",
    `Re: Exemption certificate needed for ${states.join(", ")}`,
    "",
    `Our records show that we invoiced you without sales tax on the ${bad.length === 1 ? "sale" : "sales"} below on the basis that ${bad.length === 1 ? "it was" : "they were"} exempt. To keep that treatment we must hold a valid, signed exemption certificate from you for ${states.length === 1 ? "that state" : "each of those states"}. We do not have one that covers ${bad.length === 1 ? "this sale" : "these sales"}.`,
    "",
    ...bad.map((x) => `  ${x.invoice}   ${isoDay(x.date)}   ${x.state}   ${dollars(x.amount)}   (${STATUS_LABEL[x.status].toLowerCase()})`),
    "",
    `Please send a completed certificate for ${states.join(", ")}, covering the purchase reason that applies, with your registration or permit number and a signature and date. Returning it within 30 days avoids our having to bill the tax.`,
    "",
    `Thank you,`,
    `${seller.signer || "[Name]"}`,
  ];
  return lines.join("\n");
}

export function lettersText(r, seller = {}) {
  return r.customers.filter((c) => c.exposureCents > 0).map((c) => requestLetter(c, seller)).join("\n\n" + "-".repeat(60) + "\n\n") + "\n";
}

export function renewalsCsv(r) {
  const head = ["customer", "state", "certificate_no", "expires", "days_left"];
  return [csvLine(head), ...r.renewals.map((c) => csvLine([c.customer, c.state, c.certNo, isoDay(c.expires), c.expires - r.asOf]))].join("\n") + "\n";
}

export function findingsCsv(r) {
  return [csvLine(["severity", "line", "customer", "title", "detail"]), ...r.findings.map((f) => csvLine([f.severity, f.line ?? "", f.customer ?? "", f.title, f.detail]))].join("\n") + "\n";
}

export const SAMPLE_SELLER = { name: "Example Supply Co.", signer: "Accounts Receivable" };
export const SAMPLE_RATES = "State,Rate\nTX,8.25\nOH,7.25\nFL,7\n";
export const SAMPLE_CERTS = [
  "Customer,State,Certificate number,Type,Date signed,Expires",
  "Lone Star Plumbing Supply LLC,TX,TX-1182200,Resale,2024-02-01,",
  "Buckeye Hardware Inc,OH,OH-77841,Resale,2021-05-10,2026-05-10",
  "Gulf Coast Fasteners,FL,,Resale,2025-09-02,2026-11-30",
  "Plainview Foods Co,TX,TX-5503311,Manufacturing,2025-01-15,",
  "Riverbend Tools,OH,OH-90210,Resale,2026-04-01,",
].join("\n") + "\n";
export const SAMPLE_SALES = [
  "Invoice,Date,Customer,Ship to state,Amount,Tax charged,Exemption reason",
  "INV-1001,2026-01-12,\"Lone Star Plumbing Supply, LLC\",TX,12400.00,0,Resale",
  "INV-1002,2026-02-03,Buckeye Hardware Inc.,OH,8800.00,0,Resale",
  "INV-1003,2026-06-20,Buckeye Hardware Inc.,OH,15250.00,0,Resale",
  "INV-1004,2026-03-09,Gulf Coast Fasteners,FL,6100.00,0,Resale",
  "INV-1005,2026-04-14,Plainview Foods Co,TX,22000.00,0,Resale",
  "INV-1006,2026-02-22,Riverbend Tools,OH,4300.00,0,Resale",
  "INV-1007,2026-05-05,Northside Builders,TX,9900.00,0,Resale",
  "INV-1008,2026-05-18,Lone Star Plumbing Supply LLC,OH,3100.00,0,Resale",
  "INV-1009,2026-07-01,Harbor Marine Services,FL,5200.00,0,Delivered out of state",
  "INV-1010,2026-07-08,Walk-in customer,TX,640.00,52.80,",
].join("\n") + "\n";
