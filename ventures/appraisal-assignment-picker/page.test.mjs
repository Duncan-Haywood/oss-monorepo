import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseJobs, plan, summarize, money } from "./engine.mjs";

const DOCS = "how-to-choose-which-appraisal-assignments-to-accept.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /USPAP/);
  assert.match(idx, /independen/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example is the fixture and demonstrates a real gain", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/assignments.csv")).trim());
  const inputs = { hpd: 6, booked: 0, bookeddue: 1 };
  for (const [id, v] of Object.entries(inputs)) assert.match(page, new RegExp(`id="${id}" value="${v}"`));
  const p = plan(parseJobs(m[1]), { hoursPerDay: 6, booked: 0, bookedDue: 1 });
  assert.ok(p.upliftVsBest > 50);
  assert.ok(p.declined.length >= 1);
  assert.equal(summarize(p).status, "gain");
});

test("the guide's worked queue matches the engine", async () => {
  const p = plan(parseJobs(await read("fixtures/assignments.csv")), { hoursPerDay: 6 });
  assert.equal(p.accepted, 5);
  assert.equal(money(p.net), "$3,555.00");
  assert.equal(p.hours, 41);
  assert.equal(money(p.netPerHour), "$86.71");
  assert.deepEqual(p.baselines.map((b) => [money(b.net), b.jobs]), [["$2,990.00", 4], ["$3,360.00", 3], ["$3,278.00", 7]]);
  assert.equal(money(p.upliftVsBest), "$195.00");
  const fee = (name) => money(p.declined.find((d) => d.name.startsWith(name)).minFee);
  assert.equal(fee("Refi - 1204"), "$485.00");
  assert.equal(fee("Estate"), "$810.00");
  assert.equal(fee("Rural"), "$1,470.00");
  assert.equal(fee("Drive-by"), "$347.00");
  assert.equal(fee("HELOC"), "$425.00");
  const doc = await read(DOCS);
  for (const s of ["$2,990", "$3,360", "$3,278", "$3,555", "$86.71", "$195", "$485", "$810", "$1,470", "$347", "$425", "41 hours"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["home-inspection-fee-calculator", "freelance-project-picker", "land-survey-bid-calculator", "booking-request-chooser"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
