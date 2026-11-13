// The posted-schedule guide page's "keep the posted shifts" table (2026-11-12), re-derived from eval/reissue-posted.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const proven = (s) => assert.ok(["optimal", "improved"].includes(s), `not proven: ${s}`);

test("posted-schedule page's keep-the-posted-shifts table is what eval/reissue-posted.mjs returns for the sample cafe", async () => {
  const { study } = await import("./eval/reissue-posted.mjs");
  const { sampleStaff } = await import("./calc.mjs");
  const html = page("schedule-change-after-posting.html");
  const r = study(sampleStaff(), { variants: { rebuild: {}, kept: { keepShift: 1 } } });
  const wed = r.cases.filter((c) => c.day === "Wed");
  assert.deepEqual(wed.map((c) => c.person), ["Ana", "Dev", "Fay", "Gus"]);
  for (const c of wed) {
    const a = c.out.rebuild, b = c.out.kept;
    proven(a.status); proven(b.status);
    assert.equal(a.open, b.open);
    // Same payroll in both columns: $3,690, or $3,546 for Ana, whose Wednesday shift nobody can take once Monday and Tuesday
    // are held (both leave it open, 23 h, on the posted week fresh builds give since they run column generation first, 2026-11-13).
    assert.equal(a.pay, b.pay); assert.equal(a.pay, c.person === "Ana" ? 3546 : 3690);
    assert.ok(b.owed < a.owed, `${c.person}: kept ${b.owed} vs free ${a.owed}`);
    assert.ok(html.includes(`<tr><td>${c.person}</td><td class="n">${a.changes}</td><td class="n">$${a.owed}</td><td class="n">${b.changes}</td><td class="n">$${b.owed}</td><td class="n">${a.open}</td></tr>`), c.person);
  }
  assert.ok(page("index.html").includes('id="keep-posted"'));
});
