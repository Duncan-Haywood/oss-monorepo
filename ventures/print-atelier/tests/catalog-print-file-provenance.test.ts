import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { catalogArtworks } from "../src/lib/marketplace";

/**
 * A print file URL has to point at a file this venture actually serves.
 *
 * `validateCheckoutLineItem` blocks a listing with no print file, which stops
 * the storefront charging for a print no partner can be told to make. That
 * blocker checks the *shape* of the URL — the most a pure function can check —
 * and a well-formed fabrication passes it.
 *
 * That is not hypothetical. Within minutes of the blocker landing, five seeded
 * artworks acquired `https://assets.printatelier.com/prints/<slug>.tif`:
 * plausible, uniform, and pointing at nothing. Measured 2026-08-05 —
 *
 *   - `assets.printatelier.com` terminates TLS with
 *     `SSL routines:ST_CONNECT:tlsv1 unrecognized name`; it serves no
 *     certificate for that name, so a POD partner's fetch fails outright.
 *   - `printatelier.com` resolves to 76.223.54.146 / 13.248.169.48, AWS
 *     registrar parking, and is not a domain this portfolio deploys to.
 *   - print-atelier's only declared ingress is `atelier.marisstella.dev`
 *     (`platform/k8s/apps/print-atelier/ingress.yaml`), which serves the
 *     storefront and stores no artist files.
 *
 * A fabricated URL is worse than an absent one: absent is refused, fabricated
 * is accepted and sent to a print partner after the buyer has paid. So the
 * catalog seed is checked here rather than trusted, and the check is against a
 * host the repository can be shown to serve.
 */

const KNOWN_UNSERVED_HOSTS = new Set([
  "printatelier.com",
  "assets.printatelier.com",
  "www.printatelier.com",
  "cdn.printatelier.com",
]);

/**
 * Hosts print-atelier is deployed at, read from the manifest rather than
 * restated here — a copy would drift, and a drifted copy is how a control ends
 * up vouching for a surface nobody deploys.
 */
function declaredIngressHosts(): string[] {
  const manifest = fileURLToPath(
    new URL("../../../platform/k8s/apps/print-atelier/ingress.yaml", import.meta.url),
  );
  const yaml = readFileSync(manifest, "utf8");
  return [...yaml.matchAll(/^\s*-?\s*host:\s*(\S+)\s*$/gm)].map((match) => match[1]!);
}

test("no seeded artwork claims a print file on a host this venture does not serve", () => {
  const served = new Set(declaredIngressHosts().map((host) => host.toLowerCase()));
  assert.ok(served.size > 0, "expected print-atelier's ingress to declare at least one host");

  for (const artwork of catalogArtworks) {
    const url = artwork.printFileUrl;
    if (url === undefined) {
      continue;
    }

    const host = new URL(url).hostname.toLowerCase();
    assert.ok(
      !KNOWN_UNSERVED_HOSTS.has(host),
      `${artwork.slug}: print file is on ${host}, which serves no print-atelier asset — a POD partner cannot fetch it, and the buyer has already paid by then`,
    );
    assert.ok(
      served.has(host),
      `${artwork.slug}: print file is on ${host}, which is not among the hosts print-atelier deploys (${[...served].join(", ")}). Add the host to the venture's ingress before selling a listing that points at it.`,
    );
  }
});

test("the seeded catalog print files match live artworks", () => {
  const withFiles = catalogArtworks.filter((artwork) => artwork.printFileUrl !== undefined);

  assert.deepEqual(
    withFiles.map((artwork) => artwork.slug),
    ["midnight-coast", "urban-geometry", "spring-bloom", "desert-sun", "city-at-dusk"],
    "a seeded artwork now carries a print file — confirm the file exists and the host is served",
  );
});
