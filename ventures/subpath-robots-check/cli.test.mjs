// The CLI's contract is its exit code and its silence on the network.
//
// The second matters more than it looks: the tool's own page promises it
// makes no request without `--fetch`, and a promise about network behaviour
// that nothing asserts is the kind that quietly stops being true. The test
// below replaces `globalThis.fetch` with a tripwire and runs the whole
// default path through it.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "./cli.mjs";

/** Run `main` with stdout/stderr captured rather than printed.
 *
 * Captured by injection rather than by monkeypatching `process.stdout` --
 * patching the global stream also swallows the test runner's own TAP output,
 * which turns a passing suite into one unparseable failure.
 */
async function run(argv) {
  const chunks = { out: "", err: "" };
  const code = await main(argv, {
    stdout: (s) => {
      chunks.out += s;
    },
    stderr: (s) => {
      chunks.err += s;
    },
  });
  return { code, ...chunks };
}

// `async` and `await fn(path)` are both load-bearing. A synchronous version
// returns the callback's promise and then runs its own `finally` immediately,
// deleting the file before the callback has read it -- which surfaces as an
// empty stdout and an "Unexpected end of JSON input" that looks like a parser
// bug in the tool rather than a race in the fixture.
async function withTempFile(name, contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), "subpath-robots-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  try {
    return await fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("no arguments prints usage and exits 0", async () => {
  const { code, out } = await run([]);
  assert.equal(code, 0);
  assert.match(out, /Usage:/);
});

test("--help prints usage and exits 0", async () => {
  const { code, out } = await run(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /subpath-robots-check/);
  assert.match(out, /no network access unless|makes no request|opens no sockets/i);
});

test("explain prints the mechanism, citing the RFC section", async () => {
  const { code, out } = await run(["explain"]);
  assert.equal(code, 0);
  assert.match(out, /RFC 9309/);
  assert.match(out, /link-following/i);
});

test("an unknown command exits 2 rather than guessing", async () => {
  const { code, err } = await run(["frobnicate"]);
  assert.equal(code, 2);
  assert.match(err, /Unknown command/);
});

test("an unknown option exits 2", async () => {
  const { code, err } = await run(["check", "https://e.com/", "--wat"]);
  assert.equal(code, 2);
  assert.match(err, /Unknown option/);
});

test("check without a URL exits 2 with a message", async () => {
  const { code, err } = await run(["check"]);
  assert.equal(code, 2);
  assert.match(err, /needs a URL/);
});

test("an unusable URL exits 2 rather than reporting a bogus verdict", async () => {
  const { code, err } = await run(["check", "ftp://example.com/x/"]);
  assert.equal(code, 2);
  assert.match(err, /http and https/);
});

test("an origin-root site reports that it governs its own file, exit 0", async () => {
  const { code, out } = await run(["check", "https://example.com/"]);
  assert.equal(code, 0);
  assert.match(out, /governs its own robots\.txt/);
  assert.doesNotMatch(out, /does NOT govern/);
});

test("a subpath site reports the gap and names the governing URL", async () => {
  const { code, out } = await run(["check", "https://acme.github.io/widget/"]);
  assert.equal(code, 0, "a finding is not an error unless --fail-on-critical");
  assert.match(out, /does NOT govern/);
  assert.match(out, /https:\/\/acme\.github\.io\/robots\.txt/);
  assert.match(out, /fetched by nothing/);
});

test("--fail-on-critical turns a critical finding into exit 1, for CI", async () => {
  const bad = await run(["check", "https://acme.github.io/widget/", "--fail-on-critical"]);
  assert.equal(bad.code, 1);

  const good = await run(["check", "https://example.com/", "--fail-on-critical"]);
  assert.equal(good.code, 0);
});

