import test from "node:test";
import assert from "node:assert/strict";
import { REQUIREMENTS, MAX_SCORE } from "./sprs-data.mjs";
import { scoreSprs, gapsToCsv, CONDITIONAL_MIN } from "./sprs.mjs";

const all = (status) => Object.fromEntries(REQUIREMENTS.map((r) => [r.id, status]));

test("there are 110 unique requirements", () => {
  assert.equal(REQUIREMENTS.length, 110);
  assert.equal(new Set(REQUIREMENTS.map((r) => r.id)).size, 110);
});

test("weights are only 1, 3, 5, or null for 3.12.4", () => {
  for (const r of REQUIREMENTS) {
    if (r.id === "3.12.4") assert.equal(r.weight, null);
    else assert.ok([1, 3, 5].includes(r.weight), r.id);
  }
});

test("everything met scores 110", () => {
  const s = scoreSprs(all("met"));
  assert.equal(s.score, MAX_SCORE);
  assert.equal(s.complete, true);
  assert.equal(s.gaps.length, 0);
  assert.equal(s.conditional.possible, true);
});

test("everything not met (SSP in place) reaches the documented floor of -203", () => {
  const st = all("not_met");
  st["3.12.4"] = "met";
  assert.equal(scoreSprs(st).score, -203);
});

test("no SSP is flagged and costs no points", () => {
  const st = all("met");
  st["3.12.4"] = "not_met";
  const s = scoreSprs(st);
  assert.equal(s.score, 110);
  assert.equal(s.sspMissing, true);
  assert.equal(s.conditional.possible, false);
});

test("partial MFA and non-FIPS encryption deduct 3, not 5", () => {
  const st = all("met");
  st["3.5.3"] = "partial";
  st["3.13.11"] = "partial";
  assert.equal(scoreSprs(st).score, 104);
  st["3.5.3"] = "not_met";
  st["3.13.11"] = "not_met";
  assert.equal(scoreSprs(st).score, 100);
});

test("partial on a requirement without partial credit counts as not met", () => {
  const st = all("met");
  st["3.1.1"] = "partial";
  assert.equal(scoreSprs(st).score, 105);
});

test("unanswered requirements are counted, not scored", () => {
  const s = scoreSprs({ "3.1.1": "not_met" });
  assert.equal(s.unanswered, 109);
  assert.equal(s.complete, false);
  assert.equal(s.conditional.possible, false);
});

test("conditional check: 88 floor and only 1-point gaps (or 3.13.11 partial)", () => {
  assert.equal(CONDITIONAL_MIN, 88);
  const st = all("met");
  st["3.13.11"] = "partial";
  st["3.1.3"] = "not_met";
  let s = scoreSprs(st);
  assert.equal(s.score, 106);
  assert.equal(s.conditional.possible, true);
  st["3.1.5"] = "not_met"; // 3 points
  s = scoreSprs(st);
  assert.deepEqual(s.conditional.blocking, ["3.1.5"]);
  assert.equal(s.conditional.possible, false);
});

