// The Worker's pieces that run without the Worker build: the fetch adapter around the paid
// handler (same answers as on a socket), the in-memory app files, the route table and the build's
// file list. The Worker itself was run in workerd (docs/HOSTING.md, "On Cloudflare Workers").
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { provideAppFiles, readAppFile, readAppText } from "./app-files.mjs";
import { collect, render } from "../worker/build.mjs";
import { fetchHandlerFor, nodeResponseCollector, toNodeRequest } from "./fetch-adapter.mjs";
import { FREE_API_PATHS as SERVE_FREE_API_PATHS } from "./serve.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";
import { FREE_API_PATHS, MAX_BODY, workerRoute } from "../worker/route.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url));
const NOW = () => new Date("2026-11-26T10:00:00Z");

let server;
let base;
/** @type {(r: Request, i?: { remoteAddress?: string }) => Promise<Response>} */
let viaFetch;

before(async () => {
  // Two handlers, two stores: one behind node:http, one behind the fetch adapter.
  server = createServer(createProHandler({ store: new MemoryStore({ now: NOW }), env: {}, now: NOW }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  viaFetch = fetchHandlerFor(createProHandler({ store: new MemoryStore({ now: NOW }), env: {}, now: NOW }), { maxBody: MAX_BODY });
});
after(() => server.close());

/** The same request to both; returns [socket, adapter] as {status, headers, text}. */
async function both(method, path, { body, headers = {} } = {}) {
  const init = { method, headers, body };
  const a = await fetch(base + path, init);
  const b = await viaFetch(new Request(`https://einvoice.example${path}`, init), { remoteAddress: "203.0.113.9" });
  const read = async (/** @type {Response} */ r) => ({ status: r.status, type: r.headers.get("content-type"), csp: r.headers.get("content-security-policy"), text: await r.text() });
  return [await read(a), await read(b)];
}

const drop = (/** @type {string} */ text, /** @type {string[]} */ keys) => {
  const j = JSON.parse(text);
  const walk = (/** @type {any} */ v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(j);
};

test("the adapter answers like the socket: pages, legal, sign-up, a check with fixes, errors", async () => {
  for (const path of ["/healthz", "/app", "/app/app.js", "/app/terms", "/app/de/dpa", "/v1/legal", "/v1/billing/plans", "/v1/nope"]) {
    const [a, b] = await both("GET", path);
    assert.deepEqual(b, a, path);
  }
  const redirect = await viaFetch(new Request("https://einvoice.example/"));
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "/app");

  const signup = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Kanzlei Test", acceptTerms: true }) };
  const [sa, sb] = await both("POST", "/v1/signup", signup);
  assert.equal(sa.status, 201);
  assert.equal(sb.status, 201);
  assert.deepEqual(drop(sb.text, ["id", "apiKey", "createdAt"]), drop(sa.text, ["id", "apiKey", "createdAt"]));

  const keyA = JSON.parse(sa.text).apiKey;
  const keyB = JSON.parse(sb.text).apiKey;
  const check = (/** @type {string} */ key) => ({ method: "POST", headers: { authorization: `Bearer ${key}` }, body: UBL });
  const ra = await fetch(`${base}/v1/check?lang=de&fix=1&name=a.xml`, check(keyA));
  const rb = await viaFetch(new Request("https://einvoice.example/v1/check?lang=de&fix=1&name=a.xml", check(keyB)));
  assert.equal(rb.status, 200);
  assert.deepEqual(await rb.json(), await ra.json());
  for (const h of ["x-usage-documents-used", "x-usage-documents-limit", "x-usage-documents-charged"]) assert.equal(rb.headers.get(h), ra.headers.get(h), h);

  const [na, nb] = await both("POST", "/v1/check?name=a.xml", { body: "x", headers: { authorization: "Bearer epk_wrong" } });
  assert.equal(nb.status, 401);
  assert.deepEqual(nb, na);
  const [ba, bb] = await both("POST", "/v1/signup", { body: "{not json", headers: { "content-type": "application/json" } });
  assert.equal(bb.status, 400);
  assert.deepEqual(bb, ba);
});

test("the client IP comes from the Worker, so the per-IP sign-up cap still counts", async () => {
  const handler = fetchHandlerFor(createProHandler({ store: new MemoryStore({ now: NOW }), env: { SIGNUP_PER_IP_PER_HOUR: "1" }, now: NOW }));
  const signup = () => new Request("https://e.example/v1/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", acceptTerms: true }) });
  assert.equal((await handler(signup(), { remoteAddress: "198.51.100.1" })).status, 201);
  assert.equal((await handler(signup(), { remoteAddress: "198.51.100.1" })).status, 429);
  assert.equal((await handler(signup(), { remoteAddress: "198.51.100.2" })).status, 201);
});

