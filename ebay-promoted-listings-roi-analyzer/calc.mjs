// eBay Promoted Listings report analysis. Takes the per-listing CSV a seller
// downloads from Seller Hub (Marketing > Reports) and answers the one question
// the report never does: after the ad fee, did each listing make money, and how
// much of its attributed sales had to be caused by the ad for it to pay?
// Pure functions, no DOM, no network.

const ALIASES = {
  id: ["listing id", "item id", "item number", "listing_id", "item_id", "ebay item id"],
  title: ["listing title", "title", "item title", "listing name", "item name"],
  campaign: ["campaign name", "campaign", "campaign_name"],
  impressions: ["impressions", "promoted listings impressions", "total impressions"],
  clicks: ["clicks", "promoted listings clicks", "total clicks"],
  sold: ["sold quantity", "quantity sold", "units sold", "items sold", "sold", "orders", "promoted listings sold quantity", "promoted listings quantity sold"],
  sales: ["sales", "sales ($)", "total sales", "promoted listings sales", "sales amount", "item sales", "ad sales", "attributed sales"],
  fees: ["ad fees", "ad fee", "ad fees ($)", "total ad fees", "promoted listings fees", "ad spend", "spend", "fees", "cost", "total cost"],
  adRate: ["ad rate", "ad rate (%)", "ad rate %", "campaign ad rate", "avg ad rate"],
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
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// eBay puts a few preamble lines (report name, date range) above the header
// in some downloads; find the first row that looks like the header.
function headerIndex(table) {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols = findColumns(table[i]);
    if (cols.fees !== undefined && cols.sales !== undefined && (cols.id !== undefined || cols.title !== undefined)) return i;
  }
  return -1;
}

// Returns { listings, skipped, columns } or { error }. Rows for the same
// listing (several campaigns, several date rows) are summed.
export function normalizeRows(table) {
  if (!table.length) return { error: "The file is empty." };
  const h = headerIndex(table);
  if (h === -1) {
    return { error: "Could not find the columns. Needs a listing ID or title, a Sales column and an Ad fees column (eBay Seller Hub > Marketing > Reports > Promoted Listings, listing report)." };
  }
  const cols = findColumns(table[h]);
  const byKey = new Map();
  const skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const first = String(r[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|grand total|summary)\b/.test(first)) continue;
    const get = (f) => (cols[f] === undefined ? undefined : r[cols[f]]);
    const fees = parseNumber(get("fees"));
    const sales = parseNumber(get("sales"));
    if (fees === null && sales === null) { skipped.push({ line, reason: "no sales or ad fee figure" }); continue; }
    const id = String(get("id") ?? "").trim();
    const title = String(get("title") ?? "").trim();
    const key = id || title.toLowerCase();
    if (!key) { skipped.push({ line, reason: "no listing ID or title" }); continue; }
    const cur = byKey.get(key) || { id, title, campaigns: new Set(), impressions: 0, clicks: 0, sold: 0, sales: 0, fees: 0, hasClicks: false, hasSold: false, rows: 0 };
    if (!cur.title && title) cur.title = title;
    const camp = String(get("campaign") ?? "").trim();
    if (camp) cur.campaigns.add(camp);
    const imp = parseNumber(get("impressions")), clk = parseNumber(get("clicks")), sld = parseNumber(get("sold"));
    cur.impressions += imp ?? 0;
    if (clk !== null) { cur.clicks += clk; cur.hasClicks = true; }
    if (sld !== null) { cur.sold += sld; cur.hasSold = true; }
    cur.sales += sales ?? 0;
    cur.fees += fees ?? 0;
    cur.rows += 1;
    byKey.set(key, cur);
  }
  const listings = [...byKey.values()].map((l) => ({ ...l, campaigns: [...l.campaigns] }));
  if (!listings.length) return { error: "No listing rows could be read from the file.", skipped };
  return { listings, skipped, columns: cols };
}

export const DEFAULTS = { marginPct: 25, organicPct: 0 };

