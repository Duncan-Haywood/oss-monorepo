import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { newState, unsubToken } from "./store.mjs";

const ADMIN = "admin-key-1234567890";
async function boot(over = {}) {
  const sent = []; const state = newState(); let t = 1_000_000;
  const cfg = { state, save() {}, adminKey: ADMIN, title: "Acme", baseUrl: "https://fb.test", moderation: false, dryRun: false, send: async (m) => sent.push(m), now: () => (t += 10), ...over };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const call = async (path, o = {}) => {
    const r = await fetch(base + path, { redirect: "manual", ...o, headers: { cookie: jar.c || "", ...(o.headers || {}) } });
    const sc = r.headers.get("set-cookie"); if (sc) jar.c = sc.split(";")[0];
    return r;
  };
  const form = (path, data, h = {}) => call(path, { method: "POST", body: new URLSearchParams(data), headers: { "content-type": "application/x-www-form-urlencoded", ...h } });
  const admin = (path, body) => call(`/v1/admin${path}`, { method: body ? "POST" : "GET", body: body && JSON.stringify(body), headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" } });
  return { srv, state, sent, call, form, admin, jar };
}

test("submit, vote and read back through the public pages", async () => {
  const { srv, call, form } = await boot();
  assert.equal((await form("/submit", { title: "Add dark mode", body: "<script>x</script>", email: "me@x.com" })).status, 303);
  const home = await (await call("/")).text();
  assert.match(home, /Add dark mode/);
  const post = await (await call("/post/1")).text();
  assert.doesNotMatch(post, /<script>x<\/script>/); // escaped
  assert.match(post, /&lt;script&gt;/);
  const r = await call("/v1/posts"); const j = await r.json();
  assert.equal(j.posts[0].votes, 1); assert.equal(j.posts[0].voted, true);
  await form("/vote/1", {}); // toggles the author's own auto-vote off
  assert.equal((await (await call("/v1/posts")).json()).posts[0].votes, 0);
  srv.close();
});

test("two different visitors each count once", async () => {
  const { srv, call, form, admin } = await boot();
  await form("/submit", { title: "Zapier integration" });
  const other = await fetch(`http://127.0.0.1:${srv.address().port}/vote/1`, { method: "POST", redirect: "manual" });
  assert.equal(other.status, 303);
  const list = await (await admin("/posts")).json();
  assert.equal(list.posts[0].votes, 2);
  srv.close();
});

test("moderation hides new ideas until the admin approves", async () => {
  const { srv, call, form, admin } = await boot({ moderation: true });
  await form("/submit", { title: "Bulk import tool" });
  assert.doesNotMatch(await (await call("/")).text(), /Bulk import/);
  assert.equal((await call("/post/1")).status, 404);
  await admin("/posts/1/approve", {});
  assert.match(await (await call("/")).text(), /Bulk import/);
  srv.close();
});

test("admin endpoints need the key", async () => {
  const { srv, call } = await boot();
  assert.equal((await call("/v1/admin/posts")).status, 401);
  assert.equal((await call("/v1/admin/posts", { headers: { authorization: "Bearer nope" } })).status, 401);
  srv.close();
});

test("moving a post to shipped emails subscribers with a working unsubscribe link", async () => {
  const { srv, call, form, admin, sent, state } = await boot();
  await form("/submit", { title: "CSV export", email: "Fan@X.com" });
  const res = await (await admin("/posts/1/status", { status: "shipped" })).json();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "fan@x.com");
  assert.match(sent[0].subject, /has shipped/);
  assert.match(sent[0].headers["List-Unsubscribe"], /unsubscribe\?e=fan%40x\.com&t=/);
  assert.ok(res.notified[0].startsWith("emailed"));
  const t = unsubToken(state.secret || "x", "fan@x.com"); // wrong secret must be refused
  assert.equal((await call(`/unsubscribe?e=fan%40x.com&t=${t}`)).status, 400);
  const link = sent[0].text.match(/https:\/\/fb\.test(\/unsubscribe\S+)/)[1];
  assert.equal((await call(link)).status, 200);
  assert.deepEqual(state.posts[1].subs, []);
  srv.close();
});

test("dry run logs but sends nothing", async () => {
  const { srv, form, admin, sent } = await boot({ dryRun: true });
  await form("/submit", { title: "SSO login", email: "a@x.com" });
  const res = await (await admin("/posts/1/status", { status: "planned" })).json();
  assert.equal(sent.length, 0);
  assert.match(res.notified[0], /dry-run/);
  srv.close();
});

test("honeypot, rate limit and similar-idea suggestions", async () => {
  const { srv, call, form, state } = await boot({ allow: (() => { let n = 0; return () => ++n <= 3; })() });
  await form("/submit", { title: "Spam spam spam", website: "http://bot" });
  assert.equal(Object.keys(state.posts).length, 0);
  await form("/submit", { title: "Dark mode for the dashboard", body: "white is too bright at night" });
  const sim = await (await call("/v1/similar?q=dark%20theme%20bright%20screen%20night")).json();
  assert.equal(sim.similar[0].id, "1");
  assert.equal((await form("/submit", { title: "Another idea here" })).status, 303);
  assert.equal((await form("/submit", { title: "One more idea here" })).status, 429);
  srv.close();
});

test("roadmap, changelog page and Atom feed list what shipped", async () => {
  const { srv, call, form, admin } = await boot();
  await form("/submit", { title: "Public API" });
  await admin("/posts/1/status", { status: "in-progress" });
  await admin("/changelog", { title: "v1.2 <b>", body: "Public API is live", postIds: ["1"] });
  assert.match(await (await call("/roadmap")).text(), /In progress[\s\S]*Public API/);
  const atom = await (await call("/changelog.atom")).text();
  assert.match(atom, /<title>v1\.2 &lt;b&gt;<\/title>/);
  assert.match(await (await call("/changelog")).text(), /Public API is live/);
  srv.close();
});

test("merged posts redirect to the original", async () => {
  const { srv, call, form, admin } = await boot();
  await form("/submit", { title: "Night theme" }); await form("/submit", { title: "Dark mode" });
  await admin("/posts/1/merge", { into: "2" });
  const r = await call("/post/1");
  assert.equal(r.status, 303); assert.equal(r.headers.get("location"), "/post/2");
  srv.close();
});
