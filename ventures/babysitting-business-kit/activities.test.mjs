import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "./activities.mjs";
import { exampleDesk, emptyDesk, leadReply, normalizeDesk, DEFAULT_PROFILE } from "./engine.mjs";

const TODAY = "2026-11-02";
const SIT = "2026-11-03";

function deskWith(kids, extra = {}) {
  const d = emptyDesk();
  d.families = [{ id: "fam_x", name: "Test family", kids, ...extra }];
  return d;
}

test("the library has 80+ activities, every one fully tagged, ids unique", () => {
  assert.ok(A.LIBRARY.length >= 80, `${A.LIBRARY.length}`);
  const ids = [...A.LIBRARY, ...A.FAITH].map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of [...A.LIBRARY, ...A.FAITH]) {
    assert.ok(a.ages.length && a.ages.every((b) => A.BANDS.includes(b)), a.id);
    assert.ok(A.KINDS.includes(a.kind), a.id);
    assert.ok(["in", "out", "any"].includes(a.place), a.id);
    assert.ok([1, 2, 3].includes(a.energy) && [0, 1, 2].includes(a.mess), a.id);
    assert.ok(a.minutes > 0 && Array.isArray(a.supplies) && a.how.length > 20, a.id);
    assert.equal(typeof a.screenFree, "boolean");
  }
  for (const b of A.BANDS) for (const k of A.KINDS) assert.ok(A.library({ band: b, kind: k }).length >= 1, `${b} ${k}`);
  assert.ok(A.LIBRARY.filter((a) => a.place === "out").length >= 15);
  assert.ok(A.LIBRARY.filter((a) => a.bedtime).length >= 6 && A.LIBRARY.filter((a) => a.quiet).length >= 12);
  assert.ok(A.LIBRARY.every((a) => !a.faith) && A.FAITH.every((a) => a.faith) && A.FAITH.length >= 10);
  assert.ok(A.library().every((a) => !a.faith && a.screenFree), "faith and screens are off by default");
  for (const a of A.FAITH.filter((x) => /retold|story|Noah|David|Daniel|Jonah|storm|Samaritan|Zacchaeus/.test(x.title))) assert.match(a.how, /\((Genesis|1 Samuel|Mark|Luke|Daniel|Jonah) [\d:-]+/, a.id);
});

test("ages map to bands, from birth dates or the 'age 3' a converted lead leaves", () => {
  assert.deepEqual([5, 12, 35, 36, 71, 72, 119, 120, 160].map(A.bandOf), ["infant", "toddler", "toddler", "preschool", "preschool", "school-age", "school-age", "tween", "tween"]);
  const k = A.kidsFor({ kids: [{ name: "Leo", birth: "2021-04-02" }, { name: "", allergies: "age 4" }, { name: "Bo", allergies: "age 8 months" }] }, SIT);
  assert.deepEqual(k.map((x) => [x.name, x.band]), [["Leo", "preschool"], ["Child 2", "preschool"], ["Bo", "infant"]]);
  assert.deepEqual(k[1].allergens, []);
  assert.deepEqual(k[1].unknownAllergies, []);
});

test("allergy text becomes allergen keys; unknown allergies are kept to warn about", () => {
  assert.deepEqual(A.allergyKeys("peanut allergy (EpiPen in diaper bag)").keys, ["peanut"]);
  assert.deepEqual(A.allergyKeys("nuts").keys.sort(), ["peanut", "treenut"]);
  assert.deepEqual(A.allergyKeys("milk, eggs; gluten").keys.sort(), ["dairy", "egg", "wheat"]);
  assert.deepEqual(A.allergyKeys("latex").keys, ["latex"]);
  assert.deepEqual(A.allergyKeys("none").keys, []);
  assert.deepEqual(A.allergyKeys("kiwi allergy").unknown, ["kiwi allergy"]);
});

test("a plan never includes a food or craft against a child's allergy (peanut butter and a peanut allergy)", () => {
  const d = deskWith([{ name: "Ava", birth: "2021-01-10", allergies: "peanut allergy" }, { name: "Ben", birth: "2018-05-01" }]);
  for (const weather of A.WEATHER) for (const [start, end] of [["09:00", "17:00"], ["13:00", "18:00"], ["17:00", "22:00"]]) for (let seed = 0; seed < 20; seed++) {
    const p = A.planSit(d, { familyId: "fam_x", date: SIT, start, end, weather, seed });
    const ids = p.slots.flatMap((s) => [s.id, ...s.side.map((x) => x.id)]);
    for (const id of ids) assert.ok(!A.activityById(id).allergens.includes("peanut"), `${id} in a plan for a peanut allergy`);
    assert.ok(!p.supplies.some((s) => /peanut/.test(s.item)), "no peanut butter on the supplies list");
  }
  // and the same family without the allergy can get them: the filter, not luck, keeps them out
  const p = A.planSit(d, { familyId: "fam_x", date: SIT, start: "13:00", end: "18:00" });
  assert.ok(p.avoided.some((a) => a.id === "ants-log" && a.child === "Ava" && /peanut/.test(a.reason)));
  assert.ok(p.avoided.some((a) => a.id === "pb-dough"));
  const free = A.planSit(deskWith([{ name: "Ava", birth: "2021-01-10" }]), { familyId: "fam_x", date: SIT, start: "13:00", end: "18:00" });
  assert.ok(!free.avoided.some((a) => /peanut/.test(a.reason)));
});

