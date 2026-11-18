// Mercury business-account downloads that people committed to public GitHub repositories
// (flagship item 2: "a business account at a bank other than Chase"; item 0: "a firm's own
// labelled bank books"). Two look like an LLC's own download: one with the owner's own
// Category on 105 of 200 lines, one whose 372 lines are mostly Failed card charges. The rest are
// samples in Mercury's layout. None carries a licence we can copy under and the real ones hold
// names, emails and account digits, so they are fetched at run time at pinned commits into a
// cache directory and never committed; only counts are kept in the README.
//
//   node eval/mercury-exports.mjs [--cache DIR] [--misses]
//
// It reports, per file: rows read and skipped, the accounts the file names, and, on the
// labelled file, the categorizer replayed in date order against the owner's own labels with
// the owner's Category column blanked first (so the categorizer never sees it). "Before" turns
// the bank-category layer off, which is what the reader gave before Mercury's merchant
// category was read; "after" is the default model.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readStatement, parseCsv } from "../bank.mjs";
import { newBooks, importStatement, importCsvAccounts, categorize } from "../engine.mjs";
import { suggest, trainClassifier, buildMemory, trainNewPayee, historyRecord, payeeKey } from "../categorize.mjs";

// [kind, repo, commit, path]; kind "download" = an LLC's own file, "layout" = sample rows.
export const SOURCES = [
  ["download", "etholys/etholys", "798de7eb84d8705061856b0fb8030c0f70e652e5", "Uploads/rural-commerce-llc-transactions-2025-may-19-to-2025-dec-31.csv"],
  ["download", "samayhuf-star/Adiology-23Dec-New", "6f30f5f7f812aab72a690d4dce98ff6270a01ac6", "attached_assets/transactions-googlinks-llc-to-dec082025_(2)_1765359984828.csv"],
  ["layout", "LaunchPlatform/beanhub-import-demo", "4c222104e713c80012cae2dc03389124f76cd7a6", "import-data/mercury/2024.csv"],
  ["layout", "avinashrayudu/dtc-cash-onboarding", "24b04006d7e1e14fbcff4283f239565821dc363f", "data/raw/hollis-home/upload_1/transactions_1.csv"],
  ["layout", "Izzy-Gottz/aggregate-finance", "61f5ea231c735c2fac511bfd666c77c922c949b3", "packages/connectors/files/fixtures/redacted/mercury.csv"],
];

// The owner's labels on the first file -> chart accounts a careful bookkeeper could accept.
export const OWNER_MAP = {
  "Bank Fees": ["6010"], "Software & Subscriptions": ["6060"], "Business Meals": ["6130"],
  "Legal & Professional Services": ["6050", "6020"], "Travel & Transportation": ["6120", "6160"],
  "Inventory & Materials": ["5000", "1450", "6100"], "Revenue": ["4000"], "Transfer": ["transfer"],
};

