import { describe, it } from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots.ts";
import sitemap from "../src/app/sitemap.ts";
import NotFound from "../src/app/not-found.tsx";

describe("Next.js Metadata Routes & Error pages", () => {
  it("generates robots.txt metadata configuration", () => {
    const config = robots();
    assert.ok(config);
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    assert.ok(rules);
    assert.equal(rules.userAgent, "*");
    assert.ok(typeof config.sitemap === "string" && config.sitemap.includes("/sitemap.xml"));
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
