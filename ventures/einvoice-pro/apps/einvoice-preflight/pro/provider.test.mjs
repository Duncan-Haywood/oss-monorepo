// Provider identification (Impressum, § 5 DDG; GDPR Art. 27 representative): pro/provider.mjs.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { impressumPage, PROVIDER, providerGaps } from "./provider.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const FULL = {
  ...PROVIDER,
  postalAddress: "1 Example St\nDenver, CO 80202\nUSA",
  representedBy: "A. Manager, Manager",
  register: "Colorado Secretary of State, ID 20251234567",
  euRepresentative: { name: "Rep GmbH", address: "Musterstr. 1\n10115 Berlin\nGermany", email: "rep@example.eu" },
};

test("providerGaps names each missing required detail; blanks count as missing", () => {
  assert.deepEqual(providerGaps({ ...PROVIDER, postalAddress: null, representedBy: null, euRepresentative: null }), ["postalAddress", "representedBy", "euRepresentative"]);
  assert.deepEqual(providerGaps(FULL), []);
  assert.deepEqual(providerGaps({ ...FULL, postalAddress: "  " }), ["postalAddress"]);
  assert.deepEqual(providerGaps({ ...FULL, euRepresentative: { name: "Rep", address: "", email: null } }), ["euRepresentative"]);
});

test("the page shows 'not yet published' for gaps, in each language, and says sign-up waits", () => {
  const empty = { ...PROVIDER, postalAddress: null, representedBy: null, euRepresentative: null };
  const en = impressumPage("en", empty);
  assert.match(en, /<html lang="en">/);
  assert.equal(en.match(/not yet published/g)?.length, 4); // address, represented by, EU rep, and the closing note
  assert.match(en, /Trial sign-ups open once/);
  assert.match(en, /hello@marisstella\.app/);
  const de = impressumPage("de", empty);
  assert.match(de, /<h1>Impressum<\/h1>/);
  assert.match(de, /noch nicht veröffentlicht/);
  assert.match(de, /href="\/app\/de\/privacy"/);
  assert.match(impressumPage("fr", empty), /<h1>Mentions légales<\/h1>/);
});

test("a complete provider is shown in full, escaped, with no 'not yet published'", () => {
  const html = impressumPage("en", { ...FULL, representedBy: "<script>x</script>" });
  assert.doesNotMatch(html, /not yet published|Trial sign-ups open once/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /1 Example St<br>Denver, CO 80202<br>USA/);
  assert.match(html, /Colorado Secretary of State, ID 20251234567/);
  assert.match(html, /Rep GmbH<br>Musterstr\. 1/);
  assert.match(html, /mailto:rep@example\.eu/);
});

/** @param {Record<string, string>} env */
async function serve(t, env) {
  const server = createServer(createProHandler({ store: new MemoryStore(), env: { ADMIN_TOKEN: "a".repeat(32), APP_URL: "http://localhost:8790", ...env } }));
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  return {
    get: (/** @type {string} */ p) => fetch(base + p),
    signup: () => fetch(`${base}/v1/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Kanzlei", acceptTerms: true }) }),
  };
}

test("GET /app[/de|/fr]/impressum is served as same-origin HTML; /v1/legal lists it with its gaps", async (t) => {
  const s = await serve(t, {});
  for (const p of ["/app/impressum", "/app/de/impressum", "/app/fr/impressum"]) {
    const r = await s.get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type") ?? "", /text\/html/);
    assert.match(r.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  }
  const legal = await (await s.get("/v1/legal")).json();
  assert.equal(legal.impressum.url, "/app/impressum");
  assert.equal(legal.impressum.complete, providerGaps().length === 0);
  assert.deepEqual(legal.impressum.missing, providerGaps());
});

test("a production host refuses trial sign-ups while the provider identification has gaps", async (t) => {
  const gaps = providerGaps();
  const prod = await serve(t, { APP_ENV: "production" });
  const r = await prod.signup();
  if (gaps.length) {
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.equal(body.error.code, "signup_closed");
    assert.match(body.error.message, /\/app\/impressum/);
  } else assert.equal(r.status, 201);
  // A local or test host is not a commercial offer: sign-up works there.
  const local = await serve(t, {});
  assert.equal((await local.signup()).status, 201);
});
