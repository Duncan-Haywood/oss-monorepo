import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { handler, importHelpKeeper } from "./server.mjs";
import { newState, redact, gaps, logTurn } from "./store.mjs";

const kb = readFileSync(new URL("./fixtures/sample-kb.md", import.meta.url), "utf8");
const KEY = "admin-key-123456";
const auth = { authorization: `Basic ${Buffer.from(`x:${KEY}`).toString("base64")}` };

async function serve(extra = {}) {
  const state = newState(kb); state.bar = 0.5;
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("ok", { status: 200 }); };
  const srv = http.createServer(handler({ state, adminKey: KEY, handoffWebhook: "https://desk.example/in/tok", fetch: fetchImpl, ...extra }));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (path, { method = "GET", body, headers = {} } = {}) => fetch(base + path, { method, headers: { ...(body && typeof body !== "string" ? { "content-type": "application/json" } : {}), ...headers }, body: body && typeof body !== "string" ? JSON.stringify(body) : body });
  return { state, sent, call, base, close: () => srv.close() };
}

test("ask: answers with citations and logs the question with personal details masked", async () => {
  const s = await serve();
  try {
    const r = await (await s.call("/api/ask", { method: "POST", body: { q: "How do I cancel my subscription? I'm ann@example.com, 07700 900123" } })).json();
    assert.equal(r.action, "answer");
    assert.equal(r.citations[0].title, "Cancel a subscription");
    assert.equal(s.state.log.length, 1);
    assert.doesNotMatch(s.state.log[0].q, /ann@example|07700/);
    assert.match(s.state.log[0].q, /\[email\].*\[number\]/);
    const f = await s.call("/api/feedback", { method: "POST", body: { id: r.id, helpful: true } });
    assert.equal(f.status, 200); assert.equal(s.state.log[0].helpful, true);
    await s.call("/api/feedback", { method: "POST", body: { id: r.id, helpful: false } });
    assert.equal(s.state.log[0].helpful, true, "one vote per answer");
  } finally { s.close(); }
});

test("ask: empty, non-JSON and too many requests are refused", async () => {
  const s = await serve();
  try {
    assert.equal((await s.call("/api/ask", { method: "POST", body: { q: " " } })).status, 400);
    assert.equal((await s.call("/api/ask", { method: "POST", body: "{nope", headers: { "content-type": "application/json" } })).status, 400);
    let last;
    for (let i = 0; i < 21; i++) last = await s.call("/api/ask", { method: "POST", body: { q: "shipping cost" } });
    assert.equal(last.status, 429);
  } finally { s.close(); }
});

test("handoff: forwards the question and chat to the inbox webhook in Support Desk's JSON shape", async () => {
  const s = await serve();
  try {
    const bad = await s.call("/api/handoff", { method: "POST", body: { email: "nope", question: "x" } });
    assert.equal(bad.status, 400);
    const r = await s.call("/api/handoff", { method: "POST", body: { email: "ann@example.com", name: "Ann\r\nBcc: x", question: "I was charged twice", transcript: [{ role: "customer", text: "I was charged twice" }, { role: "agent", text: "Passing this on" }] } });
    assert.equal(r.status, 200);
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].url, "https://desk.example/in/tok");
    assert.deepEqual(Object.keys(s.sent[0].body).sort(), ["from", "fromName", "subject", "text"]);
    assert.equal(s.sent[0].body.from, "ann@example.com");
    assert.doesNotMatch(s.sent[0].body.fromName, /[\r\n]/);
    assert.match(s.sent[0].body.text, /Agent: Passing this on/);
    assert.equal(s.state.handoffs[0].forwarded, true);
  } finally { s.close(); }
});

