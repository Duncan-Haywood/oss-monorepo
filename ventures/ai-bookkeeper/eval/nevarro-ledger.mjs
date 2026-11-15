// A software LLC's own books, kept in hledger and published under the MIT licence
// (nevarro-space/financials): Bluevine business checking and a Chase Ink business card,
// 2023 to 2026, every bank line filed by the owner to an account. The raw CSV downloads are
// not in that repository (it ignores `csv/`), but each journal entry keeps the bank's own
// description as hledger imported it, the amount, and the owner's account: a labelled set of
// real business bank and card lines, the fourth after Mercury, Rocket Money and Open Collective
// (flagship item 0, "a firm's own labelled bank books"; item 2, "Relay/Bluevine files").
//
//   node eval/nevarro-ledger.mjs [--cache DIR] [--misses]
//
// Fetched at run time at a pinned commit into a cache directory; nothing is committed, and
// only counts go in the README. It reports, per account: lines read, and the categorizer
// replayed in date order against the owner's labels (money out filed to an expense the
// default chart has), keywords alone and the learning loop, every line and first-seen payee,
// and how the card payments and transfers on both sides are suggested.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { suggest, trainClassifier, buildMemory, trainNewPayee, historyRecord, payeeKey } from "../categorize.mjs";

export const REPO = "nevarro-space/financials";
export const COMMIT = "f4b886caab2816d69800e8f4f7563e5848eb6ea5";
export const JOURNALS = [2023, 2024, 2025, 2026].flatMap((y) => [`ledger/${y}/bluevine.journal`, `ledger/${y}/chase-ink-unlimited.journal`]);

// The owner's accounts -> default-chart codes a careful bookkeeper could accept (first is filed).
// Hosting, backup, mail, domains, monitoring and developer tools are all software and
// subscriptions in the default chart; mail could also be utilities and phone.
export const ACCOUNT_MAP = [
  [/^expenses:hosting|^liabilities:accounts-payable:hetzner/, ["6060", "6140"]],
  [/^expenses:(backup|devtools|monitoring|domains)/, ["6060"]],
  [/^expenses:(communication|comms)/, ["6060", "6140"]],
  [/^expenses:fees:(foreign-transaction|square)/, ["6010"]],
  [/^expenses:fees:government|^expenses:taxes/, ["6110"]],
  [/^expenses:supplies/, ["6100", "6070"]],
  [/^expenses:marketing/, ["6000"]],
  [/^expenses:tutoring/, ["6020"]],
];
export const TRANSFER = /^equity:transfers|^assets:cash:|^liabilities:credit-cards|^liabilities:chase-cc/;
const BANK = { bluevine: /^assets:cash:bluevine/, "chase-ink": /^liabilities:(credit-cards:chase:ink-unlimited|chase-cc)/ };

export const wantFor = (account) => ACCOUNT_MAP.find(([re]) => re.test(account))?.[1] ?? null;

const money = (s) => { const m = /(-?)\$(-?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/.exec(s); return m ? Math.round(Number(m[3].replace(/,/g, "")) * 100) * (m[1] || m[2] ? -1 : 1) : null; };

// One hledger journal -> bank lines: { date, desc, cents (signed as the bank sees it), label }.
// The label is the other posting with the largest amount (a Hetzner charge carries the payable
// and its foreign-transaction fee; the payable is what the line is). Opening balances, interest
// summaries ("January Balance") and entries with no line on this account are left out.
export function readJournal(text, bank) {
  const out = [];
  const blocks = text.replace(/\r/g, "").split(/\n(?=\d{4}-\d{2}-\d{2})/);
  for (const b of blocks) {
    const [head, ...rest] = b.split("\n");
    const h = /^(\d{4}-\d{2}-\d{2})\s+(?:[*!]\s+)?([^;]*)/.exec(head);
    if (!h) continue;
    const posts = rest.map((l) => /^\s+([^\s;][^;]*?)(?:\s{2,}|\t)([^;=]*)/.exec(l) || /^\s+([a-z][^\s;]*)\s*$/.exec(l)).filter(Boolean)
      .map((m) => ({ account: m[1].trim(), text: (m[2] ?? "").trim() }));
    const mine = posts.find((p) => BANK[bank].test(p.account));
    if (!mine) continue;
    const cents = money(mine.text);
    if (cents == null) continue;
    const others = posts.filter((p) => p !== mine);
    const sized = others.map((p) => ({ ...p, size: Math.abs(money(p.text.split("@@").pop()) ?? 0) })).sort((a, b) => b.size - a.size);
    const label = sized[0]?.account ?? null;
    out.push({ date: h[1], desc: h[2].trim(), cents, label });
  }
  return out;
}

export async function fetchJournal(path, dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${COMMIT.slice(0, 8)}_${path.replace(/\W+/g, "_")}`);
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/${path}`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, "utf8");
}

