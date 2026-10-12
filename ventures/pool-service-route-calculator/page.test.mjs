import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { analyze, parseAccounts, money, DEFAULT_ACCOUNTS_CSV } from "./engine.mjs";

const DOCS = "which-pool-service-accounts-are-not-worth-keeping.html";
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
    assert.match(p, /Best-effort hosting, no SLA/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never sends it anywhere/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /Not affiliated with/);
  for (const e of ["audit_run", "example_loaded", "csv_downloaded"]) assert.ok(idx.includes(`record("${e}")`), e);
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

test("every literal id the page script reads exists, and the inputs carry the engine defaults", async () => {
  const idx = await read("index.html");
  for (const id of new Set([...idx.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]))) assert.match(idx, new RegExp(`id="${id}"`), id);
  const defaults = { visits: 4.33, truck: 14, helper: 0, callbackmin: 45, callbackcost: 15, target: 40, maxincrease: 15, newleg: 15, newprice: 140, newvisit: 25, newchem: 30, newcallbacks: 1 };
  for (const [id, v] of Object.entries(defaults)) assert.match(idx, new RegExp(`id="${id}" value="${v}"`), id);
});

test("the page's example accounts are the engine's default and the fixture", async () => {
  const page = await read("index.html");
  const body = (s) => s.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/^name,/.test(l)).join("\n");
  const textarea = /<textarea id="accounts-input"[^>]*>([\s\S]*?)<\/textarea>/.exec(page);
  assert.ok(textarea, "expected the accounts textarea");
  assert.equal(body(textarea[1]), body(await read("fixtures/accounts.csv")));
  assert.equal(body(DEFAULT_ACCOUNTS_CSV), body(await read("fixtures/accounts.csv")));
  const reset = /\$\("#accounts-input"\)\.value = `([\s\S]*?)`;/.exec(page);
  assert.equal(body(reset[1]), body(await read("fixtures/accounts.csv")));
});

test("the guide's worked numbers match the engine", async () => {
  const a = analyze(parseAccounts(await read("fixtures/accounts.csv")).accounts, {});
  const by = (n) => a.rows.find((r) => r.name === n);
  const doc = await read(DOCS);
  const facts = [
    money(a.route.revenue), money(a.route.blended), a.route.hours.toFixed(1),
    money(by("Foster (Far Rd)").effective), money(by("Foster (Far Rd)").needed),
    money(by("Hart (Hillcrest)").effective), money(by("Hart (Hillcrest)").needed),
    money(by("Dunn (Hillcrest)").effective), money(by("Dunn (Hillcrest)").needed),
    money(by("Chen (Cedar Ct)").effective), money(by("Chen (Cedar Ct)").needed),
    money(by("Ellis (Lakeshore)").effective), money(by("Ellis (Lakeshore)").needed),
    money(by("Brooks (Oak Lane)").effective), money(a.newStop.effective), money(a.newStop.needed),
    ...a.density.flatMap((d) => [money(d.effective), money(d.needed)]), money(a.density[0].routeAfter),
  ];
  for (const s of facts) assert.ok(doc.includes(s), s);
});

test("index links to sibling tools", async () => {
  const idx = await read("index.html");
  for (const s of ["pool-opening-closing-price-calculator", "pool-route-pricing", "route-account-pruner", "pool-plaster-bid-calculator", "lawn-care-bid-calculator"]) {
    assert.ok(idx.includes(`href="../${s}/"`), s);
    assert.ok((await readFile(new URL(`../${s}/VENTURE.yaml`, import.meta.url), "utf8")).length > 0, s);
  }
});
