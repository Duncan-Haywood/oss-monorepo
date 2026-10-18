// Investor update builder: pure arithmetic and text assembly, no I/O. Every figure on the page comes from here.
export const MAX_MONTHS = 12;
export const MIN_MONTHS = 2;
export const HORIZON = 60;

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const sum = (a) => a.reduce((s, x) => s + x, 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function money(x) {
  const v = Math.round(x);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
export function moneyShort(x) {
  const a = Math.abs(x), sign = x < 0 ? "-" : "";
  if (a >= 1e9) return sign + "$" + +(a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + "$" + +(a / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return sign + "$" + +(a / 1e3).toFixed(1) + "K";
  return sign + "$" + Math.round(a).toLocaleString("en-US");
}
export const pct = (x, d = 1) => (x >= 0 ? "" : "-") + Math.abs(x * 100).toFixed(d) + "%";
export const signedPct = (x, d = 1) => (x >= 0 ? "+" : "-") + Math.abs(x * 100).toFixed(d) + "%";

// "2026-09" and an offset back in months -> "Sep 2026". Returns "" for a bad month.
export function monthLabel(ym, back = 0) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return "";
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) - back;
  if (Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return MONTHS[((idx % 12) + 12) % 12] + " " + Math.floor(idx / 12);
}

export function normalize(raw) {
  const errors = [];
  const rows = (raw.months || []).map((r) => ({ mrr: num(r.mrr), customers: num(r.customers), cash: num(r.cash), raised: r.raised === "" || r.raised == null ? 0 : num(r.raised) }));
  const opt = (v) => (v === "" || v === null || v === undefined ? null : num(v));
  const input = {
    company: String(raw.company || "").trim() || "Our company",
    latest: String(raw.latest || ""),
    months: rows,
    newMrr: opt(raw.newMrr), expansionMrr: opt(raw.expansionMrr), contractionMrr: opt(raw.contractionMrr), churnedMrr: opt(raw.churnedMrr),
    highlights: lines(raw.highlights), lowlights: lines(raw.lowlights), asks: lines(raw.asks), hiring: lines(raw.hiring),
  };
  if (rows.length < MIN_MONTHS) errors.push("Enter at least " + MIN_MONTHS + " months so a change and a burn rate can be worked out.");
  if (rows.length > MAX_MONTHS) errors.push("Up to " + MAX_MONTHS + " months.");
  if (!monthLabel(input.latest)) errors.push("Pick the month this update covers.");
  rows.forEach((r, i) => {
    const n = i + 1;
    if (!(r.mrr >= 0)) errors.push("Month " + n + ": MRR must be zero or more.");
    if (!(r.customers >= 0)) errors.push("Month " + n + ": customers must be zero or more.");
    if (!(r.cash >= 0)) errors.push("Month " + n + ": cash in the bank must be zero or more.");
    if (!(r.raised >= 0)) errors.push("Month " + n + ": money raised must be zero or more.");
  });
  for (const k of ["newMrr", "expansionMrr", "contractionMrr", "churnedMrr"]) if (input[k] !== null && !(input[k] >= 0)) errors.push("The MRR movement fields must be zero or more.");
  return { input, errors };
}

function lines(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || "").split(/\r?\n/).map((x) => x.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
}

// Paul Graham's "default alive": at the current growth rate, with expenses held flat, does revenue overtake
// expenses before the cash runs out?
export function projectAlive(mrr, cash, burn, g) {
  const expenses = mrr + burn;
  let c = cash, low = cash;
  if (burn <= 0) return { alive: true, profitMonth: 0, lowestCash: cash, cashOutMonth: null };
  for (let t = 1; t <= HORIZON; t++) {
    const rev = mrr * Math.pow(1 + g, t);
    c += rev - expenses;
    if (c < low) low = c;
    if (c < 0) return { alive: false, profitMonth: null, lowestCash: c, cashOutMonth: t };
    if (rev >= expenses) return { alive: true, profitMonth: t, lowestCash: low, cashOutMonth: null };
  }
  return { alive: false, profitMonth: null, lowestCash: low, cashOutMonth: null, beyondHorizon: true };
}

export function requiredGrowth(mrr, cash, burn) {
  if (burn <= 0) return 0;
  if (!projectAlive(mrr, cash, burn, 1).alive) return null;
  let lo = 0, hi = 1;
  if (projectAlive(mrr, cash, burn, 0).alive) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (projectAlive(mrr, cash, burn, mid).alive) hi = mid; else lo = mid;
  }
  return hi;
}

function burnClass(x) {
  if (x < 1) return "amazing";
  if (x < 1.5) return "great";
  if (x < 2) return "good";
  if (x < 3) return "suspect";
  return "bad";
}

export function analyze(raw) {
  const { input, errors } = normalize(raw);
  if (errors.length) return { ok: false, errors };
  const m = input.months, n = m.length, cur = m[n - 1], prev = m[n - 2];
  const notes = [];
  const series = m.map((r, i) => ({
    label: monthLabel(input.latest, n - 1 - i), mrr: r.mrr, customers: r.customers, cash: r.cash,
    growth: i > 0 && m[i - 1].mrr > 0 ? r.mrr / m[i - 1].mrr - 1 : null,
    burn: i > 0 ? m[i - 1].cash - r.cash + r.raised : null,
  }));
  const growth = series[n - 1].growth;
  const k = Math.min(3, n - 1);
  const base = m[n - 1 - k].mrr;
  const cmgr = base > 0 && cur.mrr > 0 ? Math.pow(cur.mrr / base, 1 / k) - 1 : null;
  const burns = series.slice(-k).map((s) => s.burn);
  const avgBurn = sum(burns) / burns.length;
  const lastBurn = series[n - 1].burn;
  const netNew = cur.mrr - prev.mrr;
  const runway = avgBurn > 0 ? cur.cash / avgBurn : null;
  const burnMultiple = avgBurn > 0 && netNew > 0 ? lastBurn / (netNew * 12) : null;
  const comps = [input.newMrr, input.expansionMrr, input.contractionMrr, input.churnedMrr];
  let quickRatio = null, churnRate = null, nrr = null;
  if (comps.every((c) => c !== null)) {
    const [nw, ex, co, ch] = comps;
    const movement = nw + ex - co - ch;
    if (Math.abs(movement - netNew) > Math.max(1, 0.02 * Math.abs(netNew), 0.002 * prev.mrr)) {
      notes.push("The MRR movements add to " + money(movement) + " but MRR changed by " + money(netNew) + ". Check for a missed reactivation, price change or typo.");
    }
    if (co + ch > 0) quickRatio = (nw + ex) / (co + ch);
    if (prev.mrr > 0) { churnRate = (co + ch) / prev.mrr; nrr = (prev.mrr + ex - co - ch) / prev.mrr; }
  }
  const alive = projectAlive(cur.mrr, cur.cash, avgBurn, cmgr ?? 0);
  const need = requiredGrowth(cur.mrr, cur.cash, avgBurn);
  const arpa = cur.customers > 0 ? cur.mrr / cur.customers : null;
  const flags = [];
  if (runway !== null && runway < 6) flags.push("Runway is under 6 months. Fundraising typically takes several months, so start now or cut burn.");
  else if (runway !== null && runway < 12) flags.push("Runway is under 12 months.");
  if (burnMultiple !== null && burnMultiple >= 3) flags.push("Burn multiple is " + burnMultiple.toFixed(1) + ", which investors read as inefficient growth.");
  if (growth !== null && growth < 0) flags.push("MRR fell this month.");
  if (churnRate !== null && churnRate > 0.05) flags.push("Monthly MRR churn is " + pct(churnRate) + ", high for a subscription business.");
  if (cur.raised > 0) notes.push("This month's burn excludes the " + money(cur.raised) + " raised, so it reflects operations only.");
  if (avgBurn <= 0) notes.push("Cash did not fall on average, so there is no runway limit and the default-alive test is skipped.");

  return {
    ok: true, input, series, notes, flags,
    mrr: cur.mrr, prevMrr: prev.mrr, arr: cur.mrr * 12, netNew, growth, cmgr, cmgrMonths: k,
    customers: cur.customers, prevCustomers: prev.customers, customerChange: cur.customers - prev.customers, arpa,
    cash: cur.cash, lastBurn, avgBurn, burnMonths: burns.length, runway, burnMultiple,
    burnClass: burnMultiple === null ? null : burnClass(burnMultiple),
    quickRatio, churnRate, nrr, alive, requiredGrowth: need, label: series[n - 1].label,
    cashOutLabel: runway !== null ? monthLabel(input.latest, -Math.floor(runway)) : null,
    profitLabel: alive.profitMonth ? monthLabel(input.latest, -alive.profitMonth) : null,
  };
}

export function aliveLine(R) {
  if (R.avgBurn <= 0) return "Cash flow positive: cash is not falling, so runway is not a constraint.";
  const g = R.cmgr === null ? 0 : R.cmgr;
  if (R.alive.alive) {
    return "Default alive: at " + signedPct(g) + " monthly growth with expenses flat, revenue overtakes expenses in about " + R.alive.profitMonth + " months (" + R.profitLabel + "), with cash bottoming at " + moneyShort(R.alive.lowestCash) + ".";
  }
  const need = R.requiredGrowth === null ? "more than 100% a month" : pct(R.requiredGrowth) + " a month";
  return "Default dead: at " + signedPct(g) + " monthly growth with expenses flat, cash runs out" + (R.alive.cashOutMonth ? " in about " + R.alive.cashOutMonth + " months" : "") + " before revenue catches up. It takes about " + need + " to get there.";
}

function autoHighlights(R) {
  const out = [];
  if (R.growth !== null) out.push("MRR " + (R.growth >= 0 ? "grew " : "fell ") + pct(Math.abs(R.growth)) + " to " + moneyShort(R.mrr) + " (" + (R.netNew >= 0 ? "+" : "-") + moneyShort(Math.abs(R.netNew)) + " net new).");
  if (R.customerChange !== 0) out.push("Customers " + (R.customerChange > 0 ? "up " : "down ") + Math.abs(R.customerChange) + " to " + R.customers.toLocaleString("en-US") + ".");
  return out;
}

export function buildEmail(R, format = "text") {
  const i = R.input, md = format === "md";
  const h = (t) => (md ? "## " + t : t.toUpperCase());
  const b = (t) => (md ? "- " + t : "  - " + t);
  const L = [];
  L.push((md ? "# " : "") + i.company + " investor update, " + R.label);
  L.push("");
  L.push(h("TL;DR"));
  autoHighlights(R).forEach((t) => L.push(b(t)));
  if (R.runway !== null) L.push(b("Cash " + moneyShort(R.cash) + ", net burn " + moneyShort(R.avgBurn) + "/month, runway " + R.runway.toFixed(1) + " months" + (R.cashOutLabel ? " (to about " + R.cashOutLabel + ")" : "") + "."));
  else L.push(b("Cash " + moneyShort(R.cash) + " and not falling."));
  L.push("");
  L.push(h("Key metrics"));
  const rows = [
    ["MRR", moneyShort(R.mrr), R.growth === null ? "" : signedPct(R.growth) + " MoM"],
    ["ARR", moneyShort(R.arr), ""],
    ["Customers", R.customers.toLocaleString("en-US"), (R.customerChange >= 0 ? "+" : "") + R.customerChange],
  ];
  if (R.cmgr !== null) rows.push(["Growth, last " + R.cmgrMonths + " mo", signedPct(R.cmgr), "compound monthly"]);
  if (R.arpa !== null) rows.push(["ARPA", moneyShort(R.arpa), "per customer per month"]);
  if (R.churnRate !== null) rows.push(["MRR churn", pct(R.churnRate), "net revenue retention " + pct(R.nrr)]);
  if (R.quickRatio !== null) rows.push(["SaaS quick ratio", R.quickRatio.toFixed(1), ""]);
  rows.push(["Cash", moneyShort(R.cash), ""]);
  rows.push(["Net burn", R.avgBurn > 0 ? moneyShort(R.avgBurn) + "/mo" : "none", "average of last " + R.burnMonths + " mo"]);
  if (R.runway !== null) rows.push(["Runway", R.runway.toFixed(1) + " months", R.cashOutLabel || ""]);
  if (R.burnMultiple !== null) rows.push(["Burn multiple", R.burnMultiple.toFixed(2), R.burnClass]);
  if (md) { L.push("| Metric | Value | Note |"); L.push("|---|---|---|"); rows.forEach((r) => L.push("| " + r.join(" | ") + " |")); }
  else { const w = Math.max(...rows.map((r) => r[0].length)); rows.forEach((r) => L.push("  " + r[0].padEnd(w + 2) + r[1] + (r[2] ? "  (" + r[2] + ")" : ""))); }
  L.push("");
  L.push(aliveLine(R));
  const sec = (title, items) => { if (items.length) { L.push(""); L.push(h(title)); items.forEach((t) => L.push(b(t))); } };
  sec("Highlights", i.highlights);
  sec("Lowlights", i.lowlights);
  sec("Asks", i.asks);
  sec("Hiring", i.hiring);
  L.push("");
  L.push("Thanks for the support. Reply with questions or intros.");
  return L.join("\n");
}

export function subjectLine(R) {
  const g = R.growth === null ? "" : ", MRR " + signedPct(R.growth) + " to " + moneyShort(R.mrr);
  return R.input.company + " update, " + R.label + g;
}

export function resultCsv(R) {
  const rows = [["Month", "MRR", "MRR growth", "Customers", "Cash", "Net burn"]];
  R.series.forEach((s) => rows.push([s.label, s.mrr, s.growth === null ? "" : (s.growth * 100).toFixed(2) + "%", s.customers, s.cash, s.burn === null ? "" : Math.round(s.burn)]));
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export function serializeState(raw) { return JSON.stringify({ kind: "investor-update-builder", version: 1, ...raw }, null, 2); }

export function parseState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!o || o.kind !== "investor-update-builder") return { error: "That is not a saved investor update." };
  if (!Array.isArray(o.months)) return { error: "The saved file is missing fields." };
  const { kind, version, ...state } = o;
  return { state };
}

export function sampleInput() {
  return {
    company: "Acme Analytics", latest: "2026-09",
    months: [
      { mrr: 31000, customers: 62, cash: 520000, raised: "" },
      { mrr: 34500, customers: 68, cash: 497000, raised: "" },
      { mrr: 38200, customers: 75, cash: 471000, raised: "" },
      { mrr: 42900, customers: 83, cash: 441000, raised: "" },
    ],
    newMrr: 5100, expansionMrr: 900, contractionMrr: 300, churnedMrr: 1000,
    highlights: "Closed our first $2K/month annual contract\nShipped the Slack integration", lowlights: "Two small customers churned after the price change",
    asks: "Intros to heads of data at 50-200 person e-commerce companies", hiring: "One senior full-stack engineer, remote",
  };
}
