// Chargeback / dispute ratio monitor from a Stripe "Payments" export (or any CSV
// with a date, an amount, a status and a disputed flag or disputed amount).
// Pure functions, no DOM, no network.

const ALIASES = {
  id: ["id", "payment id", "charge id", "payment_intent id", "payment_intent"],
  date: ["created (utc)", "created date (utc)", "created", "date (utc)", "date", "created_at", "timestamp"],
  amount: ["amount", "amount_usd", "gross", "total"],
  currency: ["currency"],
  status: ["status", "payment status"],
  customer: ["customer id", "customer", "customer_id", "customer email", "email"],
  brand: ["card brand", "card_brand", "brand", "card network", "network"],
  disputed: ["disputed", "is disputed", "dispute", "chargeback", "has dispute"],
  disputedAmount: ["disputed amount", "dispute amount", "disputed_amount", "chargeback amount"],
  disputeDate: ["dispute date (utc)", "dispute date", "disputed date (utc)", "dispute created (utc)", "dispute_date", "chargeback date"],
  disputeReason: ["dispute reason", "dispute_reason", "chargeback reason", "reason code"],
  fraud: ["fraud", "early fraud warning", "efw", "is fraud", "fraud flag"],
};

// Settled means the card was charged; failed, pending and canceled attempts
// never reach a card network's ratio.
const SETTLED = new Set(["succeeded", "paid", "success", "captured", "refunded", "partially_refunded", "partially refunded", "disputed", "lost", "won", "charged back"]);
const IGNORED = new Set(["failed", "declined", "pending", "canceled", "cancelled", "uncaptured", "requires_action", "incomplete"]);
const TRUTHY = new Set(["true", "yes", "y", "1", "disputed", "charged back", "chargeback"]);
const FALSY = new Set(["", "false", "no", "n", "0", "none", "null"]);

// What to look at first for each Stripe dispute reason. Unknown reasons are
// kept and reported as written, never guessed.
export const REASON_ACTIONS = {
  fraudulent: "Card was used without the owner's consent: look at which orders pass your fraud checks and consider extra verification (3-D Secure) on risky ones.",
  unrecognized: "Cardholder does not recognise the charge: make the statement descriptor and the receipt email match your public name.",
  product_not_received: "Customer says it never arrived: confirm tracking and delivery proof on every shipped order.",
  product_unacceptable: "Customer says it was not as described: check listing copy and what support says before a refund is refused.",
  product_not_acceptable: "Customer says it was not as described: check listing copy and what support says before a refund is refused.",
  subscription_canceled: "Customer says they cancelled: make cancelling easy to find and send a confirmation, or they will use their bank instead.",
  credit_not_processed: "A promised refund did not reach the card: refund promptly and keep the refund id with the order.",
  duplicate: "Customer was charged twice: look for double-submit and retry paths in checkout and billing.",
  incorrect_account_details: "Payment went to the wrong account: check payout and billing details.",
  general: "Reason not specified by the bank: read each dispute for the cardholder's actual complaint.",
  customer_initiated: "Cardholder started the dispute without a specific code: read each dispute for the actual complaint.",
};

export const DEFAULT_OPTIONS = {
  warn: 0.0075, // early warning, below any program line
  elevated: 0.009, // a typical "above standard" line
  excessive: 0.015, // a typical "excessive" line
  fee: 15, // per-dispute fee, edit to your own
  winRate: 0,
  includeFraud: false, // count early fraud warnings in the headline ratio, as Visa VAMP does
};

