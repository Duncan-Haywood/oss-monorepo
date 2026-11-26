// The legal pages and the terms version recorded at sign-up. FSL-1.1-MIT (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { legalMeta, loadLegal, renderMarkdown } from "./legal.mjs";
import { createProHandler } from "./server.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { MemoryStore } from "./store.mjs";

const NOW = () => new Date("2026-11-26T10:00:00Z");

async function serve(store = new MemoryStore({ now: NOW })) {
  const server = createServer(createProHandler({ store, env: {}, now: NOW }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, headers: res.headers, text, json };
  };
  return { store, call, close: () => server.close() };
}

test("renderMarkdown escapes text and renders the subset the legal files use", () => {
  const html = renderMarkdown("# T <x>\n\nA **b** & c\nd\n\n- one\n  two\n- <script>\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n");
  assert.equal(
    html,
    "<h1>T &lt;x&gt;</h1>\n<p>A <strong>b</strong> &amp; c d</p>\n<ul><li>one two</li><li>&lt;script&gt;</li></ul>\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>",
  );
  assert.throws(() => renderMarkdown("| A |\n| B |\n"), /separator/);
});

test("legalMeta needs a title and a version line", () => {
  assert.deepEqual(legalMeta("# Terms\n\n**Version 2026-11-26** · X\n"), { title: "Terms", version: "2026-11-26" });
  assert.throws(() => legalMeta("# Terms\n"), /Version/);
});

test("the shipped Terms and Privacy Policy load, name the operator and say what the code does", () => {
  const legal = loadLegal();
  for (const k of ["terms", "privacy"]) {
    assert.match(legal[k].version, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(legal[k].markdown, /Maris Stella Labs LLC/);
    assert.match(legal[k].markdown, /hello@marisstella\.app/);
    assert.doesNotMatch(legal[k].markdown, /attorney|lawyer|counsel|certif/i, "no claim of legal review or certification");
    assert.doesNotMatch(legal[k].page, /<script/i);
  }
  // Facts the privacy page states that the code must keep true.
  assert.match(legal.privacy.markdown, /Invoice contents are not stored/);
  assert.match(legal.privacy.markdown, /first 12 characters/);
  assert.match(legal.privacy.markdown, /Anthropic/);
  assert.match(legal.terms.markdown, /30 days/);
});

test("GET /app/terms and /app/privacy serve the pages under the workspace CSP; /v1/legal names the versions", async (t) => {
  const s = await serve();
  t.after(s.close);
  const terms = await s.call("GET", "/app/terms");
  assert.equal(terms.status, 200);
  assert.match(terms.headers.get("content-type"), /text\/html/);
  assert.match(terms.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(terms.text, /<h1>Terms of Service<\/h1>/);
  assert.match(terms.text, /href="\/app\/privacy"/);
  const privacy = await s.call("GET", "/app/privacy/");
  assert.equal(privacy.status, 200);
  assert.match(privacy.text, /<h1>Privacy Policy<\/h1>/);
  const meta = await s.call("GET", "/v1/legal");
  assert.equal(meta.status, 200);
  const legal = loadLegal();
  assert.deepEqual(meta.json.terms, { title: "Terms of Service", version: legal.terms.version, url: "/app/terms" });
  assert.equal(meta.json.privacy.url, "/app/privacy");
});

test("sign-up records the Terms version accepted, and a stale version is refused with 409", async (t) => {
  const s = await serve();
  t.after(s.close);
  const version = loadLegal().terms.version;
  const ok = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei A", acceptTerms: true, termsVersion: version } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.account.termsVersion, version);
  assert.equal((await s.store.getAccount(ok.json.account.id)).termsVersion, version);
  const old = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei B", acceptTerms: true, termsVersion: "2020-01-01" } });
  assert.equal(old.status, 409);
  assert.equal(old.json.error.code, "terms_changed");
  // an older page that sends no version still gets the version the server serves
  const plain = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei C", acceptTerms: true } });
  assert.equal(plain.json.account.termsVersion, version);
  const acct = await s.call("GET", "/v1/account", { key: plain.json.apiKey });
  assert.equal(acct.json.account.termsVersion, version);
});

test("SqlStore keeps the terms version (column added on start), null for admin-made accounts", async () => {
  const store = await openSqliteStore(":memory:", { now: NOW });
  const a = await store.createAccount({ name: "A", termsVersion: "2026-11-26" });
  const b = await store.createAccount({ name: "B" });
  assert.equal((await store.getAccount(a.id)).termsVersion, "2026-11-26");
  assert.equal((await store.getAccount(b.id)).termsVersion, null);
  store.close();
});
