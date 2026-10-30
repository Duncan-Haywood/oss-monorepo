// Split out of page.test.mjs: node --test runs files in parallel but the tests
// in one file one after another, and each of these rebuilds the sample week
// many times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("widening page's table is what the engine returns for the sample cafe with one person freed or lifted to 40 h", async () => {
  const { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const slots = parseShifts(sampleShifts()).slots;
  const html = page("whose-availability-is-worth-widening.html");
  const base = sampleStaff().split("\n");
  const run = (lines) => {
    const p = parseStaff(lines.join("\n"));
    assert.deepEqual(p.errors, []);
    const r = buildRoster(p.staff, slots, { minRestHours: 10 });
    return [r.unfilled.length, r.hours, r.cost];
  };
  const any = { Ana: [3, 216, 3622], Ben: [3, 216, 3622], Cleo: [1, 232, 3870], Dev: [3, 216, 3620], Eli: [2, 224, 3736], Fay: [3, 216, 3622], Gus: [3, 216, 3622] };
  const cap = { Ana: [3, 216, 3622], Ben: [2, 224, 3750], Cleo: [3, 216, 3622], Dev: [3, 216, 3622], Eli: [3, 216, 3622], Fay: [2, 224, 3746], Gus: [3, 216, 3622] };
  for (let i = 1; i < base.length; i++) {
    const parts = base[i].split(", ");
    const name = parts[0];
    const a = base.slice(); a[i] = parts.slice(0, 4).join(", ") + ", any";
    const c = base.slice(); c[i] = [parts[0], parts[1], "40", parts[3], parts.slice(4).join(", ")].join(", ");
    assert.deepEqual(run(a), any[name], `${name} any`);
    assert.deepEqual(run(c), cap[name], `${name} cap`);
    assert.ok(html.includes("$" + any[name][2].toLocaleString("en-US")), `${name} on page`);
    assert.ok(html.includes("$" + cap[name][2].toLocaleString("en-US")), `${name} cap on page`);
  }
  assert.match(page("sitemap.xml"), /whose-availability-is-worth-widening\.html/);
  assert.match(page("index.html"), /whose-availability-is-worth-widening\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
