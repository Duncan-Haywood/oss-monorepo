import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import * as C from "./content.mjs";
import { exampleDesk, emptyDesk, normalizeDesk, contentCalendar } from "./engine.mjs";
import { handler } from "./server.mjs";

const TODAY = "2026-11-02";
const desk = () => exampleDesk(TODAY);

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root, "copy platform/llm/byok.mjs over ventures/babysitting-business-kit/byok.mjs");
});

test("the topic bank has 60+ topics across the required kinds, and faith topics only when faith is on", () => {
  assert.ok(C.TOPICS.length >= 60, `${C.TOPICS.length} topics`);
  assert.equal(new Set(C.TOPICS.map((t) => t.id)).size, C.TOPICS.length, "ids are unique");
  for (const cat of ["safety", "activities", "routines", "date night", "seasonal", "faith"]) assert.ok(C.TOPICS.some((t) => t.cat === cat), cat);
  assert.ok(C.TOPICS.some((t) => t.id === "back-to-school") && C.TOPICS.some((t) => t.id === "holiday-parties"));
  const off = C.topicBank({ showFaith: false }), on = C.topicBank({ showFaith: true });
  assert.ok(off.every((t) => !t.faith));
  assert.ok(on.length - off.length >= 8);
  for (const t of C.TOPICS) {
    assert.equal(t.outline.length, 3, t.id);
    assert.match(t.keywordPattern, /^[\w'’ -]+ in \{town\}$/, t.id);
    for (const m of t.months) assert.ok(m >= 1 && m <= 12, t.id);
  }
  assert.equal(C.localKeyword(C.topicById("date-night-ideas"), { city: "Springfield" }), "date night babysitter in Springfield");
  assert.equal(C.topicBank({}, { month: 7 }).filter((t) => t.months.length).length > 0, true);
});

test("every caption fits its channel, carries the placeholder (bulletin aside) and the sitter's town", () => {
  for (const profile of [desk().profile, { ...emptyDesk().profile, name: "A Very Long Business Owner Name", area: "Springfield, Riverside, Shelbyville, Capital City and every neighborhood in between", certifications: ["CPR", "First Aid", "Water Safety Instructor", "Early Childhood Education credential"], showFaith: true }]) {
    for (const t of C.topicBank(profile)) {
      for (const ch of C.CHANNEL_IDS) {
        const text = C.caption(t, ch, profile);
        const spec = C.CHANNELS[ch];
        assert.ok(text.length <= spec.target, `${t.id}/${ch} is ${text.length} > ${spec.target}`);
        if (spec.max) assert.ok(text.length <= spec.max);
        if (ch !== "bulletin" && ch !== "blog") assert.ok(text.includes(C.PLACEHOLDER), `${t.id}/${ch} lost the placeholder`);
      }
      assert.ok(C.caption(t, "blog", profile).includes(C.localKeyword(t, profile)), `${t.id} blog description has the search phrase`);
      const tags = C.caption(t, "instagram", profile).match(/#\w+/g) || [];
      assert.ok(tags.length <= 5);
    }
  }
});

test("a 12-week plan uses the season's topics, never repeats, rotates channels, and keeps faith to at most every fourth week", () => {
  const plan = C.contentPlan(TODAY, 12, desk().profile);
  assert.equal(plan.length, 12);
  assert.equal(new Set(plan.map((p) => p.topicId)).size, 12);
  assert.deepEqual(plan.slice(0, 5).map((p) => p.channel), C.CHANNEL_IDS);
  for (const p of plan) {
    const t = C.topicById(p.topicId);
    assert.ok(!t.months.length || t.months.includes(Number(p.date.slice(5, 7))), `${p.topicId} in ${p.date}`);
  }
  assert.ok(plan.filter((p) => C.topicById(p.topicId).faith).length <= 3);
  const noFaith = C.contentPlan(TODAY, 30, { ...desk().profile, showFaith: false });
  assert.ok(noFaith.every((p) => !C.topicById(p.topicId).faith));
  // the engine's calendar still works as before
  assert.equal(contentCalendar(TODAY, 12, desk().profile).length, 12);
});

test("posts survive normalizeDesk, get unique slugs, and template drafts cannot be published until filled in", () => {
  const d = desk();
  const t = C.topicById("rainy-day");
  const a = C.addPost(d, { ...C.postFromTopic(t, d.profile), source: "template" }, TODAY, "post_a");
  const b = C.addPost(d, { title: a.title, body: "x" }, TODAY, "post_b");
  assert.equal(a.slug, "rainy-day-activities-from-things-already-in-your-house");
  assert.equal(b.slug, `${a.slug}-2`);
  assert.equal(normalizeDesk(JSON.parse(JSON.stringify(d))).posts.length, 2);
  assert.equal(normalizeDesk({}).posts, undefined);

  let r = C.approvePost(d, "post_a", TODAY);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.blocking && i.text.includes(C.PLACEHOLDER)));
  assert.equal(C.publishedPosts(d).length, 0);

  // The sitter writes their own words but mentions a child from the desk.
  C.updatePost(d, "post_a", { body: "Last week Leo and I built a pillow fort and read under it with a flashlight. It was a hit, and it took ten minutes to set up.\n\n## Treasure hunt\n\n- Picture clues for little ones" }, TODAY);
  r = C.approvePost(d, "post_a", TODAY);
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.find((i) => i.names).names, ["Leo"]);
  r = C.approvePost(d, "post_a", TODAY, { namesConsented: true });
  assert.equal(r.ok, true);
  assert.equal(C.publishedPosts(d)[0].published, TODAY);

  C.unpublishPost(d, "post_a", TODAY);
  assert.equal(C.publishedPosts(d).length, 0);
});

