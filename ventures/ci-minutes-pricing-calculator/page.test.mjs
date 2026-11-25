import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { compare, project } from "./engine.mjs";

const DOCS = "how-to-choose-a-ci-provider-by-build-minutes.html";
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
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example runs through the engine (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE = \{ volume: (\d+), growth: (\d+) \};/.exec(page);
  assert.ok(m, "expected EXAMPLE in index.html");
  const rows = compare(Number(m[1]));
  assert.ok(rows.length >= 5);
  assert.ok(rows.at(-1).monthly > rows[0].monthly);
  assert.ok(project(Number(m[1]), Number(m[2])).endVolume > Number(m[1]));
});

test("index links one hop to the sibling estimators", async () => {
  const idx = await read("index.html");
  for (const slug of ["supabase-bill-estimator", "vercel-bill-estimator", "neon-bill-estimator", "auth-mau-pricing-calculator", "sms-segment-cost-calculator", "error-tracking-pricing-calculator", "actions-minutes-estimator"]) assert.match(idx, new RegExp(`href="\\.\\./${slug}/"`));
});

test("the how-to page's 10,000-minute spread matches the engine's rate card", async () => {
  const { readFileSync } = await import("node:fs");
  const { compare } = await import("./engine.mjs");
  const html = readFileSync(new URL("./how-to-choose-a-ci-provider-by-build-minutes.html", import.meta.url), "utf8");
  const rows = compare(10000);
  const lo = rows[0].monthly, hi = rows.at(-1).monthly;
  const m = html.match(/differ by more than (\w+) times \(\$(\d+) against \$(\d+)\)/g);
  assert.equal(m.length, 2, "FAQ schema and body both state the spread");
  for (const s of m) {
    const [, word, a, b] = s.match(/more than (\w+) times \(\$(\d+) against \$(\d+)\)/);
    const n = { two: 2, three: 3, four: 4, five: 5 }[word];
    assert.equal(Number(a), lo);
    assert.equal(Number(b), hi);
    assert.ok(hi / lo > n && hi / lo < n + 1, `${hi}/${lo} is not "more than ${word}"`);
  }
});
