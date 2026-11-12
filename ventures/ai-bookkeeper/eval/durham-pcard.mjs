// The card network's merchant category code on a third buyer: Durham County
// Council's monthly procurement-card report (England). Each line has the merchant
// ("Beneficiary"), the network's four-digit code ("Merchant Category Number") and
// the expense type the council filed it to ("Detailed Expense Type"), for every
// card line, not only those over £500 as in the Scottish Government's file.
//
// The report's "Merchant Category" column is NOT the network's category name: it is
// the council's own expense label for that code (5411 grocery stores reads
// "Catering costs - provisions", 7011 hotels "Conferencesseminars fees etc"), so
// it nearly gives the answer away. Only the code is read here (`--field code`, the
// default); `--field name` shows what reading the label would claim.
//
// The data is Durham County Council's, published under the Open Government
// Licence v3.0 at durham.gov.uk/article/8154; nothing is copied here. Fetch:
//
//   mkdir durham && cd durham
//   curl -s https://durham.gov.uk/article/8154/Government-procurement-card-transactions \
//     | grep -o 'https://durham.gov.uk/media/[^"]*csv[^"]*' | while read u; do curl -sO "$u"; done
//   node eval/durham-pcard.mjs --dir durham [--from 2023-01] [--department "<name>"] [--division "<name>"]
//        [--skip mcc|mcc-memory] [--field code|name] [--plurality] [--misses 20] [--codes 20]
//
// The run of 2026-11-12 read 78 monthly files, January 2020 to June 2026.
//
// Each line is replayed a day at a time from empty books (eval/scotgov-card.mjs
// `replay`). Only expense types that name a chart account (EXPENSE_MAP below,
// written from the expense-type names before the first scored run) are scored:
// "Miscellaneous Expenses", "Services", "Other", grants, client payments
// (hardship, pocket money, allowances, accommodation assistance) and the like are
// left out.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../bank.mjs";
import { replay, fmt } from "./scotgov-card.mjs";
import { MCC_MEMORY } from "../categorize.mjs";
import { mccAccount } from "../mcc.mjs";

// Detailed expense type (lower case, trailing ledger code dropped) -> chart accounts
// a careful bookkeeper could accept. Equipment may be expensed or capitalised; food
// bought for care homes and schools may be meals or supplies.
const EQ = ["6100", "1500"], RS = ["6100", "6090"], OFFICE_EQ = ["6070", "1500", "6100"];
export const EXPENSE_MAP = {
  "provisions": ["6130", "6100"], "catering costs - provisions": ["6130", "6100"], "catering - meetings": ["6130"], "catering costs-contractor": ["6130"], "departmental hospitality": ["6130"], "meals-school meals service": ["6130"],
  "subsistence": ["6130", "6120"],
  "equipment and materials": EQ, "equipment-purchase and rental": [...EQ, "6080"], "purchase-equipment": EQ, "catering equipment": EQ, "misc equipment tools and materials": [...RS, "1500"], "materials": RS, "technicians-supplies": RS,
  "direct materials": [...RS, "5000"], "consumables/items for resale": ["5000"],
  "conference expenses": ["6170", "6120"], "conferencesseminars fees etc": ["6170", "6120"],
  "recruitment instruction and training": ["6170", "6000"], "training-other activities": ["6170"], "training-all costs": ["6170"], "tuition fees": ["6170"], "examination fees": ["6170"],
  "subscriptions": ["6170", "6060"], "subscriptions - curriculum": ["6170", "6060"],
  "newspapers books and periodicals": ["6170", "6070", "6060"], "text books": ["6170", "6070", "6100"], "books-school library": ["6170", "6070", "6100"], "books-adult library": ["6170", "6070", "6100"],
  "public transport": ["6120"], "staff travelling": ["6120"], "travel-clients/students/children": ["6120"],
  "running costs of vehicles": ["6160"], "vehicle running expenses": ["6160"], "other fuels": ["6160", "6140"], "fuel": ["6160"], "oils & lubricants": ["6160", "6090"], "repair and maintenance of vehicles": ["6160", "6090"], "contract hire": ["6160", "6080"],
  "vehicle excise duty (ved)": ["6110", "6160"], "licences": ["6110", "6060"],
  "clothing uniforms and laundry": ["6100"],
  "cleaning and domestic supplies": ["6100"], "cleaning and domestic materials": ["6100"], "cleaning and domestic equipment": ["6100", "1500"], "cleaning materials and equipment costs": ["6100"], "medical supplies": ["6100"], "disposable medical supplies": ["6100"],
  "computers and communications": ["6060", "6070", "1500", "6140"], "computer software": ["6060"], "computer software-rentals and maint": ["6060"],
  "computer equipment": OFFICE_EQ, "computer hardware": OFFICE_EQ, "comp hardware purch-other": OFFICE_EQ, "ict supplies etc": OFFICE_EQ,
  "furniture": OFFICE_EQ, "purchase-furniture and fittings": OFFICE_EQ, "furniture repair and replacement": [...OFFICE_EQ, "6090"],
  "printing stationery and gen off exps": ["6070"], "stationery": ["6070"], "administrative stationery etc": ["6070"], "general office expenses": ["6070"],
  "postages": ["6180", "6070"],
  "advertising": ["6000"], "advertising other than for staff": ["6000"], "marketing & communications": ["6000"], "information to the public": ["6000"],
  "energy costs": ["6140"], "electricity": ["6140"], "water charges": ["6140"], "water services": ["6140"], "telephones": ["6140"], "mobile - all costs": ["6140"],
  "rendered by private contractors": ["6020"], "agency staff": ["6020"],
  "legal expenses": ["6050", "6110"], "fees-legal": ["6050", "6110"], "court fees": ["6110", "6050"], "professional fees": ["6050"], "consultants fees": ["6050"], "expert fees": ["6050"], "interpretation services": ["6050", "6020"],
  "service repairs and maintenance": RS, "general maintenance": RS, "general repairs": RS, "other routine reps and maintenance": RS, "repairs to grounds": RS, "equipment-repairsserviceinsurance": RS, "minor improvements": RS,
  "bank and giro charges": ["6010"], "rents": ["6080"],
};

