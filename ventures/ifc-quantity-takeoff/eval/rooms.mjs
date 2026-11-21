// Rooms measured from their solids against the quantities the model stores,
// and where the elements no room holds in the file were placed.
//
//   node eval/rooms.mjs <model.ifc>... [--json out.json]
//
// For every model: rooms, how each was read (body, outline and box, not
// read), each stored room quantity (floor area, perimeter, height, volume)
// against the computed one with the cause of each disagreement, and the
// elements in a room by the file and by where they stand, by class.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
const total = { models: 0, rooms: 0, measured: 0, pairs: {} };
for (const file of args) {
  const t0 = Date.now();
  const r = takeoff(parseStep(readFileSync(file)));
  const secs = (Date.now() - t0) / 1000;
  const res = { model: basename(file), rooms: r.rooms.length, secs, from: {}, status: {}, pairs: {}, disagreements: [], contained: {}, placed: {} };
  for (const rm of r.rooms) {
    res.status[rm.status] = (res.status[rm.status] || 0) + 1;
    if (rm.computed) res.from[rm.from] = (res.from[rm.from] || 0) + 1;
    for (const [k, c] of Object.entries(rm.check)) {
      const p = (res.pairs[k] ??= { n: 0, agree: 0, reasons: {} });
      p.n++;
      if (c.agree) p.agree++; else { p.reasons[c.reason] = (p.reasons[c.reason] || 0) + 1; res.disagreements.push({ room: rm.label, id: rm.id, quantity: k, name: c.name, stored: c.stored, computed: c.computed, reason: c.reason }); }
    }
  }
  for (const x of r.rows) {
    if (x.isAssembly) continue;
    if (x.spaceFrom === "contained") res.contained[x.ifcClass] = (res.contained[x.ifcClass] || 0) + 1;
    if (x.spaceFrom === "geometry") res.placed[x.ifcClass] = (res.placed[x.ifcClass] || 0) + 1;
  }
  out.push(res);
  if (res.rooms) total.models++;
  total.rooms += res.rooms;
  total.measured += Object.values(res.from).reduce((a, b) => a + b, 0);
  for (const [k, p] of Object.entries(res.pairs)) { const t = (total.pairs[k] ??= { n: 0, agree: 0, reasons: {} }); t.n += p.n; t.agree += p.agree; for (const [w, n] of Object.entries(p.reasons)) t.reasons[w] = (t.reasons[w] || 0) + n; }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  console.log(`\n${res.model}: ${res.rooms} rooms (${secs.toFixed(1)} s); read from ${JSON.stringify(res.from)}; ${JSON.stringify(res.status)}`);
  for (const [k, p] of Object.entries(res.pairs)) console.log(`  ${k.padEnd(10)} ${p.agree} of ${p.n} agree${Object.keys(p.reasons).length ? "; " + Object.entries(p.reasons).map(([w, n]) => `${n} ${w}`).join(", ") : ""}`);
  console.log(`  elements in a room: ${sum(res.contained)} by the file, ${sum(res.placed)} by where they stand ${JSON.stringify(res.placed)}`);
  for (const d of res.disagreements.filter((d) => d.reason === "unexplained")) console.log(`    unexplained: ${d.room} (#${d.id}) ${d.quantity}: stored ${d.name} ${d.stored.toFixed(3)}, computed ${d.computed.toFixed(3)}`);
}
console.log(`\nAll: ${total.rooms} rooms in ${total.models} models, ${total.measured} measured`);
for (const [k, p] of Object.entries(total.pairs)) console.log(`  ${k.padEnd(10)} ${p.agree} of ${p.n} agree; ${Object.entries(p.reasons).map(([w, n]) => `${n} ${w}`).join(", ")}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total, models: out }, null, 1));
