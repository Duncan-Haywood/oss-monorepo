// The deploy-time CLIs in scripts/ (paddle-checkout-page.ts first, then its three siblings): its argument parsing and exit codes (0 ok,
// 1 Paddle refused the token calls, 2 bad arguments or an unusable key). The red-team run of
// 2026-11-28 seeded 8 faults into the script and none was caught: no test ran it. Paddle is never
// reached: a preloaded module replaces fetch with a stub that answers by path.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const SCRIPT = join(SCRIPTS, "paddle-checkout-page.ts");
// Made-up sandbox-shaped key, joined from parts so secret scanners do not read it as a leak.
const SDBX = ["pdl", "sdbx", "apikey", "01hzzzzzzzzzzzzzzzzzzzzzzz", "SECRETPARTsdbx0123"].join("_");

/** A fetch stub: GET /products answers `products`; every other call answers `other`. */
function stub(products: number, other: number): string {
  const src = `globalThis.fetch = async (input) => {
    const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
    const status = path === "/products" ? ${products} : ${other};
    return new Response(JSON.stringify({ data: [], error: { code: "stub", detail: "stub" } }), {
      status, headers: { "content-type": "application/json" } });
  };`;
  return `data:text/javascript,${encodeURIComponent(src)}`;
}

function run(
  args: string[],
  env: Record<string, string> = {},
  preload?: string,
  script = SCRIPT,
) {
  const r = spawnSync(
    process.execPath,
    [...(preload ? ["--import", preload] : []), script, ...args],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...env },
      timeout: 20_000,
    },
  );
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("paddle-checkout-page CLI", () => {
  it("exits 2 with the usage line when --app or --app-url is missing or bad", () => {
    for (const args of [
      [],
      ["--app", "payapps"],
      ["--app-url", "https://payapps.example.test"],
      ["--app", "Bad App", "--app-url", "https://payapps.example.test"],
    ]) {
      const r = run(args);
      assert.equal(r.code, 2, `args ${JSON.stringify(args)}: ${r.err}`);
      assert.match(r.err, /^usage: paddle-checkout-page\.ts/m, JSON.stringify(args));
    }
  });

  it("reads each flag's own value, in any order", () => {
    // Valid --app and --app-url get past the usage check to the key check (no key set).
    for (const args of [
      ["--app", "payapps", "--app-url", "https://payapps.example.test"],
      ["--app-url", "https://payapps.example.test", "--apply", "--app", "payapps"],
    ]) {
      const r = run(args);
      assert.equal(r.code, 2, r.err);
      assert.doesNotMatch(r.err, /usage:/);
      assert.match(r.err, /BILLING_API_KEY cannot be used/);
    }
  });

  it("exits 2 on an app URL the pay page cannot be built from", () => {
    const r = run(["--app", "payapps", "--app-url", "not a url"]);
    assert.equal(r.code, 2, r.err);
    assert.doesNotMatch(r.err, /usage:|BILLING_API_KEY/);
  });

  it("exits 2 when Paddle rejects a well-shaped key (401), before any token call", () => {
    const r = run(
      ["--app", "payapps", "--app-url", "https://payapps.example.test"],
      { BILLING_API_KEY: SDBX },
      stub(401, 500),
    );
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /BILLING_API_KEY cannot be used/);
  });

  it("exits 1 when the key is accepted but Paddle refuses the client-token calls", () => {
    const r = run(
      ["--app", "payapps", "--app-url", "https://payapps.example.test"],
      { BILLING_API_KEY: SDBX },
      stub(200, 403),
    );
    assert.equal(r.code, 1, `${r.out}\n${r.err}`);
    assert.doesNotMatch(r.err, /BILLING_API_KEY cannot be used|usage:/);
    assert.ok(!r.out.includes(SDBX) && !r.err.includes(SDBX), "the key is never printed");
  });
});

// The three sibling deploy scripts the priv-*-deploy workflows run had no test either.
describe("paddle-webhook, paddle-catalog and paddle-key-check CLIs", () => {
  const WEBHOOK = join(SCRIPTS, "paddle-webhook.ts");
  const CATALOG = join(SCRIPTS, "paddle-catalog.ts");
  const KEYCHECK = join(SCRIPTS, "paddle-key-check.ts");
  const url = "https://payapps.example.test";

  it("paddle-webhook exits 2 with the usage line unless --active is exactly true or false", () => {
    for (const active of [[], ["--active", "yes"], ["--active"]]) {
      const r = run(["--app", "payapps", "--app-url", url, ...active], {}, undefined, WEBHOOK);
      assert.equal(r.code, 2, r.err);
      assert.match(r.err, /^usage: paddle-webhook\.ts/m);
    }
    const ok = run(["--active", "false", "--app-url", url, "--app", "payapps"], {}, undefined, WEBHOOK);
    assert.equal(ok.code, 2, ok.err);
    assert.match(ok.err, /BILLING_API_KEY cannot be used/);
  });

  it("paddle-webhook stops at exit 2 on a key Paddle answers 401, and never prints the key", () => {
    const r = run(
      ["--app", "payapps", "--app-url", url, "--active", "false"],
      { BILLING_API_KEY: SDBX },
      stub(401, 500),
      WEBHOOK,
    );
    assert.equal(r.code, 2, r.err);
    assert.ok(!r.out.includes(SDBX) && !r.err.includes(SDBX));
  });

  it("paddle-catalog exits 2 with the usage line without --catalog", () => {
    const r = run([], {}, undefined, CATALOG);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^usage: paddle-catalog\.ts/m);
  });

  it("paddle-key-check: 2 for no key or a rejected key, 1 when a probed call is refused", () => {
    assert.equal(run([], {}, undefined, KEYCHECK).code, 2);
    assert.equal(run([], { BILLING_API_KEY: SDBX }, stub(401, 401), KEYCHECK).code, 2);
    const refused = run(["--label", "PAYAPPS_KEY"], { BILLING_API_KEY: SDBX }, stub(200, 403), KEYCHECK);
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /PAYAPPS_KEY/);
    assert.ok(!refused.out.includes(SDBX) && !refused.err.includes(SDBX));
  });
});
