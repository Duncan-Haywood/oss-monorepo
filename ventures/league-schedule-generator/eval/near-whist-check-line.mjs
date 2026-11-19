// Check near-whist JSON lines (eval/near-whist-search.txt format) with checkNearWhist, without storing them.
// Usage: node eval/near-whist-check-line.mjs < lines
import { checkNearWhist } from "../whist.mjs";
const text = await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => r(s)); });
for (const l of text.split("\n").filter((x) => x.startsWith("{"))) {
  const { n, tables } = JSON.parse(l);
  if (!tables) { console.log(n, "no tables"); continue; }
  const rounds = [];
  for (let g = 0; g < n; g++) {
    const t = tables.map((r) => r.map((p) => (p + g) % n));
    const seated = new Set(t.flat());
    rounds.push({ tables: t, out: [...Array(n).keys()].filter((i) => !seated.has(i)) });
  }
  console.log(n, checkNearWhist(n, rounds) ? "ok" : "FAILS");
}
