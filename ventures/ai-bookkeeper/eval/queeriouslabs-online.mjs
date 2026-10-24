// The makerspace's raw bank text (eval/queeriouslabs-bank.mjs) replayed in date
// order with learning, the way eval/hackclub-online.mjs replays clean payee
// names: each line is suggested from everything filed before it (payee memory,
// naive Bayes, built-in keywords), then filed as the people who kept the books
// chose. Bank descriptors carry card numbers, dates and reference noise, so
// this is the harder reading of the two.
//
//   node eval/queeriouslabs-online.mjs [dir-with-2019.csv...2023.csv]
//   fetch: curl -O https://raw.githubusercontent.com/queeriouslabs/bank-account-activity/master/<year>.csv
import { readFileSync } from "node:fs";
import { suggest, trainClassifier, buildMemory, historyRecord } from "../categorize.mjs";
import { parseRows, MAP, INCOME } from "./queeriouslabs-bank.mjs";

const isoDate = (s) => { const [m, d, y] = s.split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };

// The CSV's first column is the date; parseRows drops it, so read it again.
export function parseDated(text) {
  const dates = [];
  for (const line of text.split(/\r?\n/).slice(1)) if (/^\d+\/\d+\/\d{4},/.test(line)) dates.push(isoDate(line.split(",")[0]));
  const rows = parseRows(text);
  return rows.map((r, i) => ({ ...r, date: dates[i] ?? "" })).filter((r) => r.date);
}

export function replay(rows, { learn = true } = {}) {
  const hist = [];
  const out = { n: 0, right: 0, wrong: 0, blank: 0, bySource: {}, byYear: {} };
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 } };
  for (const r of rows.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const want = MAP[r.cat] ?? INCOME[r.cat];
    if (!want) continue;
    const cents = r.cat === "Income" ? 10000 : -10000;
    const s = suggest({ desc: r.desc, cents }, model);
    const y = (out.byYear[r.date.slice(0, 4)] ??= { n: 0, right: 0, wrong: 0, blank: 0 });
    const src = (out.bySource[s.source] ??= { n: 0, right: 0 });
    out.n++; y.n++;
    if (!s.account) { out.blank++; y.blank++; }
    else { src.n++; if (want.includes(s.account)) { out.right++; y.right++; src.right++; } else { out.wrong++; y.wrong++; } }
    if (learn) {
      hist.push(historyRecord({ desc: r.desc, cents }, want[0]));
      model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist) };
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "/tmp/qd";
  const rows = [];
  for (const y of [2019, 2020, 2021, 2022, 2023]) { try { rows.push(...parseDated(readFileSync(`${dir}/${y}.csv`, "utf8"))); } catch {} }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  for (const [name, o] of [["keywords only", replay(rows, { learn: false })], ["learning online", replay(rows)]]) {
    console.log(`${name}: ${o.n} scored, suggested ${pct(o.right + o.wrong, o.n)}, right of suggested ${pct(o.right, o.right + o.wrong)}, right of all ${pct(o.right, o.n)}, wrong ${o.wrong}`);
    for (const [y, v] of Object.entries(o.byYear)) console.log(`  ${y}: n=${v.n} suggested ${pct(v.right + v.wrong, v.n)} right of all ${pct(v.right, v.n)}`);
    for (const [k, v] of Object.entries(o.bySource)) console.log(`  source ${k}: ${v.n} suggested, ${pct(v.right, v.n)} right`);
  }
}
