import { test } from "node:test";
import assert from "node:assert/strict";
import { CITIES, VIEWS, sunTimes, tzOffsetHours, parseTime, fmtTime, timeInput, normalize, buildDay, scheduleBeauty, dinnerMinutes, adviseCeremonyTimes, scoreDay, viewEvents, timelineCsv, timelineText, timelineIcs, serializeState, parseState, sampleFields } from "./calc.mjs";

const city = (name) => CITIES.find((c) => c.name === name);
function inputs(over = {}) {
  const f = { ...sampleFields(2026), ...over };
  const c = city(f.city);
  return normalize({ ...f, lat: c.lat, lon: c.lon, offset: tzOffsetHours(f.date, c.tz) });
}
const plan = (over) => { const n = inputs(over); assert.ok(n.ok, n.errors.join()); return { n, day: buildDay(n.p) }; };

test("time helpers round-trip", () => {
  assert.equal(parseTime("16:30"), 990);
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("abc"), null);
  assert.equal(fmtTime(990), "4:30 PM");
  assert.equal(fmtTime(0), "12:00 AM");
  assert.equal(fmtTime(720), "12:00 PM");
  assert.equal(timeInput(1500), "01:00");
});

test("sunset matches published almanac values within three minutes", () => {
  const ny = city("New York, NY");
  const cases = [
    ["2026-06-21", "20:31"], // 8:31 PM EDT
    ["2026-12-21", "16:32"], // 4:32 PM EST
  ];
  for (const [d, expected] of cases) {
    const s = sunTimes(d, ny.lat, ny.lon, tzOffsetHours(d, ny.tz));
    assert.ok(Math.abs(s.sunset - parseTime(expected)) <= 3, `${d}: ${fmtTime(s.sunset)}`);
  }
  const la = city("Los Angeles, CA");
  const s = sunTimes("2026-06-21", la.lat, la.lon, tzOffsetHours("2026-06-21", la.tz));
  assert.ok(Math.abs(s.sunset - parseTime("20:08")) <= 3, fmtTime(s.sunset));
});

test("polar day and night are reported, not guessed", () => {
  assert.equal(sunTimes("2026-12-21", 78, 15, 1).polar, "night");
  assert.equal(sunTimes("2026-06-21", 78, 15, 1).polar, "day");
});

test("daylight saving is part of the offset", () => {
  assert.equal(tzOffsetHours("2026-07-04", "America/New_York"), -4);
  assert.equal(tzOffsetHours("2026-01-15", "America/New_York"), -5);
  assert.equal(tzOffsetHours("2026-07-04", "America/Phoenix"), -7);
  assert.equal(tzOffsetHours("2026-07-04", "Not/AZone"), null);
});

test("validation names what is missing", () => {
  const n = normalize({ date: "", ceremonyStart: "", curfew: "", lat: "", lon: "", offset: "" });
  assert.equal(n.ok, false);
  assert.ok(n.errors.length >= 4);
  assert.equal(normalize({ ...sampleFields(), date: "2026-02-30", lat: 1, lon: 1, offset: 0 }).ok, false);
});

test("a curfew earlier than the ceremony is read as after midnight", () => {
  const n = inputs({ curfew: "00:30" });
  assert.equal(n.p.curfew, 24 * 60 + 30);
});

test("hair and makeup: makespan never beats the longest job or the even split", () => {
  for (const people of [1, 2, 3, 5, 8, 12]) for (const artists of [1, 2, 3, 4]) {
    const p = { hairPeople: people, artists, brideMin: 90, otherMin: 60 };
    const b = scheduleBeauty(p);
    const total = 90 + 60 * (people - 1);
    assert.ok(b.makespan >= Math.max(90, Math.ceil(total / artists)), `${people}/${artists}`);
    assert.equal(b.jobs.length, people);
    for (let a = 1; a <= artists; a++) {
      const mine = b.jobs.filter((j) => j.artist === a).sort((x, y) => x.from - y.from);
      mine.forEach((j, i) => { if (i) assert.ok(j.from >= mine[i - 1].to); });
    }
  }
  assert.equal(scheduleBeauty({ hairPeople: 0, artists: 2, brideMin: 90, otherMin: 60 }).makespan, 0);
});

