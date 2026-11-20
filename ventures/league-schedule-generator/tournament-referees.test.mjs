import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE, tournamentFromText } from "./tournament.mjs";
import { playTournament } from "./tournament-results.mjs";
import { parseReferees, parseCrews, assignReferees, validateReferees, refereesAfterResults, refereesCsv, refereesText, refereeSheets, SAMPLE_REFEREES } from "./tournament-referees.mjs";
import { mulberry32 } from "./calc.mjs";

const t = tournamentFromText(SAMPLE);
const refs = parseReferees(SAMPLE_REFEREES.referees, t.days, t.divisions);
const crews = parseCrews(SAMPLE_REFEREES.crews, t.divisions);

test("parse: clubs across divisions, hours, divisions with assistant-only, caps, plays", () => {
  assert.deepEqual(refs.errors, []);
  const by = Object.fromEntries(refs.officials.map((o) => [o.name, o]));
  assert.deepEqual(by["Priya Shah"].clubs.sort(), ["U10 Girls/Riverside Rapids", "U12 Boys/Riverside Rapids"]);
  assert.equal(by["Priya Shah"].maxRun, 2);
  assert.equal(by["Marcus Lee"].maxDay, 4);
  assert.deepEqual(by["Marcus Lee"].hours[0], { start: 8 * 60, end: 14 * 60 });
  assert.deepEqual(by["Ava Chen"].divs, { "U10 Girls": "any", "U12 Boys": "assistant" });
  assert.deepEqual(by["Ava Chen"].plays, ["U14 Boys/Summit Strikers"]);
  assert.equal(by["Noah Kim"].assistantOnly, true);
  assert.deepEqual(crews.crews, { "U10 Girls": 1, "U12 Boys": 1, "U14 Boys": 3 });
});

test("parse: errors name the line and the fault", () => {
  const r = parseReferees("Sam: Mon\nSam\nLee (Nobody FC)\nKai: max 0 a day", t.days, t.divisions);
  assert.equal(r.errors.length, 4, r.errors.join(" | "));
  assert.match(r.errors[0], /Sam: "Mon" is not hours/);
  assert.match(r.errors[1], /listed twice/);
  assert.match(r.errors[2], /no team is called Nobody FC/);
  assert.match(r.errors[3], /at least 1/);
  assert.match(parseCrews("U99: 2", t.divisions).errors[0], /not one of the divisions/);
  assert.equal(parseCrews("U14 Boys: 2\nall: 3", t.divisions).crews["U14 Boys"], 2, "a named division beats all");
});

test("sample weekend: every rule holds, no knockout risk, sheets and CSV agree", () => {
  const a = assignReferees(t, refs.officials, { crews: crews.crews });
  assert.deepEqual(validateReferees(t, a.games, refs.officials, a), []);
  const filled = a.games.reduce((n, g) => n + g.crew.filter((c) => c.name).length, 0);
  const places = a.games.reduce((n, g) => n + g.crew.length, 0);
  assert.equal(filled + a.unfilled.length, places);
  assert.ok(a.unfilled.length <= 1, `${a.unfilled.length} empty`);
  assert.equal(a.koRisk.length, 0);
  const sheets = refereeSheets(t, a.games, refs.officials);
  assert.equal(sheets.reduce((n, s) => n + s.games.length, 0), filled);
  const csv = refereesCsv(t, a.games).trim().split("\n");
  assert.equal(csv.length, a.games.length + 1);
  assert.match(csv[0], /Referee,Assistant 1,Assistant 2$/);
  assert.match(refereesText(t, a.games, refs.officials), /Dana Price: \d+ games?/);
  // Same input, same answer.
  assert.deepEqual(assignReferees(t, refs.officials, { crews: crews.crews }).games.map((g) => g.crew), a.games.map((g) => g.crew));
});

