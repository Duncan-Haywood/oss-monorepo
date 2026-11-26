// Every report the CLI prints, on the sample house with every report flag on
// and the fastener options typed, must read as words and numbers: no "null",
// "undefined" or "NaN" leaking from a template that printed a field the
// user never typed (redteam 2026-11-26: brace cost priced by the foot printed
// "33.94 at null each"). A new optional price or count that a text template
// names without a fallback fails here instead of on a customer's bid sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, BARE_FLAGS } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";
import { sampleFloor } from "./floor.mjs";
import { sampleRoof } from "./roof.mjs";
import { sampleFoundation } from "./foundation.mjs";
import { sampleDeck } from "./deck.mjs";
import { sampleStair } from "./stairs.mjs";
import { sampleSchedule } from "./schedule.mjs";

// the fullest house the samples make: walls, floor, roof, foundation, deck, stairs, schedule
const house = () => ({ ...samplePlan(), floor: sampleFloor(), roof: sampleRoof(), foundation: sampleFoundation(), deck: sampleDeck(), stairs: sampleStair(), schedule: sampleSchedule() });
/** @param {any} plan @param {string[]} f */
const run = (plan, f) => main(["plan.json", ...f], () => JSON.stringify(plan));

// Output formats and modes that print something other than the text report;
// every other flag that runs on its own on the sample house is swept together.
const NOT_REPORTS = new Set(["--json", "--csv", "--pdf", "--help", "--plan-only", "--schedule-template", "--example", "--fixed-plan", "--skip-refused", "--level-bids", "--proposal", "--drawings", "--sensitivity"]);
const flags = BARE_FLAGS.filter((f) => !NOT_REPORTS.has(f) && run(house(), [f]).code === 0);
const leaks = (/** @type {string} */ out) => out.split("\n").filter((l) => /\b(null|undefined|NaN)\b/.test(l));

const fastenerOptions = [
  { wallBracing: { pricePerFoot: 1.5, nailsPerBrace: 4 } },
  { wallBracing: { price: 12 } },
  { wallBracing: true, holdDowns: { wallEnds: true }, rafterTies: true, plateStraps: true, roofNails: true },
  { holdDowns: { wallEnds: true, openingMinWidth: 36, price: 30 }, rafterTies: { perBearing: 2, price: 1.2 }, plateStraps: { perJoint: 2, price: 4 }, roofNails: { rafterToPlate: 2 }, nailsPerBox: 2500, price: 60 },
];

test("the sweep is not hollow: most report flags run on the sample house", () => {
  // 2026-11-26: 28 of the 44 report flags ran alone on the sample house; a drop below 25 means a sample or a flag broke
  assert.ok(flags.length >= 25, `only ${flags.length} flags ran: ${flags.join(" ")}`);
  const r = run(house(), flags);
  assert.equal(r.code, 0, String(r.out).slice(0, 400));
  assert.ok(String(r.out).includes("FASTENERS") && !String(r.out).trim().startsWith("{"));
});

test("sample house, every report flag: no null, undefined or NaN in the text", () => {
  assert.deepEqual(leaks(String(run(house(), flags).out)), []);
});

for (const fa of fastenerOptions) {
  test(`fastener options ${JSON.stringify(fa)}: no null, undefined or NaN in the text`, () => {
    const r = run({ ...house(), fasteners: fa }, flags);
    assert.equal(r.code, 0, String(r.out).slice(0, 400));
    assert.deepEqual(leaks(String(r.out)), []);
  });
}
