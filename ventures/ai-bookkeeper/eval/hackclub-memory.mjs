// The learning layers (payee memory + naive Bayes) against Hack Club's archived
// books (hackclub/ledger main.ledger, Open Data Commons licence; fetched at run
// time, never copied), in the order the treasurer filed them.
//
//   node eval/hackclub-memory.mjs [main.ledger] [--seed 0.25]
//
// Two readings, both scored against the treasurer's own account:
//   online  every scored line is predicted from only the lines filed before it,
//           then added to the history (what a user's first year feels like);
//   seeded  history = the first `--seed` share of the ledger, the rest scored
//           (what importing last year's books and then filing this year is).
// Each reading is run with the built-in keywords alone and with the full stack,
// so the learning layers' contribution is the difference. Clean payee names, not
// bank text: an upper bound, as in eval/hackclub-ledger.mjs.
import { readFileSync } from "node:fs";
import { suggest, trainClassifier, buildMemory, historyRecord } from "../categorize.mjs";
import { MAP, INCOME } from "./hackclub-ledger.mjs";

export function parseDated(text) {
  const rows = [];
  let cur = null;
  const flush = () => { if (cur?.cat) rows.push(cur); cur = null; };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^(\d{4}\/\d\d\/\d\d)\s+(?:[*!]\s+)?(?:\([^)]*\)\s+)?(.+?)\s*$/);
    if (h) { flush(); cur = { date: h[1], desc: h[2], cat: null }; continue; }
    const p = line.match(/^\s+((?:Expenses|Income):[^\s$].*?)(?:\s{2,}|\t|$)/);
    if (p && cur && !cur.cat) cur.cat = p[1].trim();
    if (!line.trim()) flush();
  }
  flush();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const want = (r) => MAP[r.cat] ?? INCOME[r.cat];
const cents = (r) => (r.cat.startsWith("Income") ? 10000 : -10000);

// The account a line is filed under: the first mapped code, which is also what
// the model is asked to predict (a scored line counts right on any listed code).
function model(history, skip) {
  return { rules: [], codes: null, memory: buildMemory(history), classifier: trainClassifier(history), skip: new Set(skip) };
}

export function run(rows, { seedShare = null, learn = true } = {}) {
  const scored = rows.filter(want);
  const cut = seedShare == null ? 0 : Math.floor(scored.length * seedShare);
  const history = [];
  const tally = (n) => ({ n, right: 0, wrong: 0, blank: 0, bySource: {} });
  const total = tally(0);
  const conf = { hi: [0, 0], lo: [0, 0] }; // [right, n] of suggestions at confidence >= 0.8, and below
  const buckets = [tally(0), tally(0), tally(0), tally(0)];
  let m = model(history, learn ? [] : ["memory", "learned"]);
  scored.forEach((r, i) => {
    const txn = { desc: r.desc, cents: cents(r) };
    if (i < cut) { history.push(historyRecord(txn, want(r)[0])); if (i === cut - 1 && learn) m = model(history, []); return; }
    const s = suggest(txn, m);
    const q = seedShare == null ? Math.min(3, Math.floor((4 * i) / scored.length)) : Math.min(3, Math.floor((4 * (i - cut)) / (scored.length - cut)));
    if (s.account) { const c = conf[s.confidence >= 0.8 ? "hi" : "lo"]; c[1]++; if (want(r).includes(s.account)) c[0]++; }
    for (const t of [total, buckets[q]]) {
      t.n++;
      if (!s.account) t.blank++;
      else if (want(r).includes(s.account)) { t.right++; t.bySource[s.source] = (t.bySource[s.source] ?? 0) + 1; }
      else t.wrong++;
    }
    if (seedShare == null && learn) { history.push(historyRecord(txn, want(r)[0])); m = model(history, []); }
  });
  return { total, buckets, conf };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : +process.argv[i + 1]; };
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/tmp/hc/main.ledger";
  const rows = parseDated(readFileSync(file, "utf8"));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  const show = (label, o) => {
    const t = o.total;
    console.log(`${label.padEnd(26)} n=${t.n}  suggested ${pct(t.right + t.wrong, t.n)}  right of suggested ${pct(t.right, t.right + t.wrong)}  right of all ${pct(t.right, t.n)}  wrong ${t.wrong}`);
    console.log(`${"".padEnd(26)} by quarter, right of all: ${o.buckets.map((b) => pct(b.right, b.n)).join("  ")}   sources: ${JSON.stringify(t.bySource)}`);
    console.log(`${"".padEnd(26)} confidence >= 0.8: ${pct(o.conf.hi[0], o.conf.hi[1])} right of ${o.conf.hi[1]}   below: ${pct(o.conf.lo[0], o.conf.lo[1])} right of ${o.conf.lo[1]}`);
  };
  console.log(`${rows.length} transactions ${rows[0].date} to ${rows.at(-1).date}`);
  show("online, keywords only", run(rows, { learn: false }));
  show("online, full stack", run(rows));
  const seed = arg("--seed", 0.25);
  show(`seeded ${seed}, keywords only`, run(rows, { seedShare: seed, learn: false }));
  show(`seeded ${seed}, full stack`, run(rows, { seedShare: seed }));
}
