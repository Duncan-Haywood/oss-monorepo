import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { matches, validateFilter } from "./filter.mjs";
import { handler, parseRoutes } from "./server.mjs";
import { newState } from "./relay.mjs";

const ctx = (obj, headers = {}) => ({ headers, bodyText: typeof obj === "string" ? obj : JSON.stringify(obj) });

test("path filters match exact values, prefixes and nested fields", () => {
  const f = { path: "data.kind", in: ["invoice.paid", "customer.*"] };
  assert.equal(matches(f, ctx({ data: { kind: "invoice.paid" } })), true);
  assert.equal(matches(f, ctx({ data: { kind: "customer.created" } })), true);
  assert.equal(matches(f, ctx({ data: { kind: "charge.failed" } })), false);
  assert.equal(matches(f, ctx({ data: {} })), false);
  assert.equal(matches(f, ctx("not json")), false);
});

test("header filters, arrays (AND) and not", () => {
  const h = { "x-github-event": "push" };
  assert.equal(matches({ header: "X-GitHub-Event", in: ["push"] }, ctx({}, h)), true);
  assert.equal(matches({ header: "x-github-event", in: ["ping"], not: true }, ctx({}, h)), true);
  assert.equal(matches([{ header: "x-github-event", in: ["push"] }, { path: "ref", in: ["refs/heads/main"] }], ctx({ ref: "refs/heads/dev" }, h)), false);
  assert.equal(matches(undefined, ctx({})), true);
});

test("validateFilter rejects malformed filters", () => {
  assert.throws(() => validateFilter({ in: ["a"] }), /exactly one/);
  assert.throws(() => validateFilter({ path: "a", header: "b", in: ["a"] }), /exactly one/);
  assert.throws(() => validateFilter({ path: "a", in: [] }), /non-empty/);
  assert.throws(() => validateFilter([]), /empty/);
  assert.throws(() => parseRoutes(JSON.stringify([{ name: "a", target: "http://x", filter: { path: "t" } }])), /route a filter/);
});

test("server drops filtered events (200, nothing stored) and routes per target", async () => {
  const routes = parseRoutes(JSON.stringify([{
    name: "hooks", scheme: "none",
    filter: { path: "type", in: ["invoice.*", "customer.*"] },
    targets: ["http://all.invalid/", { url: "http://billing.invalid/", filter: { path: "type", in: ["invoice.*"] } }],
  }]));
  const state = newState();
  const server = http.createServer(handler({ state, save() {}, routes, adminKey: "k", now: () => 1_700_000_000_000 }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (o) => fetch(`${base}/in/hooks`, { method: "POST", body: JSON.stringify(o) }).then((r) => r.json());
    assert.equal((await post({ type: "ping" })).filtered, true);
    assert.equal(Object.keys(state.events).length, 0);
    assert.equal((await post({ type: "invoice.paid", id: "e1" })).ids.length, 2);
    assert.equal((await post({ type: "customer.created", id: "e2" })).ids.length, 1);
    const targets = Object.values(state.events).map((e) => e.target).sort();
    assert.deepEqual(targets, ["http://all.invalid/", "http://all.invalid/", "http://billing.invalid/"]);
  } finally { server.close(); }
});