test("wheat, dairy and latex allergies keep out play dough, parfaits and balloons; under-3s get no small parts", () => {
  const d = deskWith([{ name: "Cy", birth: "2024-06-01", allergies: "wheat, milk, latex" }, { name: "Di", birth: "2019-02-01" }]);
  const out = new Set(A.planSit(d, { familyId: "fam_x", date: SIT, start: "09:00", end: "17:00" }).avoided.map((a) => a.id));
  for (const id of ["playdough", "salt-dough", "parfait", "smoothie", "balloon-volley", "pasta-necklace", "puzzles", "bracelets"]) assert.ok(out.has(id), id);
  for (let seed = 0; seed < 30; seed++) {
    const p = A.planSit(d, { familyId: "fam_x", date: SIT, start: "09:00", end: "17:00", seed });
    for (const s of p.slots) for (const id of [s.id, ...s.side.map((x) => x.id)]) {
      const a = A.activityById(id);
      assert.ok(!a.smallParts && !a.allergens.some((x) => ["wheat", "dairy", "latex"].includes(x)), id);
    }
  }
});

test("a plan is balanced: active, calm, creative, snack and wind-down, at clock times, for the kids' ages", () => {
  const d = exampleDesk(TODAY);
  const p = A.planSit(d, { booking: d.bookings[3], date: SIT, weather: "nice" });
  assert.equal(p.timeOfDay, "afternoon");
  assert.deepEqual(new Set(p.slots.map((s) => s.kind)), new Set(A.KINDS));
  assert.equal(p.slots[0].at, "15:30");
  assert.equal(p.slots.at(-1).kind, "winddown");
  assert.ok(p.planned <= p.minutes && p.planned >= p.minutes - 60, `${p.planned} of ${p.minutes}`);
  for (const s of p.slots) assert.ok(s.forKids.length || s.side.length, s.id);
  assert.ok(p.supplies.length >= 3);
  assert.ok(p.slots.filter((s) => s.kind === "snack").every((s) => /Confirm with the parents/.test(s.note)));
  // ages: an infant gets infant activities beside a school-age main activity
  const mixed = deskWith([{ name: "Baby", birth: "2026-05-01" }, { name: "Kit", birth: "2018-03-01" }]);
  const m = A.planSit(mixed, { familyId: "fam_x", date: SIT, start: "13:00", end: "17:00" });
  for (const s of m.slots) {
    const all = [A.activityById(s.id), ...s.side.map((x) => A.activityById(x.id))];
    assert.ok(all.some((a) => a.ages.includes("infant")), `nothing for the baby at ${s.at}`);
    assert.ok(all.some((a) => a.ages.includes("school-age")), `nothing for Kit at ${s.at}`);
  }
});

test("weather, evening bedtime and short sits shape the plan", () => {
  const d = deskWith([{ name: "Eli", birth: "2019-01-01" }]);
  for (let seed = 0; seed < 20; seed++) {
    const rain = A.planSit(d, { familyId: "fam_x", date: SIT, start: "13:00", end: "17:00", weather: "rain", seed });
    assert.ok(rain.slots.every((s) => s.place !== "out" || A.activityById(s.id).weather.includes("rain")), "outdoor only if it suits rain");
  }
  const snow = A.planSit(d, { familyId: "fam_x", date: SIT, start: "09:00", end: "12:00", weather: "snow" });
  assert.ok(snow.slots.some((s) => A.activityById(s.id).weather?.includes("snow")));
  const eve = A.planSit(d, { familyId: "fam_x", date: SIT, start: "17:30", end: "23:00", bedtime: "20:00" });
  assert.equal(eve.bedtime, "20:00");
  assert.equal(eve.asleep, 180);
  const last = eve.slots.at(-1);
  assert.ok(last.kind === "winddown" && A.activityById(last.id).bedtime);
  assert.ok(eve.slots.every((s) => s.place !== "out" || s.at < "19:00" || s.id === "stargazing"));
  assert.match(A.planSit(d, { familyId: "fam_x", date: SIT, start: "18:00", end: "22:00" }).warnings.join(" "), /Bedtime 20:00 is a guess/);
  assert.equal(A.planSit(deskWith([{ name: "Eli", birth: "2019-01-01" }], { bedtime: "19:45" }), { familyId: "fam_x", date: SIT, start: "18:00", end: "22:00" }).bedtime, "19:45");
  const late = A.planSit(d, { familyId: "fam_x", date: SIT, start: "21:00", end: "23:30", bedtime: "20:00" });
  assert.deepEqual(late.slots.map((s) => s.kind), ["winddown"]);
  const short = A.planSit(d, { familyId: "fam_x", date: SIT, start: "15:00", end: "16:00" });
  assert.ok(short.slots.length >= 2 && short.slots.length <= 4 && short.planned <= 75, `${short.slots.length} slots, ${short.planned} min`);
  // no kids on record: a warning and a plan anyway
  const none = A.planSit(emptyDesk(), { date: SIT, start: "15:00", end: "18:00" });
  assert.ok(none.slots.length >= 4);
  assert.match(none.warnings[0], /No children/);
});