test("review flags quotes and unbacked claims without blocking", () => {
  const d = emptyDesk();
  const p = C.addPost(d, { title: "Hi", body: `I'm the best sitter in town. "They are wonderful and the kids adore them every time," a mom said. More words here to pass the length check easily.` }, TODAY);
  const issues = C.reviewPost(d, p);
  assert.ok(issues.some((i) => !i.blocking && /quotation/.test(i.text)));
  assert.ok(issues.some((i) => !i.blocking && /claim/.test(i.text)));
  assert.equal(C.approvePost(d, p.id, TODAY).ok, true);
});

test("Markdown is rendered with everything escaped and only safe links", () => {
  const html = C.renderMarkdown("## Hi <b>\n\nA **bold** and *soft* [link](https://example.com) [bad](javascript:alert(1)) <script>x</script>\n\n- one\n- two");
  assert.match(html, /<h2>Hi &lt;b&gt;<\/h2>/);
  assert.match(html, /<strong>bold<\/strong> and <em>soft<\/em> <a href="https:\/\/example.com">link<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

function publishedDesk() {
  const d = desk();
  const p = C.addPost(d, { title: "Our snow day fort", body: "We built a fort from couch cushions and read three books inside it before the snow stopped. <script>alert(1)</script>", keyword: "snow day babysitter in Springfield" }, TODAY, "post_s");
  C.addPost(d, { title: "Draft only", body: C.PLACEHOLDER }, TODAY, "post_d");
  assert.equal(C.approvePost(d, p.id, TODAY).ok, true);
  return d;
}

test("blog pages: an index and a page per published post, drafts never rendered", () => {
  const d = publishedDesk();
  const page = C.renderPostPage(d, C.publishedPosts(d)[0]);
  assert.match(page, /<title>Our snow day fort \| Grace Notes Babysitting<\/title>/);
  assert.match(page, /"@type":"BlogPosting"/);
  assert.doesNotMatch(page, /<script>alert/);
  JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page)[1]);
  const index = C.renderBlogIndex(d);
  assert.match(index, /href="\/site\/blog\/our-snow-day-fort"/);
  assert.doesNotMatch(index, /Draft only/);
  assert.equal(C.blogRoute(d, "/site/blog/draft-only"), null);
  assert.equal(C.blogRoute(d, "/site/blogger"), null);
  assert.match(C.blogRoute(d, "/site/blog/"), /<h1>Blog<\/h1>/);
  const files = C.blogFiles(d);
  assert.deepEqual(Object.keys(files), ["blog/index.html", "blog/our-snow-day-fort.html"]);
  assert.match(files["blog/index.html"], /href="our-snow-day-fort.html"/);
  assert.match(files["blog/our-snow-day-fort.html"], /href="..\/index.html"/);
  assert.deepEqual(C.blogFiles(emptyDesk()), {});
});

test("the zip holds each file intact", () => {
  const files = { "index.html": "<p>home</p>", "blog/a.html": "<p>é ✓</p>" };
  const zip = Buffer.from(C.zipFiles(files));
  assert.equal(C.crc32(new TextEncoder().encode("123456789")), 0xcbf43926); // the standard check value
  let at = 0;
  const seen = {};
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18), nameLen = zip.readUInt16LE(at + 26);
    const name = zip.subarray(at + 30, at + 30 + nameLen).toString("utf8");
    seen[name] = zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size).toString("utf8");
    at += 30 + nameLen + size;
  }
  assert.deepEqual(seen, files);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
  void inflateRawSync; // stored entries need no inflate
});

