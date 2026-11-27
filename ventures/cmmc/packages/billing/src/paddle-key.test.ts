import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPaddleKey,
  describeKeyProbe,
  keyProbeOk,
  probePaddleKey,
  probeVerdict,
} from "./paddle-key.ts";

// Made-up values in each real shape. None is a real key; they are joined from parts so the repository's
// secret scanners do not mistake a fixture for a leaked credential.
const fake = (env: string) =>
  ["pdl", env, "apikey", "01hzzzzzzzzzzzzzzzzzzzzzzz", `SECRETPART${env}0123`].join("_");
const LIVE = fake("live");
const SDBX = fake("sdbx");
const LEGACY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5";

describe("classifyPaddleKey", () => {
  it("tells live, sandbox and legacy keys apart", () => {
    const live = classifyPaddleKey(LIVE);
    assert.equal(live.kind, "live");
    assert.equal(live.environment, "live");
    assert.equal(live.prefix, "pdl_live_apikey_");
    assert.equal(live.usable, true);
    assert.equal(classifyPaddleKey(SDBX).kind, "sandbox");
    assert.equal(classifyPaddleKey("pdl_sdbx_0123456789abcdef").prefix, "pdl_sdbx_");
    const legacy = classifyPaddleKey(LEGACY);
    assert.equal(legacy.kind, "legacy");
    assert.equal(legacy.environment, null);
    assert.equal(legacy.prefix, "");
    assert.equal(legacy.usable, true);
    assert.match(legacy.advice, /cannot carry permissions or an expiry/);
  });

  it("names the wrong kinds of value", () => {
    assert.equal(classifyPaddleKey("").kind, "missing");
    assert.equal(classifyPaddleKey(undefined).kind, "missing");
    assert.equal(classifyPaddleKey("live_0123456789abcdef0123456").kind, "client-token");
    assert.equal(classifyPaddleKey("test_0123456789abcdef0123456").kind, "client-token");
    assert.equal(classifyPaddleKey("pdl_ntfset_01hzzzz_abcdef").kind, "webhook-secret");
    assert.equal(classifyPaddleKey("short-key!").kind, "unrecognised");
    for (const k of ["", "live_0123456789abcdef0123456", "pdl_ntfset_01hzzzz_abcdef", "x!"])
      assert.equal(classifyPaddleKey(k).usable, false);
  });

  it("flags whitespace from a paste and still classifies the trimmed key", () => {
    const s = classifyPaddleKey(`  ${LIVE}\n`);
    assert.equal(s.kind, "live");
    assert.equal(s.whitespace, true);
    assert.equal(classifyPaddleKey(LIVE).whitespace, false);
  });
});

describe("probeVerdict", () => {
  it("reads need 2xx; an empty-body write refused with 400 passed the permission check", () => {
    assert.equal(probeVerdict("GET", 200), "allowed");
    assert.equal(probeVerdict("GET", 400), "error");
    assert.equal(probeVerdict("POST", 400), "allowed");
    assert.equal(probeVerdict("POST", 201), "allowed");
    assert.equal(probeVerdict("POST", 403), "forbidden");
    assert.equal(probeVerdict("GET", 401), "unauthenticated");
    assert.equal(probeVerdict("GET", 500), "error");
    assert.equal(probeVerdict("GET", 0), "unreachable");
    assert.equal(probeVerdict("POST", 0), "unreachable");
  });
});

/** A fake Paddle that accepts one key on one environment with a set of permissions. */
function fakePaddle(opts: { key: string; env: "live" | "sandbox"; perms: string[] }) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.host}${url.pathname}`);
    const env = url.host.startsWith("sandbox-api.") ? "sandbox" : "live";
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${opts.key}` || env !== opts.env)
      return Response.json({ error: { code: "authentication_malformed" } }, { status: 401 });
    const perm = `${url.pathname.slice(1, -1)}.${method === "GET" ? "read" : "write"}`;
    if (!opts.perms.includes(perm))
      return Response.json({ error: { code: "forbidden" } }, { status: 403 });
    if (method === "POST") {
      assert.equal(init?.body, "{}");
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    }
    return Response.json({ data: [] });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const ALL = ["product.read", "price.read", "product.write", "price.write"];

