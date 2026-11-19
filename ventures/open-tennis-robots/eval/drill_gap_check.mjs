// Writes every preset drill with its intervals forced to 0.1 s, and the page's estimate of each
// release-to-release time, for tests/drill_gap_check.py to run on the simulated feeder.
// Usage: node eval/drill_gap_check.mjs > /tmp/drills.json
import { PRESETS, parseDrill, planDrill, feedSeconds } from "../drill.mjs";
const out = {};
for (const [k, p] of Object.entries(PRESETS)) {
  const spec = parseDrill(p.spec);
  spec.interval = 0.1;
  for (const s of spec.shots) delete s.interval;
  const plan = planDrill(spec);
  out[k] = { spec, estimate: plan.slice(1).map((r) => ({ seconds: r.gap.seconds + feedSeconds(r), by: r.gap.by })) };
}
// Held out: random drills (seeded), never looked at while the timing model was written.
let seed = 20261118;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let d = 0; d < 6; d++) {
  const shots = [];
  while (shots.length < 8) {
    const s = { x: 4 + rnd() * 7, y: -3.8 + rnd() * 7.6, speed: 15 + rnd() * 13, topspin: Math.round(-1000 + rnd() * 3500) };
    const r = planDrill(parseDrill({ machine: { y: 0, height: 1 }, shots: [s] }))[0];
    if (r.ok) shots.push(s);
  }
  const spec = parseDrill({ machine: { y: 0, height: 1 }, interval: 0.1, shots });
  const plan = planDrill(spec);
  out[`random${d}`] = { spec, estimate: plan.slice(1).map((r) => ({ seconds: r.gap.seconds + feedSeconds(r), by: r.gap.by })) };
}
console.log(JSON.stringify(out));
