import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_BYTES,
  article14Draft,
  canonicalEcosystem,
  describeAdvisories,
  describeSbom,
  match,
  normalizeAdvisories,
  normalizeSbom,
  parseInput,
  parsePurl,
  report,
  unmatchableAdvisories,
} from "./match.mjs";

const CYCLONEDX = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  components: [
    { type: "library", name: "demo-parser", version: "1.2.3", purl: "pkg:npm/demo-parser@1.2.3" },
    { type: "library", name: "safe-lib", version: "4.0.0", purl: "pkg:npm/safe-lib@4.0.0" },
  ],
};

const SPDX = {
  spdxVersion: "SPDX-2.3",
  packages: [
    {
      name: "demo-parser",
      versionInfo: "1.2.3",
      externalRefs: [{ referenceType: "purl", referenceLocator: "pkg:npm/demo-parser@1.2.3" }],
    },
  ],
};

const OSV = {
  vulns: [
    {
      id: "GHSA-demo-1234",
      summary: "Example parser issue requiring review",
      affected: [{ package: { ecosystem: "npm", name: "demo-parser" }, versions: ["1.2.3", "1.2.4"] }],
      references: [{ type: "ADVISORY", url: "https://osv.dev/GHSA-demo-1234" }],
    },
  ],
};

test("a plain purl splits into coordinates", () => {
  assert.deepEqual(parsePurl("pkg:npm/demo-parser@1.2.3"), {
    ecosystem: "npm",
    name: "demo-parser",
    version: "1.2.3",
  });
});

test("an npm scope is rejoined with a slash", () => {
  assert.equal(parsePurl("pkg:npm/%40acme/widget@2.0.0").name, "@acme/widget");
});

test("maven coordinates rejoin with a colon, the way OSV writes them", () => {
  assert.equal(parsePurl("pkg:maven/org.apache.commons/commons-lang3@3.12.0").name, "org.apache.commons:commons-lang3");
});

test("a Go module path keeps its slashes", () => {
  const parsed = parsePurl("pkg:golang/github.com/owner/repo@v1.2.3");
  assert.equal(parsed.name, "github.com/owner/repo");
  assert.equal(parsed.version, "v1.2.3");
});

test("qualifiers and subpath are not part of identity", () => {
  assert.deepEqual(parsePurl("pkg:npm/demo-parser@1.2.3?arch=x86_64#sub/dir"), {
    ecosystem: "npm",
    name: "demo-parser",
    version: "1.2.3",
  });
});

test("a malformed purl is skipped, not thrown", () => {
  assert.equal(parsePurl("not-a-purl"), null);
  assert.equal(parsePurl(undefined), null);
});

test("OSV and purl spellings of one registry fold together", () => {
  // Without this the whole cross-format story fails silently: a CycloneDX
  // SBOM says "golang" where an OSV advisory says "Go".
  assert.equal(canonicalEcosystem("Go"), canonicalEcosystem("golang"));
  assert.equal(canonicalEcosystem("crates.io"), canonicalEcosystem("cargo"));
  assert.equal(canonicalEcosystem("RubyGems"), canonicalEcosystem("gem"));
  assert.equal(canonicalEcosystem("PyPI"), canonicalEcosystem("pypi"));
});

test("an OSV distribution qualifier is dropped", () => {
  assert.equal(canonicalEcosystem("Alpine:v3.19"), "alpine");
});

test("the native component list still reads unchanged", () => {
  const native = { components: [{ ecosystem: "npm", name: "demo-parser", version: "1.2.3" }] };
  assert.deepEqual(normalizeSbom(native), [{ ecosystem: "npm", name: "demo-parser", version: "1.2.3" }]);
});

test("CycloneDX and SPDX produce the same coordinate", () => {
  assert.deepEqual(normalizeSbom(CYCLONEDX)[0], normalizeSbom(SPDX)[0]);
});

test("nested CycloneDX sub-components are walked", () => {
  const nested = {
    components: [
      {
        name: "outer",
        version: "1.0.0",
        purl: "pkg:npm/outer@1.0.0",
        components: [{ name: "inner", version: "2.0.0", purl: "pkg:npm/inner@2.0.0" }],
      },
    ],
  };
  assert.deepEqual(normalizeSbom(nested).map((c) => c.name), ["outer", "inner"]);
});

test("a component missing half its coordinate is dropped", () => {
  assert.deepEqual(normalizeSbom({ components: [{ name: "x" }, { version: "1" }] }), []);
});

