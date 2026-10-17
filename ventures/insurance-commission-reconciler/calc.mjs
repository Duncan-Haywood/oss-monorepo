// Insurance commission reconciler: an agency's policy book (from its management system) and the
// commission statements carriers send, compared line by line. It finds the money that leaves an
// agency quietly: a policy that never appeared on a statement, a commission paid at a lower rate
// than the agreement, a chargeback on a policy the agency still shows in force, a line paid twice
// (a future chargeback), a statement whose own total does not match its lines, and a rate that
// differs from what the same carrier pays the agency on every other policy of that line.
//
// What it decides: which statement line belongs to which policy, what commission the book implies,
// and where the two disagree. What it does not decide: what the producer agreement says (the rate
// the agency types or exports is the rate used), whether a cancellation was earned, or whether a
// carrier owes anything. Every finding is a question for the carrier, written as one.
// Nothing in this module touches the network or the DOM.

const DAY = 86400000;

export const DEFAULTS = {
  agency: "Your agency",
  producerCode: "",
  periodStart: "", // ISO day; blank = read from the statement dates, month-aligned
  periodEnd: "",
  lagDays: 30, // days after the effective date a carrier normally takes to pay
  rateTol: 0.25, // percentage points of rate difference that is noise
  dollarTol: 1, // dollars of difference that is rounding
};

const BOOK_ALIASES = {
  policy: ["policy number", "policy no", "policy #", "policy", "pol no", "policy num", "policy id", "contract number"],
  insured: ["insured", "client", "client name", "customer", "named insured", "account name", "account", "name"],
  carrier: ["carrier", "company", "insurer", "insurance company", "writing company", "carrier name"],
  line: ["line", "line of business", "lob", "coverage", "product", "policy type"],
  effective: ["effective date", "eff date", "effective", "inception", "policy effective", "start date", "term start", "eff"],
  premium: ["premium", "annual premium", "written premium", "total premium", "policy premium"],
  rate: ["commission rate", "comm rate", "commission %", "comm %", "rate", "commission percent", "agency commission %", "commission pct"],
  kind: ["new/renewal", "business type", "new or renewal", "transaction type", "trans type", "new renew", "nb/rn"],
  status: ["status", "policy status"],
  billing: ["billing", "bill type", "billing method", "billing type", "bill method", "bill"],
};
const STMT_ALIASES = {
  policy: BOOK_ALIASES.policy,
  insured: BOOK_ALIASES.insured,
  carrier: BOOK_ALIASES.carrier,
  line: ["line", "line of business", "lob", "coverage", "product"],
  effective: ["transaction date", "trans date", "effective date", "eff date", "effective", "eff", "date", "policy effective"],
  stmtDate: ["statement date", "statement period", "period", "pay date", "paid date", "check date", "payment date", "statement month", "commission period", "processed date", "date"],
  txn: ["transaction type", "trans type", "transaction", "type", "description", "activity", "trans code", "transaction description", "business type"],
  premium: ["premium", "written premium", "transaction premium", "gross premium", "premium amount", "commissionable premium", "comm premium"],
  rate: ["commission rate", "comm rate", "commission %", "comm %", "rate", "commission percent", "comm pct", "commission pct"],
  commission: ["commission", "commission amount", "comm amount", "commission paid", "comm", "agent commission", "commission due", "amount", "net commission", "commission earned", "comm amt"],
};
const RATE_ALIASES = {
  carrier: BOOK_ALIASES.carrier,
  line: ["line", "line of business", "lob", "coverage", "product"],
  newRate: ["new", "new business", "new %", "new rate", "new business %", "nb"],
  renewalRate: ["renewal", "renewal %", "renewal rate", "renew", "renewals", "rn"],
  rate: ["rate", "commission rate", "commission %", "commission", "%"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9#&%/]+/g, " ").trim();

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

// Money in cents. Parentheses and a leading minus are negative; a trailing minus too (some carrier
// systems print 12.50-). Returns null when blank and NaN when unreadable.
export function parseMoney(s) {
  let t = String(s ?? "").trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const cents = Math.round(Number(t) * 100);
  return neg ? -cents : cents;
}

// "15%" and "15" are fifteen percent, "0.15" is fifteen percent; a bare "1" is one percent because
// a hundred percent commission is not a rate. Returns a fraction, null when blank, NaN when unreadable.
export function parseRate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const pct = t.includes("%");
  const n = Number(t.replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (pct || n >= 1) return n / 100;
  return n;
}

// ISO, M/D/YYYY (US order), M/D/YY, or a month name form "Sep 2026" (first of the month).
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else if ((x = /^(\d{4})-(\d{1,2})$/.exec(t))) [y, m, d] = [+x[1], +x[2], 1];
  else if ((x = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t))) {
    m = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(x[1].toLowerCase()) + 1;
    if (!m) return NaN;
    [y, d] = [+x[2], 1];
  } else return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return Math.round(dt.getTime() / DAY);
}
export const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const dollars = (cents) => (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (f) => (Math.round(f * 10000) / 100).toString().replace(/\.0+$/, "") + "%";
const monthStart = (n) => { const d = new Date(n * DAY); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY); };
const monthEnd = (n) => { const d = new Date(n * DAY); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY); };

