// Labelled books from real fiscal hosts: Open Collective's public expense records,
// each with the accounting category the host's own finance team assigned. This is the
// "labelled books" reading the flagship asked for: real descriptions and payees, and an
// answer key written by someone other than the person who wrote the keyword rules.
//
//   node eval/opencollective-labelled.mjs --host opensource --pages 10 [--cache DIR] [--misses 30]
//   node eval/opencollective-labelled.mjs --host foundation --pages 10
//   node eval/opencollective-labelled.mjs --host raft --variants payee --new-payee   (layer 6 on and off)
//
// Fetched at run time from the public GraphQL API (api.opencollective.com/graphql/v2,
// no key, 10 requests a minute) and cached under --cache (default the OS temp dir); never
// copied into the repository. Only aggregate numbers are reported in docs: payees on these
// records include private individuals, so no names are written down.
//
// Two readings, on three versions of the text a line could carry:
//   cold     built-in keywords only, nothing learned (a first import);
//   online   the product's import loop month by month: every line is suggested from
//            everything filed in earlier months (payee memory, naive Bayes, keywords),
//            then filed with the host's category. Auto-post counts memory at >= 0.85,
//            the engine's default.
// Text: "memo" (what the submitter typed), "payee" (the payee's display name, close to
// what a bank line shows), "both".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { suggest, trainClassifier, buildMemory, trainNewPayee, historyRecord, NEW_PAYEE } from "../categorize.mjs";

// Host category name -> chart accounts a careful bookkeeper could pick. Categories with
// no counterpart in the small-business chart (grants, donations, "Administrative",
// "Collective Ops", honoraria, research, mutual aid) are left unscored, not forced.
export const MAPS = {
  opensource: {
    "Legal & Professional Services": ["6050"],
    "Marketing, Design, & PR": ["6000", "6020"],
    "Consultants · Maintenance and Development": ["6020"],
    "Expenses - Travel": ["6120", "6160"],
    "Expenses · Meals & Entertainment": ["6130"],
    "Expenses - Office & Event Space": ["6080"],
    "Expenses - Advertising & Marketing": ["6000"],
    "Expenses - Hosting & Subscriptions": ["6060"],
    "Expenses · Equipment & Hardware": ["6100", "6070"],
    "PAYROLL- Collectives": ["6150"],
  },
  foundation: {
    "Insurance": ["6030"],
    "Platform Fees": ["6010"],
    "Accounting": ["6050"],
    "General Consulting": ["6020", "6050"],
    "Legal & Professional Services": ["6050"],
    "Marketing, Design, & PR": ["6000", "6020"],
    "Software Engineer": ["6020"],
    "Materials & Supplies": ["6100", "6070"],
    "Program Food & Groceries": ["6130", "6100"],
    "Program Transportation & Travel": ["6120", "6160"],
    "Program Housing & Lodging": ["6120", "6080"],
    "Postage & Shipping": ["6180", "6070"],
    "Printing & Publication": ["6000", "6070"],
    "Venue Fees": ["6080"],
    "Professional Services": ["6050", "6020"],
    "Membership Dues": ["6170"],
    "Online Subscriptions": ["6060"],
    "Design Fees & Marketing": ["6000", "6020"],
    "Business Meals": ["6130"],
    "Rent & Lease": ["6080"],
    "Utilities": ["6140"],
    "Repairs & Maintenance": ["6090"],
    "Taxes & Licenses": ["6110"],
    "Equipment": ["6100", "6070"],
    "Rental Equipment": ["6080", "6100"],
    "Professional Development": ["6170"],
    "Legal Services": ["6050"],
  },
  // Held out: no keyword was written from these three hosts' lines (2026-11-10).
  raft: {
    "Fixed assets": ["6100", "6070"], "Payroll expenses": ["6150"], "Payroll expenses:Officers' salaries": ["6150"],
    "Payroll expenses:Salaries & wages": ["6150"], "Payroll expenses:Payroll taxes": ["6150", "6110"],
    "Professional fees": ["6050", "6020"], "Professional Fees:General": ["6050", "6020"], "Professional fees:Accounting fees": ["6050"],
    "Professional fees:Legal fees": ["6050"], "Professional fees:Graphic and web design": ["6020", "6000"],
    "Professional fees:Software development": ["6020"], "Professional fees:Event management and facilitation": ["6020"],
    "Office and facilities expenses": ["6070", "6080"], "Payroll processing Fees": ["6010", "6050"], "Server expenses": ["6060"],
    "Software & apps": ["6060"], "Rent": ["6080"], "Equipment rental": ["6080", "6100"], "Travel:Airfare": ["6120"],
    "Travel:Ground transportation": ["6120", "6160"], "Travel:Hotels": ["6120"], "Travel:General": ["6120", "6160"],
    "Interest paid": ["6040"], "Insurance": ["6030"], "Memberships & subscriptions": ["6170", "6060"],
    "Professional development": ["6170"], "Bank fees & service charges": ["6010"], "Business licenses": ["6110"],
    "Marketing": ["6000"], "Meals": ["6130"], "Repairs & maintenance": ["6090"], "Taxes paid": ["6110"],
    "Government filing expenses": ["6110"],
  },
  pact_collective: {
    "Accounting fees": ["6050"], "Legal fees": ["6050"], "Professional fees - other": ["6050", "6020"],
    "Temporary help - contract": ["6020"], "Supplies": ["6100", "6070"], "Telephone & telecommunications": ["6140"],
    "Postage & shipping": ["6180", "6070"], "Mailing services": ["6180", "6070"], "Printing & copying": ["6070", "6000"],
    "Books, subscriptions, references": ["6060", "6170"], "Rent, parking, other occupancy": ["6080"], "Utilities": ["6140"],
    "Equipment rental & maintenance": ["6090", "6080"], "Travel": ["6120", "6160"], "Conferences, conventions & meetings": ["6170", "6120"],
    "Insurance - non-employee related": ["6030"], "Membership dues - organization": ["6170"], "Staff development": ["6170"],
    "Outside computer services": ["6060", "6020"], "Advertising expenses": ["6000"], "Sales taxes": ["6110"],
    "Taxes - other": ["6110"], "Capital purchases - equipment": ["6100", "6070"],
  },
  metagov: {
    "Personnel": ["6150", "6020"], "Personnel:Salaries & Wages": ["6150"], "Personnel:Executive Director": ["6150", "6020"],
    "Personnel:Employer Taxes": ["6150", "6110"], "Personnel:PEO Fees": ["6050", "6010"],
    "Legal & Professional Services": ["6050"], "Legal & Professional Services:Accounting Fees": ["6050"],
    "Legal & Professional Services:Other Professional Fees": ["6050", "6020"],
    "Administrative & Operations:Advertising & Marketing": ["6000"], "Administrative & Operations:Application Subscriptions": ["6060"],
    "Administrative & Operations:Bank Charges & Fees": ["6010"], "Administrative & Operations:Insurance": ["6030"],
    "Administrative & Operations:Interest Paid": ["6040"], "Administrative & Operations:Licenses & Dues": ["6110", "6170"],
    "Project Expenses:Contractors": ["6020"], "Project Expenses:Travel": ["6120", "6160"],
  },
};

