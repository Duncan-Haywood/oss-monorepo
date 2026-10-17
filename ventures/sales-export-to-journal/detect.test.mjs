import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS, detect, convert, sampleReport, sampleBrokenReport, platform } from "./calc.mjs";

for (const p of PLATFORMS) {
  test(`${p.id}: its own sample report is detected as ${p.id} and balances`, () => {
    const text = sampleReport(p.id);
    const d = detect(text);
    assert.equal(d.id, p.id, JSON.stringify(d.ranked));
    const c = convert(text);
    assert.equal(c.platform.id, p.id);
    assert.ok(c.result.journals.length > 0);
    for (const j of c.result.journals) {
      const dr = j.lines.reduce((s, l) => s + (l.debit || 0), 0), cr = j.lines.reduce((s, l) => s + (l.credit || 0), 0);
      assert.equal(dr, cr, `${p.id} journal ${j.narration} balances`);
    }
  });

  test(`${p.id}: the broken sample still detects as ${p.id}`, () => {
    assert.equal(detect(sampleBrokenReport(p.id)).id, p.id);
  });

  test(`${p.id}: forcing another platform does not silently use ${p.id}`, () => {
    const other = PLATFORMS.find((q) => q.id !== p.id);
    const c = convert(sampleReport(p.id), { platform: other.id });
    assert.equal(c.platform.id, other.id);
  });
}

test("garbage and empty input are refused, not guessed", () => {
  for (const t of ["", "hello world", "a,b,c\n1,2,3"]) {
    const c = convert(t);
    assert.equal(c.platform, null);
    assert.equal(c.findings[0].severity, "error");
  }
});

test("every platform ships a default mapping the hub can show", () => {
  for (const p of PLATFORMS) assert.ok(Object.keys(platform(p.id).engine.defaultMapping()).length > 3);
});

test("the hub and engines never touch the network", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const files = ["calc.mjs", ...readdirSync(new URL("./engines/", import.meta.url)).map((f) => `engines/${f}`)];
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
});
