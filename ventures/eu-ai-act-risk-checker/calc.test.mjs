import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, dutiesCsv, PROHIBITED, ANNEX_III, TRANSPARENCY, ROLES } from "./calc.mjs";

const run = (o) => compute({ role: "provider", eu: "market", ...o });

test("rejects missing role and region instead of guessing", () => {
  assert.deepEqual(compute({}).errors, ["Choose your role.", "Say whether the system is on the EU market or its output is used in the EU."]);
  assert.match(run({ annex3: ["nope"] }).errors[0], /not an option/);
  assert.match(run({ gpai: "huge" }).errors[0], /general-purpose/);
});

test("no EU connection is outside the Regulation (Art 2(1))", () => {
  const r = run({ eu: "none", prohibited: ["socialscore"] });
  assert.equal(r.tier, "out");
  assert.equal(r.via, "Art 2(1)");
  assert.equal(r.duties.length, 0);
});

test("exclusions take the system out and name their Article", () => {
  for (const [id, art] of [["military", "Art 2(3)"], ["research", "Art 2(6)"], ["prerelease", "Art 2(8)"], ["personal", "Art 2(10)"]]) {
    const r = run({ exclusions: [id], annex3: ["emprecruit"] });
    assert.equal(r.tier, "out");
    assert.equal(r.via, art);
  }
});

test("a prohibited practice wins over everything and carries no duties list of a compliant route", () => {
  const r = run({ prohibited: ["emotionwork"], annex3: ["emprecruit"], transparency: ["chatbot"] });
  assert.equal(r.tier, "prohibited");
  assert.ok(r.findings.some((f) => /EUR 35 million or 7%/.test(f.title)));
  assert.ok(!r.duties.some((d) => /transparency/.test(d.who)));
  assert.equal(r.dates[0].date, "2025-02-02");
});

test("Annex III provider is high-risk with the provider duties and the Aug 2026 date", () => {
  const r = run({ annex3: ["emprecruit"] });
  assert.equal(r.tier, "high");
  assert.ok(r.duties.some((d) => d.article === "Art 9" && d.who === "Provider of a high-risk system"));
  assert.ok(r.duties.some((d) => d.article === "Art 49"));
  assert.ok(r.dates.some((d) => d.date === "2026-08-02"));
  assert.ok(!r.dates.some((d) => d.date === "2027-08-02" && /Annex I/.test(d.what)));
});

test("deployer gets Art 26 and Art 27 duties, not the provider list", () => {
  const r = run({ role: "deployer", annex3: ["svccredit"] });
  assert.equal(r.tier, "high");
  assert.ok(r.duties.some((d) => d.article === "Art 27"));
  assert.ok(!r.duties.some((d) => d.article === "Art 17"));
});

test("importer and distributor get their own single duty and the Art 25 warning", () => {
  const i = run({ role: "importer", annex3: ["edulevel"] });
  assert.ok(i.duties.some((d) => d.article === "Art 23"));
  const d = run({ role: "distributor", annex3: ["edulevel"] });
  assert.ok(d.duties.some((x) => x.article === "Art 24"));
  assert.ok(d.findings.some((f) => /Art 25/.test(f.title)));
  assert.ok(!run({ role: "provider", annex3: ["edulevel"] }).findings.some((f) => /Art 25/.test(f.title)));
});

test("the Art 6(3) exception removes high-risk unless the system profiles people", () => {
  const ex = run({ annex3: ["empmanage"], narrow: "1" });
  assert.equal(ex.tier, "minimal");
  assert.ok(ex.findings.some((f) => /Art 6\(4\)/.test(f.title)));
  const prof = run({ annex3: ["empmanage"], narrow: "1", profiling: "1" });
  assert.equal(prof.tier, "high");
  assert.equal(prof.profilingOverride, true);
});

test("the exception does not rescue an Annex I product", () => {
  assert.equal(run({ annex1: "1", narrow: "1" }).tier, "high");
  const r = run({ annex1: "1" });
  assert.ok(r.dates.some((d) => d.date === "2027-08-02" && /Annex I/.test(d.what)));
});