const CARRIER_NOISE = new Set(["insurance", "ins", "company", "co", "inc", "corp", "corporation", "llc", "group", "the", "and", "&"]);
export function carrierKey(name) {
  return norm(name).split(" ").filter((w) => w && !CARRIER_NOISE.has(w)).join(" ");
}

// A policy number is compared without punctuation, case or leading zeros. "base" also drops a
// trailing one- or two-digit segment, so PA-100231-01 (term suffix) can meet PA-100231.
export function policyKeys(raw) {
  const t = String(raw ?? "").toUpperCase().trim();
  const squash = (s) => s.replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
  const segs = t.split(/[-/\s]+/).filter(Boolean);
  const base = segs.length >= 2 && /^\d{1,2}$/.test(segs[segs.length - 1]) ? squash(segs.slice(0, -1).join("")) : squash(t);
  return { full: squash(t), base };
}

function mapHeader(cells, aliases) {
  const idx = {};
  const used = new Set();
  const heads = cells.map(norm);
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const i = heads.findIndex((h, k) => h === norm(n) && !used.has(k));
      if (i >= 0) { idx[field] = i; used.add(i); break; }
    }
  }
  return idx;
}

// Carrier statements often start with a title block, so the header is the row (of the first fifteen)
// that names the most known columns.
function readTable(text, aliases, need, what) {
  const findings = [];
  const raw = parseCsv(text);
  if (!raw.length) return { records: [], idx: {}, findings: [{ severity: "error", kind: "read", title: `${what}: nothing to read`, detail: "Paste or choose a file with a header row, then one row per line." }] };
  let best = 0, bestScore = -1, idx = {};
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    const m = mapHeader(raw[i].cells, aliases);
    const score = Object.keys(m).length;
    if (score > bestScore) { best = i; bestScore = score; idx = m; }
  }
  for (const f of need) {
    if (!(f in idx)) findings.push({ severity: "error", kind: "read", title: `${what}: no "${f}" column`, detail: `The header row needs a column for ${f}. Recognised names include: ${aliases[f].slice(0, 5).join(", ")}.` });
  }
  const records = raw.slice(best + 1).map((r) => ({ line: r.line, cells: r.cells, get: (f) => (f in idx ? String(r.cells[idx[f]] ?? "").trim() : "") }));
  return { records, idx, findings };
}

const INACTIVE = /cancel|non.?renew|lapse|expired|void|rescind|terminated|flat/;

export function readBook(text) {
  const t = readTable(text, BOOK_ALIASES, ["policy", "premium"], "Policy book");
  const findings = [...t.findings];
  const policies = [];
  if (findings.some((f) => f.severity === "error")) return { policies, findings };
  for (const r of t.records) {
    const policy = r.get("policy");
    if (!policy) continue;
    const premium = parseMoney(r.get("premium"));
    const eff = parseDate(r.get("effective"));
    const rate = parseRate(r.get("rate"));
    const bad = (what, v) => findings.push({ severity: "warning", kind: "read", policy, title: `Policy book line ${r.line}: ${what} not readable`, detail: `"${v}" was left out for ${policy}.` });
    if (Number.isNaN(premium)) bad("premium", r.get("premium"));
    if (Number.isNaN(eff)) bad("effective date", r.get("effective"));
    if (Number.isNaN(rate)) bad("commission rate", r.get("rate"));
    const kindText = norm(r.get("kind"));
    const status = norm(r.get("status"));
    policies.push({
      line: r.line, policy, keys: policyKeys(policy), insured: r.get("insured"), carrier: r.get("carrier"), ck: carrierKey(r.get("carrier")),
      lob: r.get("line"), eff: Number.isNaN(eff) ? null : eff, premium: Number.isNaN(premium) ? null : premium, rate: Number.isNaN(rate) ? null : rate,
      cls: /renew|^rn|rn$/.test(kindText) ? "renewal" : /new|^nb/.test(kindText) ? "new" : null,
      active: !INACTIVE.test(status), status: r.get("status"), direct: /direct/.test(norm(r.get("billing"))),
      lines: [],
    });
  }
  return { policies, findings };
}

