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
