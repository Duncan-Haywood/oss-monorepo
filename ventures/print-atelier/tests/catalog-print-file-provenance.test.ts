import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { catalogArtworks } from "../src/lib/marketplace";

/**
 * A print file URL has to point at a file that exists.
 *
 * `validateCheckoutLineItem` blocks a listing with no print file, which stops
 * the storefront charging for a print no partner can be told to make. That
 * blocker checks the *shape* of the URL — the most a pure function can — and a
 * well-formed fabrication passes it. This file checks the rest.
 *
 * It is not a hypothetical risk. Within an hour of the blocker being written,
 * the catalog seed acquired print file URLs twice, both fabricated, and the
 * second attempt is the instructive one. Measured 2026-08-05:
 *
 *   - First: `https://assets.printatelier.com/prints/<slug>.tif` on all five
 *     Live artworks. That hostname serves no certificate for itself
 *     (`SSL routines:ST_CONNECT:tlsv1 unrecognized name`), and
 *     `printatelier.com` resolves to 76.223.54.146 / 13.248.169.48 — AWS
 *     registrar parking, not anything this portfolio deploys.
 *   - Then, after a host check was added: the same paths moved to
 *     `atelier.marisstella.dev`, the venture's own declared ingress.
 *
 * The second set passes every check short of this one, *including a live
 * fetch*. `GET https://atelier.marisstella.dev/prints/midnight-coast.tif`
 * answers `200` with `content-type: image/tiff` — and a 197-byte body reading
 * `Server address: 10.42.0.122:80 … URI: /prints/midnight-coast.tif`. The
 * production deployment behind that host is an `nginxdemos/hello` echo server,
 * so it answers every path with a fabricated 200 and honours the extension in
 * the content type. A print partner handed that URL downloads 197 bytes of
 * server status and prints it, or rejects the job — after the buyer has paid.
 *
 * So reachability is not evidence here, and neither is the hostname. The one
 * thing that cannot be fabricated by editing a string is the file itself, in
 * the artifact this venture actually ships. That is what is checked below.
 */

const VENTURE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Hosts proved above to serve no print-atelier artwork, whatever they answer. */
const KNOWN_UNSERVED_HOSTS = new Set([
  "printatelier.com",
  "www.printatelier.com",
  "assets.printatelier.com",
  "cdn.printatelier.com",
]);

/**
 * Hosts whose responses are the echo server rather than this application. A URL
 * here is refused even though it is the venture's own ingress: until the real
 * image is deployed, a 200 from it means nothing.
 *
 * Remove a host from this set when `platform/k8s/apps/print-atelier` stops
 * running `nginxdemos/hello` — and expect the `public/` check below to be doing
 * the work from then on.
 */
const ECHO_SERVER_HOSTS = new Set(["atelier.marisstella.dev"]);

test("no seeded print file points at a host known to serve no artwork", () => {
  for (const artwork of catalogArtworks) {
    if (artwork.printFileUrl === undefined) {
      continue;
    }
    const host = new URL(artwork.printFileUrl).hostname.toLowerCase();

    assert.ok(
      !KNOWN_UNSERVED_HOSTS.has(host),
      `${artwork.slug}: print file is on ${host}, which serves no print-atelier asset — a POD partner cannot fetch it, and the buyer has already paid by then`,
    );
    assert.ok(
      !ECHO_SERVER_HOSTS.has(host),
      `${artwork.slug}: print file is on ${host}, which currently runs the nginxdemos/hello echo server. It answers 200 with image/tiff for any path and a 197-byte status body, so its response is not evidence that artwork exists there.`,
    );
  }
});

test("a print file served by this app must exist in the artifact that serves it", () => {
  // The check a fabricated string cannot pass: satisfying it means committing
  // the artist's actual file, which is visible in a diff in a way a URL is not.
  for (const artwork of catalogArtworks) {
    if (artwork.printFileUrl === undefined) {
      continue;
    }
    const { hostname, pathname } = new URL(artwork.printFileUrl);
    if (!ECHO_SERVER_HOSTS.has(hostname.toLowerCase())) {
      // Hosted off this application — nothing in this repository can vouch for
      // it, so it is refused by the test above rather than pretended about here.
      continue;
    }

    const served = new URL(`public${pathname}`, `file://${VENTURE_ROOT}`);
    assert.ok(
      existsSync(served),
      `${artwork.slug}: ${artwork.printFileUrl} is served by this app, but ${`public${pathname}`} is not in the repository. Next serves static files from public/; this venture has no public/ directory at all, so that URL resolves to nothing this app ships.`,
    );
  }
});

test("the seeded catalog is honest about having no print files yet", () => {
  // Recorded, not lamented. No artist print file exists anywhere in this
  // repository, so the number of listings that can be sold today is zero, and
  // the storefront says so per listing rather than discovering it after
  // checkout. This fails the moment a print file is seeded — which is exactly
  // when someone should re-read the two tests above and confirm the file is
  // real before money moves against it.
  assert.deepEqual(
    catalogArtworks.filter((artwork) => artwork.printFileUrl !== undefined).map((a) => a.slug),
    [],
    "a seeded artwork now carries a print file — confirm the file exists, then update this test in the same change",
  );
});

// --- the scope this control depends on, and did not state -------------------

