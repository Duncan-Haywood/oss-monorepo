// New payees: how often is the first line from a payee right, on real labelled books?
// The import loop replayed in date order (each line suggested from every earlier
// filed line, then filed with the books' own answer), scored separately on lines
// whose payee key had never been filed before. Three public sets, fetched at run
// time and never copied here (none carries a licence that lets us redistribute):
//
//   hackclub     a US nonprofit's ledger payees, 2015-2018 (clean names)
//                curl -O https://raw.githubusercontent.com/hackclub/ledger/master/main.ledger
//   makerspace   a San Francisco makerspace's bank exports, 2019-2023 (raw bank text)
//                curl -O https://raw.githubusercontent.com/queeriouslabs/bank-account-activity/master/<year>.csv
//   chase        one person's Chase card export, labelled by Chase's own category
//                curl -O https://raw.githubusercontent.com/blakeb211/billcat-local-llm/HEAD/data/cc_transactions.csv
//
//   node eval/new-payees.mjs --hackclub main.ledger --makerspace DIR --chase cc_transactions.csv
//        [--no-new-payee] [--levels direction] [--min-share 0.4] [--misses 20]
//
// --no-new-payee switches the new-payee layer (guessNewPayee) off; --levels limits its
// views (e.g. "direction" for the plain prior), as in opencollective-labelled.mjs.
//
// Each set uses the category map of its own keyword eval (hackclub-ledger.mjs,
// queeriouslabs-bank.mjs, billcat-card.mjs). The Chase label is the bank's own
// category, so its bank-category layer is switched off there (it would be reading
// the answer).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { suggest, trainClassifier, buildMemory, trainNewPayee, historyRecord, payeeKey, NEW_PAYEE } from "../categorize.mjs";
import * as HC from "./hackclub-ledger.mjs";
import * as QL from "./queeriouslabs-bank.mjs";
import { parseDated } from "./queeriouslabs-online.mjs";
import * as BC from "./billcat-card.mjs";

const mdY = (s) => { const [m, d, y] = s.split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };

export function loadHackclub(text) {
  return HC.parseLedger(text).map((r) => {
    const want = HC.MAP[r.cat] ?? HC.INCOME[r.cat];
    const cents = Math.round((r.amount || 100) * 100);
    return want && { desc: r.desc, date: r.date.replace(/\//g, "-"), cents: r.cat.startsWith("Income") ? cents : -cents, want };
  }).filter(Boolean);
}
export function loadMakerspace(dir) {
  const rows = [];
  for (const f of readdirSync(dir).filter((f) => /^\d{4}\.csv$/.test(f)).sort()) {
    for (const r of parseDated(readFileSync(join(dir, f), "utf8"))) {
      const want = QL.MAP[r.cat] ?? QL.INCOME[r.cat];
      if (want) rows.push({ desc: r.desc, date: r.date, cents: QL.INCOME[r.cat] ? 10000 : -10000, want });
    }
  }
  return rows;
}
export function loadChase(text) {
  // parseRows keeps sales only and drops the date; re-read the dates of the same lines
  // (the file has no quoted commas, so a plain split lines up: 442 of 442).
  const saleDates = text.split(/\r?\n/).slice(1).filter((l) => /^\d+\/\d+\/\d{4},/.test(l) && /,Sale,/.test(l)).map((l) => mdY(l.split(",")[0]));
  return BC.parseRows(text).map((r, i) => BC.MAP[r.cat] && { desc: r.desc, date: saleDates[i] ?? "", cents: Math.round(r.amount * 100), want: BC.MAP[r.cat] }).filter(Boolean);
}

const blank = () => ({ n: 0, right: 0, wrong: 0, blank: 0 });
function tally(o, s, want) { o.n++; if (!s.account) o.blank++; else if (want.includes(s.account)) o.right++; else o.wrong++; }

// opts.skip: layers off (passed to suggest). Returns all / first-seen / repeat tallies.
export function replay(rows, { skip, newPayeeOpts } = {}) {
  const hist = [], seen = new Set();
  const out = { all: blank(), first: blank(), repeat: blank(), firstBySource: {}, misses: [] };
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, skip, newPayeeOpts };
  let day = null, pending = [];
  for (const r of rows.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.date !== day) {
      if (pending.length) { hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist), skip, newPayeeOpts }; }
      day = r.date;
    }
    const txn = { desc: r.desc, cents: r.cents };
    const s = suggest(txn, model);
    const k = `${payeeKey(r.desc)}|${r.cents >= 0}`;
    const isFirst = !seen.has(k);
    seen.add(k);
    tally(out.all, s, r.want);
    tally(isFirst ? out.first : out.repeat, s, r.want);
    if (isFirst) {
      const b = (out.firstBySource[s.source] ??= blank()); tally(b, s, r.want);
      if (s.account && !r.want.includes(s.account)) out.misses.push(`${r.want.join("/")} got ${s.account ?? "-"} (${s.source}) | ${r.desc.slice(0, 50)}`);
    }
    pending.push(historyRecord(txn, r.want[0]));
  }
  return out;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const fmt = (o) => `n=${o.n} right ${pct(o.right, o.n)} wrong ${pct(o.wrong, o.n)} blank ${pct(o.blank, o.n)}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
  const sets = [];
  if (arg("--hackclub")) sets.push(["hackclub", loadHackclub(readFileSync(arg("--hackclub"), "utf8")), undefined]);
  if (arg("--makerspace")) sets.push(["makerspace", loadMakerspace(arg("--makerspace")), undefined]);
  if (arg("--chase")) sets.push(["chase", loadChase(readFileSync(arg("--chase"), "utf8")), new Set(["bank-category"])]);
  for (const [name, rows, skip0] of sets) {
    const skip = new Set([...(skip0 ?? []), ...(process.argv.includes("--no-new-payee") ? ["new-payee"] : [])]);
    const levels = arg("--levels") ? arg("--levels").split(",") : null;
    const o = replay(rows, { skip, newPayeeOpts: { ...NEW_PAYEE, levels, ...(arg("--min-share") ? { minShare: +arg("--min-share") } : {}) } });
    console.log(`${name}: ${rows.length} scored lines`);
    console.log(`  all         ${fmt(o.all)}`);
    console.log(`  first seen  ${fmt(o.first)}`);
    console.log(`  seen before ${fmt(o.repeat)}`);
    console.log(`  first seen by source: ${Object.entries(o.firstBySource).map(([k, v]) => `${k} ${v.n} (${pct(v.right, v.n)} right)`).join(", ")}`);
    if (+arg("--misses")) o.misses.slice(0, +arg("--misses")).forEach((m) => console.log(`    ${m}`));
  }
}