const QUERY = `query($host:String!,$limit:Int!,$offset:Int!){ expenses(host:{slug:$host}, limit:$limit, offset:$offset, status:PAID){
  totalCount nodes{ description type createdAt amountV2{ valueInCents currency } accountingCategory{ name } payee{ name } } } }`;

export async function fetchPages(host, pages, dir, { limit = 1000, pause = 7000 } = {}) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (let p = 0; p < pages; p++) {
    const file = join(dir, `${host}-${limit}-${p}-v2.json`);
    if (!existsSync(file)) {
      if (p) await new Promise((r) => setTimeout(r, pause));
      const res = await fetch("https://api.opencollective.com/graphql/v2", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { host, limit, offset: p * limit } }),
      });
      if (!res.ok) throw new Error(`page ${p}: HTTP ${res.status}`);
      writeFileSync(file, await res.text());
    }
    const nodes = JSON.parse(readFileSync(file, "utf8")).data?.expenses?.nodes ?? [];
    out.push(...nodes);
    if (nodes.length < limit) break;
  }
  return out;
}

// API node -> { date, memo, payee, cat } (cat null when the host left it blank).
export const toRow = (n) => ({
  date: String(n.createdAt ?? "").slice(0, 10), memo: String(n.description ?? "").trim(),
  payee: String(n.payee?.name ?? "").trim(), cat: n.accountingCategory?.name ?? null, type: n.type,
  cents: Number.isFinite(n.amountV2?.valueInCents) ? n.amountV2.valueInCents : null,
});

export const textOf = (r, variant) => variant === "memo" ? r.memo : variant === "payee" ? r.payee : `${r.payee} ${r.memo}`.trim();

const blank = () => ({ n: 0, right: 0, wrong: 0, blank: 0, auto: 0, autoWrong: 0 });
function tally(o, s, want) {
  o.n++;
  if (!s.account) o.blank++;
  else if (want.includes(s.account)) o.right++;
  else o.wrong++;
  if ((s.source === "memory" || s.source === "rule") && s.confidence >= 0.85) { o.auto++; if (!want.includes(s.account)) o.autoWrong++; }
}

