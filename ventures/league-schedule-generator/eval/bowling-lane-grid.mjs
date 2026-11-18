// Which seasons does the page's lane search leave off the bound? One JSON line per season.
// node eval/bowling-lane-grid.mjs 4 6 8 ... > grid.jsonl   (even team counts; weeks 2 to 40)
// Feeds eval/bowling-lane-table.py, which asks a SAT solver about each miss.
import { assignLanes, offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const ns = process.argv.slice(2).map(Number);
for (const n of ns) { const cyc=roundRobin(n); const P=n/2;
  for (let W=2; W<=40; W++) { const rounds=[]; for (let k=0;k<W;k++) rounds.push(cyc[k%cyc.length].matches);
    const t0=Date.now(); const o=offBound(assignLanes(rounds,n,P,{}),n,P);
    console.log(JSON.stringify({n,W,off:o,ms:Date.now()-t0,exact:W%P===0})); } }
