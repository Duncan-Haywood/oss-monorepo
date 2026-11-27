// The launch switch (src/launch.mjs): the pre-launch copy, the open copy (site.test.mjs checks the
// default build), the paid-on copy, the URL guard, and the plans matching the app's own.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, fileFor } from "../build.mjs";
import { BASE_PATH, FREE_INCLUDES, FREE_PLAN, PLATFORMS, TIERS } from "../src/content.mjs";
import { launch, normaliseAppUrl, withLaunch } from "../src/launch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Builds the site under a launch state; returns a reader for its files. */
function buildAs(state) {
  const out = mkdtempSync(join(tmpdir(), "seller-books-launch-"));
  dirs.push(out);
  const { pages } = withLaunch(state, () => build(out));
  const read = (rel) => readFileSync(join(out, BASE_PATH.slice(1), rel), "utf8");
  return { pages, read, html: (path) => read(fileFor(path)) };
}

describe("pre-launch (APP_URL null)", () => {
  const site = buildAs({ appUrl: null });

  test("the early-access form on home, every platform page, pricing and the form page", () => {
    const withForm = [
      "/",
      "/pricing",
      "/early-access",
      ...PLATFORMS.map((p) => `/platforms/${p.slug}`),
    ];
    for (const path of withForm) {
      const html = site.html(path);
      assert.match(html, /action="\/seller-books\/api\/early-access\/subscribe"/, path);
      assert.match(html, new RegExp(`name="source" value="${path}"`), path);
      assert.match(html, /name="website"[^>]*tabindex="-1"/, `${path} honeypot`);
    }
  });

  test("every page says early access; none links the app", () => {
    for (const page of site.pages) {
      const html = site.html(page.path);
      assert.match(html, /early access/i, page.path);
      assert.ok(!html.includes("seller-books.marisstella.app"), page.path);
    }
    assert.match(site.read("llms.txt"), /It is in early access/);
    assert.match(site.html("/pricing"), /Proposed pricing/);
  });
});

describe("paid plans on (PAID_PLANS_ON)", () => {
  const site = buildAs({ paidOn: true });

  test("no page says paid plans are not on sale", () => {
    for (const page of site.pages)
      assert.ok(!site.html(page.path).includes("not on sale"), page.path);
    assert.ok(!site.read("llms.txt").includes("not on sale"));
  });
});

describe("launch state", () => {
  test("the default build is open on the app's custom domain, paid plans dark", () => {
    assert.deepEqual(launch(), {
      open: true,
      appUrl: "https://seller-books.marisstella.app",
      paidOn: false,
    });
  });

  test("APP_URL refuses workers.dev, plain http and a path; blank means pre-launch", () => {
    assert.throws(
      () => normaliseAppUrl("https://seller-books.someone.workers.dev"),
      /workers\.dev/,
    );
    assert.throws(() => normaliseAppUrl("http://seller-books.marisstella.app"), /https/);
    assert.throws(() => normaliseAppUrl("https://seller-books.marisstella.app/app"), /no path/);
    assert.throws(() => normaliseAppUrl("not a url"), /not a URL/);
    assert.equal(normaliseAppUrl(" "), null);
    assert.equal(
      normaliseAppUrl("https://seller-books.marisstella.app/"),
      "https://seller-books.marisstella.app",
    );
  });

  test("paid plans cannot be on without an app", () => {
    assert.equal(
      withLaunch({ appUrl: null, paidOn: true }, () => launch().paidOn),
      false,
    );
  });
});

describe("the site's plans are the app's (apps/seller-books/src/shared/plans.ts)", () => {
  const plansTs = readFileSync(join(HERE, "../../seller-books/src/shared/plans.ts"), "utf8");
  /** The object literal for one plan key, as text. */
  const planBlock = (key) => {
    const i = plansTs.indexOf(`key: "${key}"`);
    assert.ok(i > 0, key);
    return plansTs.slice(i, plansTs.indexOf("\n  },", i));
  };
  const features = (block) =>
    [...block.slice(block.indexOf("features: [")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const number = (block, field) => {
    const m = block.match(new RegExp(`${field}: ([0-9_]+|null)`));
    return m[1] === "null" ? null : Number(m[1].replace(/_/g, ""));
  };

  test("Free: platforms, orders, members and its feature lines", () => {
    const b = planBlock("free");
    assert.equal(number(b, "maxPlatforms"), FREE_PLAN.platforms);
    assert.equal(number(b, "ordersPerMonth"), FREE_PLAN.ordersPerMonth);
    assert.equal(number(b, "maxMembers"), FREE_PLAN.members);
    assert.deepEqual(features(b), FREE_INCLUDES);
  });

  test("each paid tier: price, annual price, orders and feature lines", () => {
    for (const t of TIERS) {
      const b = planBlock(t.key);
      assert.equal(number(b, "priceCents"), t.monthly * 100, t.key);
      assert.equal(number(b, "annualPriceCents"), t.annual * 100, t.key);
      assert.equal(number(b, "ordersPerMonth"), t.orders, t.key);
      assert.deepEqual(features(b), t.includes, t.key);
    }
  });
});
