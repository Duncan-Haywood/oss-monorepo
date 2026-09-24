import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDependencies,
  isRegistrySpecifier,
  registryUrl,
  classifyMetadata,
  levenshtein,
  findNearMisses,
  WELL_KNOWN_PACKAGES,
  AGE_THRESHOLD_DAYS,
  VERSION_COUNT_THRESHOLD,
} from "./engine.mjs";

test("extractDependencies reads every manifest field, first occurrence wins", () => {
  const pkg = JSON.stringify({
    dependencies: { react: "^18.0.0" },
    devDependencies: { react: "^17.0.0", jest: "^29.0.0" },
  });
  const deps = extractDependencies(pkg);
  assert.equal(deps.length, 2);
  const react = deps.find((d) => d.name === "react");
  assert.equal(react.field, "dependencies");
  assert.equal(react.specifier, "^18.0.0");
});

test("extractDependencies throws on invalid JSON", () => {
  assert.throws(() => extractDependencies("not json"), /could not parse/);
});

test("extractDependencies throws on a non-object manifest", () => {
  assert.throws(() => extractDependencies("[1,2,3]"), /must contain a JSON object/);
});

test("extractDependencies skips git/file/link/workspace/URL specifiers", () => {
  const pkg = JSON.stringify({
    dependencies: {
      "from-git": "git+https://github.com/example/repo.git",
      "from-file": "file:../local-pkg",
      "from-link": "link:../linked-pkg",
      "from-workspace": "workspace:*",
      "from-url": "https://example.com/tarball.tgz",
      "real-dep": "^1.0.0",
    },
  });
  const deps = extractDependencies(pkg);
  const bySkip = Object.fromEntries(deps.map((d) => [d.name, d.skip]));
  assert.equal(bySkip["from-git"], true);
  assert.equal(bySkip["from-file"], true);
  assert.equal(bySkip["from-link"], true);
  assert.equal(bySkip["from-workspace"], true);
  assert.equal(bySkip["from-url"], true);
  assert.equal(bySkip["real-dep"], false);
});

test("extractDependencies resolves an npm: alias to its real registry name", () => {
  const pkg = JSON.stringify({
    dependencies: { "my-alias": "npm:real-package@^2.0.0" },
  });
  const [dep] = extractDependencies(pkg);
  assert.equal(dep.name, "my-alias");
  assert.equal(dep.registryName, "real-package");
  assert.equal(dep.skip, false);
});

test("extractDependencies leaves an unaliased name's registryName equal to its name", () => {
  const pkg = JSON.stringify({ dependencies: { chalk: "^5.0.0" } });
  const [dep] = extractDependencies(pkg);
  assert.equal(dep.registryName, "chalk");
});

test("isRegistrySpecifier treats a bare version range or tag or wildcard as registry-backed", () => {
  assert.equal(isRegistrySpecifier("^1.2.3"), true);
  assert.equal(isRegistrySpecifier("latest"), true);
  assert.equal(isRegistrySpecifier("*"), true);
  assert.equal(isRegistrySpecifier(""), true);
});

test("isRegistrySpecifier rejects git/file/link/workspace/URL forms", () => {
  for (const s of ["git+ssh://git@github.com/a/b.git", "file:../x", "link:../x", "workspace:*", "https://x.tgz"]) {
    assert.equal(isRegistrySpecifier(s), false, s);
  }
});

test("registryUrl encodes a scoped name as a single %2F-joined path segment", () => {
  assert.equal(registryUrl("chalk"), "https://registry.npmjs.org/chalk");
  assert.equal(registryUrl("@scope/name"), "https://registry.npmjs.org/@scope%2Fname");
});

test("classifyMetadata flags a package created recently with few versions as SUSPICIOUS_NEW", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const created = new Date(now - 10 * 86400000).toISOString(); // 10 days old
  const meta = { time: { created }, versions: { "1.0.0": {} } };
  const result = classifyMetadata(meta, { now });
  assert.equal(result.status, "SUSPICIOUS_NEW");
  assert.equal(result.ageDays, 10);
  assert.equal(result.versionCount, 1);
});

test("classifyMetadata treats an old, established package as OK", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const created = new Date(now - 3000 * 86400000).toISOString(); // ~8 years old
  const meta = { time: { created }, versions: { "1.0.0": {}, "1.1.0": {}, "2.0.0": {}, "2.1.0": {} } };
  const result = classifyMetadata(meta, { now });
  assert.equal(result.status, "OK");
});

test("classifyMetadata does not flag a package that is new but already has many versions", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const created = new Date(now - 5 * 86400000).toISOString();
  const versions = {};
  for (let i = 0; i <= VERSION_COUNT_THRESHOLD + 5; i += 1) versions[`0.0.${i}`] = {};
  const result = classifyMetadata({ time: { created }, versions }, { now });
  assert.equal(result.status, "OK", "many-version history outweighs recency alone");
});

test("classifyMetadata is exactly on the boundary at the age threshold (exclusive)", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const created = new Date(now - AGE_THRESHOLD_DAYS * 86400000).toISOString();
  const result = classifyMetadata({ time: { created }, versions: { "1.0.0": {} } }, { now });
  assert.equal(result.status, "OK", "age equal to the threshold is not < threshold");
});

test("classifyMetadata reports UNKNOWN when the document has no creation time", () => {
  const result = classifyMetadata({}, { now: Date.now() });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.ageDays, null);
});

test("levenshtein of a string with itself is 0", () => {
  assert.equal(levenshtein("requests", "requests"), 0);
});

test("levenshtein counts a transposition as two single-character edits", () => {
  assert.equal(levenshtein("reqeusts", "requests"), 2);
});

test("findNearMisses flags a one-edit typo of a well-known package", () => {
  const hits = findNearMisses("expres"); // missing final "s" from "express"
  assert.ok(hits.some((h) => h.known === "express" && h.distance === 1));
});

test("findNearMisses returns nothing for the well-known name itself", () => {
  assert.deepEqual(findNearMisses("express"), []);
});

test("findNearMisses returns nothing for a name far from every entry", () => {
  const hits = findNearMisses("completely-unrelated-name-xyz");
  assert.deepEqual(hits, []);
});

test("WELL_KNOWN_PACKAGES has no duplicate entries", () => {
  assert.equal(new Set(WELL_KNOWN_PACKAGES).size, WELL_KNOWN_PACKAGES.length);
});