const empty = () => ({ rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null });

// Replay one account's lines in date order; after each day the owner's labels are confirmed.
export function replay(lines) {
  const scored = lines.map((r, i) => ({ ...r, i, want: wantFor(r.label ?? "") })).filter((r) => r.want && r.cents < 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i);
  const blank = () => ({ n: 0, right: 0, wrong: 0 });
  const all = blank(), first = blank(), kw = blank(), misses = [], hist = [], seen = new Set();
  let model = empty(), day = null, pending = [];
  const flush = () => { if (!pending.length) return; hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist) }; };
  for (const r of scored) {
    if (r.date !== day) { flush(); day = r.date; }
    const txn = { desc: r.desc, cents: r.cents };
    const k0 = suggest(txn, empty());
    kw.n++; if (k0.account && r.want.includes(k0.account)) kw.right++; else if (k0.account) kw.wrong++;
    const s = suggest(txn, model);
    const k = payeeKey(r.desc), ok = s.account && r.want.includes(s.account);
    for (const o of seen.has(k) ? [all] : [all, first]) { o.n++; if (ok) o.right++; else if (s.account) o.wrong++; }
    if (!ok) misses.push({ first: !seen.has(k), kw: k0.account ?? "-", line: `${r.label} | got ${s.account ?? "-"} (${s.source ?? ""}) | ${r.desc}` });
    seen.add(k);
    pending.push(historyRecord(txn, r.want[0]));
  }
  return { all, first, kw, misses };
}

// Transfers (card payments on both sides, the owner's capital, Fidelity sweeps): does a cold
// import, with nothing learned, suggest a transfer for them?
export function transfers(lines) {
  const t = lines.filter((r) => r.label && TRANSFER.test(r.label));
  const o = { n: t.length, transfer: 0, other: [] };
  for (const r of t) {
    const s = suggest({ desc: r.desc, cents: r.cents }, empty());
    if (s.account === "transfer") o.transfer++; else o.other.push(`${s.account ?? "-"} ${r.cents} ${r.desc}`);
  }
  return o;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const fmt = (o) => `${pct(o.right, o.n)} right / ${pct(o.wrong, o.n)} wrong of ${o.n}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const dir = arg("--cache", join(tmpdir(), "nevarro-ledger"));
  const showMisses = process.argv.includes("--misses");
  for (const bank of Object.keys(BANK)) {
    const lines = [];
    for (const p of JOURNALS.filter((j) => j.includes(bank === "bluevine" ? "bluevine" : "chase-ink"))) lines.push(...readJournal(await fetchJournal(p, dir), bank));
    const out = lines.filter((r) => r.cents < 0).length;
    console.log(`${bank}: ${lines.length} lines (${out} out, ${lines.length - out} in), ${new Set(lines.map((r) => payeeKey(r.desc))).size} payee keys`);
    const r = replay(lines);
    console.log(`  keywords alone:              ${fmt(r.kw)}`);
    console.log(`  learning loop, every line:   ${fmt(r.all)}`);
    console.log(`  learning loop, first-seen:   ${fmt(r.first)}`);
    const t = transfers(lines);
    console.log(`  transfers suggested as transfers: ${t.transfer} of ${t.n}`);
    if (showMisses) {
      for (const m of r.misses) console.log(`    ${m.first ? "first" : "again"} kw=${m.kw} ${m.line}`);
      for (const l of t.other) console.log(`    transfer missed: ${l}`);
    }
  }
}
