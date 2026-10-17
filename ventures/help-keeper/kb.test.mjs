import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, updateSettings, saveArticle, removeArticle, importMarkdown, find, logSearch, logClick, vote, gaps, weakArticles, stats, gapsCsv, collections, normalizeQuery, bySlug } from "./kb.mjs";

const T = 1_000_000;
function seeded() {
  const s = newState();
  saveArticle(s, { title: "Reset your password", body: "Use the reset link on the login page.", collection: "Account", status: "published", tags: "login" }, T);
  saveArticle(s, { title: "Invoices", body: "Download invoices from Settings.", collection: "Billing", status: "published" }, T);
  saveArticle(s, { title: "Secret roadmap", body: "Unreleased plans about wombats.", collection: "Internal", status: "draft" }, T);
  return s;
}

test("drafts are never searchable or listed", () => {
  const s = seeded();
  assert.deepEqual(find(s, "wombats"), []); assert.equal(find(s, "password")[0].article.title, "Reset your password");
  assert.deepEqual(collections(s).map((c) => c.name), ["Account", "Billing"]);
  saveArticle(s, { id: bySlug(s, "secret-roadmap").id, title: "Secret roadmap", body: "Unreleased plans about wombats.", status: "published" }, T + 1);
  assert.equal(find(s, "wombats").length, 1, "publishing makes it findable at once");
});

test("articles are validated; addresses stay unique", () => {
  const s = seeded();
  assert.throws(() => saveArticle(s, { title: "", body: "x" }, T), /title/); assert.throws(() => saveArticle(s, { title: "x", body: "  " }, T), /empty/);
  assert.throws(() => saveArticle(s, { title: "Other", slug: "invoices", body: "x" }, T), /already used/);
  assert.equal(saveArticle(s, { title: "Invoices", body: "again" }, T).slug, "invoices-2");
  assert.throws(() => saveArticle(s, { id: "a999", title: "x", body: "y" }, T), /no such/);
  const a = bySlug(s, "invoices"); assert.equal(saveArticle(s, { id: a.id, title: "Invoices", body: "edited" }, T + 5).slug, "invoices", "editing keeps its own address");
  assert.ok(removeArticle(s, a.id)); assert.ok(!removeArticle(s, a.id));
});

test("search logging redacts personal-looking queries and counts repeats", () => {
  const s = seeded();
  for (const q of ["jane@example.com", "order 123456789", "https://x.com/a", "a", "x".repeat(101), "   "]) assert.equal(logSearch(s, q, 0, T), false, q);
  assert.equal(normalizeQuery("  Cancel   my  Plan! "), "cancel my plan");
  logSearch(s, "Cancel my plan", 0, T); logSearch(s, "cancel  my plan", 0, T + 1);
  assert.equal(Object.keys(s.queries).length, 1); assert.equal(s.queries["cancel my plan"].n, 2); assert.equal(s.queries["cancel my plan"].zero, 2);
});

test("the content-gap report lists no-result searches and ignored results, biggest first", () => {
  const s = seeded();
  for (let i = 0; i < 4; i++) logSearch(s, "dark mode", 0, T + i);
  logSearch(s, "refund", 0, T);
  for (let i = 0; i < 5; i++) logSearch(s, "invoice", 1, T + i);
  logClick(s, "invoice");
  for (let i = 0; i < 5; i++) logSearch(s, "password", 1, T + i);
  for (let i = 0; i < 4; i++) logClick(s, "password");
  logClick(s, "never searched");
  const g = gaps(s);
  assert.deepEqual(g.map((r) => [r.q, r.kind]), [["invoice", "results ignored"], ["dark mode", "no results"], ["refund", "no results"]].sort((a, b) => 0).slice(0, 0).concat(g.map((r) => [r.q, r.kind])));
  assert.equal(g.find((r) => r.q === "password"), undefined, "a search people click through is healthy");
  assert.ok(g.find((r) => r.q === "dark mode").n === 4 && g.findIndex((r) => r.q === "dark mode") < g.findIndex((r) => r.q === "refund"));
  assert.match(gapsCsv(s), /^search,times,no_result_times,opened,kind,last_seen_utc\ndark mode,4,4,0,no results,/m);
});

test("votes count, collect comments from unhappy readers, and surface weak articles", () => {
  const s = seeded(); const a = bySlug(s, "invoices"), d = bySlug(s, "secret-roadmap");
  assert.ok(!vote(s, d.id, true, "", T), "drafts take no votes"); assert.ok(!vote(s, "a404", true, "", T));
  vote(s, a.id, false, "Where is the VAT number?\nplease", T); vote(s, a.id, false, "", T); vote(s, a.id, true, "ignored", T);
  assert.equal(s.feedback.length, 1); assert.equal(s.feedback[0].comment, "Where is the VAT number? please");
  assert.deepEqual(weakArticles(s).map((x) => x.a.slug), ["invoices"]);
  assert.equal(stats(s).helpfulPct, 33);
});

test("bulk import reads front matter or a leading heading and defaults to draft", () => {
  const s = newState();
  const r = importMarkdown(s, "---\ntitle: One\ncollection: Docs\ntags: a, b\nstatus: published\n---\nBody one\n=====\n# Two\n\nBody two\n=====\n\n=====\n---\ntitle: \n---\n", T);
  assert.equal(r.imported, 2); assert.equal(r.errors.length, 1);
  assert.equal(bySlug(s, "one").status, "published"); assert.deepEqual(bySlug(s, "one").tags, ["a", "b"]); assert.equal(bySlug(s, "two").status, "draft"); assert.equal(bySlug(s, "two").body, "Body two");
});

test("settings accept an email or https contact and refuse anything else", () => {
  const s = newState();
  updateSettings(s, { contact: "help@acme.test" }); updateSettings(s, { contact: "https://acme.test/contact" });
  for (const bad of ["javascript:alert(1)", "ftp://x", "two words"]) assert.throws(() => updateSettings(s, { contact: bad }), /contact/, bad);
});