// Scored rows only (category maps to the chart). Month batches, oldest first.
export function evaluate(rows, map, variant, { learn = true, amounts = false, skip = null, newPayeeOpts = null } = {}) {
  const scored = rows.filter((r) => r.cat && map[r.cat]).sort((a, b) => a.date.localeCompare(b.date));
  const all = blank(), firstSeen = blank(), repeat = blank(), bySource = {}, byCat = {}, misses = [];
  const hist = [], seen = new Set();
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
  let month = null, pending = [];
  const flush = () => {
    if (!learn || !pending.length) return;
    hist.push(...pending); pending = [];
    model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist) };
  };
  for (const r of scored) {
    if (r.date.slice(0, 7) !== month) { flush(); month = r.date.slice(0, 7); }
    const want = map[r.cat];
    const txn = { desc: textOf(r, variant), cents: amounts && r.cents ? -Math.abs(r.cents) : -10000 };
    const s = suggest(txn, { ...model, ...(skip ? { skip } : {}), ...(newPayeeOpts ? { newPayeeOpts } : {}) });
    tally(all, s, want);
    const k = txn.desc.toLowerCase();
    tally(seen.has(k) ? repeat : firstSeen, s, want);
    seen.add(k);
    const src = (bySource[s.source] ??= { n: 0, right: 0 }); src.n++; if (s.account && want.includes(s.account)) src.right++;
    const c = (byCat[r.cat] ??= blank()); tally(c, s, want);
    if (!s.account || !want.includes(s.account)) misses.push({ cat: r.cat, got: s.account, memo: r.memo });
    pending.push(historyRecord(txn, want[0]));
  }
  return { rows: rows.length, uncategorised: rows.filter((r) => !r.cat).length, unscored: rows.filter((r) => r.cat && !map[r.cat]).length, all, firstSeen, repeat, bySource, byCat, misses, months: new Set(scored.map((r) => r.date.slice(0, 7))).size, from: scored[0]?.date, to: scored.at(-1)?.date };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const line = (o) => `n=${o.n} suggested ${pct(o.right + o.wrong, o.n)} right-of-suggested ${pct(o.right, o.right + o.wrong)} right-of-all ${pct(o.right, o.n)} auto-posted ${pct(o.auto, o.n)} (wrong ${o.autoWrong})`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const host = arg("--host", "opensource");
  const map = MAPS[host];
  if (!map) throw new Error(`no category map for host "${host}" (have: ${Object.keys(MAPS).join(", ")})`);
  const rows = (await fetchPages(host, +arg("--pages", 10), arg("--cache", join(tmpdir(), "oc-labelled")))).map(toRow);
  const variants = (arg("--variants", "memo,payee,both")).split(",");
  const amounts = !process.argv.includes("--no-amounts");
  if (process.argv.includes("--new-payee")) {
    // The new-payee layer on and off, online, each line at its real amount.
    for (const v of variants) for (const skip of [new Set(["new-payee"]), null]) {
      const o = evaluate(rows, map, v, { amounts, skip });
      console.log(`${v.padEnd(5)} new-payee ${skip ? "off" : "on "} all ${line(o.all)}`);
      console.log(`                first time seen ${line(o.firstSeen)}`);
      if (!skip) {
        // The same layer allowed only the direction view: "the account most new payees went to".
        const p = evaluate(rows, map, v, { amounts, newPayeeOpts: { ...NEW_PAYEE, levels: ["direction"] } });
        console.log(`    prior only  first time seen ${line(p.firstSeen)}`);
        // The same layer with the record gate off (minRecord 0): what the gate withholds.
        const u = evaluate(rows, map, v, { amounts, newPayeeOpts: { ...NEW_PAYEE, minRecord: 0 } });
        console.log(`    gate off    first time seen ${line(u.firstSeen)}`);
      }
      if (!skip) console.log(`                by source ${Object.entries(o.bySource).map(([k, x]) => `${k} ${x.n} (${pct(x.right, x.n)} right)`).join(", ")}`);
    }
    process.exit(0);
  }
  for (const v of variants) {
    for (const learn of [false, true]) {
      const o = evaluate(rows, map, v, { learn, amounts });
      if (v === variants[0] && !learn) {
        console.log(`${host}: ${o.rows} paid expenses, ${o.uncategorised} with no category, ${o.unscored} in categories with no chart account; ${o.all.n} scored, ${o.from} to ${o.to} (${o.months} months)`);
        const [top, k] = Object.entries(o.byCat).sort((a, b) => b[1].n - a[1].n)[0];
        console.log(`  baseline: always "${top}" would be right on ${pct(k.n, o.all.n)}`);
      }
      console.log(`${v.padEnd(5)} ${learn ? "online" : "cold  "} ${line(o.all)}`);
      if (learn) {
        console.log(`        first time seen ${line(o.firstSeen)}`);
        console.log(`        seen before     ${line(o.repeat)}`);
        console.log(`        by source ${Object.entries(o.bySource).map(([k, x]) => `${k} ${x.n} (${pct(x.right, x.n)} right)`).join(", ")}`);
      }
      if (arg("--by-cat") && learn === (arg("--by-cat") === "online") && v === variants.at(-1)) for (const [k, x] of Object.entries(o.byCat).sort((a, b) => b[1].n - a[1].n)) console.log(`        ${k.padEnd(44)} ${line(x)}`);
      if (+arg("--misses", 0) && v === variants.at(-1) && !learn) {
        const m = new Map();
        for (const x of o.misses) { const k = `${x.cat} | got ${x.got} | ${x.memo.slice(0, 60)}`; m.set(k, (m.get(k) ?? 0) + 1); }
        [...m].sort((a, b) => b[1] - a[1]).slice(0, +arg("--misses")).forEach(([k, n]) => console.log(`   x${n} ${k}`));
      }
    }
  }
}
