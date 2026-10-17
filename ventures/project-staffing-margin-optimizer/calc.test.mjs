import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, toCsv, EXAMPLE_PEOPLE, EXAMPLE_PROJECTS, EXAMPLE_SHARED } from "./calc.mjs";

const P = (name, cost, hours, skills) => ({ name, cost: String(cost), hours: String(hours), skills });
const J = (name, rate, hours, skill) => ({ name, rate: String(rate), hours: String(hours), skill });

// Exhaustive integer search over every hour matrix: the ground truth the flow must equal.
function brute(people, projects, minPct = 0) {
  const n = people.length, m = projects.length;
  const ok = (i, j) => {
    if (!projects[j].skill.split(",").some((s) => people[i].skills.split(",").map((x) => x.trim()).includes(s.trim()))) return false;
    const mg = projects[j].rate - people[i].cost;
    return mg > 0 && mg >= (minPct / 100) * projects[j].rate - 1e-9;
  };
  let best = 0;
  const left = people.map((p) => Number(p.hours)), need = projects.map((p) => Number(p.hours));
  (function go(c, val) {
    if (c === n * m) { best = Math.max(best, val); return; }
    const i = Math.floor(c / m), j = c % m;
    if (!ok(i, j)) return go(c + 1, val);
    for (let h = 0; h <= Math.min(left[i], need[j]); h++) {
      left[i] -= h; need[j] -= h;
      go(c + 1, val + h * (projects[j].rate - people[i].cost));
      left[i] += h; need[j] += h;
    }
  })(0, 0);
  return best;
}

test("one person, one project: margin is hours times the rate gap", () => {
  const a = analyze([P("A", 50, 10, "x")], [J("p", 80, 6, "x")]);
  assert.equal(a.margin, 180);
  assert.equal(a.hoursStaffed, 6);
  assert.equal(a.perPerson[0].idle, 4);
});

test("matches exhaustive search on random small instances", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const sk = ["a", "b", "c"];
  for (let t = 0; t < 120; t++) {
    const ppl = Array.from({ length: 2 + rnd(2) }, (_, i) => P("p" + i, 20 + rnd(60), 1 + rnd(4), sk.filter(() => rnd(2)).join(",") || "a"));
    const prj = Array.from({ length: 2 + rnd(2) }, (_, i) => J("j" + i, 40 + rnd(60), 1 + rnd(4), sk[rnd(3)]));
    const minPct = [0, 0, 25][rnd(3)];
    const a = analyze(ppl, prj, { minMarginPct: String(minPct) });
    assert.ok(Math.abs(a.margin - brute(ppl, prj, minPct)) < 1e-6, JSON.stringify({ ppl, prj, minPct, got: a.margin, want: brute(ppl, prj, minPct) }));
  }
});

test("scarce hours go to the project that pays more per hour, even if it is not listed first", () => {
  const a = analyze([P("A", 50, 10, "x")], [J("cheap", 70, 10, "x"), J("rich", 120, 10, "x")]);
  assert.equal(a.assignments.length, 1);
  assert.equal(a.assignments[0].project, "rich");
});

test("a cheaper person is not simply given everything: skills can force the dearer one onto a project", () => {
  const a = analyze([P("cheap", 40, 10, "x"), P("dear", 80, 10, "x,y")], [J("X", 100, 10, "x"), J("Y", 100, 10, "y")]);
  const byProject = Object.fromEntries(a.assignments.map((r) => [r.project, r.person]));
  assert.equal(byProject.X, "cheap");
  assert.equal(byProject.Y, "dear");
  assert.equal(a.margin, 600 + 200);
});

test("work billed at or below cost is never staffed, and the reason is given", () => {
  const a = analyze([P("A", 90, 10, "x")], [J("loss", 90, 10, "x")]);
  assert.equal(a.margin, 0);
  assert.equal(a.perProject[0].unfilled, 10);
  assert.match(a.perProject[0].why, /bill rate/);
});

test("minimum margin turns a thin job away", () => {
  const input = [[P("A", 80, 10, "x")], [J("thin", 90, 10, "x")]];
  assert.equal(analyze(...input, { minMarginPct: "0" }).margin, 100);
  const a = analyze(...input, { minMarginPct: "20" });
  assert.equal(a.margin, 0);
  assert.match(a.perProject[0].why, /minimum margin/);
});

test("a project nobody can do is flagged", () => {
  const a = analyze([P("A", 50, 10, "x")], [J("p", 100, 5, "z")]);
  assert.equal(a.perProject[0].why, "nobody has this skill");
});

test("value of an extra hour: a person whose time is the bottleneck is worth the best margin they could earn", () => {
  const a = analyze([P("A", 50, 10, "x")], [J("p", 120, 100, "x")]);
  assert.equal(Math.round(a.perPerson[0].extraHourValue), 70);
  const idle = analyze([P("A", 50, 100, "x")], [J("p", 120, 10, "x")]);
  assert.equal(idle.perPerson[0].extraHourValue, 0);
});

test("incomplete rows are dropped with a warning; empty rows are ignored silently", () => {
  const a = analyze([P("A", 50, 10, "x"), { name: "B", cost: "", hours: "", skills: "" }, { name: "", cost: "", hours: "", skills: "" }], [J("p", 80, 5, "x")]);
  assert.equal(a.warnings.length, 1);
  assert.equal(a.people.length, 1);
});

test("no people or no projects is not ok", () => {
  assert.equal(analyze([], [J("p", 80, 5, "x")]).ok, false);
});

test("skills match case-insensitively and across separators", () => {
  const a = analyze([P("A", 50, 10, "Design / UX")], [J("p", 100, 5, "ux")]);
  assert.equal(a.margin, 250);
});

test("fractional hours are respected to a quarter hour", () => {
  const a = analyze([P("A", 40, 2.5, "x")], [J("p", 100, 10, "x")]);
  assert.equal(a.margin, 150);
});

test("the worked example is internally consistent", () => {
  const a = analyze(EXAMPLE_PEOPLE, EXAMPLE_PROJECTS, EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.ok(a.margin > 0);
  for (const p of a.perPerson) assert.ok(p.used <= p.hours + 1e-9);
  for (const p of a.perProject) assert.ok(p.filled <= p.hours + 1e-9);
  assert.ok(Math.abs(a.revenue - a.cost - a.margin) < 1e-6);
});

test("csv has a header and one row per assignment", () => {
  const a = analyze([P("A, Inc", 50, 10, "x")], [J("p", 80, 6, "x")]);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"A, Inc",p,6,80,50,480\.00,180\.00$/);
});