// Per listing and in total. `marginPct` is profit as a % of the sale price
// BEFORE the ad fee (after item cost, eBay fees, shipping you pay). Only the
// seller knows it, so it is an input and every figure is conditional on it.
// `organicPct` is the share of ad-attributed sales assumed to have sold
// anyway; eBay credits the ad with any sale that follows a promoted click, so
// the true figure is not zero.
export function analyze(listings, opts = {}) {
  const marginPct = Number.isFinite(opts.marginPct) ? opts.marginPct : DEFAULTS.marginPct;
  const organicPct = Number.isFinite(opts.organicPct) ? opts.organicPct : DEFAULTS.organicPct;
  if (!(marginPct > 0 && marginPct <= 100)) return { invalid: "Profit margin must be above 0% and at most 100%." };
  if (!(organicPct >= 0 && organicPct < 100)) return { invalid: "The share that would have sold anyway must be from 0% up to (not including) 100%." };
  if (!listings || !listings.length) return { invalid: "No listings to analyze." };
  const m = marginPct / 100, o = organicPct / 100;

  const rows = listings.map((l) => {
    const profitBefore = l.sales * m;
    const attributedProfit = profitBefore - l.fees; // every attributed sale credited to the ad
    const incrementalProfit = l.sales * (1 - o) * m - l.fees; // only the share the ad caused
    // Share of attributed sales the ad must have CAUSED for the fee to pay for itself.
    const requiredCausedShare = l.fees > 0 ? (profitBefore > 0 ? l.fees / profitBefore : Infinity) : 0;
    const adRate = l.sales > 0 ? l.fees / l.sales : (l.fees > 0 ? Infinity : 0);
    let verdict;
    if (l.fees <= 0) verdict = l.sales > 0 ? "free" : "idle";
    else if (l.sales <= 0) verdict = "no-sale";
    else if (requiredCausedShare > 1) verdict = "loses";
    else if (incrementalProfit < 0) verdict = "fails-your-assumption";
    else if (requiredCausedShare > 0.6) verdict = "marginal";
    else verdict = "pays";
    return {
      ...l, adRate, profitBefore, attributedProfit, incrementalProfit, requiredCausedShare, verdict,
      ctr: l.impressions > 0 && l.hasClicks ? l.clicks / l.impressions : null,
      clickToSale: l.hasClicks && l.clicks > 0 && l.hasSold ? l.sold / l.clicks : null,
    };
  }).sort((a, b) => b.fees - a.fees);

  const t = rows.reduce((a, r) => ({
    fees: a.fees + r.fees, sales: a.sales + r.sales, sold: a.sold + r.sold,
    impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks,
    attributed: a.attributed + r.attributedProfit, incremental: a.incremental + r.incrementalProfit,
  }), { fees: 0, sales: 0, sold: 0, impressions: 0, clicks: 0, attributed: 0, incremental: 0 });
  const profitBefore = t.sales * m;
  const summary = {
    listings: rows.length, ...t, marginPct, organicPct,
    adRate: t.sales > 0 ? t.fees / t.sales : null,
    roas: t.fees > 0 ? t.sales / t.fees : null,
    breakEvenRoas: 1 / m,
    requiredCausedShare: t.fees > 0 && profitBefore > 0 ? t.fees / profitBefore : (t.fees > 0 ? Infinity : 0),
    losers: rows.filter((r) => r.verdict === "loses" || r.verdict === "no-sale"),
    // The fees on listings that lose even if every sale was caused by the ad.
    feesOnLosers: rows.filter((r) => r.verdict === "loses" || r.verdict === "no-sale").reduce((a, r) => a + r.fees, 0),
    lossOnLosers: rows.filter((r) => r.verdict === "loses" || r.verdict === "no-sale").reduce((a, r) => a + r.attributedProfit, 0),
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
const label = (r) => (r.title ? r.title.slice(0, 60) : r.id) + (r.id && r.title ? ` (${r.id})` : "");

function findings(rows, s) {
  const out = [];
  const m = s.marginPct / 100;
  if (s.fees > 0 && s.attributed < 0) {
    out.push({ severity: "high", title: `Ads cost more than the profit on the sales they are credited with`, detail: `You paid ${money(s.fees)} in ad fees on ${money(s.sales)} of attributed sales. At a ${s.marginPct}% margin that is ${money(s.sales * m)} of profit before ads, so even if every one of those sales was caused by the ad you are ${money(-s.attributed)} behind.` });
  } else if (s.fees > 0) {
    out.push({ severity: "info", title: `Fees were ${pct(s.requiredCausedShare, 0)} of the profit on the sales they are credited with`, detail: `The ads pay for themselves only if at least ${pct(s.requiredCausedShare, 0)} of the attributed sales would not have happened without the promotion. Your assumption of ${s.organicPct}% selling anyway gives an incremental result of ${money(s.incremental)}.` });
  }
  const losing = s.losers;
  if (losing.length) {
    const top = losing.slice().sort((a, b) => a.attributedProfit - b.attributedProfit).slice(0, 5);
    out.push({ severity: "high", title: `${losing.length} listing${losing.length === 1 ? "" : "s"} lose money even if the ad caused every sale`, detail: `Ad fees on these total ${money(s.feesOnLosers)} against ${money(s.lossOnLosers)} of profit after fees. Worst: ` + top.map((r) => `${label(r)} ${money(r.attributedProfit)}`).join("; ") + `. Lower the ad rate on these, or remove them from the campaign.` });
  }
  const unsold = rows.filter((r) => r.verdict === "no-sale");
  if (unsold.length) {
    out.push({ severity: "high", title: `${unsold.length} listing${unsold.length === 1 ? "" : "s"} with ad fees and no attributed sale`, detail: `${money(unsold.reduce((a, r) => a + r.fees, 0))} spent with nothing credited. This happens with cost-per-click campaigns (Promoted Listings Advanced) and with refunds or cancellations in the period.` });
  }
  const fails = rows.filter((r) => r.verdict === "fails-your-assumption");
  if (fails.length && s.organicPct > 0) {
    out.push({ severity: "medium", title: `${fails.length} more listing${fails.length === 1 ? "" : "s"} turn negative if ${s.organicPct}% of their sales would have happened anyway`, detail: fails.slice(0, 5).map((r) => `${label(r)} needs ${pct(r.requiredCausedShare, 0)} caused`).join("; ") + "." });
  }
  const marginal = rows.filter((r) => r.verdict === "marginal");
  if (marginal.length) {
    out.push({ severity: "medium", title: `${marginal.length} listing${marginal.length === 1 ? "" : "s"} only pay if most of their sales were caused by the ad`, detail: marginal.slice(0, 5).map((r) => `${label(r)} needs ${pct(r.requiredCausedShare, 0)}`).join("; ") + ". Items that already rank well or have little competition are the usual place this is not true." });
  }
  const top3 = rows.slice(0, 3);
  if (s.fees > 0 && rows.length > 3) {
    const share = top3.reduce((a, r) => a + r.fees, 0) / s.fees;
    if (share >= 0.5) out.push({ severity: "info", title: `Three listings take ${pct(share, 0)} of your ad fees`, detail: top3.map((r) => `${label(r)} ${money(r.fees)}`).join("; ") + ". Checking these three first covers most of the spend." });
  }
  const noAds = rows.filter((r) => r.verdict === "free");
  if (noAds.length) out.push({ severity: "info", title: `${noAds.length} listing${noAds.length === 1 ? "" : "s"} with sales but no ad fee`, detail: "Sales with no fee were not credited to a promoted click." });
  if (s.roas) out.push({ severity: "info", title: `Return on ad spend ${s.roas.toFixed(1)}x; break-even at your margin is ${s.breakEvenRoas.toFixed(1)}x`, detail: "ROAS compares attributed sales with fees. At your profit margin the ads must return at least the break-even figure for the profit on those sales to cover the fee, and more than that if some of the sales would have happened anyway." });
  return out;
}

// Largest ad rate that still leaves `keepPct` of the pre-ad profit on a listing.
export function maxAdRate(marginPct, keepPct = 0) {
  if (!(marginPct > 0)) return 0;
  return (marginPct / 100) * (1 - keepPct / 100);
}

export function sampleCsv() {
  return [
    "Report: Promoted Listings Standard, sample data",
    "Campaign name,Listing ID,Listing title,Impressions,Clicks,Sold quantity,Sales,Ad fees,Ad rate",
    'Spring gear,100000000001,Fender Player Strat pickguard white,18400,310,22,"$550.00","$44.00",8.0%',
    'Spring gear,100000000002,Boss DS-1 distortion pedal used,9300,150,9,"$315.00","$31.50",10.0%',
    'Spring gear,100000000003,Ibanez Tube Screamer TS9 vintage,22100,480,6,"$720.00","$108.00",15.0%',
    'Spring gear,100000000004,Shure SM58 microphone,30500,610,41,"$2,296.00","$91.84",4.0%',
    'Spring gear,100000000005,Guitar strap leather,4100,45,12,"$300.00","$36.00",12.0%',
    'Spring gear,100000000006,Marshall 1960A cab,6200,88,1,"$850.00","$127.50",15.0%',
    'Spring gear,100000000007,Used capo Kyser,2600,22,0,"$0.00","$0.00",5.0%',
    "Totals,,,93200,1705,91,\"$5,031.00\",\"$438.84\",",
  ].join("\n");
}
