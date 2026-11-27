// The container's one process: paid API, workspace and free pages behind one port.
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { createCombinedHandler, routeFor } from "./serve.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const DOCKERFILE = readFileSync(new URL("../Dockerfile.pro", import.meta.url), "utf8");

/** @param {Record<string, string>} env */
async function start(env = {}) {
  const now = () => new Date("2026-11-26T10:00:00Z");
  const store = new MemoryStore({ now });
  const pro = createProHandler({ store, llm: null, env: { ADMIN_TOKEN: "t", ...env }, now });
  const server = createServer(createCombinedHandler({ pro, env }));
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
  const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

test("routeFor: paid owns /app, /healthz and /v1 except the free API paths", () => {
  const off = { freeApi: false };
  const on = { freeApi: true };
  assert.equal(routeFor("/healthz", off), "pro");
  assert.equal(routeFor("/app", off), "pro");
  assert.equal(routeFor("/app/app.js", off), "pro");
  assert.equal(routeFor("/apple.mjs", off), "free");
  assert.equal(routeFor("/v1/check", on), "pro");
  assert.equal(routeFor("/v1/signup", on), "pro");
  assert.equal(routeFor("/v1/validate", off), "off");
  assert.equal(routeFor("/v1/validate", on), "free");
  assert.equal(routeFor("/v1/generate", on), "free");
  assert.equal(routeFor("/v1/unknown", on), "pro");
  assert.equal(routeFor("/", off), "free");
  assert.equal(routeFor("/create.html", off), "free");
  assert.equal(routeFor("/report.mjs", off), "free");
  assert.equal(routeFor("/api/admin/metrics", off), "pro");
  assert.equal(routeFor("/api/other", off), "free");
});

test("one port serves the free pages, the workspace and the paid API", async () => {
  const { server, base } = await start();
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<html/i);

    const mod = await fetch(`${base}/report.mjs`);
    assert.equal(mod.status, 200);
    assert.match(mod.headers.get("content-type") ?? "", /javascript/);

    const app = await fetch(`${base}/app`);
    assert.equal(app.status, 200);
    assert.match(app.headers.get("content-security-policy") ?? "", /default-src 'none'/);

    const health = await fetch(`${base}/healthz`);
    assert.deepEqual(await health.json(), { ok: true });

    const signup = await fetch(`${base}/v1/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Kanzlei Test", acceptTerms: true }),
    });
    assert.equal(signup.status, 201);
    const { apiKey } = await signup.json();

    const check = await fetch(`${base}/v1/check?lang=de`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/xml" },
      body: UBL,
    });
    assert.equal(check.status, 200);
    const body = await check.json();
    assert.ok(Array.isArray(body.findings), "the paid check answers with findings");

    // create.html fetches these for its Factur-X PDF; the free server alone has no route for them.
    const font = await fetch(`${base}/fonts/PreflightSans-Regular.ttf`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get("content-type"), "font/ttf");
    assert.ok((await font.arrayBuffer()).byteLength > 1000);
    assert.equal((await fetch(`${base}/fonts/../server.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/fonts/OFL.txt`)).status, 404);

    // Server-side files are not served by the free half.
    assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/no-such-page.html`)).status, 404);
  } finally {
    server.close();
  }
});

test("the free JSON API is off unless FREE_API=on", async () => {
  const off = await start();
  try {
    const res = await fetch(`${off.base}/v1/validate`, { method: "POST", headers: { "content-type": "application/xml" }, body: UBL });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "not_found");
  } finally {
    off.server.close();
  }
  const on = await start({ FREE_API: "on" });
  try {
    const res = await fetch(`${on.base}/v1/validate`, { method: "POST", headers: { "content-type": "application/xml" }, body: UBL });
    assert.equal(res.status, 200);
    assert.ok("status" in (await res.json()));
  } finally {
    on.server.close();
  }
});

test("Dockerfile.pro starts the combined server and ships what pro/ imports", () => {
  assert.match(DOCKERFILE, /CMD \["node", "pro\/serve\.mjs"\]/);
  // pro/plans.mjs and pro/billing.mjs import ../../../packages/billing/src/index.ts
  assert.match(DOCKERFILE, /COPY packages\/billing\/src \/srv\/packages\/billing\/src/);
  // pro/admin.mjs imports ../../../packages/admin-metrics/src/index.ts
  assert.match(DOCKERFILE, /COPY packages\/admin-metrics\/src \/srv\/packages\/admin-metrics\/src/);
  assert.match(DOCKERFILE, /WORKDIR \/srv\/apps\/einvoice-preflight/);
  assert.match(DOCKERFILE, /COPY apps\/einvoice-preflight\/pro \.\/pro/);
  assert.match(DOCKERFILE, /VOLUME \/data/);
});
