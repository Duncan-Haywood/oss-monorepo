import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { computeBudget, money, pct } from "./engine.mjs";

const DOCS = "what-is-modified-total-direct-costs.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy, opt-out and the not-advice warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not grant/i, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["calculate_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page makes no network call and ships no dependency", async () => {
  const idx = await read("index.html");
  assert.doesNotMatch(idx, /fetch\(|XMLHttpRequest|sendBeacon|<script[^>]+src="https?:/);
  for (const f of ["engine.mjs", "usage.mjs"]) assert.doesNotMatch(await read(f), /fetch\(|https?\.request|node:http|node:net/, f);
});

test("every input id the page script reads exists, with the engine defaults as values", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { salaries: 120000, fringe: 33600, supplies: 6000, travel: 8000, services: 12000, otherdirect: 4000, tuition: 0, participant: 0, rental: 0, patient: 0, rate: 15, eqthreshold: 10000, subcap: 50000, awardcap: 0 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
  assert.equal(computeBudget({}).total, 211140);
});

test("the guide's worked numbers match the engine", async () => {
  const r = computeBudget({ tuition: 18000, equipment: "12500, 4200", subawards: "80000\n30000", awardCap: 350000 });
  const doc = await read(DOCS);
  for (const s of [r.mtdc, r.excluded, r.direct, r.indirect, r.total, r.overChargeIfAppliedToTdc, r.fit.maxDirect, r.fit.directCut, r.fit.maxIndirect, r.fit.over].map(money).concat(pct(r.effectiveOnDirect))) assert.ok(doc.includes(s), s);
  const page = await read("index.html");
  assert.ok(page.includes('$("#tuition").value = 18000; $("#equipment").value = "12500\\n4200"; $("#subawards").value = "80000\\n30000"; $("#awardcap").value = 350000;'));
});

test("index links to the grant deadline tracker", async () => {
  assert.ok((await read("index.html")).includes('href="../grant-deadline-tracker/"'));
});
