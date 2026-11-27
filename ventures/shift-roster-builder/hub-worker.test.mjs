import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker, { RosterHub, serve, loadState } from "./hub-worker.mjs";
import { parseStaff, parseShifts, buildRoster } from "./calc.mjs";

// A stand-in for the Durable Object runtime: storage values are structured-cloned like the real one.
function fakeNamespace(env, storage = new Map()) {
  const objects = new Map();
  const ns = {
    idFromName: (n) => n,
    get: (id) => {
      if (!objects.has(id)) {
        const ctx = { storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); } }, blockConcurrencyWhile: (fn) => fn() };
        objects.set(id, new RosterHub(ctx, { ...env, HUB: ns }));
      }
      return objects.get(id);
    },
  };
  return { ns, storage };
}
const ENV = { ADMIN_KEY: "adm", TEAM_TOKEN: "tm" };
function boot(env = ENV, storage) {
  const { ns, storage: st } = fakeNamespace(env, storage);
  const call = (path, init) => worker.fetch(new Request("https://hub.example" + path, init), { ...env, HUB: ns });
  const post = (path, body) => call(path, { method: "POST", body: new URLSearchParams(body), redirect: "manual" });
  return { call, post, storage: st };
}
const STAFF = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, Mon-Wed 8-18";
const SHIFTS = "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day";
// What the admin page's script does in the manager's browser.
const browserOwner = (staff = STAFF, shifts = SHIFTS) => buildRoster(parseStaff(staff).staff, parseShifts(shifts).slots).owner;

test("the Worker refuses to run without both secrets", async () => {
  const w = boot({});
  assert.equal((await w.call("/healthz")).status, 200);
  assert.equal((await w.call("/admin?key=x")).status, 503);
});

test("the admin page builds in the browser and the Worker will not run the search itself", async () => {
  const w = boot();
  const html = await (await w.call("/admin?key=adm")).text();
  assert.match(html, /<script type="module">/);
  assert.match(html, /import\("\/calc\.mjs"\)/);
  assert.match(html, /name="owner"/);
  const r = await w.post("/admin/save?key=adm", { act: "publish", weekStart: "2026-11-16", staff: STAFF, shifts: SHIFTS });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /builds the roster in your browser/);
});

test("a browser-built roster is checked, published, kept across a restart, and shown to staff without wages", async () => {
  const w = boot();
  const r = await w.post("/admin/save?key=adm", { act: "publish", weekStart: "2026-11-16", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify(browserOwner()) });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Published\. Payroll \$/);
  // A new Durable Object instance over the same storage (an eviction or redeploy) still has the week.
  const again = boot(ENV, w.storage);
  const html = await (await again.call("/team?t=tm")).text();
  assert.match(html, /week of 2026-11-16/);
  assert.match(html, /Ana/);
  assert.doesNotMatch(html, /23\.17|19\.43|payroll/i);
  const feed = await again.call("/team/feed.ics?t=tm&person=Ana");
  assert.match(await feed.text(), /BEGIN:VEVENT/);
});

test("a roster that breaks a rule or does not match the lists is refused", async () => {
  const w = boot();
  // Ben (index 1) is not free on Thursday or Friday.
  const bad = [1, 1, 1, 1, 1];
  let r = await w.post("/admin/save?key=adm", { act: "publish", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify(bad) });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /breaks a rule/);
  r = await w.post("/admin/save?key=adm", { act: "publish", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify([0, 0]) });
  assert.match(await r.text(), /does not match the shift list/);
  r = await w.post("/admin/save?key=adm", { act: "publish", staff: STAFF, shifts: SHIFTS, owner: "{not json" });
  assert.match(await r.text(), /could not be read/);
  assert.equal(loadState(w.storage.get("state")).published, null);
});

test("staff requests reach the manager with cover candidates, from the published week", async () => {
  const w = boot();
  await w.post("/admin/save?key=adm", { act: "publish", weekStart: "2026-11-16", staff: STAFF, shifts: SHIFTS, owner: JSON.stringify([0, 0, 0, 0, 0]) });
  const r = await w.post("/team/callout?t=tm", { shift: "Ana|1|540|1020", note: "dentist" });
  assert.equal(r.status, 200);
  const admin = await (await w.call("/admin?key=adm")).text();
  assert.match(admin, /Ana<\/strong> cannot make Tue/);
  assert.match(admin, /Give to Ben/);
});

test("serve passes the body, method and query through and keeps redirects bodiless", async () => {
  let seen;
  const hub = async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(...c);
    seen = { method: req.method, url: req.url, body: new TextDecoder().decode(new Uint8Array(chunks)) };
    res.writeHead(303, { location: "/x" }); res.end("");
  };
  const out = await serve(hub, new Request("https://h.example/admin/save?key=a", { method: "POST", body: "a=1&b=2" }));
  assert.deepEqual(seen, { method: "POST", url: "/admin/save?key=a", body: "a=1&b=2" });
  assert.equal(out.status, 303);
  assert.equal(out.headers.get("location"), "/x");
});

test("the browser's modules are a closed graph and the Worker uses no Node built-ins", () => {
  const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  // The browser's module graph must be closed: calc.mjs imports only bnp.mjs, which imports nothing.
  const deps = (f) => [...read(f).matchAll(/^import .* from "\.\/([\w.-]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(deps("./calc.mjs"), ["bnp.mjs"]);
  assert.deepEqual(deps("./bnp.mjs"), []);
  // The Worker's own imports use no Node built-ins.
  for (const f of ["./hub-worker.mjs", "./hub.mjs"]) assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm, ""), /from "node:|\bBuffer\.|require\(/, f);
});
