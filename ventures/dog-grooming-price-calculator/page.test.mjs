import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, parseClasses, parseAppointments, audit, money } from "./engine.mjs";

const DOCS = "how-to-price-dog-grooming-by-breed-and-time.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty and FAQ data; index carries sponsor, privacy, opt-out and the not-market-rates warning", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
    assert.match(p, /not (a )?market rates?/i, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never sends them anywhere/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["compare_run", "audit_run", "example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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
  for (const f of ["engine.mjs", "cli.mjs", "usage.mjs"]) assert.doesNotMatch(await read(f), /fetch\(|https?\.request|node:http|node:net/, f);
});

test("every input id the page script reads exists, with the engine defaults as values", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { target: 60, walkaway: 75, drive: 0, noshow: 5, supplies: 6 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the page's worked example matches the fixtures", async () => {
  const page = await read("index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^(class|breed_class),/.test(l)).join("\n");
  const c = /const CLASSES_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  const h = /const HISTORY_EXAMPLE = `([\s\S]*?)`;/.exec(page);
  assert.ok(c && h, "expected CLASSES_EXAMPLE and HISTORY_EXAMPLE in index.html");
  assert.equal(body(c[1]), body(await read("fixtures/classes.csv")));
  assert.equal(body(h[1]), body(await read("fixtures/appointments.csv")));
  assert.match(page, /<textarea id="classes-input"[^>]*>class,price/);
});

test("the guide's worked numbers match the engine", async () => {
  const c = compare(parseClasses(await read("fixtures/classes.csv")), {});
  const by = (n) => c.classes.find((x) => x.name === n);
  assert.equal(money(by("Giant").plain.effective), "$42.43");
  assert.equal(money(by("Giant").plain.neededPrice), "$205.47");
  assert.equal(money(by("Giant").plain.walkAway), "$158.11");
  assert.equal(money(by("Medium doodle").plain.effective), "$44.72");
  assert.equal(money(by("Medium doodle").variants[1].effective), "$42.58");
  assert.equal(money(by("Medium double coat").plain.effective), "$45.08");
  assert.equal(money(by("Medium double coat").variants[2].effective), "$47.64");
  assert.equal(money(by("Small smooth").plain.effective), "$64.60");
  assert.equal(money(compare(parseClasses(await read("fixtures/classes.csv")), { driveMinutes: 20 }).classes.find((x) => x.name === "Giant").plain.effective), "$38.19");
  const a = audit(parseAppointments(await read("fixtures/appointments.csv")), {});
  assert.equal(money(a.revenue), "$1,265.00");
  assert.equal(a.hours.toFixed(2), "27.11");
  assert.equal(money(a.blendedHourly), "$44.01");
  assert.equal(money(a.shortfall), "$436.32");
  assert.equal(money(a.classes[0].effective), "$41.43");
  assert.equal(money(a.classes[0].raisePerDog), "$66.79");
  assert.equal(money(a.classes[0].neededAvgPrice), "$221.79");
  const doc = await read(DOCS);
  for (const s of ["$42.43", "$205.47", "$158.11", "$44.72", "$42.58", "$45.08", "$47.64", "$64.60", "$38.19", "$1,265.00", "27.11", "$44.01", "$436.32", "$41.43", "$66.79", "$221.79", "$61.80"]) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["dog-grooming-profit-calculator", "dog-grooming-day-planner", "pet-grooming-bid-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
  }
});
