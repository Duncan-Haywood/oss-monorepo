// One week of late changes priced under the Los Angeles County preset and four others, at $18 an hour
// (README "Los Angeles County"). node eval/la-county-compare.mjs prints the table in eval/la-county-compare-2026-11-17.md.
import { readNoticeEnv, priceChange, shortRests } from "../notice.mjs";

const S = (day, sh, eh) => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label: "", role: "" });
const WS = "2026-11-23"; // a Monday; times are UTC
const CHANGES = [
  ["Monday's 8 h shift cancelled 10 days ahead", "2026-11-13T09:00:00Z", "cancelled", S(0, 9, 17), null, {}],
  ["1 h cut off Tuesday's 8 h shift, Monday 23:00", "2026-11-23T23:00:00Z", "moved", S(1, 9, 17), S(1, 9, 16), {}],
  ["10 min cut off Wednesday's end, 3 days ahead", "2026-11-22T09:00:00Z", "moved", S(2, 9, 17), S(2, 9, 17 - 10 / 60), {}],
  ["Ben asked one-to-one to cover Ana's Thursday call-out", "2026-11-25T20:00:00Z", "added", null, S(3, 9, 17), { person: "Ben", cause: "cover", coverFor: "Ana" }],
];
const PRESETS = ["los-angeles-county", "los-angeles", "seattle", "chicago", "berkeley"];
const total = Object.fromEntries(PRESETS.map((p) => [p, 0]));
const lines = [`| Change | ${PRESETS.join(" | ")} |`, `|---|${PRESETS.map(() => "---:|").join("")}`];
for (const [title, iso, kind, from, to, extra] of CHANGES) {
  const cells = PRESETS.map((p) => {
    const r = priceChange({ id: 1, at: Date.parse(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false, ...extra }, readNoticeEnv({ FAIR_WORKWEEK: p }), { wage: 18 });
    total[p] += r.premium || 0;
    return `$${(r.premium || 0).toFixed(2)}`;
  });
  lines.push(`| ${title} | ${cells.join(" | ")} |`);
}
// Close Friday at midnight, open Saturday at 8: an 8 h rest.
const week = { weekStart: WS, assignments: [{ person: "Ana", slot: S(4, 16, 24) }, { person: "Ana", slot: S(5, 8, 16) }] };
const restCells = PRESETS.map((p) => {
  const v = shortRests(week, null, readNoticeEnv({ FAIR_WORKWEEK: p }), new Map([["Ana", 18]])).reduce((t, x) => t + (x.premium || 0), 0);
  total[p] += v;
  return `$${v.toFixed(2)}`;
});
lines.push(`| Close Fri 24:00, open Sat 08:00 (8 h rest) | ${restCells.join(" | ")} |`);
lines.push(`| **Total** | ${PRESETS.map((p) => `**$${total[p].toFixed(2)}**`).join(" | ")} |`);
console.log(lines.join("\n"));