// ---------- AI drafting with a mock fetch ----------

function mockFetch(reply, { status = 200 } = {}) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 400, status, json: async () => reply }; };
  f.calls = calls;
  return f;
}

test("the prompt holds the sitter's public profile and the topic, never family data, and forbids invention", () => {
  const d = desk();
  const prompt = C.aiPrompt(C.topicById("bedtime-routine"), d.profile);
  assert.match(prompt, /Town: Springfield/);
  assert.match(prompt, /evening babysitter in Springfield/);
  for (const secret of ["Leo", "Mia", "Rivera", "peanut", "555-0111", "12 Oak St", "Hannah"]) assert.ok(!prompt.includes(secret), secret);
  assert.doesNotMatch(prompt, /Faith activities/); // not a faith topic
  assert.match(C.aiPrompt(C.topicById("bedtime-prayers"), d.profile), /Faith activities offered when parents ask/);
  assert.match(C.AI_SYSTEM, /Never invent anecdotes/);
  assert.match(C.AI_SYSTEM, /testimonials/);
  assert.ok(C.AI_SYSTEM.includes(C.PLACEHOLDER));
});

test("Anthropic from the browser: the sitter's key, the direct-browser header, a draft that still needs the sitter", async () => {
  const f = mockFetch({ content: [{ type: "text", text: "TITLE: A calm bedtime while you're out\n\nKids sleep better with the same steps.\n\n## Your steps\n\n- Bath, books, bed" }], usage: { input_tokens: 300, output_tokens: 120 } });
  const d = desk();
  const r = await C.draftPost({ provider: "anthropic", apiKey: "sk-sitter-own", browser: true }, C.topicById("bedtime-routine"), d.profile, { fetch: f });
  assert.equal(r.source, "model");
  assert.equal(r.title, "A calm bedtime while you're out");
  assert.ok(r.body.includes(C.PLACEHOLDER), "placeholder inserted when the model left it out");
  assert.equal(f.calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(f.calls[0].init.headers["x-api-key"], "sk-sitter-own");
  assert.equal(f.calls[0].init.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(f.calls[0].body.system, C.AI_SYSTEM);
  const post = C.addPost(d, r, TODAY);
  assert.equal(post.status, "draft");
  assert.equal(C.approvePost(d, post.id, TODAY).ok, false, "an untouched AI draft cannot be published");
});

test("Ollama needs no key; a failed call or no config falls back to the template", async () => {
  const f = mockFetch({ choices: [{ message: { content: `TITLE: Rainy days\n\n${C.PLACEHOLDER}\n\nTape roads for toy cars.` } }] });
  const r = await C.draftPost({ provider: "ollama", model: "llama3.2" }, C.topicById("rainy-day"), desk().profile, { fetch: f });
  assert.equal(r.source, "model");
  assert.equal(f.calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.equal(f.calls[0].init.headers.authorization, undefined);
  assert.equal(r.body.split(C.PLACEHOLDER).length, 2, "placeholder appears once");

  const bad = await C.draftPost({ provider: "openai", apiKey: "k", model: "m" }, C.topicById("rainy-day"), desk().profile, { fetch: mockFetch({}, { status: 500 }) });
  assert.equal(bad.source, "template");
  assert.match(bad.error, /HTTP 500/);
  const none = await C.draftPost(null, C.topicById("rainy-day"), desk().profile, { fetch: () => { throw new Error("must not be called"); } });
  assert.equal(none.source, "template");
  assert.ok(none.body.startsWith(C.PLACEHOLDER));
});

// ---------- the server ----------

async function serve(state, env, fetchImpl) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, () => Date.parse("2026-11-02T15:00:00Z"), fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)), saves: () => saves };
}

