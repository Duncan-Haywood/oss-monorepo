// Adyen's own published Settlement details report sample (batch 134, 63 rows,
// the 2023 "migration" column layout with 64 columns), run through the payout
// reader. Adyen links it from docs.adyen.com, "Settlement details report"
// ("Download a sample Settlement details report"). It is Adyen's file, so it is
// fetched at run time and never copied into the repository.
//
//   node eval/adyen-sample.mjs [file.csv]
//   fetch: curl -o adyen-sample.csv "https://assets.ctfassets.net/ihg38ochctiz/6PaiU8ix01khChAlsBjZCb/e2de8e02237fac2d5343f0f2fcf27ee0/1.1_SAMPLE_settlement_detail_report_batch_134_2023_migration.csv"
//
// What it checks: every row is read (none silently skipped), the batch ties
// (carried in + activity - carried out = payout), and the Balancetransfer rows
// are not booked as income.
import { readFileSync } from "node:fs";
import { readPayoutReport } from "../payouts.mjs";

const URL = "https://assets.ctfassets.net/ihg38ochctiz/6PaiU8ix01khChAlsBjZCb/e2de8e02237fac2d5343f0f2fcf27ee0/1.1_SAMPLE_settlement_detail_report_batch_134_2023_migration.csv";
const file = process.argv[2];
const text = file ? readFileSync(file, "utf8") : await (await fetch(URL)).text();
const r = readPayoutReport(text);
const lines = text.trim().split(/\r?\n/).length - 1;
const by = {};
for (const x of [...r.rows, ...r.pending.filter((x) => !r.rows.includes(x))]) by[x.kind] = (by[x.kind] ?? 0) + x.net;
const types = {};
for (const l of text.trim().split(/\r?\n/).slice(1)) { const t = l.split(",")[8]; types[t] = (types[t] ?? 0) + 1; }
console.log(JSON.stringify({ source: r.source, dataRows: lines, journalTypes: types, activityRows: r.rows.length, payouts: r.payouts.length, pending: r.pending.length, netByKind: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, (v / 100).toFixed(2)])), problems: r.problems }, null, 2));
