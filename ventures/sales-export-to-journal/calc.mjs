// Sales export -> journal, any platform. Drop the CSV you have; this works out which of nine
// platforms wrote it (Airbnb, Amazon, eBay, Etsy, Gumroad, PayPal, Shopify, Square, Stripe) by running each
// platform's own reader over it and keeping the one that understands the most rows, then hands back
// that engine's journals. The readers are unmodified copies of the per-platform tools in this
// portfolio, so a fix to one is a copy away from the hub; detect.test.mjs feeds every engine's own
// sample report to the hub and fails if the wrong platform wins.
import * as airbnb from "./engines/airbnb.mjs";
import * as amazon from "./engines/amazon.mjs";
import * as ebay from "./engines/ebay.mjs";
import * as etsy from "./engines/etsy.mjs";
import * as gumroad from "./engines/gumroad.mjs";
import * as paypal from "./engines/paypal.mjs";
import * as shopify from "./engines/shopify.mjs";
import * as square from "./engines/square.mjs";
import * as stripe from "./engines/stripe.mjs";

export const PLATFORMS = [
  { id: "airbnb", label: "Airbnb host transaction history", engine: airbnb },
  { id: "amazon", label: "Amazon settlement report", engine: amazon },
  { id: "ebay", label: "eBay Transaction report", engine: ebay },
  { id: "etsy", label: "Etsy payment account statement", engine: etsy },
  { id: "gumroad", label: "Gumroad sales export", engine: gumroad },
  { id: "paypal", label: "PayPal Activity report", engine: paypal },
  { id: "shopify", label: "Shopify Payments payout transactions", engine: shopify },
  { id: "square", label: "Square Transactions export", engine: square },
  { id: "stripe", label: "Stripe payout reconciliation report", engine: stripe },
];
// Header words only that platform's export carries. A boost, not a requirement: real exports drift,
// and the generic readers (Gumroad, Shopify) will happily parse a Stripe file as a worse fit, so the
// signature is what breaks that tie while a drifted header still falls back to row counts.
const SIGNATURES = {
  airbnb: ["confirmation code", "arriving by date"],
  amazon: ["settlement-id", "amount-description"],
  ebay: ["transaction creation date", "payout currency"],
  etsy: ["fees & taxes", "fees-&-taxes"],
  gumroad: ["sale id", "purchase id"],
  paypal: ["balance impact", "transaction id,item title"],
  shopify: ["payout status", "automatic payout"],
  square: ["total collected", "gross sales"],
  stripe: ["automatic_payout_id", "reporting_category", "balance_transaction_id"],
};
const signatureBoost = (id, text) => {
  const head = String(text).split(/\r?\n/).slice(0, 40).join("\n").toLowerCase();
  return SIGNATURES[id].some((t) => head.includes(t)) ? 400 : 0;
};
export const platform = (id) => PLATFORMS.find((p) => p.id === id);

const REJECTED = /does not look like|file is empty|no header/i;

// How well did this platform's reader understand the file? A reader that refuses the header scores
// nothing; otherwise rows it kept and journals it could build count for, unexplained errors against.
export function score(r) {
  if (r.findings.some((f) => f.severity === "error" && REJECTED.test(f.title))) return 0;
  const rows = r.summary.rows || 0;
  if (!rows) return 0;
  const errors = r.findings.filter((f) => f.severity === "error").length;
  const agreed = r.reconciliation.filter((x) => x.agrees === true || x.agree === true).length;
  return Math.max(1, rows * 10 + r.journals.length * 5 + agreed * 20 - errors * 15);
}

export function detect(text, opts = {}) {
  const ranked = PLATFORMS.map((p) => {
    const result = p.engine.validate(text, { ...opts, mapping: undefined });
    const base = score(result);
    return { id: p.id, label: p.label, score: base ? base + signatureBoost(p.id, text) : 0 };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return { id: null, ranked, confident: false };
  const runnerUp = ranked[1];
  return { id: best.id, ranked, confident: !runnerUp || runnerUp.score < best.score * 0.6 };
}

// Run the reader for `id`, or the detected one. `mapping` is parsed by that platform's own parser.
export function convert(text, opts = {}) {
  const d = opts.platform && opts.platform !== "auto" ? { id: opts.platform, ranked: [], confident: true, forced: true } : detect(text, opts);
  if (!d.id) {
    return { detection: d, platform: null, result: null, findings: [{ severity: "error", title: "Could not tell which platform wrote this file", detail: "None of the nine readers recognised the header row. Choose the platform from the list, or open the single-platform tool for the export you have.", line: 0 }] };
  }
  const p = platform(d.id);
  const { platform: _drop, ...rest } = opts;
  const result = p.engine.validate(text, rest);
  return { detection: d, platform: p, result, findings: result.findings };
}

export const parseMapping = (id, text) => platform(id).engine.parseMapping(text);
export const mappingText = (id, mapping) => platform(id).engine.mappingText(mapping);
export const defaultMapping = (id) => platform(id).engine.defaultMapping();
export const sampleReport = (id) => platform(id).engine.sampleReport();
export const sampleBrokenReport = (id) => platform(id).engine.sampleBrokenReport();
export const money = gumroad.money;
export const decodeBuffer = gumroad.decodeBuffer;
export const toXeroJournalCsv = (id, j, o) => platform(id).engine.toXeroJournalCsv(j, o);
export const toQboJournalCsv = (id, j, o) => platform(id).engine.toQboJournalCsv(j, o);
export const toIif = (id, j, o) => platform(id).engine.toIif(j, o);
export const journalsCsv = (id, j, o) => platform(id).engine.journalsCsv(j, o);
export const findingsCsv = (id, r) => platform(id).engine.findingsCsv(r);