// Published network programmes the tool reads per brand, besides your own
// lines. Values as Visa and Mastercard published them; acquirers can apply
// stricter lines, and the networks change these, so check what you are quoted.
// Visa Acquirer Monitoring Program (VAMP), effective 1 June 2025: ratio =
// (TC40 fraud reports + TC15 disputes) / settled card-not-present Visa
// transactions in the month; merchant "excessive" line 2.2% until
// 31 March 2026, 1.5% from 1 April 2026 (US, Canada, Europe, Asia Pacific),
// with at least 1,500 fraud reports plus disputes in the month.
// Mastercard Excessive Chargeback Program (ECP): chargebacks received in a
// month / Mastercard transactions in the PREVIOUS month; Excessive
// Chargeback Merchant (ECM) at 1.5% and 100 chargebacks, High Excessive
// (HECM) at 3.0% and 300 chargebacks.
export const PROGRAMMES = {
  vamp: { name: "Visa VAMP (merchant)", line: 0.015, lineBefore20260401: 0.022, minCount: 1500 },
  ecm: { name: "Mastercard ECP", ecm: 0.015, ecmMin: 100, hecm: 0.03, hecmMin: 300 },
};

// Card brand as a network key: visa, mastercard, amex, discover, other or "".
export function networkOf(brand) {
  const b = String(brand ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!b) return "";
  if (b.startsWith("visa")) return "visa";
  if (b === "mc" || b.startsWith("mastercard") || b.startsWith("master")) return "mastercard";
  if (b === "amex" || b.startsWith("americanexpress")) return "amex";
  if (b.startsWith("discover")) return "discover";
  return b;
}

export function prevMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function parseCsv(text) {
  const rows = [];
  // Each row carries a non-enumerable `line`: the file line it starts on,
  // so a reader can name it after blank lines or quoted line breaks.
  let row = [], field = "", quoted = false, line = 1, start = 1;
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else { field += c; if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) line++; }
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(Object.defineProperty(row, "line", { value: start }));
      row = []; start = ++line;
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(Object.defineProperty(row, "line", { value: start }));
  return rows;
}

export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let iso = s, ymd = null;
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) { iso = s.replace(" ", "T") + (s.length > 10 ? "" : "T00:00:00") + "Z"; ymd = s.slice(0, 10); }
  else if (/^\d{9,10}$/.test(s)) return new Date(Number(s) * 1000);
  const d = new Date(iso);
  // Date rolls 2026-02-30 into March: refuse a day that does not round-trip.
  return Number.isNaN(d.getTime()) || (ymd && d.toISOString().slice(0, 10) !== ymd) ? null : d;
}