// Expected-rate table: carrier, optional line, then new/renewal rates or one rate.
export function readRates(text) {
  const out = [];
  if (!String(text || "").trim()) return out;
  const t = readTable(text, RATE_ALIASES, [], "Rate table");
  for (const r of t.records) {
    const carrier = r.get("carrier");
    if (!carrier) continue;
    const g = (f) => { const v = parseRate(r.get(f)); return Number.isNaN(v) ? null : v; };
    const one = g("rate");
    out.push({ ck: carrierKey(carrier), lob: norm(r.get("line")), new: g("newRate") ?? one, renewal: g("renewalRate") ?? one });
  }
  return out;
}

export function classifyTxn(text, commissionCents) {
  const t = norm(text);
  if (/bonus|override|contingen|profit shar|incentive|volume|adjustment fee|fee income|marketing/.test(t)) return "other";
  if (commissionCents < 0) return "chargeback";
  if (/renew|^rn\b/.test(t)) return "renewal";
  if (/\bnew\b|^nb\b|new business|inception|issued/.test(t)) return "new";
  if (/endors|change|adjust|audit|mid ?term|additional|\bap\b/.test(t)) return "endorsement";
  return "unspecified";
}

export function readStatement(text, name, defaultCarrier) {
  const t = readTable(text, STMT_ALIASES, ["policy"], `Statement ${name}`);
  const findings = [...t.findings];
  const lines = [];
  const totals = [];
  if (findings.some((f) => f.severity === "error")) return { lines, totals, findings };
  if (!("commission" in t.idx) && !("premium" in t.idx && "rate" in t.idx)) {
    findings.push({ severity: "error", kind: "read", title: `Statement ${name}: no commission column`, detail: "The header row needs a commission amount column (or premium and rate)." });
    return { lines, totals, findings };
  }
  for (const r of t.records) {
    const cells = r.cells.map((c) => String(c ?? "").trim());
    const policy = /^(grand\s+|statement\s+)?totals?\b/i.test(r.get("policy")) ? "" : r.get("policy");
    if (!policy) {
      if (cells.some((c) => /\btotals?\b/i.test(c))) {
        const direct = parseMoney(r.get("commission"));
        let amt = Number.isFinite(direct) ? direct : null;
        if (amt === null) for (let i = cells.length - 1; i >= 0; i--) { const v = parseMoney(cells[i]); if (Number.isFinite(v) && v !== null) { amt = v; break; } }
        if (amt !== null) totals.push({ line: r.line, cents: amt });
      } else {
        const c = parseMoney(r.get("commission"));
        if (Number.isFinite(c) && c) findings.push({ severity: "warning", kind: "no-policy", carrier: r.get("carrier") || defaultCarrier, cents: 0, paidCents: c, title: `Statement ${name} line ${r.line}: ${dollars(c)} with no policy number`, detail: `${r.get("txn") || "A line"} for ${dollars(c)} could not be matched to any policy. If it is a bonus or override it is not a policy commission; otherwise ask the carrier what it is for.` });
      }
      continue;
    }
    let premium = parseMoney(r.get("premium"));
    let rate = parseRate(r.get("rate"));
    let commission = parseMoney(r.get("commission"));
    let derived = false;
    if (Number.isNaN(commission) || Number.isNaN(premium) || Number.isNaN(rate)) {
      findings.push({ severity: "warning", kind: "read", policy, title: `Statement ${name} line ${r.line}: an amount is not readable`, detail: `${policy} was left out; check the premium, rate and commission cells on that line.` });
      continue;
    }
    if (commission === null && premium !== null && rate !== null) { commission = Math.round(premium * rate); derived = true; }
    if (commission === null) continue;
    const eff = parseDate(r.get("effective"));
    const sd = parseDate(r.get("stmtDate"));
    const carrier = r.get("carrier") || defaultCarrier || "";
    lines.push({
      file: name, line: r.line, policy, keys: policyKeys(policy), insured: r.get("insured"), carrier, ck: carrierKey(carrier), lob: r.get("line"),
      txnText: r.get("txn"), cls: classifyTxn(r.get("txn"), commission), eff: Number.isNaN(eff) ? null : eff, stmtDate: Number.isNaN(sd) ? null : sd,
      premium, rate, commission, derived, book: null,
    });
  }
  return { lines, totals, findings };
}

function expectedRate(p, cls, rates) {
  if (p.rate != null) return { rate: p.rate, source: "book" };
  const k = cls === "renewal" ? "renewal" : cls === "new" ? "new" : p.cls || "renewal";
  const lob = norm(p.lob);
  const hit = rates.find((r) => r.ck === p.ck && r.lob && r.lob === lob && r[k] != null) || rates.find((r) => r.ck === p.ck && !r.lob && r[k] != null);
  return hit ? { rate: hit[k], source: "table" } : null;
}

