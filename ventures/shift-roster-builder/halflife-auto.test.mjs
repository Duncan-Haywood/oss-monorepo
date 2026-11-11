import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demandShifts, pickHalfLife, AUTO_MIN_WEEKS } from "./demand.mjs";

// Hand-built hourly sales from Monday 2026-01-05, `weeks` weeks, 9:00-17:00 every day; level(w) scales week w.
function sales(weeks, level = () => 1) {
  const rows = ["datetime,sales"];
  const t0 = Date.UTC(2026, 0, 5);
  for (let d = 0; d < weeks * 7; d++) {
    const date = new Date(t0 + d * 864e5).toISOString().slice(0, 10);
    const w = Math.floor(d / 7);
    for (let h = 9; h < 17; h++) rows.push(`${date} ${String(h).padStart(2, "0")}:00,${Math.round(level(w) * (h === 12 ? 160 : 70) * (1 + 0.15 * Math.sin(d * 1.7 + h)))}`);
  }
  return rows.join("\n");
}

test("half-life auto: too few weeks to test keeps equal weights and says why", () => {
  const p = pickHalfLife(sales(6), { splh: 60 });
  assert.equal(p.halfLife, undefined);
  assert.ok(p.weeks < AUTO_MIN_WEEKS);
  assert.match(p.note, /fewer than 4, so every earlier week weighs the same/);
});

test("half-life auto: steady sales keep equal weights (a tie goes to the plain average)", () => {
  const p = pickHalfLife(sales(16), { splh: 60 });
  assert.equal(p.halfLife, undefined);
  assert.match(p.note, /every earlier week weighed the same/);
});

test("half-life auto: sales that kept growing pick a half-life, and the plan follows the recent level", () => {
  const text = sales(20, (w) => 1 + 0.12 * w);
  const p = pickHalfLife(text, { splh: 60 });
  assert.ok([8, 4, 2].includes(p.halfLife), `picked ${p.halfLife}`);
  assert.match(p.note, /fewer than equal weights/);
  const auto = demandShifts(text, { splh: 60, halfLife: "auto" });
  const plain = demandShifts(text, { splh: 60 });
  assert.equal(auto.halfLife, p.halfLife);
  assert.ok(auto.needed > plain.needed, `${auto.needed} vs ${plain.needed}`);
  assert.ok(auto.notes.some((n) => n.startsWith("Half-life auto:")));
  // An explicit number or none is used as given.
  assert.equal(demandShifts(text, { splh: 60, halfLife: "none" }).needed, plain.needed);
  assert.equal(demandShifts(text, { splh: 60, halfLife: p.halfLife }).needed, auto.needed);
});

test("half-life auto: with a short cost it picks among the fractile plans", () => {
  const text = sales(20, (w) => 1 + 0.12 * w);
  const p = pickHalfLife(text, { splh: 60, shortCost: 3 });
  assert.ok([8, 4, 2].includes(p.halfLife), `picked ${p.halfLife}`);
});

test("CLI: --from-sales defaults to auto; --half-life none and numbers still work; 0 is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "hl-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, sales(20, (w) => 1 + 0.12 * w));
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const run = (...a) => execFileSync(process.execPath, [cli, "--from-sales", f, "--splh", "60", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const auto = run(), none = run("--half-life", "none"), four = run("--half-life", "4");
  assert.notEqual(auto, none);
  assert.ok(auto === four || auto === run("--half-life", "2") || auto === run("--half-life", "8"));
  assert.throws(() => run("--half-life", "0"));
  assert.match(readFileSync(cli, "utf8"), /the default, auto, backtests/);
});