test("screens only when the family said yes; avoided recent activities vary the next plan", () => {
  const d = deskWith([{ name: "Fay", birth: "2017-01-01" }]);
  for (let seed = 0; seed < 20; seed++) assert.ok(A.planSit(d, { familyId: "fam_x", date: SIT, start: "13:00", end: "19:00", seed }).slots.every((s) => A.activityById(s.id).screenFree));
  const first = A.planSit(d, { familyId: "fam_x", date: SIT, start: "13:00", end: "16:00" });
  d.activityPlans = A.savePlan(d, A.planRecord(first));
  const again = A.planSit(d, { familyId: "fam_x", date: "2026-11-10", start: "13:00", end: "16:00", avoid: A.recentActivityIds(d, "fam_x"), seed: `fam_x|${SIT}|13:00` });
  const overlap = again.slots.filter((s) => first.slots.some((f) => f.id === s.id)).length;
  assert.ok(overlap <= 1, `${overlap} repeats`);
});

test("faith activities appear only when the sitter offers them AND the family asked", () => {
  const kids = [{ name: "Gus", birth: "2020-01-01" }];
  const run = (profile, fam, leads = []) => {
    const d = deskWith(kids, fam);
    d.profile = { ...DEFAULT_PROFILE, ...profile };
    d.leads = leads;
    const ids = [];
    for (let seed = 0; seed < 15; seed++) ids.push(...A.planSit(d, { familyId: "fam_x", date: SIT, start: "16:00", end: "21:00", seed }).slots.map((s) => s.id));
    return { faith: A.faithAllowed(d, d.families[0]), any: ids.some((id) => A.activityById(id).faith), bag: A.bagOfTricks(d, "fam_x", TODAY) };
  };
  assert.deepEqual([run({ showFaith: false }, {}).faith, run({ showFaith: false }, {}).any], [false, false]); // default
  assert.equal(run({ showFaith: true }, {}).any, false); // sitter on, family didn't ask
  assert.equal(run({ showFaith: false }, { faithActivities: true }).any, false); // family asked, sitter off
  assert.equal(run({ showFaith: true, faithActivities: "" }, { faithActivities: true }).any, false); // nothing offered
  const on = run({ showFaith: true }, { faithActivities: true });
  assert.equal(on.faith, true);
  assert.equal(on.any, true);
  // the request can come from the inquiry that became this family
  assert.equal(run({ showFaith: true }, {}, [{ id: "l1", familyId: "fam_x", faithActivities: true }]).faith, true);
  assert.equal(run({ showFaith: true }, {}, [{ id: "l1", familyId: "fam_other", faithActivities: true }]).faith, false);
});

test("bag of tricks: portable, safe for these kids, no food, house items to borrow", () => {
  const d = exampleDesk(TODAY);
  const bag = A.bagOfTricks(d, "fam_a", TODAY);
  assert.ok(bag.pack.length >= 8 && bag.pack.length <= 12);
  assert.ok(bag.pack.every((p) => !/peanut/.test(p.item)));
  assert.ok(bag.pack[0].unlocks >= bag.pack.at(-1).unlocks);
  assert.ok(bag.borrow.includes("couch cushions"));
  assert.ok(!bag.pack.some((p) => bag.borrow.includes(p.item)));
  assert.ok(bag.avoided.some((a) => a.child === "Mia"));
  assert.match(A.bagPage(bag), /No warranty[\s\S]*github\.com\/sponsors\/Duncan-Haywood/);
  const latex = A.bagOfTricks(deskWith([{ name: "Hal", birth: "2019-01-01", allergies: "latex" }]), "fam_x", TODAY);
  assert.ok(!latex.pack.some((p) => p.item === "balloon"));
});