test("a declared body over the cap is refused before it is read", async () => {
  const handler = fetchHandlerFor(() => assert.fail("handler must not run"), { maxBody: 10 });
  const r = await handler(new Request("https://e.example/v1/check", { method: "POST", body: "x".repeat(11), headers: { "content-length": "11" } }));
  assert.equal(r.status, 413);
});

test("a handler that throws or never ends still gets a 500, not a hung request", async () => {
  const throws = fetchHandlerFor(async () => {
    throw new Error("boom");
  });
  assert.equal((await throws(new Request("https://e.example/x"))).status, 500);
  const silent = fetchHandlerFor(async () => {});
  assert.equal((await silent(new Request("https://e.example/x"))).status, 500);
});

test("request and response shims: headers lower-cased, body once, no body on 204", async () => {
  const req = await toNodeRequest(new Request("https://e.example/a/b?c=1", { method: "POST", headers: { "X-Thing": "y" }, body: "hello" }), { remoteAddress: "1.2.3.4" });
  assert.equal(req.url, "/a/b?c=1");
  assert.equal(req.headers["x-thing"], "y");
  assert.equal(req.socket.remoteAddress, "1.2.3.4");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), "hello");
  const { res, response } = nodeResponseCollector();
  res.writeHead(204, { "X-A": "1" }).end("ignored");
  const r = await response;
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("x-a"), "1");
  assert.equal(await r.text(), "");
});

test("app files from memory: served instead of the disk, unknown paths missing, bad paths refused", () => {
  try {
    provideAppFiles(new Map([["pro/web/index.html", "<p>memory</p>"], ["fonts/A.ttf", new Uint8Array([1, 2])]]));
    assert.equal(readAppText("pro/web/index.html"), "<p>memory</p>");
    assert.deepEqual([...(readAppFile("fonts/A.ttf") ?? [])], [1, 2]);
    assert.equal(readAppFile("pro/web/app.js"), null);
  } finally {
    provideAppFiles(null);
  }
  assert.match(readAppText("pro/web/index.html") ?? "", /<html/i);
  for (const bad of ["../LICENSE", "pro/../x", "/etc/passwd", "pro//web", "./pro/web/index.html"]) assert.throws(() => readAppFile(bad), /bad app file path/, bad);
});

test("routes: fonts, the free API off (same set as the container), the rest to the paid handler", () => {
  assert.deepEqual([...FREE_API_PATHS].sort(), [...SERVE_FREE_API_PATHS].sort());
  assert.equal(workerRoute("/fonts/PreflightSans-Regular.ttf", "GET"), "font");
  assert.equal(workerRoute("/fonts/PreflightSans-Regular.ttf", "POST"), "pro");
  assert.equal(workerRoute("/fonts/../x.ttf", "GET"), "pro");
  assert.equal(workerRoute("/v1/validate", "POST"), "off");
  for (const p of ["/", "/app", "/v1/check", "/api/admin/metrics", "/healthz"]) assert.equal(workerRoute(p, "GET"), "pro", p);
});

test("the build embeds every file the Worker reads", () => {
  const files = collect();
  for (const f of ["index.html", "app.js", "app.css", "workspace-lib.mjs"]) assert.ok(files.text[`pro/web/${f}`], f);
  for (const lang of ["", "de/", "fr/"]) for (const k of ["terms", "privacy", "dpa"]) assert.ok(files.text[`pro/legal/${lang}${k}.md`], `${lang}${k}`);
  const fonts = readdirSync(new URL("../fonts/", import.meta.url)).filter((f) => f.endsWith(".ttf"));
  assert.ok(fonts.length > 0);
  for (const f of fonts) assert.ok(files.base64[`fonts/${f}`], f);
  // Every rule set the manifest names is embedded, or the plain route would say "unavailable".
  const manifest = JSON.parse(readFileSync(new URL("../plain/manifest.json", import.meta.url), "utf8"));
  // A set marked sameAs is read from the set it names.
  const named = new Set(Object.entries(manifest.sets).map(([name, set]) => `${set.sameAs ?? name}.json`));
  assert.ok(named.size > 10);
  for (const f of named) assert.ok(files.text[`plain/${f}`], f);
  // Nothing outside the listed folders, and no test or secret-looking file.
  for (const k of [...Object.keys(files.text), ...Object.keys(files.base64)]) assert.match(k, /^(pro\/web|pro\/legal(\/de|\/fr)?|fonts|plain)\/[\w.-]+$/, k);
  const out = render({ text: { "a/b.md": "x" }, base64: {} });
  assert.match(out, /^\/\/ Generated by worker\/build\.mjs/);
});