/**
 * Every test above reads `catalogArtworks`. That is the whole population *only*
 * while the seed literal is the only thing that can put a print file on a
 * listing — and nothing said so, or checked it.
 *
 * The gap is not hypothetical, and it is not the fabricated-URL gap the tests
 * above close. It is the shape where a well-meaning change adds a *second*
 * source — an operator API route, a `PRINT_ATELIER_PRINT_FILES` env map, a
 * persistence store keyed on slug — because the blocker's own `operatorAction`
 * says "record its https URL on the listing" and the product offers no way to
 * do that. A URL arriving by any of those routes is shape-checked by
 * `parsePrintFileUrl` and then sent to a POD partner, while every assertion
 * above still passes: `catalogArtworks` is untouched, so the host checks, the
 * `public/` check and the empty-set check all read a population the URL was
 * never in. The control would report provenance established over nothing.
 *
 * Measured 2026-08-08 by running the money path with one master supplied: the
 * chain behind the seed is complete and does ship. `artworkUrl_0` reaches
 * `payment_intent_data.metadata`, survives to `payment_intent.succeeded`, and
 * `queuePrintfulFulfillmentFromOrder` returns `queued` with the file, quantity,
 * unit retail price, recipient and buyer email all correct. So a second source
 * is *sufficient* to move money against a print file this control never saw.
 *
 * The two contracts below therefore pin the control's own scope rather than any
 * behaviour. They are exact sets in both directions: adding a source fails, and
 * so does removing one, because either is a change to what "provenance" covers
 * here and neither should land without someone re-reading this file.
 */

const SRC_ROOT = new URL("../src/", import.meta.url);

/** Every `.ts`/`.tsx` under `src/`, relative to it, sorted. */
function sourceFiles(dir: URL = SRC_ROOT, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      found.push(...sourceFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(`${prefix}${entry.name}`);
    }
  }
  return found;
}

/**
 * Case-insensitive on purpose: it has to catch `printFileUrl` the field and
 * `parsePrintFileUrl` / `isUsablePrintFileUrl` / `resolvePrintFileUrl` the
 * three functions. A case-sensitive `printFileUrl` misses all three — and
 * misses `gelato-orders.ts` entirely, which is the adapter that sends the URL
 * to Gelato.
 */
const PRINT_FILE_MENTION = /printfileurl/i;

test("the print file surface is the reviewed set of modules, and no other", () => {
  const touching = sourceFiles().filter((file) =>
    PRINT_FILE_MENTION.test(readFileSync(new URL(file, SRC_ROOT), "utf8")),
  );

  assert.deepEqual(
    touching,
    [
      // Declares the field, and holds the seed that is this control's population.
      "lib/checkout.ts",
      // Owns `parsePrintFileUrl` — the one definition of a usable URL — and the
      // `artworkUrl` metadata key both adapters read.
      "lib/fulfillment-order-inputs.ts",
      "lib/gelato-orders.ts",
      "lib/marketplace.ts",
      "lib/printful-orders.ts",
    ].sort(),
    "a module outside the reviewed set now handles print file URLs. If it can " +
      "introduce a URL that is not on a `catalogArtworks` entry — an API route, an " +
      "env map, a persistence store — then the three tests at the top of this file " +
      "no longer see the whole population, and provenance is established over a set " +
      "the new URL is not in. Extend those tests to read the new source, then add " +
      "the module here in the same change.",
  );
});

test("nothing constructs a print file URL from a source other than the catalog", () => {
  // The file-set contract above cannot see a new source added *inside* a module
  // that already handles print files — `checkout.ts` reading `process.env`, say.
  // This one pins every assignment's right-hand side, so that edit fails too.
  const assignments: string[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(new URL(file, SRC_ROOT), "utf8");
    for (const line of source.split("\n")) {
      // `\??` so an *optional* declaration (`printFileUrl?: string;`) is caught
      // too. Without it the two `?:` declarations were invisible here, and a
      // new source declared optional would have been invisible with them.
      const match = /\bprintFileUrl\s*\??\s*:\s*(.+?),?\s*$/.exec(line);
      if (match) {
        assignments.push(`${file}: ${match[1].trim()}`);
      }
    }
  }

  assert.deepEqual(
    assignments.sort(),
    [
      // The metadata key name, not a URL.
      'lib/fulfillment-order-inputs.ts: "artworkUrl"',
      // Type declarations.
      "lib/checkout.ts: string;",
      "lib/marketplace.ts: string;",
      "lib/printful-orders.ts: string;",
      // The two catalog-derived reads: `artworkToCheckoutLine` and
      // `sanitizeCheckoutLineItems`. Both re-derive from the artwork rather than
      // carrying whatever a stored cart held.
      "lib/checkout.ts: artwork.printFileUrl",
      "lib/checkout.ts: artwork.printFileUrl",
      // The fulfillment end, through the shared validator, from order metadata
      // the checkout wrote from the catalog.
      "lib/printful-orders.ts: resolvePrintFileUrl(paymentMetadata, index).value",
    ].sort(),
    "a print file URL is now assigned from an expression this control has not " +
      "reviewed. If the new right-hand side can yield a URL that is not on a " +
      "`catalogArtworks` entry, the tests at the top of this file stop covering " +
      "every URL that reaches a POD partner. Confirm where the value comes from " +
      "and extend those tests to read it, then record the expression here.",
  );
});