// What a carrier usually pays this agency: the modal rate per carrier + line + class, from the
// statement lines themselves, only when there are enough lines and one rate clearly dominates.
function modalRates(lines) {
  const groups = new Map();
  for (const l of lines) {
    if (!(l.commission > 0) || !(l.premium > 0) || !["new", "renewal"].includes(l.cls)) continue;
    const r = Math.round((l.commission / l.premium) * 1000) / 1000;
    const key = `${l.ck}|${norm(l.lob)}|${l.cls}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key);
    g.set(r, (g.get(r) || 0) + 1);
  }
  const out = new Map();
  for (const [key, g] of groups) {
    const total = [...g.values()].reduce((a, b) => a + b, 0);
    const [rate, n] = [...g.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (total >= 5 && n / total >= 0.6) out.set(key, { rate, n, total });
  }
  return out;
}

const SEV = { error: 0, warning: 1, info: 2 };

export function reconcile({ book, statements = [], rates = "", opts = {} }) {
  const o = { ...DEFAULTS, ...opts };
  const rateTable = readRates(rates);
  const b = readBook(book);
  const findings = [...b.findings];
  const lines = [];
  const totals = [];
  for (const s of statements) {
    const r = readStatement(s.text, s.name, s.carrier || s.name);
    findings.push(...r.findings);
    lines.push(...r.lines);
    for (const t of r.totals) {
      const mine = r.lines.filter((l) => l.file === s.name).reduce((a, l) => a + l.commission, 0);
      totals.push({ file: s.name, carrier: s.carrier || s.name, stated: t.cents, computed: mine, line: t.line });
    }
  }
  const policies = b.policies;
  const fatal = findings.some((f) => f.severity === "error" && f.kind === "read");
  const tol = o.dollarTol * 100;

  // Period: given, or the statement dates widened to whole months.
  let ps = parseDate(o.periodStart), pe = parseDate(o.periodEnd);
  if (!Number.isFinite(ps) || !Number.isFinite(pe)) {
    const ds = lines.map((l) => l.stmtDate).filter((x) => x != null);
    if (ds.length) { ps = monthStart(Math.min(...ds)); pe = monthEnd(Math.max(...ds)); } else { ps = null; pe = null; }
  }

  // Match each statement line to a book policy: same carrier and exact number first, then the
  // number without its term suffix, then any carrier when exactly one policy has that number.
  const byNo = new Map();
  for (const p of policies) for (const k of new Set([p.keys.full, p.keys.base])) { if (!byNo.has(k)) byNo.set(k, []); byNo.get(k).push(p); }
  for (const l of lines) {
    if (fatal) break;
    const pick = (cands) => {
      if (!cands.length) return null;
      if (l.eff == null) return cands[0];
      return [...cands].sort((a, c) => Math.abs((a.eff ?? 1e9) - l.eff) - Math.abs((c.eff ?? 1e9) - l.eff))[0];
    };
    const exact = (byNo.get(l.keys.full) || []).filter((p) => p.keys.full === l.keys.full);
    const sameCarrier = (arr) => arr.filter((p) => !p.ck || !l.ck || p.ck === l.ck);
    let cand = sameCarrier(exact), how = "exact";
    if (!cand.length) { cand = sameCarrier(byNo.get(l.keys.base) || []); how = "suffix"; }
    if (!cand.length) {
      const any = [...new Set([...(byNo.get(l.keys.full) || []), ...(byNo.get(l.keys.base) || [])])];
      if (any.length === 1) { cand = any; how = "carrier"; }
    }
    const p = pick(cand);
    if (p) {
      l.book = p; l.how = how; p.lines.push(l);
      l.lob = l.lob || p.lob; l.ck = l.ck || p.ck;
      if (how === "suffix") findings.push({ severity: "info", kind: "term-suffix", carrier: l.carrier, policy: l.policy, insured: l.insured || p.insured, cents: 0, title: `${l.policy} matched to ${p.policy}`, detail: "The numbers differ only by a term suffix; they were treated as the same policy." });
      if (how === "carrier") findings.push({ severity: "info", kind: "carrier-name", carrier: l.carrier, policy: l.policy, insured: l.insured || p.insured, cents: 0, title: `${l.policy}: carrier named differently`, detail: `The statement says "${l.carrier}" and the book says "${p.carrier}"; matched on the policy number alone because only one policy has it.` });
    }
  }

  // Rate: the agent's own book/table, else the carrier's usual rate for that line.
  const modal = modalRates(lines);
  const rateFor = (p, l, cls) => {
    const e = expectedRate(p, cls, rateTable);
    if (e) return e;
    const m = modal.get(`${l ? l.ck : p.ck}|${norm(l?.lob || p.lob)}|${cls}`);
    return m ? { rate: m.rate, source: "usual", n: m.n, total: m.total } : null;
  };

  if (!fatal) {
    // 1. Matched lines: rate and premium.
    for (const l of lines) {
      const p = l.book;
      if (!p) continue;
      const cls = ["new", "renewal"].includes(l.cls) ? l.cls : l.cls === "unspecified" ? p.cls || "renewal" : null;
      if (cls && l.commission > 0 && l.premium > 0) {
        const e = rateFor(p, l, cls);
        if (e) {
          const expected = Math.round(l.premium * e.rate);
          const diff = l.commission - expected;
          const paidRate = l.commission / l.premium;
          if (Math.abs(paidRate - e.rate) * 100 > o.rateTol && Math.abs(diff) > tol) {
            const under = diff < 0;
            const src = e.source === "book" ? "the rate in your book" : e.source === "table" ? "the rate in your table" : `what ${l.carrier || "this carrier"} pays you on ${e.n} of ${e.total} other ${p.lob || "policies"} lines`;
            findings.push({
              severity: under ? "error" : "warning", kind: under ? "underpaid" : "overpaid", carrier: l.carrier || p.carrier, policy: p.policy, insured: p.insured || l.insured,
              effective: l.eff ?? p.eff, premiumCents: l.premium, expectedCents: expected, paidCents: l.commission, cents: under ? -diff : 0, overCents: under ? 0 : diff, rateExpected: e.rate, ratePaid: paidRate, rateSource: e.source,
              title: `${p.policy}: paid at ${pct(paidRate)}, expected ${pct(e.rate)}`,
              detail: `${p.insured || l.insured}: ${dollars(l.premium)} premium paid ${dollars(l.commission)}; at ${pct(e.rate)} (${src}) it would be ${dollars(expected)}. ${under ? `${dollars(-diff)} short.` : `${dollars(diff)} more than expected, which can come back as a chargeback.`}`,
            });
          }
        }
      }
      if (["new", "renewal"].includes(l.cls) && p.premium > 0 && l.premium > 0) {
        const d = Math.abs(l.premium - p.premium);
        if (d / p.premium > 0.02 && d > 2500) {
          findings.push({ severity: "warning", kind: "premium-mismatch", carrier: l.carrier || p.carrier, policy: p.policy, insured: p.insured || l.insured, premiumCents: l.premium, cents: 0, title: `${p.policy}: statement premium ${dollars(l.premium)}, book ${dollars(p.premium)}`, detail: `Commission is calculated on the statement premium. If the carrier's figure is the lower one, the commission is lower by the rate times ${dollars(d)}; if it came from an audit or endorsement, update the book.` });
        }
      }
    }

    // 2. Chargebacks against policies the book still shows in force.
    for (const l of lines) {
      if (l.cls !== "chargeback") continue;
      const p = l.book;
      if (p && p.active) {
        findings.push({ severity: "error", kind: "chargeback-active", carrier: l.carrier || p.carrier, policy: p.policy, insured: p.insured || l.insured, paidCents: l.commission, cents: -l.commission, effective: l.eff ?? p.eff, title: `${p.policy}: ${dollars(-l.commission)} charged back on a policy your book shows in force`, detail: `${p.insured || l.insured} is "${p.status || "active"}" in your book but the carrier reversed ${dollars(-l.commission)}. Either the book is out of date (cancellation not recorded) or the carrier has the wrong status.` });
      } else if (!p) {
        findings.push({ severity: "info", kind: "chargeback", carrier: l.carrier, policy: l.policy, insured: l.insured, paidCents: l.commission, cents: 0, title: `${l.policy}: ${dollars(-l.commission)} charged back, policy not in your book`, detail: "Nothing in the book to compare against." });
      }
    }

    // 3. On the statement, not in the book.
    for (const l of lines) {
      if (l.book || l.cls === "other" || l.cls === "chargeback") continue;
      findings.push({ severity: "warning", kind: "unknown-policy", carrier: l.carrier, policy: l.policy, insured: l.insured, paidCents: l.commission, cents: 0, title: `${l.policy}: ${dollars(l.commission)} paid, no such policy in your book`, detail: `${l.insured || "The insured"} (${l.txnText || "no transaction type"}) is on the ${l.file} statement but not in the book. Add it, or ask the carrier whether the commission belongs to your agency.` });
    }

    // 4. The same line twice.
    const dup = new Map();
    for (const l of lines) {
      const k = [l.ck, l.keys.full, l.cls, l.premium, l.commission, l.eff, l.stmtDate].join("|");
      if (!dup.has(k)) dup.set(k, []);
      dup.get(k).push(l);
    }
    for (const g of dup.values()) {
      if (g.length < 2 || g[0].cls === "other") continue;
      const l = g[0];
      findings.push({ severity: "warning", kind: "duplicate", carrier: l.carrier, policy: l.policy, insured: l.insured || l.book?.insured, paidCents: l.commission, cents: 0, overCents: l.commission * (g.length - 1), title: `${l.policy}: ${dollars(l.commission)} appears ${g.length} times`, detail: `Identical lines (lines ${g.map((x) => x.line).join(", ")} of ${l.file}). If it is a duplicate payment, expect a chargeback; hold ${dollars(l.commission * (g.length - 1))} aside.` });
    }

    // 5. Book policies with no commission.
    if (ps == null) {
      findings.push({ severity: "info", kind: "period-unknown", cents: 0, title: "Statement period unknown, unpaid policies not checked", detail: "No statement date column was found. Enter the period the statements cover to find policies that were never paid." });
    } else {
      let older = 0, olderCents = 0, notDue = 0;
      // Only carriers whose statements were loaded can be checked; the rest are said so, not called unpaid.
      const loaded = new Set(lines.map((l) => l.ck).filter(Boolean));
      const skipped = new Map();
      for (const p of policies) {
        if (!p.active || p.eff == null) continue;
        if (p.ck && !loaded.has(p.ck)) { const k = skipped.get(p.ck) || { carrier: p.carrier, n: 0 }; k.n++; skipped.set(p.ck, k); continue; }
        // A policy with a chargeback was paid once; the chargeback finding speaks for it.
        if (p.lines.some((l) => (l.commission > 0 && l.cls !== "other") || l.cls === "chargeback")) continue;
        const dueBy = p.eff + o.lagDays;
        const e = rateFor(p, null, p.cls || "renewal");
        const expected = e && p.premium ? Math.round(p.premium * e.rate) : null;
        if (dueBy > pe) { notDue++; continue; }
        if (dueBy < ps) { older++; olderCents += expected || 0; continue; }
        findings.push({
          severity: p.direct ? "warning" : "error", kind: "missing", carrier: p.carrier, policy: p.policy, insured: p.insured, effective: p.eff, premiumCents: p.premium, expectedCents: expected, paidCents: 0, cents: expected || 0, rateExpected: e?.rate ?? null, rateSource: e?.source,
          title: `${p.policy}: no commission on any statement${expected ? `, about ${dollars(expected)}` : ""}`,
          detail: `${p.insured || "The insured"} (${p.carrier || "carrier not named"}, effective ${isoDay(p.eff)}${p.premium ? `, ${dollars(p.premium)} premium` : ""}) was due by ${isoDay(dueBy)} and is on no statement you loaded.${expected ? ` At ${pct(e.rate)} that is ${dollars(expected)}.` : " No commission rate is known for it, so no amount is estimated."}${p.direct ? " It is direct billed, so commission may arrive with installments; check whether the first one was paid." : ""}`,
        });
      }
      for (const k of skipped.values()) findings.push({ severity: "info", kind: "no-statement", carrier: k.carrier, cents: 0, title: `No statement loaded for ${k.carrier}: ${k.n} polic${k.n === 1 ? "y" : "ies"} not checked`, detail: `Load ${k.carrier}'s statement to check those policies. They are not reported as unpaid.` });
      if (older) findings.push({ severity: "info", kind: "older-unmatched", cents: 0, title: `${older} polic${older === 1 ? "y" : "ies"} were due before this period and are on no loaded statement`, detail: `They fall before ${isoDay(ps)}, so an earlier statement may have paid them. Load the earlier statements to check${olderCents ? `; up to ${dollars(olderCents)} is at stake` : ""}.` });
      if (notDue) findings.push({ severity: "info", kind: "not-due", cents: 0, title: `${notDue} polic${notDue === 1 ? "y is" : "ies are"} not due yet`, detail: `Effective less than ${o.lagDays} days before ${isoDay(pe)}; they were not checked.` });
    }

    // 6. Statement totals against their own lines.
    for (const t of totals) {
      if (Math.abs(t.stated - t.computed) > tol) {
        findings.push({ severity: "error", kind: "total-mismatch", carrier: t.carrier, cents: 0, title: `${t.file}: total ${dollars(t.stated)}, lines add to ${dollars(t.computed)}`, detail: `The statement's own total differs from its lines by ${dollars(t.stated - t.computed)}. Lines may be missing from the file you loaded, or the carrier's total includes something it did not itemise.` });
      }
    }
  }

  findings.sort((a, c) => SEV[a.severity] - SEV[c.severity] || Math.abs(c.cents || c.overCents || 0) - Math.abs(a.cents || a.overCents || 0));
  const sum = (kind, f) => findings.filter((x) => x.kind === kind).reduce((a, x) => a + (x[f] || 0), 0);
  const summary = {
    statementLines: lines.length, policies: policies.length,
    matched: lines.filter((l) => l.book).length, unmatched: lines.filter((l) => !l.book && l.cls !== "other").length,
    paidCents: lines.reduce((a, l) => a + l.commission, 0),
    missing: findings.filter((f) => f.kind === "missing").length, missingCents: sum("missing", "cents"),
    underpaid: findings.filter((f) => f.kind === "underpaid").length, underpaidCents: sum("underpaid", "cents"),
    chargebackCents: sum("chargeback-active", "cents"), chargebacks: findings.filter((f) => f.kind === "chargeback-active").length,
    overpaidCents: sum("overpaid", "overCents") + sum("duplicate", "overCents"),
    errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length,
    period: ps == null ? null : { start: isoDay(ps), end: isoDay(pe) },
  };
  summary.recoverableCents = summary.missingCents + summary.underpaidCents + summary.chargebackCents;

  const carriers = new Map();
  const car = (name) => { const k = carrierKey(name) || "(unnamed)"; if (!carriers.has(k)) carriers.set(k, { carrier: name || "(unnamed)", lines: 0, paidCents: 0, missing: 0, recoverableCents: 0, items: 0 }); return carriers.get(k); };
  for (const l of lines) { const c = car(l.carrier); c.lines++; c.paidCents += l.commission; }
  for (const f of findings) {
    if (!["missing", "underpaid", "chargeback-active"].includes(f.kind)) continue;
    const c = car(f.carrier); c.items++; c.recoverableCents += f.cents || 0; if (f.kind === "missing") c.missing++;
  }
  return { opts: o, summary, findings, lines, policies, carriers: [...carriers.values()].sort((a, c) => c.recoverableCents - a.recoverableCents) };
}

