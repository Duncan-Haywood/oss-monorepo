import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeCall, parseDue, splitNotes, crmFields, toCsv, followUpEmail, checkEmail, SAMPLE_NOTES, FIELDS } from "./calc.mjs";

const TODAY = "2026-10-17"; // a Saturday
const a = analyzeCall(SAMPLE_NOTES, { rep: "Me", today: TODAY });
const field = (x, id) => x.coverage.find((c) => c.id === id);

test("parseDue resolves weekdays, relative phrases and dates against a fixed today", () => {
  assert.equal(parseDue("tomorrow", TODAY), "2026-10-18");
  assert.equal(parseDue("Tuesday", TODAY), "2026-10-20");
  assert.equal(parseDue("next Thursday", TODAY), "2026-10-22");
  assert.equal(parseDue("Saturday", TODAY), "2026-10-24", "same weekday means next week, never today");
  assert.equal(parseDue("next week", TODAY), "2026-10-19");
  assert.equal(parseDue("end of week", TODAY), "2026-10-23");
  assert.equal(parseDue("in 2 weeks", TODAY), "2026-10-31");
  assert.equal(parseDue("by Nov 3", TODAY), "2026-11-03");
  assert.equal(parseDue("Jan 15", TODAY), "2027-01-15", "a past month-day rolls to next year");
  assert.equal(parseDue("11/5", TODAY), "2026-11-05");
  assert.equal(parseDue("13/45", TODAY), null);
  assert.equal(parseDue("soonish", TODAY), null);
  assert.equal(parseDue("", TODAY), null);
});

test("splitNotes strips bullets and speaker labels, and keeps label words as text", () => {
  const u = splitNotes("- Dana: We use Excel. It is slow.\n2) Next steps: send deck by Friday\n\nMe: Okay then");
  assert.deepEqual(u.map((x) => [x.speaker, x.text]), [["Dana", "We use Excel."], ["Dana", "It is slow."], [null, "Next steps: send deck by Friday"], ["Me", "Okay then"]]);
});

test("the sample call covers every field and every item cites its sentence", () => {
  assert.equal(a.total, FIELDS.length);
  assert.equal(a.percent, 100);
  for (const c of a.coverage) { assert.ok(c.found, c.id); assert.ok(c.evidence[0].text.length > 5, c.id); }
  assert.match(field(a, "budget").evidence[0].text, /\$20k/);
  assert.match(field(a, "timeline").evidence.map((e) => e.text).join(" "), /January 15/);
  assert.deepEqual(a.competitors, ["RouteWorks"]);
  assert.deepEqual(a.stakeholders.map((s) => s.who), ["Dana Reyes", "Marcus"]);
  assert.ok(a.objections.some((o) => o.id === "price"));
});

test("next steps: owner follows the speaker label, due dates resolve", () => {
  const mine = a.nextSteps.filter((s) => s.owner === "you");
  const theirs = a.nextSteps.filter((s) => s.owner === "them");
  assert.equal(mine.length, 2);
  assert.equal(theirs.length, 1);
  assert.equal(mine[0].due, "2026-10-20");
  assert.equal(mine[1].due, "2026-10-22");
  assert.equal(theirs[0].due, null);
});

test("thin notes report gaps and risks instead of inventing fields", () => {
  const t = analyzeCall("Spoke to Priya. She said send me some info and she will think about it. Seemed interested.", { today: TODAY });
  assert.ok(t.percent <= 12, String(t.percent));
  const ids = t.flags.map((f) => f.id);
  for (const id of ["no-dated-next-step", "no-decision-maker", "brush-off", "no-budget", "no-timeline"]) assert.ok(ids.includes(id), id);
  assert.equal(t.gaps.length, t.total - t.qualified);
  assert.equal(crmFields(t).Budget, "");
});

test("an undated next step is reported but does not satisfy the dated-next-step field", () => {
  const t = analyzeCall("I'll send the proposal.", { today: TODAY });
  assert.equal(t.nextSteps.length, 1);
  assert.equal(field(t, "nextstep").found, false);
  assert.match(t.flags.find((f) => f.id === "no-dated-next-step").text, /no date/);
});

test("price objection with no quantified impact is flagged", () => {
  const t = analyzeCall("Dana: Honestly it is too expensive.\nDana: We might look again later.", { today: TODAY });
  assert.ok(t.flags.some((f) => f.id === "price-no-value"));
  assert.ok(t.objections.some((o) => o.id === "timing") || t.objections.some((o) => o.id === "price"));
});

test("custom competitor names are found, case-insensitively and with regex characters inert", () => {
  const t = analyzeCall("They also compared us to c++ builder and hubspot.", { competitors: "HubSpot, C++ Builder", today: TODAY });
  assert.deepEqual(t.competitors.sort(), ["C++ Builder", "HubSpot"]);
});

test("crmFields is flat, dated, and CSV-safe", () => {
  const f = crmFields(a, { company: "=HYPERLINK(\"x\")", contact: "Dana Reyes", date: "2026-10-16" });
  assert.equal(f["Qualification coverage"], "9/9");
  assert.equal(f["Next step date"], "2026-10-20");
  assert.equal(f["Next step owner"], "you");
  const csv = toCsv(f);
  assert.match(csv, /'=HYPERLINK/);
  assert.equal(csv.split("\n").length, 3);
  assert.equal(toCsv([]), "");
  assert.match(toCsv({ a: 'say "hi", ok' }), /"say ""hi"", ok"/);
});

test("the follow-up email recaps only what was said and passes its own checks", () => {
  const e = followUpEmail(a, { company: "Brightline", contact: "Dana Reyes", you: "Sam" });
  assert.match(e.body, /^Hi Dana,/);
  assert.match(e.body, /I will send the sample route comparison by Tuesday \(Tue, Oct 20\)/);
  assert.match(e.body, /On your side, as I noted it/);
  assert.deepEqual(checkEmail(e.body, SAMPLE_NOTES), { errors: [], warnings: [] });
  const bare = followUpEmail(analyzeCall("Quick intro call.", { today: TODAY }), {});
  assert.match(bare.body, /Proposed next step/);
  assert.deepEqual(checkEmail(bare.body, "Quick intro call.").errors, []);
});

test("checkEmail rejects invented figures and guarantees, and warns on discounts and length", () => {
  assert.equal(checkEmail("We can do $9,000 a year, guaranteed.", SAMPLE_NOTES).errors.length, 2);
  assert.equal(checkEmail("Your budget of $20k a year works. Next call Tuesday to schedule the demo please.", SAMPLE_NOTES).errors.length, 0);
  assert.ok(checkEmail("A limited time discount for you, then we schedule a call to review the next steps together soon.", "x").warnings.some((w) => /discount/.test(w)));
  assert.ok(checkEmail("word ".repeat(250) + "call", "x").warnings.some((w) => /words/.test(w)));
});

test("empty or non-string input never throws", () => {
  for (const v of ["", null, undefined, "   \n\n"]) {
    const t = analyzeCall(v, { today: TODAY });
    assert.equal(t.units, 0);
    assert.equal(t.qualified, 0);
    assert.ok(followUpEmail(t, {}).body.length > 20);
  }
});