describe("probePaddleKey", () => {
  it("a scoped sandbox key with every permission passes, probing only the sandbox", async () => {
    const f = fakePaddle({ key: SDBX, env: "sandbox", perms: ALL });
    const p = await probePaddleKey(SDBX, { fetch: f.fetchFn });
    assert.equal(p.environment, "sandbox");
    assert.equal(p.baseUrl, "https://sandbox-api.paddle.com");
    assert.equal(keyProbeOk(p), true);
    // Each call is "METHOD host/path": compare the host exactly, not as a substring.
    assert.ok(f.calls.every((c) => c.split(" ")[1]?.split("/")[0] === "sandbox-api.paddle.com"));
    assert.equal(f.calls.length, 4);
  });

  it("reports a missing write permission as 403 with the permission to add", async () => {
    const f = fakePaddle({ key: LIVE, env: "live", perms: ["product.read", "price.read"] });
    const p = await probePaddleKey(LIVE, { fetch: f.fetchFn });
    assert.equal(keyProbeOk(p), false);
    const text = describeKeyProbe(p, "PAYAPPS_BILLING_API_KEY").join("\n");
    assert.match(text, /^PAYAPPS_BILLING_API_KEY: live \(prefix pdl_live_apikey_\)/);
    assert.match(text, /create-product: 403 forbidden: give the key product\.write/);
    assert.match(text, /missing permissions: product\.write, price\.write/);
    assert.match(text, /list-products: ok/);
  });

  it("limits the probe to reads when asked", async () => {
    const f = fakePaddle({ key: LIVE, env: "live", perms: ["product.read", "price.read"] });
    const p = await probePaddleKey(LIVE, {
      fetch: f.fetchFn,
      calls: ["list-products", "list-prices"],
    });
    assert.equal(keyProbeOk(p), true);
    assert.deepEqual(f.calls, ["GET api.paddle.com/products", "GET api.paddle.com/prices"]);
  });

  it("finds a legacy key's environment: live refuses it, sandbox accepts", async () => {
    const f = fakePaddle({ key: LEGACY, env: "sandbox", perms: ALL });
    const p = await probePaddleKey(LEGACY, { fetch: f.fetchFn });
    assert.equal(p.environment, "sandbox");
    assert.equal(p.baseUrl, "https://sandbox-api.paddle.com");
    assert.equal(keyProbeOk(p), true);
    assert.equal(f.calls[0], "GET api.paddle.com/products");
    const text = describeKeyProbe(p).join("\n");
    assert.match(text, /legacy-format/);
    assert.match(text, /Paddle accepted it on sandbox/);
  });

  it("a legacy key neither environment accepts is reported, with no base url", async () => {
    const f = fakePaddle({ key: "someone-elses-key", env: "live", perms: ALL });
    const p = await probePaddleKey(LEGACY, { fetch: f.fetchFn });
    assert.equal(p.baseUrl, null);
    assert.equal(keyProbeOk(p), false);
    assert.match(describeKeyProbe(p).join("\n"), /neither live nor sandbox/);
  });

  it("a sandbox key sent to the wrong account answers 401 and is not ok", async () => {
    const f = fakePaddle({ key: "other", env: "sandbox", perms: ALL });
    const p = await probePaddleKey(SDBX, { fetch: f.fetchFn });
    assert.equal(p.baseUrl, null);
    assert.match(describeKeyProbe(p).join("\n"), /401 authentication_malformed/);
  });

  it("never calls Paddle for a value of the wrong kind", async () => {
    const f = fakePaddle({ key: LIVE, env: "live", perms: ALL });
    const p = await probePaddleKey("pdl_ntfset_01hzzzz_abcdef", { fetch: f.fetchFn });
    assert.equal(f.calls.length, 0);
    assert.equal(keyProbeOk(p), false);
    assert.match(describeKeyProbe(p).join("\n"), /notification secret \(wrong kind\)/);
  });

  it("never prints the key past its public prefix", async () => {
    for (const key of [LIVE, SDBX, LEGACY, `  ${LIVE} `]) {
      const f = fakePaddle({
        key: key.trim(),
        env: key.includes("sdbx") ? "sandbox" : "live",
        perms: ALL,
      });
      const text = describeKeyProbe(await probePaddleKey(key, { fetch: f.fetchFn })).join("\n");
      assert.ok(!text.includes("SECRETPART"), text);
      assert.ok(!text.includes(LEGACY.slice(0, 8)), text);
    }
  });

  it("a network failure is not a pass and not acceptance", async () => {
    const offline = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    for (const key of [LIVE, LEGACY]) {
      const p = await probePaddleKey(key, { fetch: offline });
      assert.equal(keyProbeOk(p), false);
      assert.equal(p.baseUrl, null, "no answer must not pick an environment to sync against");
      const text = describeKeyProbe(p).join("\n");
      assert.match(text, /no answer from Paddle/);
      assert.doesNotMatch(text, /accepted it/);
    }
  });

  it("a legacy key: live unreachable, sandbox accepts, so sandbox is its environment", async () => {
    const f = fakePaddle({ key: LEGACY, env: "sandbox", perms: ALL });
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).host === "api.paddle.com") throw new Error("reset");
      return f.fetchFn(input, init);
    }) as typeof fetch;
    const p = await probePaddleKey(LEGACY, { fetch: flaky });
    assert.equal(p.environment, "sandbox");
    assert.equal(keyProbeOk(p), true);
  });
});