test("the validator catches each rule when broken by hand", () => {
  const a = assignReferees(t, refs.officials, { crews: crews.crews });
  const one = (fn) => { const gs = JSON.parse(JSON.stringify(a.games)); fn(gs); return validateReferees(t, gs, refs.officials, a); };
  const pool = (div, team) => a.games.findIndex((g) => !g.knockout && g.division === div && g.teams.includes(`${div}/${team}`));
  assert.ok(one((gs) => { gs[pool("U12 Boys", "Riverside Rapids")].crew[0].name = "Priya Shah"; }).some((e) => /club is playing/.test(e)));
  assert.ok(one((gs) => { gs.find((g) => g.division === "U10 Girls").crew[0].name = "Tom Becker"; }).some((e) => /not down for U10 Girls/.test(e)));
  assert.ok(one((gs) => { gs[0].crew[0].name = "Noah Kim"; }).some((e) => /assistant only/.test(e)));
  assert.ok(one((gs) => { gs.find((g) => g.dayIndex === 0 && g.startAbs >= 15 * 60).crew[0].name = "Marcus Lee"; }).some((e) => /outside their hours/.test(e)));
  const summit = t.games.find((g) => g.teams.includes("U14 Boys/Summit Strikers"));
  assert.ok(one((gs) => { const g = gs.find((x) => x.division === "U10 Girls" && x.startAbs < summit.endAbs && summit.startAbs < x.endAbs); if (g) g.crew[0].name = "Ava Chen"; else gs[0].crew[0].name = "Ava Chen"; }).length > 0);
  // Two games at the same time on different fields.
  assert.ok(one((gs) => { const [x, y] = gs.filter((g) => g.startAbs === gs[0].startAbs); x.crew[0].name = "Dana Price"; y.crew[0].name = "Dana Price"; }).some((e) => /leave under/.test(e)));
});

test("caps: a day, in all, and in a row", () => {
  const few = parseReferees("A: max 2 a day\nB: max 3\nC: max 1 in a row\nD\nE\nF", t.days, t.divisions).officials;
  const a = assignReferees(t, few, {});
  assert.deepEqual(validateReferees(t, a.games, few, a), []);
  const n = (name) => a.loads.find((l) => l.name === name);
  assert.ok(n("A").perDay.every((k) => k <= 2));
  assert.ok(n("B").games <= 3);
  // C never has two games with under the 30-minute break between them.
  const c = a.games.filter((g) => g.crew.some((x) => x.name === "C")).sort((p, q) => p.startAbs - q.startAbs);
  for (let i = 1; i < c.length; i++) if (c[i].dayIndex === c[i - 1].dayIndex) assert.ok(c[i].startAbs - c[i - 1].endAbs >= 30);
});

test("an empty list leaves every slot empty with the reason", () => {
  const a = assignReferees(t, [], {});
  assert.equal(a.unfilled.length, t.games.length);
  assert.equal(a.unfilled[0].why, "no officials were listed");
});

test("after results: a referee whose club reached a knockout game gets a replacement or a swap", () => {
  // Every official belongs to a club in U12 Boys, so the knockout games cannot avoid the risk.
  const lines = "Ref A (North Hills Hawks)\nRef B (Riverside Rapids)\nRef C (Valley United)\nRef D (Lakeview Lightning)\nRef E (Harbor City FC)\nRef F (Summit Strikers)\nRef G";
  const o = parseReferees(lines, t.days, t.divisions).officials;
  const a = assignReferees(t, o, {});
  assert.deepEqual(validateReferees(t, a.games, o, a), []);
  let fixed = 0, flagged = 0;
  for (let s = 1; s <= 20; s++) {
    const rng = mulberry32(s);
    const res = [];
    for (let guard = 0; guard < 10; guard++) {
      const r = playTournament(t, res.join("\n"));
      const due = r.next;
      if (!due.length) break;
      for (const g of due) { const h = Math.floor(rng() * 3), w = Math.floor(rng() * 3); res.push(`${g.division}: ${g.home} ${h} - ${w} ${g.away}${h === w && g.knockout ? ` (${g.home} on penalties)` : ""}`); }
    }
    const played = playTournament(t, res.join("\n")).games;
    const fixes = refereesAfterResults(t, a, played, o);
    for (const f of fixes) {
      flagged++;
      if (f.fix.kind) fixed++;
      assert.ok(o.find((x) => x.name === f.name).clubs.includes(`${f.division}/${f.club}`));
      if (!f.fix.kind) continue;
      // Apply the fix and re-check every rule with the named teams.
      const gs = a.games.map((g) => { const p = played.find((x) => x.id === g.id); return { ...g, home: p.home, away: p.away, crew: g.crew.map((c) => ({ ...c })) }; });
      const g = gs.find((x) => x.id === f.id), k = g.crew.findIndex((c) => c.name === f.name);
      if (f.fix.kind === "replace") g.crew[k].name = f.fix.with;
      else { const h = gs.find((x) => x.id === f.fix.game); h.crew[h.crew.findIndex((c) => c.name === f.fix.with)].name = f.name; g.crew[k].name = f.fix.with; }
      assert.ok(!validateReferees(t, gs, o, a).some((e) => e.startsWith(`${f.fix.with} on ${g.division} ${g.stage}`) || e.startsWith(`${f.name} on ${g.division} ${g.stage}`)), `seed ${s}: the fix for ${f.stage} holds`);
    }
  }
  assert.ok(flagged >= 3, `${flagged} knockout clashes flagged over 20 weekends`);
  assert.equal(fixed, flagged, "a free official or a swap was found for each");
});