test("an OSV export yields one entry per enumerated version", () => {
  const advisories = normalizeAdvisories(OSV);
  assert.deepEqual(advisories.map((a) => a.version), ["1.2.3", "1.2.4"]);
  assert.equal(advisories[0].source, "https://osv.dev/GHSA-demo-1234");
});

test("OSV ranges are never resolved into versions", () => {
  const ranged = {
    vulns: [
      {
        id: "GHSA-range-only",
        affected: [
          {
            package: { ecosystem: "npm", name: "demo-parser" },
            ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "9.9.9" }] }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(normalizeAdvisories(ranged), []);
  assert.equal(unmatchableAdvisories(ranged)[0].advisory, "GHSA-range-only");
});

test("an advisory carrying both exact versions and ranges is not reported as skipped", () => {
  const both = {
    vulns: [
      {
        id: "GHSA-both",
        affected: [
          {
            package: { ecosystem: "npm", name: "demo-parser" },
            versions: ["1.2.3"],
            ranges: [{ type: "SEMVER", events: [{ introduced: "0" }] }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(unmatchableAdvisories(both), []);
});

test("a CycloneDX SBOM matches an OSV export", () => {
  // The pair a real vendor actually has on disk.
  const result = report(CYCLONEDX, OSV, "Demo service", "2026.09", new Date("2026-09-03T11:00:00Z"));
  assert.equal(result.component_count, 2);
  assert.equal(result.matched_findings.length, 1);
  assert.equal(result.matched_findings[0].component, "demo-parser@1.2.3");
  assert.equal(result.matched_findings[0].advisory, "GHSA-demo-1234");
  assert.equal(result.generated, "2026-09-03");
});

test("cross-format ecosystem spellings still meet", () => {
  const sbom = { components: [{ name: "x", version: "1.0.0", purl: "pkg:golang/example.com/x@1.0.0" }] };
  const osv = { vulns: [{ id: "GO-1", affected: [{ package: { ecosystem: "Go", name: "example.com/x" }, versions: ["1.0.0"] }] }] };
  assert.equal(match(sbom, osv).length, 1);
});

test("a version mismatch is never inferred into a match", () => {
  const sbom = { components: [{ name: "x", version: "2" }] };
  const advisories = [{ name: "x", version: "1", id: "A" }];
  assert.deepEqual(match(sbom, advisories), []);
});

test("the draft says what was not evaluated", () => {
  const ranged = {
    vulns: [{ id: "GHSA-range-only", affected: [{ package: { ecosystem: "npm", name: "demo-parser" }, ranges: [{ type: "SEMVER" }] }] }],
  };
  const draft = article14Draft(report(CYCLONEDX, ranged, "P", "V"));
  assert.match(draft, /Not evaluated by this tool/);
  assert.match(draft, /GHSA-range-only/);
});

test("the draft refuses to read as a filing even with no findings", () => {
  const draft = article14Draft(report({ components: [] }, [], "P", "V"));
  assert.match(draft, /No exact matches in the supplied advisory export\./);
  assert.match(draft, /not a filing, legal advice, or a conclusion that a report is required/);
});

test("a bad export fails with an instruction, not a parser error", () => {
  assert.throws(() => parseInput("<html>", "The SBOM"), /not valid JSON/);
  assert.throws(() => parseInput("<html>", "The SBOM"), /CycloneDX, SPDX, or OSV/);
});

test("an oversized file is refused before it is parsed", () => {
  assert.throws(() => parseInput("x".repeat(MAX_BYTES + 1), "The SBOM"), /larger than 25 MB/);
});

test("the page can name the format it read", () => {
  assert.equal(describeSbom(CYCLONEDX), "CycloneDX");
  assert.equal(describeSbom(SPDX), "SPDX");
  assert.equal(describeSbom({ components: [] }), "component list");
  assert.equal(describeSbom("nonsense"), "unrecognised");
  assert.equal(describeAdvisories(OSV), "OSV");
  assert.equal(describeAdvisories([{ name: "x", version: "1", id: "A" }]), "advisory list");
  assert.equal(describeAdvisories(42), "unrecognised");
});

test("the exported record carries the spec it was produced under", () => {
  // A record filed as evidence has to say which rules produced it, or a
  // reviewer reading it in six months cannot tell what it did or did not check.
  const result = report(CYCLONEDX, OSV, "P", "V");
  assert.equal(result.spec, "cra-exact-coordinate-v1");
  assert.equal(result.coverage, "Exact name, ecosystem, and version matches only; no range or reachability analysis.");
});
