import { test } from "node:test";
import assert from "node:assert/strict";
import { CROPS, STARTER_SET, GROUPS, buildSeason, planCrop, planGarden, cropById, parseDate, isoDate, monthGrid, upcoming, tasksCsv, tasksIcs, tasksText, serializeState, parseState, sampleFields } from "./calc.mjs";

const season = (lastFrost = "2026-05-01", firstFrost = "2026-10-10", extra = {}) => buildSeason({ lastFrost, firstFrost, ...extra });
const day = (iso) => parseDate(iso);

test("dates parse strictly and round-trip", () => {
  assert.equal(isoDate(parseDate("2026-05-01")), "2026-05-01");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("May 1"), null);
  assert.equal(parseDate(""), null);
});

test("season: validation and the southern-hemisphere wrap", () => {
  assert.equal(season("", "2026-10-10").ok, false);
  assert.equal(season("2026-05-01", "2026-05-20").ok, false);
  const s = season();
  assert.equal(s.ok, true);
  assert.equal(s.frostFreeDays, 162);
  assert.equal(s.heatAssumed, true);
  // Last frost 30 Sep, first frost 1 Jun: the fall frost belongs to next year.
  const south = season("2026-09-30", "2026-06-01");
  assert.equal(south.ok, true);
  assert.equal(isoDate(south.firstFrost), "2027-06-01");
  assert.equal(south.frostFreeDays, 244);
  assert.equal(season("2026-05-01", "2026-10-10", { heat: "2026-04-01" }).ok, false);
  assert.equal(season("2026-05-01", "2026-10-10", { heat: "2026-07-15" }).heatAssumed, false);
});

test("worked values: tomato indoors 6 weeks before a transplant one week after last frost", () => {
  const p = planCrop(cropById("tomato"), season());
  const seg = p.segments[0];
  assert.equal(isoDate(seg.dates[0]), "2026-05-08");
  assert.equal(isoDate(seg.indoorStart[0]), "2026-03-27");
  assert.equal(isoDate(seg.harvestFrom), "2026-07-17");
});

test("cautious mode delays tender and half-hardy crops but not hardy ones", () => {
  const std = season();
  const cau = season("2026-05-01", "2026-10-10", { cautious: true });
  const first = (c, s) => planCrop(cropById(c), s).segments[0].plantFrom;
  assert.equal(first("tomato", cau) - first("tomato", std), 7);
  assert.equal(first("carrot", cau) - first("carrot", std), 7);
  assert.equal(first("peas", cau), first("peas", std));
});

test("every crop is internally consistent", () => {
  for (const c of CROPS) {
    assert.ok(GROUPS.some(([g]) => g === c.group), c.id);
    assert.ok(c.dtm > 0 && c.harvestDays > 0, c.id);
    if (c.method === "transplant") assert.ok(c.indoorWeeks >= 0, c.id);
  }
  assert.equal(new Set(CROPS.map((c) => c.id)).size, CROPS.length);
  for (const id of STARTER_SET) assert.ok(cropById(id), id);
});

test("property: across frost dates and crops, every plan obeys the frost rules", () => {
  const lasts = ["2026-03-15", "2026-04-10", "2026-05-01", "2026-05-25"];
  const spans = [120, 150, 180, 220];
  for (const l of lasts) for (const span of spans) for (const cautious of [false, true]) {
    const lf = day(l);
    const s = buildSeason({ lastFrost: l, firstFrost: isoDate(lf + span), cautious });
    assert.ok(s.ok, `${l} +${span}`);
    const g = planGarden(CROPS.map((c) => c.id), s);
    for (const p of g.plans) {
      const c = p.crop;
      for (const seg of p.segments) {
        assert.ok(seg.dates.length >= 1 && seg.dates.length <= 8, c.id);
        for (let i = 1; i < seg.dates.length; i++) assert.ok(seg.dates[i] > seg.dates[i - 1], `${c.id} dates ascend`);
        assert.ok(seg.harvestFrom >= seg.dates[0] + c.dtm, `${c.id} harvest after planting`);
        assert.ok(seg.harvestTo >= seg.harvestFrom, c.id);
        if (c.hardy === "tender" && !c.fallPlant) assert.ok(seg.dates[0] >= s.lastFrost, `${c.id} tender before last frost`);
        if (!c.fallPlant) {
          const grace = { hardy: 28, half: 14, tender: 0 }[c.hardy];
          for (const d of seg.dates) assert.ok(d + c.dtm <= s.firstFrost + grace, `${c.id} cannot mature before ${isoDate(s.firstFrost)} (+${grace}): planted ${isoDate(d)}`);
          if (c.cool && seg.season === "spring") for (const d of seg.dates) assert.ok(d + c.dtm <= s.heat, `${c.id} spring crop must finish before the heat`);
        }
        if (seg.indoorStart) seg.indoorStart.forEach((d, i) => assert.equal(d, seg.dates[i] - c.indoorWeeks * 7));
      }
      if (p.segments.length === 2) assert.ok(p.segments[1].plantFrom > p.segments[0].plantTo, `${c.id} fall after spring`);
    }
    for (let i = 1; i < g.tasks.length; i++) assert.ok(g.tasks[i].date >= g.tasks[i - 1].date, "tasks sorted");
  }
});

