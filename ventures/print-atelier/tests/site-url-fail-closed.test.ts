import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test, { describe, afterEach, beforeEach } from "node:test";

import robots from "../src/app/robots.ts";
import sitemap from "../src/app/sitemap.ts";
import {
  GET as adCatalogGet,
  POST as adCatalogPost,
} from "../src/app/api/ad-catalog/sync/route.ts";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth.ts";
import { buildAdCatalogFeed, SITE_ORIGIN_BLOCKER } from "../src/lib/ad-catalog.ts";
import { executeAdCatalogSyncLive, type FetchLike } from "../src/lib/ad-catalog-sync-http.ts";
import { parseSiteUrl, resolveSiteUrl, SITE_URL_ENV } from "../src/lib/site-url.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";

/**
 * The venture must not publish URLs on a domain it does not own.
 *
 * `robots.ts`, `sitemap.ts` and the ad-catalog sync route each carried
 * `process.env.NEXT_PUBLIC_SITE_URL ?? "https://printatelier.com"`, and
 * `AdSyncHealthMonitor` sent that literal to the live-push route as a query
 * parameter, where it overrode anything the server resolved.
 * `printatelier.com` resolves to AWS registrar parking and is not a host this
 * portfolio serves — measured in `catalog-print-file-provenance.test.ts`, whose
 * `KNOWN_UNSERVED_HOSTS` this file reuses rather than restating the claim.
 *
 * So the contract is: with no configured origin, each surface publishes
 * nothing. Every test here is written against the real modules — no mock of
 * `site-url` — because a test that mocks the module the fix lives in stays
 * green when the fix is reverted.
 */

describe("site-url fail-closed contract", () => {
const CONFIGURED = "https://atelier.marisstella.dev";

const savedSiteUrl: { value: string | undefined } = { value: undefined };
const savedOpsToken: { value: string | undefined } = { value: undefined };
const TOKEN = "s3cr3t-operator-token";
const AUTHORIZED = { authorization: `Bearer ${TOKEN}` };

beforeEach(() => {
  savedSiteUrl.value = process.env[SITE_URL_ENV];
  savedOpsToken.value = process.env[OPS_TOKEN_ENV];
  delete process.env[SITE_URL_ENV];
  // Set so an authorization refusal cannot be mistaken for the site-origin
  // refusal: both answer 503, and only one of them is under test here.
  process.env[OPS_TOKEN_ENV] = TOKEN;
});

afterEach(() => {
  restore(SITE_URL_ENV, savedSiteUrl.value);
  restore(OPS_TOKEN_ENV, savedOpsToken.value);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://atelier.marisstella.dev${path}`, { headers });
}

// --- the resolver --------------------------------------------------------

test("parseSiteUrl accepts an absolute http(s) origin", () => {
  assert.equal(parseSiteUrl("https://atelier.marisstella.dev"), CONFIGURED);
  assert.equal(parseSiteUrl("https://atelier.marisstella.dev/"), CONFIGURED);
  assert.equal(parseSiteUrl("  https://atelier.marisstella.dev  "), CONFIGURED);
  assert.equal(parseSiteUrl("http://localhost:3000"), "http://localhost:3000");
});

const rejectedValues: [string, string | null | undefined][] = [
  ["unset", undefined],
  ["null", null],
  ["empty", ""],
  ["whitespace", "   "],
  ["not a URL at all", "not a url"],
  ["a bare hostname", "atelier.marisstella.dev"],
  ["a relative path", "/prints"],
  ["a javascript: URL", "javascript:alert(1)"],
  ["a data: URL", "data:text/html,x"],
  ["an ftp: URL", "ftp://example.com"],
  ["embedded credentials", "https://user:pass@atelier.marisstella.dev"],
  ["a path prefix that concatenation would drop", "https://atelier.marisstella.dev/store"],
  ["a query string", "https://atelier.marisstella.dev/?utm=1"],
  ["a fragment", "https://atelier.marisstella.dev/#top"],
];

for (const [label, value] of rejectedValues) {
  test(`parseSiteUrl rejects ${label}`, () => {
    assert.equal(parseSiteUrl(value), null);
  });
}

test("resolveSiteUrl returns null when NEXT_PUBLIC_SITE_URL is unset, and never a fallback domain", () => {
  assert.equal(resolveSiteUrl(), null);
});

test("resolveSiteUrl returns the configured origin", () => {
  process.env[SITE_URL_ENV] = `${CONFIGURED}/`;
  assert.equal(resolveSiteUrl(), CONFIGURED);
});

test("resolveSiteUrl refuses a configured value that is not an absolute origin", () => {
  process.env[SITE_URL_ENV] = "atelier.marisstella.dev";
  assert.equal(resolveSiteUrl(), null);
});

// --- robots.txt ----------------------------------------------------------

test("robots.txt names no host and invites no crawler when the origin is unconfigured", () => {
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;

  assert.equal(config.sitemap, undefined, "a sitemap line would advertise a host we cannot name");
  assert.ok(rules);
  assert.equal(rules.allow, undefined);
  assert.equal(rules.disallow, "/");
  assert.ok(
    !JSON.stringify(config).includes("printatelier.com"),
    "robots.txt must not fall back to a domain this venture does not serve",
  );
});

test("robots.txt points at the configured origin when there is one", () => {
  process.env[SITE_URL_ENV] = `${CONFIGURED}/`;
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;

  assert.equal(config.sitemap, `${CONFIGURED}/sitemap.xml`);
  assert.equal(rules?.allow, "/");
  assert.deepEqual(rules?.disallow, ["/admin-portal", "/ops"]);
});

// --- sitemap.xml ---------------------------------------------------------

test("sitemap.xml publishes no entries when the origin is unconfigured", () => {
  assert.deepEqual(sitemap(), []);
});

test("sitemap.xml publishes entries on the configured origin", () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  const entries = sitemap();

  assert.ok(entries.length > 0, "a configured deployment still publishes its sitemap");
  for (const entry of entries) {
    assert.ok(
      entry.url.startsWith(`${CONFIGURED}/`),
      `${entry.url} is not on the configured origin`,
    );
  }
});

// --- the ad-catalog sync route -------------------------------------------

test("an authorized sync refuses rather than pushing a feed on a guessed origin", async () => {
  for (const [name, call] of [
    ["GET", () => adCatalogGet(request("/api/ad-catalog/sync", AUTHORIZED))],
    ["POST", () => adCatalogPost(request("/api/ad-catalog/sync", AUTHORIZED))],
    [
      "GET live=true",
      () => adCatalogGet(request("/api/ad-catalog/sync?live=true", AUTHORIZED)),
    ],
  ] as [string, () => Promise<Response>][]) {
    const response = await call();
    assert.equal(response.status, 503, `${name} should refuse an unconfigured deployment`);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.error, "Site origin is not configured");
    assert.ok(
      typeof body.hint === "string" && body.hint.includes(SITE_URL_ENV),
      "the refusal must tell the operator which variable to set",
    );
    assert.ok(
      !JSON.stringify(body).includes("printatelier.com"),
      "the refusal must not suggest the domain that caused this",
    );
  }
});

test("a configured deployment syncs against its own origin", async () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  const response = await adCatalogGet(request("/api/ad-catalog/sync", AUTHORIZED));

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(!body.includes("printatelier.com"));
});

