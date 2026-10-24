// Hack Club's books replayed in date order, the way a treasurer would use the
// product: each transaction is suggested from everything filed before it
// (payee memory, naive Bayes, built-in keywords), then filed as the treasurer
// chose. Reports accuracy by year and what each layer contributed.
//
//   node eval/hackclub-online.mjs [main.ledger]     (curl https://raw.githubusercontent.com/hackclub/ledger/master/main.ledger)
//
// Payee text only (clean names, not bank text), so read it as an upper bound.
import { readFileSync } from "node:fs";
import { suggest, trainClassifier, buildMemory, historyRecord } from "../categorize.mjs";
import { parseLedger, MAP, INCOME } from "./hackclub-ledger.mjs";

export function replay(rows, { learn = true } = {}) {
  const hist = [];
  const out = { n: 0, right: 0, wrong: 0, blank: 0, bySource: {}, byYear: {} };
  let model = null;
  const codes = null;
  for (const r of rows.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const want = MAP[r.cat] ?? INCOME[r.cat];
    if (!want) continue;
    const cents = r.cat.startsWith("Income") ? 10000 : -10000;
    model ??= { rules: [], codes, memory: buildMemory([]), classifier: { n: 0 } };
    const s = suggest({ desc: r.desc, cents }, model);
    const y = (out.byYear[r.date.slice(0, 4)] ??= { n: 0, right: 0, wrong: 0, blank: 0 });
    const src = (out.bySource[s.source] ??= { n: 0, right: 0 });
    out.n++; y.n++; src.n++;
    if (!s.account) { out.blank++; y.blank++; }
    else if (want.includes(s.account)) { out.right++; y.right++; src.right++; }
    else { out.wrong++; y.wrong++; }
    if (learn) {
      hist.push(historyRecord({ desc: r.desc, cents }, want[0]));
      model = { rules: [], codes, memory: buildMemory(hist), classifier: trainClassifier(hist) };
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = parseLedger(readFileSync(process.argv[2] ?? "/tmp/hc/main.ledger", "utf8"));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  for (const [name, o] of [["keywords only", replay(rows, { learn: false })], ["learning online", replay(rows)]]) {
    console.log(`${name}: ${o.n} scored, suggested ${pct(o.right + o.wrong, o.n)}, right of suggested ${pct(o.right, o.right + o.wrong)}, right of all ${pct(o.right, o.n)}, wrong ${o.wrong}`);
    for (const [y, v] of Object.entries(o.byYear)) console.log(`  ${y}: n=${v.n} suggested ${pct(v.right + v.wrong, v.n)} right of all ${pct(v.right, v.n)}`);
    for (const [k, v] of Object.entries(o.bySource)) console.log(`  source ${k}: ${v.n} suggested, ${pct(v.right, v.n)} right`);
  }
}