test("the printable plan for parents escapes text and carries the clauses", () => {
  const d = deskWith([{ name: "<b>Ivy</b>", birth: "2020-01-01", allergies: "peanuts" }], { name: "O'Neil & Co" });
  const p = A.planSit(d, { familyId: "fam_x", date: SIT, start: "15:00", end: "18:00" });
  const html = A.planPage(p, { ...DEFAULT_PROFILE, businessName: "Grace <Notes>" });
  assert.match(html, /&lt;b&gt;Ivy&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Ivy/);
  assert.match(html, /O&#39;Neil &amp; Co/);
  assert.match(html, /allergies: peanuts/);
  assert.match(html, /Left out because of allergies/);
  assert.match(html, /No warranty/);
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /href="\/"/);
  for (const s of p.slots) assert.ok(html.includes(s.at));
});

test("activitiesForReport lists what was done, from a plan or a saved record", () => {
  const d = exampleDesk(TODAY);
  const p = A.planSit(d, { familyId: "fam_b", date: SIT, start: "15:00", end: "18:00" });
  const fromPlan = A.activitiesForReport(p);
  assert.equal(fromPlan.length, p.slots.length + p.slots.reduce((n, s) => n + s.side.length, 0));
  assert.deepEqual(Object.keys(fromPlan[0]).sort(), ["kids", "kind", "minutes", "title"]);
  const rec = A.planRecord(p);
  rec.items[0].done = false;
  assert.equal(A.activitiesForReport(rec).length, fromPlan.length - 1);
  assert.deepEqual(A.activitiesForReport(null), []);
  // saved plans survive normalizeDesk, one per sit
  d.activityPlans = A.savePlan(d, rec);
  d.activityPlans = A.savePlan(d, A.planRecord(p));
  assert.equal(normalizeDesk(JSON.parse(JSON.stringify(d))).activityPlans.length, 1);
  assert.equal(normalizeDesk(emptyDesk()).activityPlans, undefined);
});

test("upcoming sits come from expanded weekly repeats, not cancelled or done", () => {
  const d = exampleDesk(TODAY);
  const up = A.upcomingSits(d, TODAY, 30);
  assert.ok(up.length >= 4 && up.every((b) => b.date >= TODAY && b.familyId === "fam_a"));
  assert.ok(up.every((b) => b.key));
  const plan = A.planForBooking(d, up[0], { weather: "cold" });
  assert.equal(plan.bookingKey, up[0].key);
});

test("leadReply keeps the sitter's capitalisation of their faith activities", () => {
  const d = exampleDesk(TODAY);
  const reply = leadReply(d.leads[0], d.profile);
  assert.match(reply, /happy to include Bible stories, simple prayers/);
  assert.doesNotMatch(reply, /bible/);
  const own = leadReply(d.leads[0], { ...d.profile, faithActivities: "Prayers before meals, songs about Jesus." });
  assert.match(own, /include Prayers before meals, songs about Jesus\./);
});

test("an allergy is still read when the note starts with EpiPen, inhaler or Notes", () => {
  for (const t of ["EpiPen for peanut allergy", "epipen (peanuts)", "Notes: severe peanut allergy", "inhaler; peanut allergy"]) assert.deepEqual(A.allergyKeys(t).keys, ["peanut"], t);
  assert.deepEqual(A.allergyKeys("EpiPen in the diaper bag").unknown, ["EpiPen in the diaper bag"], "an EpiPen with no named allergen asks the sitter to check");
  const p = A.planSit(deskWith([{ name: "Ava", birth: "2019-05-01", allergies: "EpiPen for peanut allergy" }]), { familyId: "fam_x", date: SIT, start: "09:00", end: "17:00" });
  const ids = JSON.stringify(p);
  for (const id of ["bird-feeder", "pb-dough", "ants-log"]) assert.ok(p.avoided.some((a) => a.id === id) || !ids.includes(`"${id}"`), id);
  assert.ok(p.avoided.some((a) => /peanut/.test(a.reason)));
});

test("small-part activities are left out when a child's age is unknown or no children are on file", () => {
  const unaged = A.planSit(deskWith([{ name: "Ava" }]), { familyId: "fam_x", date: SIT, start: "09:00", end: "17:00" });
  assert.ok(unaged.avoided.some((a) => a.reason === "small parts, age unknown"));
  const none = A.planSit(deskWith([]), { familyId: "fam_x", date: SIT, start: "09:00", end: "17:00" });
  assert.ok(none.avoided.some((a) => a.reason === "small parts, ages unknown"));
});