test("an explicit baseUrl is still validated, and its refusal is the caller's 400", async () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  const response = await adCatalogGet(
    request("/api/ad-catalog/sync?baseUrl=not%20a%20url", AUTHORIZED),
  );
  assert.equal(response.status, 400);
});

test("the 400 body is readable on a second request — the response is not a shared stream", async () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  for (const attempt of [1, 2]) {
    const response = await adCatalogGet(
      request("/api/ad-catalog/sync?baseUrl=javascript%3Aalert(1)", AUTHORIZED),
    );
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /absolute http\(s\) URL/, `attempt ${attempt}`);
  }
});

// --- the feed itself -----------------------------------------------------

test("an unconfigured deployment produces no eligible feed row and no fabricated link", () => {
  const feed = buildAdCatalogFeed();

  assert.ok(feed.items.length > 0, "the feed still has rows — they are blocked, not absent");
  assert.equal(feed.eligibleCount, 0);
  for (const item of feed.items) {
    assert.equal(item.link, "", `${item.id} invented a product link`);
    assert.equal(item.imageLink, "", `${item.id} invented an image link`);
    assert.equal(item.eligible, false);
    assert.ok(
      item.blockers.includes(SITE_ORIGIN_BLOCKER),
      `${item.id} must say why it is blocked`,
    );
    assert.equal(item.availability, "out of stock");
  }
});

test("a configured deployment builds feed rows on its own origin", () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  const feed = buildAdCatalogFeed();

  assert.ok(feed.eligibleCount > 0, "a configured deployment can still sell");
  for (const item of feed.items) {
    assert.ok(item.link.startsWith(`${CONFIGURED}/`), `${item.id}: ${item.link}`);
    assert.ok(item.imageLink.startsWith(`${CONFIGURED}/`), `${item.id}: ${item.imageLink}`);
    assert.ok(!item.blockers.includes(SITE_ORIGIN_BLOCKER));
  }
});

/**
 * The pair below is a controlled comparison, and the control matters more than
 * the assertion: a live push also stops for missing credentials, missing
 * consent or too few ready creatives, so "no HTTP request happened" on its own
 * proves nothing. Both runs therefore pass the *same* credentials and the same
 * full consent, and differ in one variable — whether the deployment knows its
 * own origin.
 */
const META_CREDENTIALS = {
  META_CATALOG_ID: "cat_123",
  META_ACCESS_TOKEN: "token_abc",
  META_PIXEL_ID: "px_1",
};