test("dinner length follows the meal style and the guest count unless overridden", () => {
  const base = inputs().p;
  assert.equal(dinnerMinutes({ ...base, guests: 100, meal: "plated", dinnerMin: null }), 60);
  assert.equal(dinnerMinutes({ ...base, guests: 100, meal: "buffet", dinnerMin: null }), 50);
  assert.equal(dinnerMinutes({ ...base, dinnerMin: 75 }), 75);
  assert.ok(dinnerMinutes({ ...base, guests: 300, meal: "plated", dinnerMin: null }) > dinnerMinutes({ ...base, guests: 50, meal: "plated", dinnerMin: null }));
});

test("the sample day is internally consistent", () => {
  const { n, day } = plan();
  assert.deepEqual(day.warnings, []);
  const ceremony = day.events.find((e) => e.kind === "ceremony");
  assert.equal(ceremony.start, n.p.ceremonyStart);
  const first = day.events.find((e) => e.title === "First look");
  assert.ok(first.end <= ceremony.start - 20 - 5, "first look and portraits finish before the ceremony");
  for (const e of day.events) {
    assert.ok(e.end >= e.start);
    assert.ok(e.who.length > 0, e.title);
  }
  // the sequential reception events never overlap each other
  const seq = day.events.filter((e) => e.couple && e.start >= day.cocktailEnd).sort((a, b) => a.start - b.start);
  seq.forEach((e, i) => { if (i) assert.ok(e.start >= seq[i - 1].end, `${seq[i - 1].title} / ${e.title}`); });
  // the program ends exactly at the curfew
  assert.equal(Math.max(...day.events.map((e) => e.end)), n.p.curfew);
});

test("sunset portraits are an overlay: they never collide with the couple's own events", () => {
  for (const start of ["14:00", "15:00", "16:00", "16:30", "17:00", "17:30", "18:30"]) for (const firstLook of [true, false]) {
    const { day } = plan({ ceremonyStart: start, firstLook });
    if (!day.golden) continue;
    for (const e of day.events.filter((x) => x.couple)) assert.ok(day.golden.end <= e.start || day.golden.start >= e.end, `${start} ${firstLook}: ${e.title}`);
    assert.ok(day.golden.start >= day.ceremonyEnd);
  }
});

test("skipping the first look pushes portraits after the ceremony and can stretch the cocktail hour", () => {
  const withLook = plan({ firstLook: true }).day;
  const without = plan({ firstLook: false, cocktailMin: 45 }).day;
  assert.equal(withLook.warnings.length, 0);
  assert.ok(without.warnings.some((w) => /cocktail hour stretches/.test(w)));
  assert.ok(without.cocktailEnd > without.ceremonyEnd + 45);
  const fam = without.events.find((e) => e.title.startsWith("Family portraits"));
  assert.equal(fam.start, without.ceremonyEnd);
});

test("a program that cannot fit before the curfew says by how much", () => {
  const { day } = plan({ curfew: "19:30" });
  assert.ok(day.danceLen < 0);
  assert.ok(day.warnings.some((w) => /past the 7:30 PM end time/.test(w)));
});

test("an outdoor ceremony too close to sunset is flagged, an indoor one is not", () => {
  const out = plan({ ceremonyStart: "18:30", outdoors: true }).day;
  assert.ok(out.warnings.some((w) => /within 15 minutes of sunset/.test(w)));
  const inside = plan({ ceremonyStart: "18:30", outdoors: false }).day;
  assert.ok(!inside.warnings.some((w) => /within 15 minutes of sunset/.test(w)));
});

test("a second venue adds travel time for guests", () => {
  const near = plan({ sameVenue: true }).day;
  const far = plan({ sameVenue: false, travel: 30 }).day;
  assert.ok(far.events.some((e) => e.title === "Guests travel to the reception"));
  const cock = (d) => d.events.find((e) => e.title.startsWith("Cocktail hour"));
  assert.equal(cock(far).start - cock(near).start, 30);
});

test("very early hair and makeup is flagged", () => {
  const { day } = plan({ ceremonyStart: "11:00", hairPeople: 10, artists: 1, curfew: "17:00" });
  assert.ok(day.warnings.some((w) => /Hair and makeup would start at/.test(w)));
});