export async function fetchSource([, repo, sha, path], dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${repo.replace("/", "_")}_${sha.slice(0, 8)}_${path.replace(/\W+/g, "_").slice(-40)}`);
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, "utf8");
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// Blank one column (the owner's labels) and return the CSV text plus the labels by file line.
export function hideColumn(text, name) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const ix = rows[0].findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  // labels[k - 1] is the label of the row that starts on line k of the returned text, the line
  // number the reader gives each row. A quoted cell holding a line break (a Copilot Money note,
  // 2026-11-15) makes a row span two lines, so a row's index is not its line.
  const labels = [], out = [];
  let line = 1;
  for (const r of rows) {
    labels[line - 1] = ix === -1 ? "" : String(r[ix] ?? "").trim();
    if (ix !== -1 && r !== rows[0] && r.length > ix) r[ix] = "";
    const t = r.map(csvCell).join(",");
    out.push(t);
    line += 1 + (t.match(/\r\n|\r|\n/g) ?? []).length;
  }
  return { text: out.join("\n") + "\n", labels };
}

// Chart code for each account a Mercury file names: the card is a liability, the first
// checking account 1000, any other 1010.
export function accountMap(names) {
  const map = {}; let bank = 0;
  for (const n of names) map[n] = /credit/i.test(n) ? "2000" : bank++ === 0 ? "1000" : "1010";
  return map;
}

// Replay the labelled lines in date order; after each day, file what was seen to the owner's
// account (first of the accepted list), as a bookkeeper confirming the queue would.
export function replay(rows, labels, { skip = null } = {}) {
  const lines = rows.map((r) => ({ ...r, want: OWNER_MAP[labels[r.line - 1]] })).filter((r) => r.want && r.want[0] !== "transfer")
    .sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  const blank = () => ({ n: 0, right: 0, wrong: 0 });
  const all = blank(), first = blank(), misses = [], hist = [], seen = new Set();
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null }, day = null, pending = [];
  const flush = () => { if (!pending.length) return; hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist) }; };
  for (const r of lines) {
    if (r.date !== day) { flush(); day = r.date; }
    const txn = { desc: r.desc, cents: r.cents, ...(r.bankCat ? { bankCat: r.bankCat } : {}), ...(r.card ? { card: r.card } : {}) };
    const s = suggest(txn, skip ? { ...model, skip } : model);
    const k = payeeKey(r.desc);
    for (const o of seen.has(k) ? [all] : [all, first]) { o.n++; if (s.account && r.want.includes(s.account)) o.right++; else if (s.account) o.wrong++; }
    if (!(s.account && r.want.includes(s.account))) misses.push(`${labels[r.line - 1]} | got ${s.account ?? "-"} (${s.source ?? ""}) | ${r.desc}`);
    seen.add(k);
    pending.push(historyRecord(txn, r.want[0]));
  }
  return { all, first, misses };
}

// Import the whole file, one account per Source Account, and categorize once: how many lines
// are paired as transfers between the file's own accounts.
export function importAll(text, skipLayers = null) {
  const names = readStatement(text).accountNames ?? [];
  let books = newBooks();
  const r = names.length > 1 ? importCsvAccounts(books, text, accountMap(names)) : importStatement(books, text, "1000");
  books = categorize(r.books, skipLayers ? { skipLayers } : {});
  const t = books.transactions;
  return { accounts: names.length || 1, lines: t.length, transfers: t.filter((x) => x.status === "transfer").length, review: t.filter((x) => x.status === "review").length, suggested: t.filter((x) => x.suggestion?.account && x.status !== "transfer").length };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
const fmt = (o) => `${pct(o.right, o.n)} right / ${pct(o.wrong, o.n)} wrong of ${o.n}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const dir = arg("--cache", join(tmpdir(), "mercury-exports"));
  for (const src of SOURCES) {
    const raw = await fetchSource(src, dir);
    const { text, labels } = hideColumn(raw, "Category");
    const read = readStatement(text);
    const why = {};
    for (const p of read.problems) { const m = p.match(/state (\w+)/); const k = m ? `status ${m[1]}` : p.replace(/^Line \d+: /, "").slice(0, 50); why[k] = (why[k] ?? 0) + 1; }
    const out = read.rows.filter((r) => r.cents < 0);
    console.log(`${src[0].padEnd(8)} ${src[1].padEnd(36)} ${read.bank} rows ${read.rows.length} skipped ${JSON.stringify(why)} accounts ${read.accountNames?.length ?? 1}`);
    console.log(`         money-out lines with Mercury's merchant category: ${out.filter((r) => r.bankCat).length} of ${out.length}; cards named: ${new Set(read.rows.map((r) => r.card).filter(Boolean)).size}`);
    const imp = importAll(text);
    const noCat = importAll(text, ["bank-category"]);
    console.log(`         imported: ${imp.lines} lines in ${imp.accounts} account(s), ${imp.transfers} paired transfers, ${imp.suggested} suggested (${noCat.suggested} without the bank's category), ${imp.review} to review`);
    if (labels.filter((l) => OWNER_MAP[l]).length > 20) {
      const before = replay(read.rows, labels, { skip: new Set(["bank-category"]) }), after = replay(read.rows, labels);
      console.log(`         owner's labels, every line: before ${fmt(before.all)}; after ${fmt(after.all)}`);
      console.log(`         owner's labels, first-seen payee: before ${fmt(before.first)}; after ${fmt(after.first)}`);
      if (process.argv.includes("--misses")) for (const m of after.misses) console.log("           " + m);
    }
    // Before this slice, the whole file went into one account: the same import with the account column hidden.
    if ((read.accountNames?.length ?? 0) > 1) {
      const one = importAll(hideColumn(text, "Source Account").text);
      console.log(`         as one account (before): ${one.lines} lines, ${one.transfers} paired transfers, ${one.suggested} suggested, ${one.review} to review`);
    }
  }
}
