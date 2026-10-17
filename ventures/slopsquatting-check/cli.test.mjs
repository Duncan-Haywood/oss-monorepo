import test from "node:test";
import assert from "node:assert/strict";
import { run, checkOne } from "./cli.mjs";

function fakeResponse({ status = 200, json = null } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => json,
  };
}

function fixedNowMeta({ daysAgo, versionCount }) {
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const versions = {};
  for (let i = 0; i < versionCount; i += 1) versions[`0.0.${i}`] = {};
  return { time: { created }, versions };
}

test("checkOne returns SKIPPED for a non-registry specifier without calling fetch", async () => {
  const dep = { name: "local", registryName: "local", skip: true, skipReason: "file:" };
  let called = false;
  const result = await checkOne(dep, { fetchImpl: async () => { called = true; return fakeResponse(); } });
  assert.equal(result.status, "SKIPPED");
  assert.equal(called, false);
});

test("checkOne returns NOT_FOUND on a 404", async () => {
  const dep = { name: "totally-hallucinated-pkg-xyz", registryName: "totally-hallucinated-pkg-xyz", skip: false };
  const result = await checkOne(dep, { fetchImpl: async () => fakeResponse({ status: 404 }) });
  assert.equal(result.status, "NOT_FOUND");
});

test("checkOne returns OK for an old, established package", async () => {
  const dep = { name: "chalk", registryName: "chalk", skip: false };
  const meta = fixedNowMeta({ daysAgo: 4000, versionCount: 20 });
  const result = await checkOne(dep, { fetchImpl: async () => fakeResponse({ json: meta }) });
  assert.equal(result.status, "OK");
});

test("checkOne returns SUSPICIOUS_NEW for a package created days ago with one version", async () => {
  const dep = { name: "freshly-squatted", registryName: "freshly-squatted", skip: false };
  const meta = fixedNowMeta({ daysAgo: 3, versionCount: 1 });
  const result = await checkOne(dep, { fetchImpl: async () => fakeResponse({ json: meta }) });
  assert.equal(result.status, "SUSPICIOUS_NEW");
  assert.equal(result.versionCount, 1);
});

test("checkOne reports ERROR (not a security finding) on a network failure", async () => {
  const dep = { name: "whatever", registryName: "whatever", skip: false };
  const result = await checkOne(dep, { fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); } });
  assert.equal(result.status, "ERROR");
  assert.match(result.error, /ENOTFOUND/);
});

test("checkOne reports ERROR on a non-404 non-2xx response", async () => {
  const dep = { name: "whatever", registryName: "whatever", skip: false };
  const result = await checkOne(dep, { fetchImpl: async () => fakeResponse({ status: 503 }) });
  assert.equal(result.status, "ERROR");
  assert.match(result.error, /503/);
});

test("run exits 1 when any dependency is NOT_FOUND", async () => {
  const pkg = JSON.stringify({ dependencies: { "hallucinated-name": "^1.0.0" } });
  const { exitCode, output } = await run([], {
    readFile: async () => pkg,
    fetchImpl: async () => fakeResponse({ status: 404 }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /DOES NOT EXIST/);
});

test("run exits 0 by default when the only finding is SUSPICIOUS_NEW", async () => {
  const pkg = JSON.stringify({ dependencies: { "new-thing": "^1.0.0" } });
  const meta = fixedNowMeta({ daysAgo: 2, versionCount: 1 });
  const { exitCode, output } = await run([], {
    readFile: async () => pkg,
    fetchImpl: async () => fakeResponse({ json: meta }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /very recently/);
});

test("run --strict exits 1 when the only finding is SUSPICIOUS_NEW", async () => {
  const pkg = JSON.stringify({ dependencies: { "new-thing": "^1.0.0" } });
  const meta = fixedNowMeta({ daysAgo: 2, versionCount: 1 });
  const { exitCode } = await run(["--strict"], {
    readFile: async () => pkg,
    fetchImpl: async () => fakeResponse({ json: meta }),
  });
  assert.equal(exitCode, 1);
});

test("run exits 0 with 'nothing flagged' when everything resolves clean", async () => {
  const pkg = JSON.stringify({ dependencies: { chalk: "^5.0.0" } });
  const meta = fixedNowMeta({ daysAgo: 4000, versionCount: 30 });
  const { exitCode, output } = await run([], {
    readFile: async () => pkg,
    fetchImpl: async () => fakeResponse({ json: meta }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Nothing flagged/);
});

test("run --json emits parseable JSON with per-dependency status", async () => {
  const pkg = JSON.stringify({ dependencies: { chalk: "^5.0.0" } });
  const meta = fixedNowMeta({ daysAgo: 4000, versionCount: 30 });
  const { output } = await run(["--json"], {
    readFile: async () => pkg,
    fetchImpl: async () => fakeResponse({ json: meta }),
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed[0].name, "chalk");
  assert.equal(parsed[0].status, "OK");
});

test("run exits 2 with a readable message when the file cannot be read", async () => {
  const { exitCode, output } = await run(["missing.json"], {
    readFile: async () => { throw new Error("ENOENT: no such file"); },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /ENOENT/);
});

test("run exits 2 on invalid JSON rather than crashing", async () => {
  const { exitCode, output } = await run([], { readFile: async () => "not json" });
  assert.equal(exitCode, 2);
  assert.match(output, /could not parse/);
});

test("run skips a git-specifier dependency without calling fetch, and does not flag it", async () => {
  const pkg = JSON.stringify({ dependencies: { "from-git": "git+https://example.com/repo.git" } });
  let calls = 0;
  const { exitCode, output } = await run([], {
    readFile: async () => pkg,
    fetchImpl: async () => { calls += 1; return fakeResponse({ status: 404 }); },
  });
  assert.equal(calls, 0);
  assert.equal(exitCode, 0);
  assert.match(output, /1 skipped/);
});

test("--help exits 0 and does not touch the filesystem or network", async () => {
  const { exitCode, output } = await run(["--help"], {
    readFile: async () => { throw new Error("must not be called"); },
    fetchImpl: async () => { throw new Error("must not be called"); },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Usage/);
});
