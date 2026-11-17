// Their days off (added 2026-11-12): a call due on the prospect's own holiday moves to their next working day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDaily, csvQueue } from "./daily.mjs";
import { parseCsv } from "./engine.mjs";

const TASKS = `date,channel,step,prospect,company,email,phone,subject
2026-06-24,call,3,Luc Martin,Atelier Nord,luc@nord.example,514-555-0100,
2026-06-24,email,4,Luc Martin,Atelier Nord,luc@nord.example,,Quick question
2026-06-24,call,3,Ana Lee,Lakeside Co,ana@lake.example,416-555-0100,
2026-07-13,call,5,Kate Ross,Bay Supply,kate@bay.example,709-555-0100,
2026-11-26,call,2,Ray Diaz,Mesa Parts,ray@mesa.example,303-555-0100,
2026-10-12,call,2,Ray Diaz,Mesa Parts,ray@mesa.example,303-555-0100,
2026-06-24,call,3,Ines Roy,Cap Rouge,ines@cap.example,418-555-0100,`;
const PROSPECTS = `email,first_name,company,country,region,state,holidays
luc@nord.example,Luc,Atelier Nord,CA,CA-QC,,
ana@lake.example,Ana,Lakeside Co,CA,CA-ON,,
kate@bay.example,Kate,Bay Supply,,,,ca-nl
ray@mesa.example,Ray,Mesa Parts,US,CA,CO,
ines@cap.example,Ines,Cap Rouge,FR,,,`;
const find = (d, email, step) => [...d.queue, ...d.held].find((q) => q.email === email && String(q.step) === String(step));

test("a call on Quebec's Saint-Jean-Baptiste waits a day; the email that day and Ontario's call do not move", () => {
  const d = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-06-24" });
  assert.equal(find(d, "luc@nord.example", 3), undefined, "Luc's call is not due on 24 June");
  assert.ok(find(d, "luc@nord.example", 4), "the email that day stays: it waits in the inbox");
  assert.ok(find(d, "ana@lake.example", 3), "Ontario works 24 June");
  const next = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-06-25", done: "luc@nord.example|4\nana@lake.example|3" });
  const luc = find(next, "luc@nord.example", 3);
  assert.equal(luc.date, "2026-06-25"); assert.equal(luc.planned, "2026-06-24"); assert.equal(luc.overdue, false);
  assert.deepEqual(luc.their_day_off, { date: "2026-06-24", name: "Saint-Jean-Baptiste Day", holidays: "ca-qc" });
  assert.match(next.brief, /Luc Martin, Atelier Nord \(3\) \(not 2026-06-24: their day off, Saint-Jean-Baptiste Day\)/);
  const row = parseCsv(csvQueue(next)).find((r) => r.email === "luc@nord.example");
  assert.equal(row.their_day_off, "2026-06-24 Saint-Jean-Baptiste Day"); assert.equal(row.planned, "2026-06-24");
});

test("the holidays column wins; their next working day must also be yours", () => {
  // Orangemen's Day 2026 is Monday 13 July in Newfoundland and Labrador; the rep is off the 14th.
  const d = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-07-15", holidays: "2026-07-14" });
  const kate = find(d, "kate@bay.example", 5);
  assert.equal(kate.date, "2026-07-15"); assert.equal(kate.their_day_off.name, "Orangemen's Day");
});

test("country US means the six business holidays; a bare region CA (California) and an unknown country change nothing", () => {
  const thanks = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-11-27" });
  const ray = find(thanks, "ray@mesa.example", 2);
  assert.equal(ray.date, "2026-11-27"); assert.equal(ray.their_day_off.name, "Thanksgiving Day");
  // Columbus Day (and Canadian Thanksgiving) on 12 October: a US business is open, and region "CA" is not Canada.
  const oct = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-10-12" });
  assert.equal(find(oct, "ray@mesa.example", 2).date, "2026-10-12");
  // FR has no calendar here: the call stays on its day rather than erroring.
  const fr = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-06-24" });
  assert.equal(find(fr, "ines@cap.example", 3).their_day_off, undefined);
});

test("a retried call that lands on their holiday moves on too", () => {
  const d = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-06-25", retry: [{ email: "ana@lake.example", step: "3", on: "2026-07-01", tries: 1, last: "2026-06-30" }] });
  const later = runDaily({ tasks: TASKS, prospects: PROSPECTS, today: "2026-07-02", retry: [{ email: "ana@lake.example", step: "3", on: "2026-07-01", tries: 1, last: "2026-06-30" }] });
  assert.equal(find(d, "ana@lake.example", 3), undefined);
  const ana = find(later, "ana@lake.example", 3);
  assert.equal(ana.date, "2026-07-02"); assert.equal(ana.tries, 1); assert.equal(ana.their_day_off.name, "Canada Day");
});