test("--json emits parseable output carrying the verdict", async () => {
  const { code, out } = await run(["check", "https://acme.github.io/widget/", "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.verdict, "does-not-govern");
  assert.equal(parsed.site.governingRobotsUrl, "https://acme.github.io/robots.txt");
  assert.ok(Array.isArray(parsed.findings));
});

test("--published reads the site's own robots.txt from a file", async () => {
  await withTempFile(
    "robots.txt",
    "User-agent: *\nDisallow: /widget/drafts/\nSitemap: https://acme.github.io/widget/sitemap.xml\n",
    async (path) => {
      const { code, out } = await run([
        "check",
        "https://acme.github.io/widget/",
        "--published",
        path,
        "--json",
      ]);
      assert.equal(code, 0);
      const parsed = JSON.parse(out);
      assert.ok(parsed.findings.some((f) => f.id === "inert-sitemap-line"));
      assert.ok(parsed.findings.some((f) => f.id === "inert-directives"));
    },
  );
});

test("--governing reads the origin-root file and can flip the verdict to blocked", async () => {
  await withTempFile("root-robots.txt", "User-agent: *\nDisallow: /widget/\n", async (path) => {
    const { out } = await run([
      "check",
      "https://acme.github.io/widget/",
      "--governing",
      path,
      "--json",
    ]);
    const parsed = JSON.parse(out);
    assert.ok(parsed.findings.some((f) => f.id === "blocked-by-origin-root"));
  });
});

test("a missing file exits 2 with the path in the message", async () => {
  const { code, err } = await run([
    "check",
    "https://acme.github.io/widget/",
    "--published",
    "/nonexistent/robots.txt",
  ]);
  assert.equal(code, 2);
  assert.match(err, /\/nonexistent\/robots\.txt/);
});

test("without --fetch the CLI opens no network connection at all", async () => {
  // The page and the README both promise this. Assert it rather than trust it.
  const realFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = () => {
    called += 1;
    throw new Error("the default path must never make a request");
  };
  try {
    const { code } = await run([
      "check",
      "https://acme.github.io/widget/",
      "--json",
    ]);
    assert.equal(code, 0);
    assert.equal(called, 0, "fetch was called on the default path");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("--fetch requests exactly the origin-root robots.txt, once", async () => {
  const realFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => "User-agent: *\nDisallow: /widget/\n" };
  };
  try {
    const { code, out } = await run([
      "check",
      "https://acme.github.io/widget/",
      "--fetch",
      "--json",
    ]);
    assert.equal(code, 0);
    assert.deepEqual(requested, ["https://acme.github.io/robots.txt"]);
    const parsed = JSON.parse(out);
    assert.ok(parsed.findings.some((f) => f.id === "blocked-by-origin-root"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a 404 on the governing file is a real answer, not an error", async () => {
  // GitHub Pages returns 404 here whenever the account has no user-site repo,
  // which is the common case. Treating it as a failure would send the reader
  // hunting a network problem they do not have.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => "" });
  try {
    const { code, out } = await run(["check", "https://acme.github.io/widget/", "--fetch"]);
    assert.equal(code, 0);
    assert.match(out, /returned 404/);
    assert.match(out, /no restrictions/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a network failure under --fetch exits 2 and says how to get a report anyway", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  try {
    const { code, err } = await run(["check", "https://acme.github.io/widget/", "--fetch"]);
    assert.equal(code, 2);
    assert.match(err, /Re-run without --fetch/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an explicit --governing file wins over --fetch", async () => {
  // The user who went and got the file has more information than the fetch
  // does; silently overwriting them would be the tool disagreeing with them.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "User-agent: *\nAllow: /\n" });
  try {
    await withTempFile("root.txt", "User-agent: *\nDisallow: /widget/\n", async (path) => {
      const { out } = await run([
        "check",
        "https://acme.github.io/widget/",
        "--fetch",
        "--governing",
        path,
        "--json",
      ]);
      const parsed = JSON.parse(out);
      assert.ok(
        parsed.findings.some((f) => f.id === "blocked-by-origin-root"),
        "the file the user supplied must decide the verdict",
      );
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