test("transparency alone is the limited tier and splits duties by role", () => {
  const p = run({ transparency: ["chatbot", "generative", "deepfake"] });
  assert.equal(p.tier, "limited");
  assert.deepEqual(p.duties.filter((d) => /transparency/.test(d.who)).map((d) => d.article), ["Art 50(1)", "Art 50(2)"]);
  const d = run({ role: "deployer", transparency: ["chatbot", "generative", "deepfake"] });
  assert.deepEqual(d.duties.filter((x) => /transparency/.test(x.who)).map((x) => x.article), ["Art 50(4)"]);
  const both = run({ role: "both", transparency: ["chatbot", "deepfake"] });
  assert.equal(both.duties.filter((x) => /transparency/.test(x.who)).length, 2);
});

test("nothing ticked is minimal with only the AI literacy duty", () => {
  const r = run({});
  assert.equal(r.tier, "minimal");
  assert.deepEqual(r.duties.map((d) => d.article), ["Art 4"]);
  assert.ok(r.findings.some((f) => /Art 95/.test(f.title)));
});

test("general-purpose model: documentation, copyright, systemic-risk extras and legacy date", () => {
  const m = run({ gpai: "model" });
  assert.ok(m.duties.some((d) => d.article === "Art 53(1)(a)-(b)"));
  assert.ok(!m.duties.some((d) => d.article === "Art 55"));
  assert.ok(m.dates.some((d) => d.date === "2025-08-02"));
  assert.ok(m.dates.some((d) => d.date === "2027-08-02"));
  const s = run({ gpai: "systemic" });
  assert.ok(s.duties.some((d) => d.article === "Art 55") && s.duties.some((d) => d.article === "Art 52(1)"));
});

test("open-source general-purpose models lose only the documentation duties, and lose the exemption at systemic risk", () => {
  const o = run({ gpai: "model", openSource: "1" });
  assert.ok(!o.duties.some((d) => d.article === "Art 53(1)(a)-(b)"));
  assert.ok(o.duties.some((d) => d.article === "Art 53(1)(c)-(d)"));
  const s = run({ gpai: "systemic", openSource: "1" });
  assert.ok(s.duties.some((d) => d.article === "Art 53(1)(a)-(b)"));
});

test("a deployer does not inherit the model provider's duties", () => {
  const r = run({ role: "deployer", gpai: "model" });
  assert.ok(!r.duties.some((d) => /^Art 5[3-5]/.test(d.article)));
  assert.ok(r.findings.some((f) => /rely on the provider/.test(f.title)));
});

test("dates are unique and sorted", () => {
  const r = run({ annex3: ["emprecruit"], annex1: "1", gpai: "model", transparency: ["chatbot"] });
  const d = r.dates.map((x) => x.date);
  assert.deepEqual(d, [...d].sort());
  assert.equal(new Set(r.dates.map((x) => x.what)).size, r.dates.length);
});

test("every option carries an Article and ids are unique", () => {
  for (const list of [PROHIBITED, ANNEX_III, TRANSPARENCY]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
    for (const x of list) assert.match(x.article, /Art|Annex/);
  }
  assert.equal(PROHIBITED.length, 8);
  assert.equal(new Set(ANNEX_III.map((x) => x.article.replace(/\(.\)$/, ""))).size, 8); // Annex III points 1-8 all covered
  assert.equal(ROLES.length, 5);
});

test("string and array inputs parse the same", () => {
  assert.deepEqual(parse({ role: "provider", eu: "market", annex3: "emprecruit,edulevel" }).annex3.map((x) => x.id), ["edulevel", "emprecruit"]); // list order, not input order
});

test("sample, summary and CSV", () => {
  const r = compute(SAMPLE);
  assert.equal(r.tier, "high");
  assert.match(summaryText(r), /High-risk \[Annex III 4\(a\), Art 50\(2\)\]/);
  const csv = dutiesCsv(r).split("\n");
  assert.equal(csv[0], "role,article,duty");
  assert.ok(csv.length > 10);
});