const REVIEW_KINDS = [
  ["missing", "Policies with no commission on any statement"],
  ["underpaid", "Commission paid at a lower rate than expected"],
  ["chargeback-active", "Chargebacks on policies we show in force"],
];

// One note per carrier, only the items that carrier's statements gave rise to. Worded as a question:
// the carrier's records, not ours, decide.
export function disputeLetter(report, carrierName) {
  const o = report.opts;
  const ck = carrierKey(carrierName);
  const mine = report.findings.filter((f) => carrierKey(f.carrier) === ck && REVIEW_KINDS.some(([k]) => k === f.kind));
  if (!mine.length) return "";
  const period = report.summary.period ? `${report.summary.period.start} to ${report.summary.period.end}` : "the statements provided";
  const out = [];
  out.push(`Subject: Commission statement review - ${o.agency}${o.producerCode ? ` - producer code ${o.producerCode}` : ""} - ${period}`);
  out.push("");
  out.push(`Hello ${carrierName} commission team,`);
  out.push("");
  out.push(`We compared your commission statements for ${period} with our policy records and have the items below. The amounts are our own calculation from our records and your statements. If a rate or a policy status differs under our producer agreement, please tell us which and we will correct our records.`);
  let total = 0;
  for (const [kind, heading] of REVIEW_KINDS) {
    const g = mine.filter((f) => f.kind === kind);
    if (!g.length) continue;
    out.push("");
    out.push(`${heading} (${g.length}):`);
    for (const f of g) {
      total += f.cents || 0;
      const bits = [f.policy, f.insured, f.effective != null ? `eff ${isoDay(f.effective)}` : "", f.premiumCents ? `premium ${dollars(f.premiumCents)}` : ""].filter(Boolean).join(" | ");
      if (kind === "missing") out.push(`  - ${bits} | ${f.expectedCents ? `expected about ${dollars(f.expectedCents)} at ${pct(f.rateExpected)}` : "not found on any statement"}`);
      else if (kind === "underpaid") out.push(`  - ${bits} | paid ${dollars(f.paidCents)} (${pct(f.ratePaid)}), expected ${dollars(f.expectedCents)} (${pct(f.rateExpected)}), difference ${dollars(f.paidCents - f.expectedCents)}`);
      else out.push(`  - ${bits} | charged back ${dollars(-f.paidCents)}; our records show the policy in force`);
    }
  }
  out.push("");
  out.push(`Amount we are asking you to review: ${dollars(total)}.`);
  out.push("");
  out.push("Thank you,");
  out.push(o.agency);
  return out.join("\n");
}