test("gaps sort heaviest first and the CSV is formula-safe", () => {
  const st = all("met");
  st["3.1.3"] = "not_met";
  st["3.1.1"] = "not_met";
  const s = scoreSprs(st);
  assert.deepEqual(s.gaps.map((g) => g.id), ["3.1.1", "3.1.3"]);
  const csv = gapsToCsv([{ id: "=cmd", label: 'a,"b"', deduct: 1, status: "not_met" }]);
  assert.match(csv, /^Requirement,/);
  assert.match(csv, /'=cmd/);
  assert.match(csv, /"a,""b"""/);
});

test("CSV guard defuses tab and CR prefixes but lets plain numbers through", () => {
  const csv = gapsToCsv([{ id: "\tx", label: "\r=y", deduct: -1, status: "not_met" }]);
  const row = csv.split("\n")[1];
  assert.match(row, /^'\tx,/);
  assert.match(row, /,-1,/);
});

test("32 CFR 170.21(a)(2)(iii): six requirements never go on a POA&M", async () => {
  const { POAM_PROHIBITED } = await import("./sprs-data.mjs");
  assert.deepEqual(Object.keys(POAM_PROHIBITED).sort(), ["3.1.20", "3.1.22", "3.10.3", "3.10.4", "3.10.5", "3.12.4"]);
  for (const id of Object.keys(POAM_PROHIBITED)) {
    assert.ok(REQUIREMENTS.some((r) => r.id === id), id);
    assert.ok(POAM_PROHIBITED[id].includes(`L2-${id} `), id);
  }
  // Each is a 1-pointer (or 3.12.4), so the weight rule alone would let it through.
  for (const id of ["3.1.20", "3.1.22", "3.10.3", "3.10.4", "3.10.5"]) {
    const st = all("met");
    st[id] = "not_met";
    st["3.1.3"] = "not_met"; // an allowed 1-pointer alongside
    const s = scoreSprs(st);
    assert.equal(s.score, 108);
    assert.equal(s.conditional.scoreOk, true);
    assert.deepEqual(s.conditional.prohibited, [id]);
    assert.deepEqual(s.conditional.overWeight, []);
    assert.deepEqual(s.conditional.blocking, [id]);
    assert.equal(s.conditional.possible, false, id);
  }
});

test("POA&M starter says which gaps the rule allows", () => {
  const st = all("met");
  st["3.1.3"] = "not_met";
  st["3.1.5"] = "not_met";
  st["3.10.4"] = "not_met";
  st["3.13.11"] = "partial";
  const s = scoreSprs(st);
  const byId = Object.fromEntries(s.gaps.map((g) => [g.id, g.poam]));
  assert.deepEqual(byId, { "3.1.3": "allowed", "3.1.5": "over_one_point", "3.10.4": "prohibited", "3.13.11": "allowed" });
  const lines = gapsToCsv(s.gaps).trim().split("\n");
  assert.match(lines[0], /POA&M allowed \(32 CFR 170\.21\)/);
  assert.ok(lines.find((l) => l.startsWith("3.10.4,")).includes("No: listed in 32 CFR 170.21(a)(2)(iii)"));
  assert.ok(lines.find((l) => l.startsWith("3.1.3,")).includes(",Yes,"));
});

// 32 CFR 170.24(c)(2)(i)(B)(1)-(4), read on the eCFR renderer API 25 Nov 2026: the regulation lists
// every 5-point and 3-point requirement by number; 3.5.3 and 3.13.11 are 5 at most (3 when partial);
// 3.12.4 has no value; all the rest are 1.
test("every weight matches the lists in 32 CFR 170.24(c)(2)(i)(B)", () => {
  const five = new Set(("3.1.1 3.1.2 3.2.1 3.2.2 3.3.1 3.4.1 3.4.2 3.5.1 3.5.2 3.6.1 3.6.2 3.7.2 3.8.3 " +
    "3.9.2 3.10.1 3.10.2 3.12.1 3.12.3 3.13.1 3.13.2 3.14.1 3.14.2 3.14.3 3.1.12 3.1.13 3.1.16 3.1.17 " +
    "3.1.18 3.3.5 3.4.5 3.4.6 3.4.7 3.4.8 3.5.10 3.7.5 3.8.7 3.11.2 3.13.5 3.13.6 3.13.15 3.14.4 3.14.6 " +
    "3.5.3 3.13.11").split(" "));
  const three = new Set(("3.3.2 3.7.1 3.8.1 3.8.2 3.9.1 3.11.1 3.12.2 3.1.5 3.1.19 3.7.4 3.8.8 3.13.8 " +
    "3.14.5 3.14.7").split(" "));
  assert.equal(five.size, 44);
  assert.equal(three.size, 14);
  for (const r of REQUIREMENTS) {
    const expected = r.id === "3.12.4" ? null : five.has(r.id) ? 5 : three.has(r.id) ? 3 : 1;
    assert.equal(r.weight, expected, r.id);
  }
});
