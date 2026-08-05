import { describe, it } from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots.ts";
import sitemap from "../src/app/sitemap.ts";
import NotFound from "../src/app/not-found.tsx";

describe("Next.js Metadata Routes & Error pages", () => {
  it("generates robots.txt metadata configuration", () => {
    const config = robots();
    assert.ok(config);
    // `MetadataRoute.Robots` types `rules` as one rule or an array of them and
    // `sitemap` as optional, so both need narrowing before they are read.
    // Without it `tsc --noEmit` — a declared gate for this venture — failed on
    // this file, taking the whole verify chain red with it.
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    assert.ok(rules, "expected robots.txt to declare at least one rule");
    assert.equal(rules.userAgent, "*");
    assert.equal(typeof config.sitemap, "string");
    assert.ok(String(config.sitemap).includes("/sitemap.xml"));
  });

  it("generates sitemap metadata entries", () => {
    const entries = sitemap();
    assert.ok(Array.isArray(entries));
    assert.ok(entries.length > 0);
    assert.ok(entries[0].url.startsWith("http"));
  });

  it("renders NotFound error element", () => {
    const element = NotFound();
    assert.ok(element);
    assert.equal(element.type, "div");
  });
});
