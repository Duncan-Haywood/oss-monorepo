// Scores an owner array (eval/score-floor-milp.py's OWNER_OUT) with the engine's own rules and score (calc.mjs ownerValid,
// scoreOwner) on the same generated week, beside the roster buildRoster posts.
//   node eval/score-floor-milp-check.mjs owner.json [P=60] [S=168]
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, _internals } from "../calc.mjs";
const { buildContext, scoreOwner, ownerValid, validList } = _internals;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const J = JSON.parse(readFileSync(process.argv[2], "utf8"));
const P = Number(process.argv[3] || 60), S = Number(process.argv[4] || 168);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c <= J.week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < J.week) continue;
  const ctx = buildContext(parseStaff(st).staff, parseShifts(sh).slots, { exact: true });
  const own = Int32Array.from(J.owner);
  const sc = scoreOwner(ctx, own);
  const bad = sc.lists.map((l, p) => (validList(ctx, p, l) ? null : `P${p}`)).filter(Boolean);
  console.log(`week ${c}: valid ${ownerValid(ctx, own)}${bad.length ? ` (breaks a rule: ${bad.join(", ")})` : ""}; score ${sc.total.toFixed(2)}; open ${sc.unfilled} h`);
}