export function allDisputeLetters(report) {
  return report.carriers.map((c) => disputeLetter(report, c.carrier)).filter(Boolean).join("\n\n----------------------------------------\n\n");
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s)) s = "'" + s; // keep a spreadsheet from running a typed cell
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (c) => (c == null ? "" : (c / 100).toFixed(2));

export function findingsCsv(report) {
  const head = ["severity", "kind", "carrier", "policy", "insured", "effective", "premium", "expected", "paid", "money_to_chase", "title", "detail"];
  const rows = report.findings.map((f) => [f.severity, f.kind, f.carrier, f.policy, f.insured, f.effective != null ? isoDay(f.effective) : "", money(f.premiumCents), money(f.expectedCents), money(f.paidCents), money(f.cents), f.title, f.detail]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function carrierCsv(report) {
  const head = ["carrier", "statement_lines", "commission_paid", "policies_missing", "items_to_review", "money_to_chase"];
  const rows = report.carriers.map((c) => [c.carrier, c.lines, money(c.paidCents), c.missing, c.items, money(c.recoverableCents)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export const SAMPLE_OPTS = { agency: "Example Insurance Agency", producerCode: "A12345", periodStart: "2026-09-01", periodEnd: "2026-09-30", lagDays: 30 };

export function sampleBook() {
  return [
    "Policy,Insured,Carrier,Line,Effective,Premium,Commission Rate,Business Type,Status,Billing",
    "PA-100231,Alvarez Bakery LLC,Northbridge Mutual,Commercial Package,2026-07-28,8400,15%,New,Active,Agency",
    "PA-100232,Okafor Dental,Northbridge Mutual,Professional Liability,2026-07-30,3200,15%,Renewal,Active,Agency",
    "PA-100240,Marsh Landscaping,Northbridge Mutual,Commercial Auto,2026-08-01,12400,12%,Renewal,Active,Agency",
    "PA-100245,Dunmore Plumbing,Northbridge Mutual,General Liability,2026-06-15,2900,15%,New,Cancelled,Agency",
    "PA-100250,Tran Nails,Northbridge Mutual,BOP,2026-08-10,1800,15%,New,Active,Agency",
    "PA-100252,Hollis Roofing,Northbridge Mutual,General Liability,2026-08-18,6100,15%,New,Active,Agency",
    "PA-100260,Keller Realty,Northbridge Mutual,Commercial Package,2026-09-25,9000,15%,New,Active,Agency",
    "HO-558120,Lindqvist Jane,Cedar Casualty,Homeowners,2026-08-05,2150,12%,New,Active,Direct",
    "HO-558121,Brightwater Church,Cedar Casualty,Property,2026-08-12,5600,10%,Renewal,Active,Agency",
    "HO-558130,Ruiz Carlos,Cedar Casualty,Homeowners,2026-08-20,1900,12%,Renewal,Active,Agency",
  ].join("\n");
}

export function sampleStatements() {
  return [
    {
      name: "Northbridge Mutual", carrier: "Northbridge Mutual", text: [
        "Northbridge Mutual - Agency commission statement,,,,,,,",
        "Policy,Insured,Transaction,Effective Date,Premium,Rate,Commission,Statement Date",
        "PA-100231,Alvarez Bakery LLC,New Business,2026-07-28,8400,15%,1260.00,2026-09-15",
        "PA-100232,Okafor Dental,Renewal,2026-07-30,3200,15%,480.00,2026-09-15",
        "PA-100240,Marsh Landscaping,Renewal,2026-08-01,12400,9%,1116.00,2026-09-15",
        "PA-100245,Dunmore Plumbing,Chargeback,2026-06-15,-2900,,-435.00,2026-09-15",
        "PA-100250,Tran Nails,Chargeback,2026-08-10,-1800,,-270.00,2026-09-15",
        "PA-100999,Mystery Supply Co,New Business,2026-08-14,4000,15%,600.00,2026-09-15",
        "Total,,,,,,2781.00,",
      ].join("\n"),
    },
    {
      name: "Cedar Casualty", carrier: "Cedar Casualty", text: [
        "Policy,Insured,Type,Eff,Premium,Commission %,Commission,Date",
        "HO-558121,Brightwater Church,Renewal,2026-08-12,5600,10%,560.00,2026-09-10",
        "HO-558130,Ruiz Carlos,Renewal,2026-08-20,1900,12%,228.00,2026-09-10",
        "HO-558130,Ruiz Carlos,Renewal,2026-08-20,1900,12%,228.00,2026-09-10",
      ].join("\n"),
    },
  ];
}
