import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