test("a long-season crop in a short season is flagged, not silently planted", () => {
  const s = buildSeason({ lastFrost: "2026-06-01", firstFrost: "2026-09-01" });
  assert.ok(s.ok);
  const g = planGarden(["pumpkin", "radish"], s);
  assert.equal(g.plans.find((p) => p.crop.id === "pumpkin").segments.length, 0);
  assert.match(g.warnings.join(" "), /Pumpkin: Needs about 100 days/);
  assert.ok(g.plans.find((p) => p.crop.id === "radish").segments.length >= 1);
});

test("a cool crop sown late in spring is pushed to fall, with a note", () => {
  const s = buildSeason({ lastFrost: "2026-05-01", firstFrost: "2026-10-10", heat: "2026-05-25" });
  const p = planCrop(cropById("broccoli"), s);
  assert.equal(p.segments.length, 1);
  assert.equal(p.segments[0].season, "fall");
  assert.match(p.notes.join(" "), /Plant it in fall instead/);
});

test("fall planting needs a summer in between", () => {
  const p = planCrop(cropById("spinach"), season());
  assert.deepEqual(p.segments.map((x) => x.season), ["spring", "fall"]);
  const short = planCrop(cropById("spinach"), buildSeason({ lastFrost: "2026-05-15", firstFrost: "2026-08-25" }));
  assert.ok(short.segments.every((x) => x.season === "spring"));
});

test("garlic goes in after the first fall frost and is harvested next summer", () => {
  const p = planCrop(cropById("garlic"), season());
  assert.equal(isoDate(p.segments[0].dates[0]), "2026-10-31");
  assert.equal(isoDate(p.segments[0].harvestFrom), "2027-06-28");
});

test("month grid marks start, plant and harvest months with letters", () => {
  const g = planGarden(["tomato"], season());
  const grid = monthGrid(g);
  assert.equal(grid.months[0].label, "Mar 2026");
  const row = grid.rows[0].cells;
  assert.equal(row[0], "S");
  assert.equal(row[1], "S");
  assert.equal(row[2], "SP");
  assert.ok(row.some((c) => c.includes("H")));
  assert.deepEqual(monthGrid(planGarden([], season())), { months: [], rows: [] });
});

test("upcoming returns only tasks in the window", () => {
  const g = planGarden(STARTER_SET, season());
  const t = upcoming(g, day("2026-05-01"), 14);
  assert.ok(t.length > 0);
  for (const x of t) assert.ok(x.date >= day("2026-05-01") && x.date <= day("2026-05-15"));
});

test("exports: csv quotes, ics is well formed, text lists every task", () => {
  const g = planGarden(["tomato", "summersquash"], season());
  const csv = tasksCsv(g);
  assert.equal(csv.split("\n")[0], "date,task,crop,type");
  assert.match(csv, /"Summer squash \/ zucchini"|Summer squash \/ zucchini/);
  const ics = tasksIcs(g, "20260101T000000Z");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, g.tasks.length);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, g.tasks.length);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260508/);
  assert.match(ics, /DTEND;VALUE=DATE:20260509/);
  assert.equal(new Set([...ics.matchAll(/UID:(.*)\r/g)].map((m) => m[1])).size, g.tasks.length);
  const text = tasksText(g);
  for (const t of g.tasks) assert.ok(text.includes(t.text), t.text);
  assert.match(text, /not a forecast/);
});

test("save file round-trips and rejects other files", () => {
  const f = sampleFields();
  const back = parseState(serializeState(f));
  assert.deepEqual(back.state.crops, f.crops);
  assert.equal(back.state.lastFrost, f.lastFrost);
  assert.match(parseState("nope").error, /not valid JSON/);
  assert.match(parseState('{"app":"other"}').error, /not a saved planting plan/);
  assert.match(parseState(serializeState({ lastFrost: "2026-05-01", firstFrost: "2026-05-02", crops: [] })).error, /frost-free days/);
});