test("CORS: any site by default, only the listed ones when ALLOWED_ORIGINS is set", async () => {
  const open = await serve();
  try { assert.equal((await open.call("/api/ask", { method: "POST", body: { q: "shipping" }, headers: { origin: "https://a.example" } })).headers.get("access-control-allow-origin"), "*"); } finally { open.close(); }
  const shut = await serve({ allowedOrigins: "https://shop.example" });
  try {
    assert.equal((await shut.call("/api/ask", { method: "POST", body: { q: "shipping" }, headers: { origin: "https://evil.example" } })).status, 403);
    const ok = await shut.call("/api/ask", { method: "POST", body: { q: "shipping" }, headers: { origin: "https://shop.example" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://shop.example");
  } finally { shut.close(); }
});

test("admin: needs the key, refuses cross-site posts, escapes what customers typed", async () => {
  const s = await serve();
  try {
    assert.equal((await s.call("/admin")).status, 401);
    await s.call("/api/ask", { method: "POST", body: { q: "<script>alert(1)</script> do you sell kettles?" } });
    const html = await (await s.call("/admin", { headers: auth })).text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert/);
    const x = await s.call("/admin/settings", { method: "POST", headers: { ...auth, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "name=Pwned" });
    assert.equal(x.status, 403);
    assert.equal(s.state.settings.name, "Support");
  } finally { s.close(); }
});

test("admin: save knowledge, run test questions, take the recommended bar", async () => {
  const s = await serve();
  try {
    const post = (path, fields) => s.call(path, { method: "POST", headers: { ...auth, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
    let html = await (await post("/admin/knowledge", { knowledge: "# Opening hours\nWe are open 9 to 5 on weekdays.\n# Shipping\nShipping is free over $35." })).text();
    assert.match(html, /Saved 2 articles/);
    const tests = "question,expect\nwhen are you open,opening-hours\nis shipping free,shipping\ndo you sell kettles,handoff";
    html = await (await post("/admin/tests", { tests, do: "bar" })).text();
    assert.match(html, /Answer bar set to/);
    assert.match(html, /answered correctly/);
    assert.equal(typeof s.state.bar, "number");
    html = await (await post("/admin/tests", { tests, do: "calibrate" })).text();
    assert.match(html, /at least 30 test questions/);
    const csv = await (await s.call("/admin/log.csv", { headers: auth })).text();
    assert.match(csv, /^at,question,action/);
  } finally { s.close(); }
});

test("pages: widget, home page and robots", async () => {
  const s = await serve();
  try {
    const w = await s.call("/widget.js");
    assert.match(w.headers.get("content-type"), /javascript/);
    const js = await w.text();
    assert.doesNotMatch(js.replace(/root\.innerHTML = `[\s\S]*?`;/, ""), /innerHTML/, "server strings are set with textContent only");
    assert.doesNotThrow(() => new Function(js));
    assert.match(await (await s.call("/")).text(), /widget\.js/);
    assert.match(await (await s.call("/robots.txt")).text(), /Disallow: \/admin/);
  } finally { s.close(); }
});

test("Help Keeper import reads llms.txt and each article's Markdown, only from that site", async () => {
  const pages = {
    "https://help.example/llms.txt": "# Acme\n\n## General\n- [Refunds](https://help.example/a/refunds.md): x\n- [Evil](https://evil.example/a/evil.md): y\n",
    "https://help.example/a/refunds.md": "# Refunds\n\nRefunds take 5 days.\n",
  };
  const md = await importHelpKeeper("https://help.example/", async (u) => new Response(pages[u] ?? "", { status: pages[u] ? 200 : 404 }));
  assert.match(md, /slug: refunds/);
  assert.match(md, /url: https:\/\/help\.example\/a\/refunds/);
  assert.doesNotMatch(md, /evil/);
});

test("the gap list counts unanswered and unhelpful questions", () => {
  const st = newState(kb);
  for (const q of ["do you sell kettles", "Do you sell kettles?", "decaf?"]) logTurn(st, { action: "handoff", reasons: [{ id: "not_covered" }], citations: [], confidence: 0.1 }, q, 1);
  assert.equal(gaps(st)[0].n, 2);
  assert.equal(redact("call 555-123-4567 or mail a@b.co"), "call [number] or mail [email]");
});
