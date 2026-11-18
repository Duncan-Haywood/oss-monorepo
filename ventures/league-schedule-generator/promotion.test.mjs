// Promotion and relegation into next season (divisionsPromotion), on made-up tiered leagues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readDivisionsSpec, buildDivisions, divisionsStandings, divisionsPromotion, parseDivisions } from "./divisions.mjs";

const FIELDS = {
  divisions: "Premier: A1, A2, A3, A4, A5\nDivision 1: B1, B2, B3, B4, B5 (double)\nDivision 2: C1, C2, C3, C4, C5\nJuniors: J1, J2, J3",
  courts: "Court 1, Court 2, Court 3", times: "19:00, 20:00", start: "2026-01-06", weekdays: "Tue",
};
const season = () => { const { spec, errors } = readDivisionsSpec(FIELDS); assert.deepEqual(errors, []); return buildDivisions(spec); };
// Every scheduled game played; the team listed earlier in its division wins (so final order = entry order),
// unless `upset` names a pair whose result is flipped.
function results(s, { skip = 0, draw = null } = {}) {
  const lines = [];
  for (const d of s.divisions) for (const r of d.rounds) for (const m of r.matches) {
    const h = d.teams[m.home], a = d.teams[m.away];
    if (draw && draw(d.name, h, a)) { lines.push(`${d.name}: ${h} 1 - 1 ${a}`); continue; }
    lines.push(`${d.name}: ${h} ${m.home < m.away ? "2 - 0" : "0 - 2"} ${a}`);
  }
  return lines.slice(0, lines.length - skip).join("\n");
}
const ladder = "Premier > Division 1 > Division 2";

test("one up and one down at each boundary, and an unladdered division copied unchanged", () => {
  const s = season();
  const st = divisionsStandings(s, results(s));
  assert.deepEqual(st.errors, []);
  const r = divisionsPromotion(s, st, { ladder, up: 1 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.divisionsText, "Premier: A1, A2, A3, A4, B1\nDivision 1: B2, B3, B4, A5, C1 (double)\nDivision 2: C2, C3, C4, C5, B5\nJuniors: J1, J2, J3");
  // The text parses back as a valid divisions box with the same sizes, every team once.
  const p = parseDivisions(r.divisionsText);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.divisions.map((d) => d.teams.length), [5, 5, 5, 3]);
  assert.equal(new Set(p.divisions.flatMap((d) => d.teams)).size, 18);
  assert.equal(r.moves.length, 4);
  assert.match(r.text, /A5: Premier -> Division 1 \(place 5 of 5, relegated\)/);
  assert.match(r.text, /C1: Division 2 -> Division 1 \(place 1 of 5, promoted\)/);
});

test("two up, one down changes division sizes; the ladder defaults to the order listed", () => {
  const s = season();
  const st = divisionsStandings(s, results(s));
  const r = divisionsPromotion(s, st, { ladder, up: 2, down: 1 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(parseDivisions(r.divisionsText).divisions.map((d) => d.teams.length), [6, 5, 4, 3]);
  const all = divisionsPromotion(s, st, { up: 1 });
  // Juniors joins the ladder when none is typed: its top team goes up to Division 2.
  assert.match(all.divisionsText, /Division 2: .*J1/);
});

test("a play-off at each boundary: pending keeps the upper team, a named winner swaps", () => {
  const s = season();
  const st = divisionsStandings(s, results(s));
  const pend = divisionsPromotion(s, st, { ladder, up: 1, playoff: true });
  assert.deepEqual(pend.errors, []);
  assert.deepEqual(pend.playoffs.map((p) => [p.upper, p.lower, p.winner]), [["A4", "B2", null], ["B4", "C2", null]]);
  assert.match(pend.text, /Play-offs still to play/);
  const won = divisionsPromotion(s, st, { ladder, up: 1, playoff: true, winners: "B2, B4" });
  assert.deepEqual(won.errors, []);
  assert.match(won.divisionsText, /^Premier: A1, A2, A3, B1, B2$/m);
  assert.match(won.divisionsText, /^Division 1: B3, B4, A5, A4, C1 \(double\)$/m);
  assert.match(won.text, /B2: Division 1 -> Premier \(place 2 of 5, won the play-off against A4\)/);
  const bad = divisionsPromotion(s, st, { ladder, up: 1, playoff: true, winners: "C5" });
  assert.match(bad.errors.join(" "), /"c5" is not in any play-off/);
  assert.equal(bad.divisionsText, "");
});

test("never guesses: games left and a boundary level on every tie-break are warned", () => {
  const s = season();
  const st = divisionsStandings(s, results(s, { skip: 6 }));
  const r = divisionsPromotion(s, st, { ladder, up: 1 });
  assert.match(r.warnings.join(" "), /Division 2: 3 games still to play/);
  // A4 and A5 draw each other and each lose to everyone else: level on every tie-break at the relegation line.
  const level = (d, h, a) => d === "Premier" && [h, a].sort().join() === "A4,A5";
  const st2 = divisionsStandings(s, results(s, { draw: level }));
  const r2 = divisionsPromotion(s, st2, { ladder, up: 1 });
  assert.match(r2.warnings.join(" "), /Premier: A4 and A5 are level on every tie-break at place 4/);
});

test("leaving, joining, name clashes and impossible counts are refused with the reason", () => {
  const s = season();
  const st = divisionsStandings(s, results(s));
  const r = divisionsPromotion(s, st, { ladder, up: 1, leaving: "A2", joining: "Division 2: New Town, Old Town" });
  assert.deepEqual(r.errors, []);
  assert.match(r.divisionsText, /^Premier: A1, A3, A4, B1$/m);
  assert.match(r.divisionsText, /^Division 2: C2, C3, C4, C5, B5, New Town, Old Town$/m);
  assert.match(divisionsPromotion(s, st, { ladder, leaving: "Nobody" }).errors.join(), /no team "Nobody"/);
  assert.match(divisionsPromotion(s, st, { ladder, joining: "Division 2: C3" }).errors.join(), /already has C3/);
  assert.match(divisionsPromotion(s, st, { ladder, up: 3 }).errors.join(), /Division 1: 3 up and 3 down is more than its 5 teams/);
  assert.match(divisionsPromotion(s, st, { ladder, up: 2, playoff: true }).errors.join(), /plus 2 play-off places/);
  assert.match(divisionsPromotion(s, st, { ladder: "Premier > Div 9" }).errors.join(), /no division called "Div 9"/);
  // A promoted team whose name is already used one tier up.
  const clash = { ...FIELDS, divisions: "Top: X, Y, Z\nLow: Y, Q, R" };
  const sc = buildDivisions(readDivisionsSpec(clash).spec);
  const stc = divisionsStandings(sc, results(sc));
  assert.match(divisionsPromotion(sc, stc, { up: 1 }).errors.join(), /Y cannot move to Top/);
});

test("the CLI prints next season with --promote", () => {
  const dir = mkdtempSync(join(tmpdir(), "promo-"));
  const s = season();
  writeFileSync(join(dir, "spec.json"), JSON.stringify({ ...FIELDS, ladder, promote: 1 }));
  writeFileSync(join(dir, "results.txt"), results(s));
  const cli = new URL("./divisions.mjs", import.meta.url).pathname;
  const out = spawnSync("node", [cli, join(dir, "spec.json"), "--results", join(dir, "results.txt"), "--promote"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Next season's divisions:\nPremier: A1, A2, A3, A4, B1/);
});
