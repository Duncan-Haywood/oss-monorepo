import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, createEntry, updateEntry, remove, publicEntries, stats, renderMarkdown, plainText } from "./store.mjs";

const T0 = Date.UTC(2026, 9, 15);
const mk = (s, o, id = "aa", now = T0) => createEntry(s, { title: "Dark mode", body: "You can now switch.", ...o }, { id, now });

test("validation: title, body, tag, status and date", () => {
  const s = newState();
  assert.match(mk(s, { title: " " }).error, /title/);
  assert.match(mk(s, { body: "" }).error, /body/);
  assert.match(mk(s, { tag: "huge" }).error, /tag must/);
  assert.match(mk(s, { status: "x" }).error, /status/);
  assert.match(mk(s, { publishAt: "not a date" }).error, /publishAt/);
  assert.equal(s.entries.length, 0);
  assert.equal(mk(s, {}).entry.tag, "new");
});

test("drafts and future entries are not public; published and due ones are, newest first", () => {
  const s = newState();
  mk(s, { title: "old", publishAt: T0 - 5000 }, "01");
  mk(s, { title: "draft", status: "draft" }, "02");
  mk(s, { title: "soon", publishAt: T0 + 86400000 }, "03");
  mk(s, { title: "now" }, "04");
  assert.deepEqual(publicEntries(s, T0).map((e) => e.title), ["now", "old"]);
  assert.deepEqual(publicEntries(s, T0 + 2 * 86400000).map((e) => e.title), ["soon", "now", "old"]);
  assert.deepEqual(stats(s, T0), { total: 4, published: 2, scheduled: 1, draft: 1, latest: T0 });
  assert.deepEqual(publicEntries(s, T0, { tag: "fixed" }), []);
});

test("update and remove", () => {
  const s = newState(); mk(s, { status: "draft" }, "ab");
  assert.equal(updateEntry(s, "ab", { status: "published" }, T0 + 1).entry.updatedAt, T0 + 1);
  assert.equal(publicEntries(s, T0 + 1).length, 1);
  assert.match(updateEntry(s, "ab", { title: "" }, T0).error, /empty/);
  assert.match(updateEntry(s, "zz", {}, T0).error, /no such/);
  assert.match(updateEntry(s, "ab", { tag: "q" }, T0).error, /tag/);
  assert.equal(remove(s, "ab").ok, true);
  assert.match(remove(s, "ab").error, /no such/);
});

test("markdown subset escapes everything and only allows http(s) links", () => {
  const h = renderMarkdown("## Hi <script>alert(1)</script>\n\nSome **bold**, *em* and `a<b`.\nSecond [ok](https://x.example/a?b=1&c=2) [bad](javascript:alert(1))\n\n- one\n- <img src=x onerror=1>");
  assert.ok(!/<script|<img/.test(h));
  assert.match(h, /<h3>Hi &lt;script&gt;/); assert.match(h, /<strong>bold<\/strong>/); assert.match(h, /<em>em<\/em>/); assert.match(h, /<code>a&lt;b<\/code>/);
  assert.match(h, /<a href="https:\/\/x\.example\/a\?b=1&amp;c=2" rel="noopener nofollow ugc">ok<\/a>/);
  assert.ok(!/href="javascript/.test(h)); assert.match(h, /<ul><li>one<\/li><li>&lt;img/);
  assert.equal(renderMarkdown(""), "");
});

test("plainText strips markup for the widget", () => {
  assert.equal(plainText("**Bold** and `code` and [docs](https://d.example)\n- item"), "Bold and code and docs (https://d.example)\nitem");
});