const fullConsent = () =>
  catalogArtworks.map((artwork) => ({
    artworkSlug: artwork.slug,
    podLicenseAccepted: true,
    paidAdRightsAccepted: true,
    aiRoomSceneAccepted: true,
    payoutAcknowledged: true,
  }));

function recordingFetch(calls: string[]): FetchLike {
  return async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => '{"success":true}' };
  };
}

test("an unconfigured live sync makes no outbound request to any ad platform", async () => {
  const calls: string[] = [];

  const result = await executeAdCatalogSyncLive(
    ["meta"],
    META_CREDENTIALS,
    { consentRecords: fullConsent() },
    recordingFetch(calls),
  );

  assert.deepEqual(
    calls,
    [],
    "credentials and consent were both in place — only the missing origin stopped it",
  );
  assert.equal(result.platforms.find((entry) => entry.platform === "meta")?.status, "blocked");
});

test("a configured live sync does reach the platform — the guard above is not just a broken sync", async () => {
  process.env[SITE_URL_ENV] = CONFIGURED;
  const calls: string[] = [];

  await executeAdCatalogSyncLive(
    ["meta"],
    META_CREDENTIALS,
    { consentRecords: fullConsent() },
    recordingFetch(calls),
  );

  assert.equal(calls.length, 1, "same inputs as above but with an origin — this one must push");
});

// --- the literal itself --------------------------------------------------

/**
 * The previous fix in this class covered only the fields it named, so this
 * checks the surface rather than the three lines that were reported.
 *
 * The exemptions below are per file and carry a claim that is re-checked, not a
 * blanket allowance for a directory: each named module must be imported by
 * nothing else under `src/`. The moment a route or component imports one, the
 * exemption fails and the literal has to go.
 */
const SRC = fileURLToPath(new URL("../src", import.meta.url));

const LITERAL_EXEMPT = new Map<string, string>([
  [
    "lib/art-fair-checkout.ts",
    "default parameter of generateBoothQRCheckout; imported by no route or component",
  ],
  [
    "lib/provenance-royalty-dashboard.ts",
    "default parameter of verifyArtworkProvenance; imported by no route or component",
  ],
  [
    "lib/gallery-qr-attribution.ts",
    "hardcoded access-pass URL; imported by no route or component",
  ],
  [
    "lib/gallery-guestbook-presale.ts",
    "hardcoded SMS invite URL; imported by no route or component",
  ],
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Comments here name the domain on purpose — recording why the fallback was
 * removed is the point of them. So the scan has to read code, not prose.
 *
 * It does that by collecting string and template contents rather than by
 * deleting comments, because the obvious comment strip is worse than none:
 * `//.*` also eats the tail of `"https://printatelier.com"`, leaving `"https:`,
 * and the check would then be structurally unable to see the exact literal it
 * exists to find. `stringLiterals` is checked against both cases below before
 * it is trusted with the source tree.
 */
function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      i = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== char) {
        if (source[j] === "\\") {
          value += source[j + 1] ?? "";
          j += 2;
          continue;
        }
        value += source[j];
        j += 1;
      }
      literals.push(value);
      i = j + 1;
      continue;
    }

    i += 1;
  }

  return literals;
}

test("the literal scanner reads code and not comments", () => {
  assert.deepEqual(stringLiterals('const a = "https://printatelier.com";'), [
    "https://printatelier.com",
  ]);
  assert.deepEqual(stringLiterals("const a = `${base}//printatelier.com`;"), ["${base}//printatelier.com"]);
  assert.deepEqual(stringLiterals("// see https://printatelier.com for why\n"), []);
  assert.deepEqual(stringLiterals("/* https://printatelier.com */"), []);
});

test("no publishing surface under src/ carries a printatelier.com literal", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const relative = path.relative(SRC, file).split(path.sep).join("/");
    const inCode = stringLiterals(readFileSync(file, "utf8")).some((literal) =>
      literal.includes("printatelier.com"),
    );
    if (!inCode) {
      continue;
    }
    if (LITERAL_EXEMPT.has(relative)) {
      continue;
    }
    offenders.push(relative);
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "these files name a domain this venture does not serve — resolve the origin through src/lib/site-url.ts instead",
  );
});

test("each exempted module is still unreachable from any route or component", () => {
  const files = sourceFiles(SRC);

  for (const [relative, reason] of LITERAL_EXEMPT) {
    const moduleName = path.basename(relative, ".ts");
    const importers = files.filter((file) => {
      const self = path.relative(SRC, file).split(path.sep).join("/");
      if (self === relative) {
        return false;
      }
      const text = readFileSync(file, "utf8");
      return (
        text.includes(`"@/lib/${moduleName}"`) ||
        text.includes(`'@/lib/${moduleName}'`) ||
        text.includes(`"./${moduleName}"`) ||
        text.includes(`'./${moduleName}'`)
      );
    });

    assert.deepEqual(
      importers.map((file) => path.relative(SRC, file)),
      [],
      `${relative} is exempt because "${reason}" — that is no longer true, so fix its literal`,
    );
  }
});
});

