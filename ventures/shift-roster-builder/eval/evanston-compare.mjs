// One week of four late changes priced under five fair-workweek presets, at $18 an hour (README "Evanston").
// node eval/evanston-compare.mjs prints the table in eval/evanston-compare-2026-11-17.md.
import { readNoticeEnv, priceChange } from "../notice.mjs";

const S = (day, sh, eh) => ({ day, startMin: Math.round(sh * 60), endMin: Math.round(eh * 60), label: "", role: "" });
const WS = "2026-11-23"; // a Monday; times are UTC
const CHANGES = [
  ["1 h cut off Monday's 8 h shift, Sunday 23:00", "2026-11-22T23:00:00Z", "moved", S(0, 9, 17), S(0, 9, 16)],
  ["Tuesday's 4 h shift cancelled, Monday 20:00", "2026-11-23T20:00:00Z", "cancelled", S(1, 12, 16), null],
  ["5 min added to Wednesday's end, Tuesday 22:00", "2026-11-24T22:00:00Z", "moved", S(2, 9, 17), S(2, 9, 17 + 5 / 60)],
  ["Thursday's 8 h shift cancelled 3 days ahead", "2026-11-23T09:00:00Z", "cancelled", S(3, 9, 17), null],
];
const PRESETS = ["evanston", "berkeley", "emeryville", "chicago", "seattle"];
const total = Object.fromEntries(PRESETS.map((p) => [p, 0]));
const lines = [`| Change | ${PRESETS.join(" | ")} |`, `|---|${PRESETS.map(() => "---:|").join("")}`];
for (const [title, iso, kind, from, to] of CHANGES) {
  const cells = PRESETS.map((p) => {
    const r = priceChange({ id: 1, at: Date.parse(iso), weekStart: WS, person: "Ana", kind, from, to, cause: "republish", requested: false }, readNoticeEnv({ FAIR_WORKWEEK: p }), { wage: 18 });
    total[p] += r.premium || 0;
    return `$${(r.premium || 0).toFixed(2)}`;
  });
  lines.push(`| ${title} | ${cells.join(" | ")} |`);
}
lines.push(`| **Total** | ${PRESETS.map((p) => `**$${total[p].toFixed(2)}**`).join(" | ")} |`);
console.log(lines.join("\n"));
