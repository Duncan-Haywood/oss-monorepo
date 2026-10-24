import { readFileSync } from "node:fs";
// Built-in keyword layer against the hledger project's own Open Collective books
// (simonmichael/hledger_finance oc.journal, no licence file: fetched at run time,
// never copied):  curl -O https://raw.githubusercontent.com/simonmichael/hledger_finance/main/oc.journal
//   node eval/hledger-finance.mjs oc.journal
// Scores the transaction title against sponsors (income) and bounties (expense).
import { suggest } from "../categorize.mjs";
const t = readFileSync(process.argv[2], "utf8").split(/\n\n+/);
const tally = {}; const miss = new Map();
for (const b of t) {
  const L = b.split("\n"); const h = L.find((l) => /^\d{4}-/.test(l)); if (!h) continue;
  const desc = h.slice(11);
  const posts = L.filter((l) => /^    [a-z]/.test(l)).map((l) => l.trim().split(/\s{2,}/)[0]);
  const main = posts.find((a) => /^(expenses:(bounties|misc)|revenues)/.test(a)); if (!main) continue;
  const exp = main.startsWith("expenses");
  const s = suggest({ desc, cents: exp ? -10000 : 10000 }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) });
  const k = main.split(":").slice(0, 2).join(":");
  (tally[k] ??= { n: 0, sug: 0, acct: {} }).n++;
  if (s.account) { tally[k].sug++; tally[k].acct[s.account] = (tally[k].acct[s.account] ?? 0) + 1; }
  else miss.set(desc.replace(/\d+/g, "N").slice(0, 60), 1);
}
console.log(tally); console.log([...miss.keys()].slice(0, 15));