test("the advisor ranks times and the sample's own time is in the list", () => {
  const { n } = plan();
  const adv = adviseCeremonyTimes(n.p);
  assert.equal(adv.best.length, 3);
  assert.ok(adv.best[0].score >= adv.best[1].score && adv.best[1].score >= adv.best[2].score);
  assert.ok(adv.best[0].score >= adv.own.score);
  assert.equal(adv.own.start, n.p.ceremonyStart);
  // a ceremony after dark is never recommended for an outdoor wedding
  for (const b of adv.best) assert.ok(buildDay({ ...n.p, ceremonyStart: b.start }).ceremonyEnd <= buildDay(n.p).sun.sunset - 15);
});

test("scoring punishes an overrun harder than a late ceremony", () => {
  const { n } = plan({ curfew: "19:30" });
  assert.ok(scoreDay(buildDay(n.p), n.p).score < 60);
});

test("views filter by who needs to know, and every view is non-empty", () => {
  const { day } = plan();
  for (const v of Object.keys(VIEWS)) assert.ok(viewEvents(day, v).length > 0, v);
  assert.equal(viewEvents(day, "all").length, day.events.length);
  assert.equal(viewEvents(day, "photo").length, day.events.length);
  const dj = viewEvents(day, "dj").map((e) => e.title);
  assert.ok(dj.includes("First dance") && dj.includes("Open dancing"));
  assert.ok(!viewEvents(day, "dj").some((e) => e.title === "Wedding party portraits"));
  assert.ok(viewEvents(day, "catering").some((e) => e.title.startsWith("Dinner service")));
});

test("exports: csv quotes, text lists every event, ics is valid and floating", () => {
  const { n, day } = plan();
  const csv = timelineCsv(day, "all").trim().split("\n");
  assert.equal(csv[0], "start,end,event,who,notes");
  assert.equal(csv.length - 1 >= day.events.length, true);
  const txt = timelineText(day, n.p, "all");
  assert.match(txt, /Ceremony/);
  assert.match(txt, /Saturday, October 17, 2026/);
  const ics = timelineIcs(day, n.p, "all");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, day.events.length);
  assert.match(ics, /DTSTART:20261017T163000\r\n/);
  assert.doesNotMatch(ics, /DTSTART:[^\r]*Z/);
  assert.doesNotMatch(ics, /[^\r]\n/);
});

test("a program past midnight exports onto the next calendar day", () => {
  const { n, day } = plan({ curfew: "00:30" });
  const ics = timelineIcs(day, n.p, "all");
  assert.match(ics, /DTSTART:20261018T0010\d\d\r\n|DTSTART:20261018T00\d\d00\r\n/);
});

test("saved files round-trip and reject strangers", () => {
  const f = sampleFields(2026);
  assert.deepEqual(parseState(serializeState({ fields: f })).state, f);
  assert.ok(parseState("{").error);
  assert.ok(parseState(JSON.stringify({ app: "other" })).error);
});

test("every city preset resolves a time zone and a sunset on a summer date", () => {
  for (const c of CITIES) {
    const off = tzOffsetHours("2026-06-20", c.tz);
    assert.ok(Number.isFinite(off), c.name);
    const s = sunTimes("2026-06-20", c.lat, c.lon, off);
    assert.ok(s && s.sunset > 14 * 60, `${c.name}: ${s && fmtTime(s.sunset)}`);
  }
});

test("property: across dates, cities and start times nothing throws and times stay ordered", () => {
  const dates = ["2026-03-14", "2026-06-20", "2026-09-26", "2026-12-12"];
  for (const c of CITIES.filter((_, i) => i % 4 === 0)) for (const date of dates) for (const start of ["11:00", "13:30", "16:00", "18:00"]) for (const firstLook of [true, false]) {
    const f = { ...sampleFields(2026), city: c.name, date, ceremonyStart: start, firstLook, curfew: "23:00" };
    const n = normalize({ ...f, lat: c.lat, lon: c.lon, offset: tzOffsetHours(date, c.tz) });
    assert.ok(n.ok);
    const day = buildDay(n.p);
    for (let i = 1; i < day.events.length; i++) assert.ok(day.events[i].start >= day.events[i - 1].start);
    for (const e of day.events) assert.ok(Number.isFinite(e.start) && Number.isFinite(e.end) && e.end >= e.start, `${c.name} ${date} ${start}: ${e.title}`);
  }
});