// "Subscriptions E372", "Legal expenses 338045": the ledger code is dropped.
export const expenseKey = (s) => String(s ?? "").toLowerCase().replace(/\s+(e\d{3}|\d{6})$/, "").replace(/\s+/g, " ").trim();
export const wantFor = (s) => EXPENSE_MAP[expenseKey(s)] ?? null;

const MON = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
// "04-JUN-26" (2025 on) and "01-Mar-2023" (earlier files).
export function dmy(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (!m || !MON[m[2].toLowerCase()]) return "";
  return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
}

// "Resources BK0010" and "Resources" are one department.
const deptKey = (s) => String(s ?? "").replace(/\s+[A-Z]{2}\d{4}$/, "").replace(/,/g, "").replace(/\s+/g, " ").trim();

export function decode(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

export function loadDurham(texts, { field = "code", department = null, division = null } = {}) {
  const out = [];
  for (const text of texts) {
    const rows = parseCsv(text.replace(/^﻿/, ""));
    const hi = rows.findIndex((r) => r.some((x) => String(x).trim() === "Beneficiary"));
    if (hi === -1) continue;
    const h = rows[hi].map((x) => String(x).trim());
    const c = { dept: h.indexOf("Local authority department which incurred the expenditure"), div: h.indexOf("Service Division"), type: h.indexOf("Detailed Expense Type"), date: h.indexOf("Date of Transaction"), desc: h.indexOf("Beneficiary"), code: h.indexOf("Merchant Category Number"), name: h.indexOf("Merchant Category"), amt: h.indexOf("Gross Amount") };
    for (const r of rows.slice(hi + 1)) {
      const date = dmy(r[c.date]), amount = Number(String(r[c.amt] ?? "").replace(/,/g, "")), want = wantFor(r[c.type]);
      if (!date || !want || !Number.isFinite(amount) || amount <= 0) continue;
      const dept = deptKey(r[c.dept]), div = String(r[c.div] ?? "").trim();
      if (department && dept !== department) continue;
      if (division && div !== division) continue;
      const mcc = String(r[field === "name" ? c.name : c.code] ?? "").trim();
      out.push({ desc: String(r[c.desc] ?? "").trim(), date, cents: -Math.round(amount * 100), mcc, want, department: dept, division: div });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const dir = arg("--dir");
  const texts = readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort().map((f) => decode(readFileSync(join(dir, f))));
  const field = arg("--field", "code");
  const rows = loadDurham(texts, { field, department: arg("--department"), division: arg("--division") });
  if (process.argv.includes("--plurality")) MCC_MEMORY.plurality = true;
  const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
  const scoreFrom = arg("--from", ""), scoreTo = arg("--to", "9999");
  if (process.argv.includes("--departments")) {
    const n = new Map(); for (const r of rows) n.set(r.department, (n.get(r.department) ?? 0) + 1);
    [...n].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
    process.exit(0);
  }
  const o = replay(rows, { skip, scoreFrom, scoreTo });
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${rows.length} mapped lines, ${rows[0]?.date} to ${rows.at(-1)?.date}; scored ${scoreFrom || "start"} to ${scoreTo === "9999" ? "end" : scoreTo}; category field: ${field}${skip.size ? `; off: ${[...skip].join(",")}` : ""}`);
  console.log(`  all          ${fmt(o.all)}`);
  console.log(`  first seen   ${fmt(o.first)}`);
  console.log(`  seen before  ${fmt(o.repeat)}`);
  console.log(`  category alone, every line ${fmt(o.alone)}`);
  console.log(`  first seen by source: ${Object.entries(o.firstBySource).map(([k, v]) => `${k} ${v.n} (${pct(v.right, v.n)} right)`).join(", ")}`);
  if (+arg("--misses", 0)) o.misses.slice(0, +arg("--misses")).forEach((m) => console.log(`    ${m}`));
  if (+arg("--codes", 0)) {
    const cnt = new Map();
    for (const r of rows) if (r.mcc && !mccAccount(r.mcc)) cnt.set(r.mcc, (cnt.get(r.mcc) ?? 0) + 1);
    [...cnt].sort((a, b) => b[1] - a[1]).slice(0, +arg("--codes")).forEach(([k, n]) => console.log(`    x${n} ${k}`));
  }
}
