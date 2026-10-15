import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("robots.txt"), /sitemap\.xml/);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("every form control the script reads exists on the page", () => {
  const html = page("index.html");
  for (const id of ["views", "niche", "format", "usage", "exclusivity", "calculate", "load-example", "copy-link", "clear", "optout"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("every select option is a value the calculator knows", async () => {
  const html = page("index.html");
  const { NICHES, FORMATS, USAGE_RIGHTS, EXCLUSIVITY } = await import("./calculator.mjs");
  const lists = { niche: NICHES, format: FORMATS, usage: USAGE_RIGHTS, exclusivity: EXCLUSIVITY };
  for (const [id, allowed] of Object.entries(lists)) {
    const block = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`))[1];
    const values = [...block.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(values.sort(), [...allowed].sort(), `${id} options drifted from calculator.mjs`);
  }
});

test("index links one hop to the sibling creator tools", () => {
  const html = page("index.html");
  for (const slug of ["podcast-sponsorship-rate-calculator", "youtube-revenue-rpm-analyzer", "brand-deal-rate-calculator", "newsletter-sponsorship-rate-calculator"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`), `index must link ../${slug}/`);
  }
});
