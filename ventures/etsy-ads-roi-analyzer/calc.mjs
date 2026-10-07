// Etsy Ads listing-performance analysis. Takes the per-listing table a seller
// exports from Etsy Stats / Advertising and answers what the dashboard's ROAS
// figure does not: after Etsy's fees and the seller's own margin, did each
// advertised listing make money, and which should be paused, lowered or kept?
// Pure functions, no DOM, no network.

const ALIASES = {
  id: ["listing id", "listing_id", "etsy listing id"],
  title: ["listing", "listing title", "title", "listing name", "item", "item name", "product", "name"],
  views: ["views", "ad views", "impressions", "ad impressions", "total views"],
  clicks: ["clicks", "ad clicks", "total clicks"],
  orders: ["orders", "ad orders", "purchases", "orders from ads", "attributed orders", "sales count", "conversions"],
  revenue: ["revenue", "revenue ($)", "ad revenue", "attributed revenue", "revenue from ads", "total revenue", "sales ($)", "sales revenue", "revenue (usd)"],
  spend: ["spend", "spend ($)", "ad spend", "ad spend ($)", "advertising spend", "total spend", "cost", "ad cost", "budget spent", "spent", "spend (usd)"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "$1,234.50", "(12.00)", "12.5%", "--" -> number | null
export function parseNumber(value) {
  let s = String(value ?? "").trim();
  if (!s || /^(--+|n\/a|na|-)$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$€£,%\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Some exports carry a title or date-range line above the header.
function headerIndex(table) {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols = findColumns(table[i]);
    if (cols.spend !== undefined && cols.revenue !== undefined && (cols.id !== undefined || cols.title !== undefined)) return i;
  }
  return -1;
}

// Returns { listings, skipped, columns } or { error }. Rows for the same
// listing (several date rows or campaigns) are summed.
export function normalizeRows(table) {
  if (!table.length) return { error: "The file is empty." };
  const h = headerIndex(table);
  if (h === -1) {
    return { error: "Could not find the columns. Needs a listing title or ID, a Revenue column and a Spend column (Etsy Stats > Marketing > Etsy Ads, listing table; views, clicks and orders are used when present)." };
  }
  const cols = findColumns(table[h]);
  const byKey = new Map();
  const skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const first = String(r[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|grand total|summary|all listings)\b/.test(first)) continue;
    const get = (f) => (cols[f] === undefined ? undefined : r[cols[f]]);
    const spend = parseNumber(get("spend"));
    const revenue = parseNumber(get("revenue"));
    if (spend === null && revenue === null) { skipped.push({ line, reason: "no revenue or spend figure" }); continue; }
    const id = String(get("id") ?? "").trim();
    const title = String(get("title") ?? "").trim();
    const key = id || title.toLowerCase();
    if (!key) { skipped.push({ line, reason: "no listing title or ID" }); continue; }
    const cur = byKey.get(key) || { id, title, views: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, hasOrders: false, hasClicks: false, rows: 0 };
    if (!cur.title && title) cur.title = title;
    const v = parseNumber(get("views")), c = parseNumber(get("clicks")), o = parseNumber(get("orders"));
    cur.views += v ?? 0;
    if (c !== null) { cur.clicks += c; cur.hasClicks = true; }
    if (o !== null) { cur.orders += o; cur.hasOrders = true; }
    cur.revenue += revenue ?? 0;
    cur.spend += spend ?? 0;
    cur.rows += 1;
    byKey.set(key, cur);
  }
  const listings = [...byKey.values()];
  if (!listings.length) return { error: "No listing rows could be read from the file.", skipped };
  return { listings, skipped, columns: cols };
}

// Etsy's published rates change and vary by region, so these are editable
// approximations, not a quote: transaction fee ~6.5% of item + shipping,
// payment processing ~3% + $0.25 per order in the US.
export const DEFAULTS = { marginPct: 40, txnFeePct: 6.5, processingPct: 3, perOrderFee: 0.25, organicPct: 0 };

// `marginPct` is profit as a % of revenue AFTER item cost, materials and
// shipping you pay but BEFORE Etsy fees and ad spend. Etsy fees are then
// subtracted separately so the seller can edit them. `organicPct` is the
// share of ad-credited sales assumed to have sold anyway (Etsy Ads also
// credits orders that follow any ad click, and offsite ads are separate).
export function analyze(listings, opts = {}) {
  const pick = (k) => (Number.isFinite(opts[k]) ? opts[k] : DEFAULTS[k]);
  const marginPct = pick("marginPct"), txnFeePct = pick("txnFeePct"), processingPct = pick("processingPct");
  const perOrderFee = pick("perOrderFee"), organicPct = pick("organicPct");
  if (!(marginPct > 0 && marginPct <= 100)) return { invalid: "Item margin must be above 0% and at most 100%." };
  if (!(txnFeePct >= 0 && processingPct >= 0 && txnFeePct + processingPct < 100)) return { invalid: "Etsy fee percentages must be zero or more and add up to under 100%." };
  if (!(perOrderFee >= 0)) return { invalid: "The per-order fee cannot be negative." };
  if (!(organicPct >= 0 && organicPct < 100)) return { invalid: "The share that would have sold anyway must be from 0% up to (not including) 100%." };
  if (!listings || !listings.length) return { invalid: "No listings to analyze." };
  const m = marginPct / 100, o = organicPct / 100, feeRate = (txnFeePct + processingPct) / 100;

  const rows = listings.map((l) => {
    const etsyFees = l.revenue * feeRate + l.orders * perOrderFee;
    const profitBeforeAds = l.revenue * m - etsyFees;
    const profitAfterAds = profitBeforeAds - l.spend; // every credited order caused by the ad
    const incrementalProfit = profitBeforeAds * (1 - o) - l.spend; // only the share the ad caused
    const roas = l.spend > 0 ? l.revenue / l.spend : null;
    // ROAS at which ad spend equals profit before ads (the ad must have caused every order).
    const breakEvenRoas = profitBeforeAds > 0 && l.revenue > 0 ? l.revenue / profitBeforeAds : Infinity;
    const breakEvenRoasAdjusted = profitBeforeAds > 0 && l.revenue > 0 ? l.revenue / (profitBeforeAds * (1 - o)) : Infinity;
    let action;
    if (l.spend <= 0) action = l.revenue > 0 ? "no-spend" : "idle";
    else if (l.hasOrders && l.orders <= 0 || l.revenue <= 0) action = "pause";
    else if (profitAfterAds < 0) action = "pause";
    else if (incrementalProfit < 0) action = "lower";
    else action = "keep";
    return {
      ...l, etsyFees, profitBeforeAds, profitAfterAds, incrementalProfit, roas, breakEvenRoas, breakEvenRoasAdjusted, action,
      costPerOrder: l.orders > 0 ? l.spend / l.orders : null,
      costPerClick: l.clicks > 0 ? l.spend / l.clicks : null,
      clickRate: l.views > 0 && l.hasClicks ? l.clicks / l.views : null,
    };
  });
  // Rank: pause (worst loss first), then lower, then keep (best incremental profit first).
  const order = { pause: 0, lower: 1, keep: 2, "no-spend": 3, idle: 4 };
  rows.sort((a, b) => order[a.action] - order[b.action] ||
    (a.action === "keep" ? b.incrementalProfit - a.incrementalProfit : a.profitAfterAds - b.profitAfterAds));
  rows.forEach((r, i) => { r.rank = i + 1; });

  const t = rows.reduce((a, r) => ({
    spend: a.spend + r.spend, revenue: a.revenue + r.revenue, orders: a.orders + r.orders, clicks: a.clicks + r.clicks,
    etsyFees: a.etsyFees + r.etsyFees, profitBeforeAds: a.profitBeforeAds + r.profitBeforeAds,
    profitAfterAds: a.profitAfterAds + r.profitAfterAds, incremental: a.incremental + r.incrementalProfit,
  }), { spend: 0, revenue: 0, orders: 0, clicks: 0, etsyFees: 0, profitBeforeAds: 0, profitAfterAds: 0, incremental: 0 });
  const by = (act) => rows.filter((r) => r.action === act);
  const summary = {
    listings: rows.length, ...t, marginPct, txnFeePct, processingPct, perOrderFee, organicPct,
    roas: t.spend > 0 ? t.revenue / t.spend : null,
    breakEvenRoas: t.profitBeforeAds > 0 ? t.revenue / t.profitBeforeAds : Infinity,
    costPerOrder: t.orders > 0 ? t.spend / t.orders : null,
    pause: by("pause"), lower: by("lower"), keep: by("keep"),
    spendOnPause: by("pause").reduce((a, r) => a + r.spend, 0),
    spendOnLower: by("lower").reduce((a, r) => a + r.spend, 0),
  };
  return { rows, summary, findings: findings(rows, summary) };
}

export function money(n) {
  const v = Math.round(n * 100) / 100;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}
const label = (r) => (r.title ? r.title.slice(0, 60) : r.id);

function findings(rows, s) {
  const out = [];
  if (s.spend > 0 && s.profitAfterAds < 0) {
    out.push({ severity: "high", title: "Ads cost more than the profit on the orders they are credited with", detail: `You spent ${money(s.spend)} on ads for ${money(s.revenue)} of credited revenue. After your margin and about ${money(s.etsyFees)} of Etsy fees, profit before ads is ${money(s.profitBeforeAds)}, so even if the ads caused every order you are ${money(-s.profitAfterAds)} behind.` });
  } else if (s.spend > 0) {
    out.push({ severity: "info", title: `Profit after ads and fees is ${money(s.profitAfterAds)} if the ads caused every order`, detail: `With an assumption of ${s.organicPct}% selling anyway it is ${money(s.incremental)}. ROAS ${s.roas.toFixed(2)}x against a break-even of ${Number.isFinite(s.breakEvenRoas) ? s.breakEvenRoas.toFixed(2) + "x" : "n/a"} at your margin and fees.` });
  }
  if (s.pause.length) {
    const worst = s.pause.slice(0, 5).map((r) => `${label(r)} ${money(r.profitAfterAds)}`).join("; ");
    out.push({ severity: "high", title: `${s.pause.length} listing${s.pause.length === 1 ? "" : "s"} to pause`, detail: `${money(s.spendOnPause)} of spend on listings that lose money even if the ad caused every order, or that had no order at all. Worst: ${worst}.` });
  }
  if (s.lower.length) {
    out.push({ severity: "medium", title: `${s.lower.length} listing${s.lower.length === 1 ? "" : "s"} to lower the budget on`, detail: `They are profitable if the ad caused every order but lose at ${s.organicPct}% selling anyway: ` + s.lower.slice(0, 5).map((r) => `${label(r)} ROAS ${r.roas.toFixed(2)}x vs ${r.breakEvenRoasAdjusted.toFixed(2)}x needed`).join("; ") + "." });
  }
  const top3 = rows.slice().sort((a, b) => b.spend - a.spend).slice(0, 3);
  if (s.spend > 0 && rows.length > 3) {
    const share = top3.reduce((a, r) => a + r.spend, 0) / s.spend;
    if (share >= 0.5) out.push({ severity: "info", title: `Three listings take ${pct(share, 0)} of your ad spend`, detail: top3.map((r) => `${label(r)} ${money(r.spend)}`).join("; ") + ". Checking these first covers most of the spend." });
  }
  const noOrders = rows.filter((r) => r.spend > 0 && r.orders <= 0 && r.hasOrders);
  if (noOrders.length) out.push({ severity: "info", title: `${noOrders.length} listing${noOrders.length === 1 ? "" : "s"} spent money with zero orders`, detail: "Etsy Ads credits orders that follow an ad click within a window; a listing may still sell by other routes. Low click counts make this noisy, so give a listing a few hundred views before judging it." });
  return out;
}

export function sampleCsv() {
  return [
    "Etsy Ads listings, sample data",
    "Listing,Views,Clicks,Orders,Revenue,Spend",
    'Hand-poured soy candle set,4200,126,14,"$392.00","$61.20"',
    'Personalised leather keyring,9800,210,31,"$589.00","$88.50"',
    'Linen tea towel pair,3100,40,2,"$64.00","$37.40"',
    'Ceramic mug speckled,5200,95,0,"$0.00","$29.10"',
    'Wax melt sampler,2600,70,9,"$126.00","$41.00"',
    'Printable wedding planner PDF,12100,260,48,"$288.00","$22.00"',
    'Total,36000,801,104,"$1,459.00","$279.20"',
  ].join("\n");
}