export function parseAmount(value) {
  const s = String(value ?? "").trim().replace(/[$€£,\s]/g, "");
  if (s === "") return null;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[()]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function normalizeReason(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

const monthOf = (d) => d.toISOString().slice(0, 7);

// Returns { events, skipped, ignored, currency, otherCurrency, columns, error }.
// Each event is { line, at, month, amount, brand, customer, disputed,
// disputedAmount, disputeMonth, reason }.
export function normalizeRows(table) {
  const empty = { events: [], skipped: [], ignored: 0, otherCurrency: 0, currency: "", columns: {} };
  if (!table.length) return { ...empty, error: "The file is empty." };
  const cols = findColumns(table[0]);
  if (cols.date === undefined) return { ...empty, columns: cols, error: "No date column found. Expected a header like “Created (UTC)”." };
  if (cols.amount === undefined) return { ...empty, columns: cols, error: "No amount column found. Expected a header like “Amount”." };
  if (cols.status === undefined) return { ...empty, columns: cols, error: "No status column found. Expected a header like “Status” with Paid/Failed values." };
  if (cols.disputed === undefined && cols.disputedAmount === undefined && cols.disputeDate === undefined) {
    return { ...empty, columns: cols, error: "No dispute column found. Expected “Disputed Amount” (Stripe’s Payments export has it) or a Disputed yes/no column." };
  }
  const get = (r, k) => (cols[k] === undefined ? "" : String(r[cols[k]] ?? "").trim());
  const events = [], skipped = [];
  let ignored = 0, otherCurrency = 0, currency = "";
  const counts = new Map();
  for (let i = 1; i < table.length; i++) {
    const c = get(table[i], "currency").toUpperCase();
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  for (let i = 1; i < table.length; i++) {
    const r = table[i], line = table[i].line ?? i + 1;
    const status = get(r, "status").toLowerCase();
    if (IGNORED.has(status)) { ignored++; continue; }
    if (!SETTLED.has(status)) { skipped.push({ line, reason: `status “${get(r, "status")}” not recognised` }); continue; }
    const at = parseDate(get(r, "date"));
    if (!at) { skipped.push({ line, reason: "date not readable" }); continue; }
    const amount = parseAmount(get(r, "amount"));
    if (amount === null) { skipped.push({ line, reason: "amount not readable" }); continue; }
    const cur = get(r, "currency").toUpperCase();
    if (cur && currency && cur !== currency) { otherCurrency++; continue; }
    const flag = get(r, "disputed").toLowerCase();
    if (flag && !TRUTHY.has(flag) && !FALSY.has(flag)) { skipped.push({ line, reason: `disputed value “${get(r, "disputed")}” not recognised` }); continue; }
    const dAmt = parseAmount(get(r, "disputedAmount"));
    const dDate = parseDate(get(r, "disputeDate"));
    const fraudFlag = get(r, "fraud").toLowerCase();
    const disputed = TRUTHY.has(flag) || (dAmt !== null && dAmt > 0) || dDate !== null || ["disputed", "lost", "won", "charged back"].includes(status);
    events.push({
      line, at, month: monthOf(at), amount,
      brand: get(r, "brand").toLowerCase() || "",
      customer: get(r, "customer"),
      disputed,
      earlyFraud: TRUTHY.has(fraudFlag) && !disputed,
      disputedAmount: disputed ? (dAmt !== null && dAmt > 0 ? dAmt : amount) : 0,
      disputeMonth: disputed ? monthOf(dDate || at) : null,
      reason: disputed ? normalizeReason(get(r, "disputeReason")) || "unspecified" : "",
    });
  }
  return { events, skipped, ignored, currency, otherCurrency, columns: cols };
}

export function statusFor(ratio, o) {
  if (ratio === null) return "none";
  if (ratio >= o.excessive) return "excessive";
  if (ratio >= o.elevated) return "elevated";
  if (ratio >= o.warn) return "watch";
  return "ok";
}

// Disputes that can still arrive before the ratio reaches the threshold
// (the ratio is flagged AT the threshold, so one fewer than that).
export function headroom(txns, disputes, threshold) {
  return Math.ceil(threshold * txns - 1e-9) - 1 - disputes;
}

// Settled transactions needed so that the disputes already in hand fall below
// the threshold.
export function txnsToDilute(disputes, threshold) {
  return Math.floor(disputes / threshold + 1e-9) + 1;
}

function bucket(map, key, f) {
  const b = map.get(key) || { key, txns: 0, disputes: 0, amount: 0 };
  f(b);
  map.set(key, b);
}

const pctOf = (n, d) => (d > 0 ? n / d : null);

export function analyze(events, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (!events.length) return { invalid: "No settled charges found in the file." };
  if (!(o.warn > 0) || !(o.elevated >= o.warn) || !(o.excessive >= o.elevated)) {
    return { invalid: "Thresholds must satisfy 0 < watch ≤ elevated ≤ excessive." };
  }
  const months = new Map();
  const m = (key) => {
    if (!months.has(key)) months.set(key, { key, txns: 0, disputes: 0, disputedAmount: 0, volume: 0, earlyFraud: 0 });
    return months.get(key);
  };
  const brands = new Map(), reasons = new Map(), customers = new Map();
  // Per network and month: charges in the charge month, disputes in the
  // dispute month, early fraud warnings in the charge month (no EFW date in
  // the export).
  const netMonths = new Map();
  const nm = (net, key) => {
    const k = `${net}|${key}`;
    if (!netMonths.has(k)) netMonths.set(k, { network: net, key, txns: 0, disputes: 0, earlyFraud: 0 });
    return netMonths.get(k);
  };
  let txns = 0, disputes = 0, volume = 0, disputedAmount = 0;
  for (const e of events) {
    const row = m(e.month);
    row.txns++; row.volume += e.amount; txns++; volume += e.amount;
    if (e.earlyFraud) row.earlyFraud++;
    const net = networkOf(e.brand);
    nm(net, e.month).txns++;
    if (e.earlyFraud) nm(net, e.month).earlyFraud++;
    if (e.disputed) nm(net, e.disputeMonth).disputes++;
    bucket(brands, e.brand || "(not in file)", (b) => { b.txns++; });
    if (e.disputed) {
      const dm = m(e.disputeMonth);
      dm.disputes++; dm.disputedAmount += e.disputedAmount;
      disputes++; disputedAmount += e.disputedAmount;
      bucket(brands, e.brand || "(not in file)", (b) => { b.disputes++; b.amount += e.disputedAmount; });
      bucket(reasons, e.reason, (b) => { b.disputes++; b.amount += e.disputedAmount; });
      if (e.customer) bucket(customers, e.customer, (b) => { b.disputes++; b.amount += e.disputedAmount; });
    }
  }
  const byMonth = [...months.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((r) => {
    const counted = r.disputes + (o.includeFraud ? r.earlyFraud : 0);
    const ratio = pctOf(counted, r.txns);
    return { ...r, counted, ratio, status: statusFor(ratio, o) };
  });
  // Disputes can land in a month with no sales in the file; the latest month that has charges is the one to judge.
  const last = [...byMonth].reverse().find((r) => r.txns > 0);

  // Brand rows are only ranked once there is enough volume for a ratio to mean something.
  const byBrand = [...brands.values()].map((b) => ({ ...b, ratio: pctOf(b.disputes, b.txns) })).sort((a, b) => b.disputes - a.disputes || b.txns - a.txns);
  const byReason = [...reasons.values()].map((b) => ({ ...b, share: pctOf(b.disputes, disputes), action: REASON_ACTIONS[b.key] || "" })).sort((a, b) => b.disputes - a.disputes);
  const repeat = [...customers.values()].filter((c) => c.disputes >= 2).sort((a, b) => b.disputes - a.disputes || b.amount - a.amount).slice(0, 10);

  // Headroom and dilution for the most recent month.
  const lines = [["watch", o.warn], ["elevated", o.elevated], ["excessive", o.excessive]];
  const room = lines.map(([name, t]) => {
    const h = headroom(last.txns, last.counted, t);
    return { name, threshold: t, headroom: h, txnsNeeded: h < 0 ? txnsToDilute(last.counted, t) : null, extraTxns: h < 0 ? txnsToDilute(last.counted, t) - last.txns : 0 };
  });

  // Each brand's own ratio in the judged month, against your lines, and the
  // two network programmes as they count.
  const get = (net, key) => netMonths.get(`${net}|${key}`) || { network: net, key, txns: 0, disputes: 0, earlyFraud: 0 };
  const brandLatest = [...new Set([...netMonths.values()].map((r) => r.network))].filter((n) => n)
    .map((net) => {
      const r = get(net, last.key);
      const counted = r.disputes + (o.includeFraud ? r.earlyFraud : 0);
      const ratio = pctOf(counted, r.txns);
      return { ...r, counted, ratio, status: statusFor(ratio, o) };
    })
    .filter((r) => r.txns > 0 || r.disputes > 0)
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
  const programmes = [];
  const visa = get("visa", last.key);
  if (visa.txns > 0 || visa.disputes > 0) {
    const P = PROGRAMMES.vamp;
    const line = last.key < "2026-04" ? P.lineBefore20260401 : P.line;
    const count = visa.disputes + visa.earlyFraud;
    const ratio = pctOf(count, visa.txns);
    const overRatio = ratio !== null && ratio >= line;
    programmes.push({
      id: "vamp", name: P.name, month: last.key, numerator: count,
      numeratorText: `${visa.disputes} disputes + ${visa.earlyFraud} fraud warnings`,
      denominator: visa.txns, denominatorText: `${visa.txns} Visa charges in ${last.key}`,
      ratio, line, minCount: P.minCount, overRatio, countMet: count >= P.minCount,
      reading: ratio === null ? "no Visa charges this month" : !overRatio ? "under the line" : count >= P.minCount ? "over the line and the minimum count" : `over the ratio line; below the ${P.minCount.toLocaleString("en-US")} count minimum`,
    });
  }
  const mcNow = get("mastercard", last.key), pm = prevMonth(last.key), mcPrev = get("mastercard", pm);
  if (mcNow.txns > 0 || mcNow.disputes > 0 || mcPrev.txns > 0) {
    const P = PROGRAMMES.ecm;
    const ratio = pctOf(mcNow.disputes, mcPrev.txns);
    const level = ratio === null ? null : ratio >= P.hecm && mcNow.disputes >= P.hecmMin ? "HECM" : ratio >= P.ecm && mcNow.disputes >= P.ecmMin ? "ECM" : null;
    const overRatio = ratio !== null && ratio >= P.ecm;
    programmes.push({
      id: "ecm", name: P.name, month: last.key, numerator: mcNow.disputes,
      numeratorText: `${mcNow.disputes} chargebacks in ${last.key}`,
      denominator: mcPrev.txns, denominatorText: `${mcPrev.txns} Mastercard charges in ${pm} (the previous month)`,
      ratio, line: P.ecm, minCount: P.ecmMin, overRatio, countMet: mcNow.disputes >= P.ecmMin, level,
      reading: ratio === null ? `no Mastercard charges in ${pm} in the file, so the ratio cannot be computed` : level ? `${level} (excessive chargeback merchant)` : overRatio ? `over the 1.50% ratio line; below the ${P.ecmMin} chargeback minimum` : "under the line",
    });
  }

  // Trend: average month-over-month change in ratio across the last up-to-four
  // months that have sales, projected forward. Arithmetic, not a forecast.
  const withRatio = byMonth.filter((r) => r.ratio !== null).slice(-4);
  let projection = null;
  if (withRatio.length >= 3) {
    const slope = (withRatio[withRatio.length - 1].ratio - withRatio[0].ratio) / (withRatio.length - 1);
    const cur = withRatio[withRatio.length - 1].ratio;
    const next = (n) => Math.max(0, cur + slope * n);
    const cross = (t) => {
      if (cur >= t) return 0;
      if (slope <= 0) return null;
      return Math.ceil((t - cur) / slope - 1e-9);
    };
    projection = { slope, cur, next3: [1, 2, 3].map(next), monthsToWatch: cross(o.warn), monthsToElevated: cross(o.elevated), monthsToExcessive: cross(o.excessive), basis: withRatio.length };
  }

  const exposure = disputedAmount * (1 - Math.min(1, Math.max(0, o.winRate)));
  const cost = { fees: disputes * o.fee, exposure, total: disputes * o.fee + exposure, winRate: o.winRate };

  const findings = [];
  const pc = (x) => `${(x * 100).toFixed(2)}%`;
  const countCaveat = (n) => `Networks measure each brand on its own and also need a minimum count before they identify a merchant (Visa VAMP ${PROGRAMMES.vamp.minCount.toLocaleString("en-US")} fraud reports plus disputes, Mastercard ECM ${PROGRAMMES.ecm.ecmMin} chargebacks); this month has ${n} dispute${n === 1 ? "" : "s"} in total${n < PROGRAMMES.ecm.ecmMin ? ", under both minimums" : ""}.`;
  if (last.status === "excessive" || last.status === "elevated") {
    findings.push({ severity: "high", title: `${last.key}: ${pc(last.ratio)} of settled charges were disputed (${last.status})`, detail: `${last.disputes} disputes on ${last.txns} charges is above your ${last.status} line of ${pc(last.status === "excessive" ? o.excessive : o.elevated)}. ${countCaveat(last.disputes)} Compare this with the figures your payment provider or acquirer quotes you.` });
  } else if (last.status === "watch") {
    findings.push({ severity: "medium", title: `${last.key}: ${pc(last.ratio)} is above your early-warning line`, detail: `${last.disputes} disputes on ${last.txns} charges. Under your elevated line of ${pc(o.elevated)}, with room for ${Math.max(0, room[1].headroom)} more disputes this month before it is reached.` });
  } else {
    findings.push({ severity: "info", title: `${last.key}: ${last.ratio === null ? "no sales" : pc(last.ratio)}, under your early-warning line`, detail: `${last.disputes} disputes on ${last.txns} charges. ${room[0].headroom + 1} more disputes would reach the ${pc(o.warn)} watch line this month.` });
  }
  if (last.txns > 0 && last.txns < 200) {
    findings.push({ severity: "info", title: "Small month: one dispute moves the ratio a lot", detail: `With ${last.txns} charges, a single dispute is ${pc(1 / last.txns)} of the denominator. Read this month together with the trend, and know that programs usually also require a minimum number of disputes before any ratio counts.` });
  }
  if (projection && projection.slope > 0.0005) {
    const when = projection.monthsToExcessive === 0 ? "already above" : projection.monthsToExcessive !== null ? `would cross your excessive line in about ${projection.monthsToExcessive} month(s)` : "";
    findings.push({ severity: projection.monthsToElevated !== null && projection.monthsToElevated <= 3 ? "high" : "medium", title: `The ratio is rising by about ${(projection.slope * 100).toFixed(2)} points a month`, detail: `Over the last ${projection.basis} months. Continuing at that pace it ${when || "stays under the excessive line for now"}. This is a straight line through your own months, not a prediction.` });
  }
  const top = byReason[0];
  if (top && top.share >= 0.4 && disputes >= 5) {
    findings.push({ severity: "medium", title: `${Math.round(top.share * 100)}% of disputes are “${top.key.replace(/_/g, " ")}”`, detail: top.action || "One reason dominates: read those disputes first, because fixing one cause moves the ratio most." });
  }
  if (repeat.length) {
    findings.push({ severity: "medium", title: `${repeat.length} customer(s) disputed more than once`, detail: `Together ${repeat.reduce((s, c) => s + c.disputes, 0)} disputes. Repeat disputers are the cheapest to prevent: stop selling to them and look for what they have in common.` });
  }
  for (const p of programmes) {
    if (!p.overRatio) continue;
    const identified = p.id === "ecm" ? Boolean(p.level) : p.countMet;
    findings.push({
      severity: identified ? "high" : "medium",
      title: `${p.name} ${p.month}: ${pc(p.ratio)} (${p.reading})`,
      detail: `${p.numeratorText} ÷ ${p.denominatorText}, against the published ${pc(p.line)} line${identified ? "." : ` and minimum count of ${p.minCount.toLocaleString("en-US")}. Below the count minimum the network does not identify you on this programme by itself, but acquirers watch the ratio and can apply their own lines.`}`,
    });
  }
  const rank = { none: 0, ok: 0, watch: 1, elevated: 2, excessive: 3 };
  const hotBrand = brandLatest.find((b) => b.txns > 0 && rank[b.status] >= 2 && rank[b.status] > rank[last.status]);
  if (hotBrand) {
    findings.push({ severity: "high", title: `${hotBrand.network} alone is at ${pc(hotBrand.ratio)} in ${last.key} (${hotBrand.status})`, detail: `${hotBrand.counted} of ${hotBrand.txns} ${hotBrand.network} charges, while the blended figure for all brands is ${pc(last.ratio)}. Networks measure each brand separately, so this brand's line is the one that binds.` });
  }
  const worstBrand = byBrand.find((b) => b.txns >= 50 && b.key !== "(not in file)" && b.ratio !== null && b.ratio >= 2 * (disputes / txns) && b.disputes >= 3);
  if (worstBrand) {
    findings.push({ severity: "info", title: `${worstBrand.key} disputes run at ${pc(worstBrand.ratio)}`, detail: `More than twice the overall ${pc(disputes / txns)}. Networks measure each brand separately, so a bad month on one brand can matter even when the blended figure looks fine.` });
  }
  const efw = byMonth.reduce((s, r) => s + r.earlyFraud, 0);
  if (efw > 0) findings.push({ severity: "info", title: `${efw} early fraud warning(s) not yet disputed`, detail: o.includeFraud ? "They are counted in the monthly ratio above, as Visa VAMP counts TC40 fraud reports alongside disputes. Refunding them early may stop a dispute from being filed." : "Visa VAMP counts fraud reports alongside disputes; the monthly ratio above does not (tick “Count early fraud warnings” to include them), but the Visa VAMP row does. Refunding them early may stop a dispute from being filed." });

  return {
    summary: { txns, disputes, volume, disputedAmount, ratio: pctOf(disputes, txns), from: byMonth[0].key, to: byMonth[byMonth.length - 1].key, months: byMonth.length },
    options: o, byMonth, byBrand, brandLatest, programmes, byReason, repeat, room, projection, cost, findings,
  };
}

export const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(2)}%`);

export function sampleCsv() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lines = ["id,Created (UTC),Amount,Currency,Status,Customer ID,Card Brand,Disputed Amount,Dispute Date (UTC),Dispute Reason"];
  const brands = ["visa", "visa", "visa", "mastercard", "mastercard", "amex"];
  const reasons = [["fraudulent", 0.5], ["product_not_received", 0.2], ["unrecognized", 0.15], ["subscription_canceled", 0.1], ["general", 0.05]];
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
  const perMonth = [820, 860, 910, 980, 1040, 1100];
  const rate = [0.0035, 0.0048, 0.0061, 0.0082, 0.0104, 0.0128];
  let n = 0, cust = 0;
  const heavy = ["cus_9001", "cus_9002"];
  for (let m = 0; m < 6; m++) {
    for (let i = 0; i < perMonth[m]; i++) {
      const day = Math.floor(rnd() * 28);
      const at = new Date(Date.UTC(2026, m, 1 + day, 8 + Math.floor(rnd() * 10)));
      const amount = [19, 29, 49, 79, 129][Math.floor(rnd() * 5)];
      const brand = brands[Math.floor(rnd() * brands.length)];
      let id = `cus_${1000 + (++cust % 700)}`;
      const dispute = rnd() < rate[m];
      let status = "Paid", dAmt = "", dDate = "", reason = "";
      if (dispute) {
        let pick = rnd(), r = reasons[0][0];
        for (const [k, w] of reasons) { if (pick < w) { r = k; break; } pick -= w; }
        if (rnd() < 0.12) id = heavy[Math.floor(rnd() * 2)];
        dAmt = `${amount}.00`;
        const d = new Date(at.getTime() + (5 + Math.floor(rnd() * 15)) * 86400000);
        dDate = fmt(d);
        reason = r;
      } else if (rnd() < 0.03) status = "Refunded";
      lines.push(`ch_${++n},${fmt(at)},${amount}.00,USD,${status},${id},${brand},${dAmt},${dDate},${reason}`);
    }
  }
  for (let i = 0; i < 40; i++) lines.push(`ch_${++n},2026-03-${pad(1 + (i % 27))} 10:00:00,${29}.00,USD,Failed,cus_${2000 + i},visa,,,`);
  return lines.join("\n");
}
