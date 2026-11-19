import { ALL } from "../conformance-cases.mjs";
import * as nw from "../audit.mjs";
import * as old from "./audit-before-2026-11-19.mjs";
const by = {}; let o=0,n=0;
for (const c of ALL) {
  const p = nw.pathOf(c.url);
  const a = old.isAllowed(old.parseRobotsTxt(c.robots).records, c.agent, p).allowed === c.expected;
  const b = nw.isAllowed(nw.parseRobotsTxt(c.robots).records, c.agent, c.url).allowed === c.expected;
  o+=a; n+=b;
  const g = by[c.group] ??= {total:0, old:0, rfc:c.rfc}; g.total++; g.old+=a;
}
console.log("cases", ALL.length, "old right", o, "new right", n);
for (const [k,v] of Object.entries(by)) if (v.old<v.total) console.log(`${v.old}/${v.total} ${v.rfc?"RFC":"Google"}  ${k}`);
const robots = "User-agent: GPTBot\nDisallow: /" + "*a".repeat(30) + "b\n";
for (const [name, m] of [["old", old], ["new", nw]]) { const t=performance.now(); m.isAllowed(m.parseRobotsTxt(robots).records, "GPTBot", "/" + "a".repeat(40)); console.log(name, "30-star pattern, 40-char path:", (performance.now()-t).toFixed(1), "ms"); }
