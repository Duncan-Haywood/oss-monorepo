import { describe, it } from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots.ts";
import sitemap from "../src/app/sitemap.ts";
import NotFound from "../src/app/not-found.tsx";

describe("Next.js Metadata Routes & Error pages", () => {
  it("generates robots.txt metadata configuration when site URL is configured", () => {
    const prevEnv = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://atelier.marisstella.dev";
    try {
      const config = robots();
      assert.ok(config);
      const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
      assert.ok(rules, "expected robots.txt to declare at least one rule");
      assert.equal(rules.userAgent, "*");
      assert.equal(typeof config.sitemap, "string");
      assert.ok(String(config.sitemap).includes("/sitemap.xml"));
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prevEnv;
    }
  });

  it("generates fallback robots.txt disallowing crawling when site URL is unconfigured", () => {
    const prevEnv = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const config = robots();
      assert.ok(config);
      const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
      assert.ok(rules);
      assert.equal(rules.userAgent, "*");
      assert.equal(rules.disallow, "/");
      assert.equal(config.sitemap, undefined);
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prevEnv;
    }
  });

  it("generates sitemap metadata entries when site URL is configured", () => {
    const prevEnv = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://atelier.marisstella.dev";
    try {
      const entries = sitemap();
      assert.ok(Array.isArray(entries));
      assert.ok(entries.length > 0);
      assert.ok(entries[0].url.startsWith("https://atelier.marisstella.dev"));
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prevEnv;
    }
  });

  it("returns empty sitemap when site URL is unconfigured", () => {
    const prevEnv = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const entries = sitemap();
      assert.ok(Array.isArray(entries));
      assert.equal(entries.length, 0);
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prevEnv;
    }
  });

  it("renders NotFound error element", () => {
    const element = NotFound();
    assert.ok(element);
    assert.equal(element.type, "div");
  });
});