test("the server serves approved posts under /site/blog and the content modules", async () => {
  const s = await serve({ desk: publishedDesk() }, {});
  try {
    assert.match(await (await fetch(`${s.base}/site/blog`)).text(), /Our snow day fort/);
    assert.match(await (await fetch(`${s.base}/site/blog/our-snow-day-fort`)).text(), /couch cushions/);
    assert.equal((await fetch(`${s.base}/site/blog/draft-only`)).status, 404);
    for (const f of ["content.mjs", "content-ui.mjs", "byok.mjs"]) assert.equal((await fetch(`${s.base}/${f}`)).headers.get("content-type"), "text/javascript; charset=utf-8");
  } finally { await s.close(); }
});

test("POST /api/draft uses the server's LLM_* env, needs the admin key, and saves a draft", async () => {
  const f = mockFetch({ choices: [{ message: { content: "TITLE: Fall nights\n\nA standing night helps." } }] });
  const state = { desk: desk() };
  const env = { ADMIN_KEY: "admin", LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "https://llm.example/v1", LLM_API_KEY: "sitter-key", LLM_MODEL: "some-model" };
  const s = await serve(state, env, f);
  try {
    assert.equal((await fetch(`${s.base}/api/draft`, { method: "POST", body: "{}" })).status, 401);
    const r = await fetch(`${s.base}/api/draft`, { method: "POST", headers: { authorization: "Bearer admin" }, body: JSON.stringify({ topicId: "fall-weekly-night" }) });
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.source, "model");
    assert.equal(out.post.status, "draft");
    assert.ok(out.post.body.includes(C.PLACEHOLDER));
    assert.equal(f.calls[0].url, "https://llm.example/v1/chat/completions");
    assert.equal(f.calls[0].init.headers.authorization, "Bearer sitter-key");
    assert.equal(f.calls[0].body.model, "some-model");
    assert.equal(state.desk.posts.length, 1);
    assert.equal(s.saves(), 1);
    assert.equal((await fetch(`${s.base}/api/draft`, { method: "POST", headers: { authorization: "Bearer admin" }, body: JSON.stringify({ topicId: "nope" }) })).status, 400);
  } finally { await s.close(); }
});

test("with no LLM_* set, /api/draft returns the template draft and calls nothing", async () => {
  const state = { desk: desk() };
  const s = await serve(state, { ADMIN_KEY: "admin" }, () => { throw new Error("no network"); });
  try {
    const out = await (await fetch(`${s.base}/api/draft`, { method: "POST", headers: { authorization: "Bearer admin" }, body: JSON.stringify({ topicId: "rainy-day" }) })).json();
    assert.equal(out.source, "template");
    assert.equal(out.configured, false);
  } finally { await s.close(); }
});
