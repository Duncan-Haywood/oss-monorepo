import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, createEntry, updateEntry, setStatus, remove, published, renderBody, publicEntry, toRss, toJsonFeed, stats, esc } from "./store.mjs";

const mk = (s, o = {}, i = "a1") => createEntry(s, { title: "Dark mode", body: "We added dark mode.", ...o }, { id: i, now: 1000 });

test("entries start as drafts and are invisible until published", () => {
  const s = newState(); const { entry } = mk(s);
  assert.equal(entry.status, "draft"); assert.equal(published(s).length, 0);
  setStatus(s, "a1", "published", 2000);
  assert.deepEqual(published(s).map((e) => e.slug), ["dark-mode"]);
  setStatus(s, "a1", "draft", 3000); assert.equal(published(s).length, 0);
});

test("validation: title, body, category, slug", () => {
  const s = newState();
  assert.match(createEntry(s, { title: "", body: "x" }, { id: "x", now: 1 }).error, /title/);
  assert.match(createEntry(s, { title: "t", body: " " }, { id: "x", now: 1 }).error, /body/);
  assert.match(mk(s, { category: "huge" }).error, /category/);
  assert.match(mk(s, { slug: "Bad Slug!" }).error, /slug/);
});

test("titles with no usable letters still get a valid slug", () => {
  const s = newState(); assert.equal(mk(s, { title: "A" }, "ab12").entry.slug, "entry-ab12");
});

test("duplicate titles get distinct slugs", () => {
  const s = newState(); mk(s, {}, "a"); mk(s, {}, "b");
  assert.deepEqual(s.entries.map((e) => e.slug), ["dark-mode", "dark-mode-2"]);
});

test("publish dates: back-dating is allowed, the future is not, first date sticks on re-publish", () => {
  const s = newState(); mk(s);
  assert.match(setStatus(s, "a1", "published", 5000, new Date(9000).toISOString()).error, /past/);
  assert.equal(setStatus(s, "a1", "published", 5000, new Date(10).toISOString()).entry.publishedAt, 10);
  setStatus(s, "a1", "draft", 6000); assert.equal(setStatus(s, "a1", "published", 7000).entry.publishedAt, 10);
});

test("ordering is newest first and filters by tag and category", () => {
  const s = newState(); mk(s, { title: "One", tags: "api, Billing" }, "a"); mk(s, { title: "Two", category: "fixed" }, "b");
  setStatus(s, "a", "published", 100); setStatus(s, "b", "published", 200);
  assert.deepEqual(published(s).map((e) => e.title), ["Two", "One"]);
  assert.deepEqual(published(s, { tag: "billing" }).map((e) => e.title), ["One"]);
  assert.deepEqual(published(s, { category: "fixed" }).map((e) => e.title), ["Two"]);
});

test("body renderer escapes HTML, allows only http(s) links, renders lists and emphasis", () => {
  const h = renderBody("<script>alert(1)</script>\n- **bold** and `code`\n- [ok](https://x.dev/a?b=1&c=2)\n[bad](javascript:alert(1))\n\nsecond *para*");
  assert.ok(!h.includes("<script>")); assert.match(h, /&lt;script&gt;/);
  assert.match(h, /<ul><li><strong>bold<\/strong> and <code>code<\/code><\/li>/);
  assert.match(h, /<a href="https:\/\/x\.dev\/a\?b=1&amp;c=2" rel="noopener noreferrer">ok<\/a>/);
  assert.ok(!/href="javascript/.test(h));
  assert.match(h, /<p>second <em>para<\/em><\/p>/);
});

test("a title cannot break out of attributes or feeds", () => {
  const s = newState(); mk(s, { title: '"><img src=x onerror=alert(1)> & ]]>' }); setStatus(s, "a1", "published", 5);
  const rss = toRss(s, { title: "T", link: "https://c.example", description: "d" });
  assert.ok(!rss.includes("<img")); assert.match(rss, /&lt;img/);
  assert.ok(!JSON.stringify(publicEntry(s.entries[0])).includes("createdAt"));
});

test("feeds list only published entries, with absolute permalinks", () => {
  const s = newState(); mk(s, {}, "a"); mk(s, { title: "Draft one" }, "b"); setStatus(s, "a", "published", 86400000);
  const f = toJsonFeed(s, { title: "T", link: "https://c.example" });
  assert.equal(f.items.length, 1); assert.equal(f.items[0].url, "https://c.example/e/dark-mode");
  assert.match(toRss(s, { title: "T", link: "https://c.example", description: "d" }), /<pubDate>Fri, 02 Jan 1970/);
});

test("update and remove; stats", () => {
  const s = newState(); mk(s); setStatus(s, "a1", "published", 50);
  assert.equal(updateEntry(s, "a1", { title: "New title", tags: ["a", "a", "b"] }, 60).entry.tags.length, 2);
  assert.match(updateEntry(s, "zz", {}, 1).error, /no such/);
  assert.deepEqual(stats(s), { total: 1, published: 1, drafts: 0, latest: new Date(50).toISOString() });
  remove(s, "a1"); assert.equal(s.entries.length, 0); assert.equal(esc("<"), "&lt;");
});
