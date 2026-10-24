import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "./studio.mjs";

const answers = S.normalizeAnswers({
  topic: "Bakery launch", name: "Rosa at Juniper Bakery", about: "I bake sourdough for cafes in Leeds and teach small-batch baking.",
  audience: "independent cafe owners who want a better bread supplier", problem: "bread arrives late, stale by lunchtime, and the supplier never answers the phone",
  outcome: "fresh loaves before opening and one person to call",
  stories: [
    "We lost our biggest cafe client in week two because a delivery came at 9:30. I rebuilt the route so the first drop is at 6:45. Lesson: reliability sells more bread than flavour.",
    "A customer asked why our loaves cost more. I showed her the 36-hour ferment. She now orders twice a week.",
    "Our first oven broke on a Friday. We baked at a friend's pizzeria overnight. Nobody noticed, and I learned to keep a backup plan written down.",
  ],
  opinions: ["Most cafes should stock fewer breads, not more."], tips: ["Order bread for the day you have, not the day you hope for."],
  proof: ["14 cafes supplied every morning since March"], offer: "Book a free tasting for your cafe", link: "https://example.com/tasting",
  keywords: ["sourdough wholesale", "cafe bread supplier"], banned: ["game-changer"],
  platforms: S.PLATFORM_IDS, hours: 8,
});
const interview = { id: "t1", topic: "Bakery launch", createdAt: "2026-10-20", answers };
const START = "2026-11-02"; // a Monday

test("every question maps to an answer field, and every platform's formats exist", () => {
  const keys = Object.keys(S.emptyAnswers());
  for (const q of S.QUESTIONS) assert.ok(keys.includes(q.id), q.id);
  for (const p of S.PLATFORMS) for (const f of p.formats) assert.equal(S.FORMATS[f].platform, p.id);
  assert.equal(S.PLATFORMS.length, 14);
});

test("normalizeAnswers cleans hostile or partial input", () => {
  const a = S.normalizeAnswers({ about: 42, stories: "one\ntwo", platforms: ["x", "myspace", "x"], hours: 999, link: "javascript:alert(1)", voice: { formal: "lots" } });
  assert.equal(a.about, "42");
  assert.deepEqual(a.stories, ["one", "two"]);
  assert.deepEqual(a.platforms, ["x"]);
  assert.equal(a.hours, 60);
  assert.equal(a.link, "");
  assert.equal(a.voice.formal, 40);
});

test("splitList: stories by blank line, lists by line, tags by comma", () => {
  assert.deepEqual(S.splitList("a b\nc\n\n d \n", "stories"), ["a b c", "d"]);
  assert.deepEqual(S.splitList("- one\n* two\n\nthree", "list"), ["one", "two", "three"]);
  assert.deepEqual(S.splitList("a, b ,\nc", "tags"), ["a", "b", "c"]);
  assert.equal(S.joinList(["a", "b"], "stories"), "a\n\nb");
});

test("state: import, export round trip and storage that throws", () => {
  const state = { version: 1, interviews: [interview, { ...interview }], activeId: "t1", startDate: START };
  const back = S.importState(JSON.stringify(state));
  assert.equal(back.interviews.length, 2);
  assert.notEqual(back.interviews[0].id, back.interviews[1].id, "duplicate ids are made unique");
  assert.deepEqual(back.interviews[0].answers, answers);
  assert.throws(() => S.importState("not json"), /not valid JSON/);
  assert.throws(() => S.importState("{}"), /no interviews/);
  // A single exported interview also imports.
  assert.equal(S.importState(JSON.stringify(interview)).interviews.length, 1);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  assert.equal(S.loadState(broken), null);
  assert.equal(S.saveState(broken, back), false);
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(S.saveState(ok, back), true);
  assert.deepEqual(S.loadState(ok), back);
});

test("measure: X counts links as 23, Bluesky counts graphemes", () => {
  assert.equal(S.measure("hi https://example.com/a/very/long/path/that/goes/on", "x"), 3 + 23);
  assert.equal(S.measure("👩‍👩‍👧", "graphemes"), 1);
  assert.equal(S.measure("👩‍👩‍👧", "chars") > 1, true);
});

test("clip and fitWith stay under the limit and keep the tail", () => {
  const long = "word ".repeat(100).trim();
  const c = S.clip(long, 50);
  assert.ok(S.measure(c) <= 50);
  assert.ok(c.endsWith("…"));
  assert.ok(!S.clip(long, 50, "chars", true).endsWith("…"));
  const t = S.fitWith(long, "\n\nhttps://example.com/x", 280, "x");
  assert.ok(S.measure(t, "x") <= 280);
  assert.ok(t.endsWith("https://example.com/x"));
});

test("bannedHits matches whole words only, case-insensitively", () => {
  assert.deepEqual(S.bannedHits("This is a Game-Changer.", ["game-changer", "game"]), ["game-changer", "game"]);
  assert.deepEqual(S.bannedHits("gamely", ["game"]), []);
});

test("hashtags come only from the user's keywords", () => {
  assert.deepEqual(S.hashtags(["sourdough wholesale", "café bread", "sourdough wholesale"], 5), ["#SourdoughWholesale", "#CaféBread"]);
  assert.deepEqual(S.hashtags([], 5), []);
});

test("plan: fits the hours, never exceeds the budget, reports what it cannot cover", () => {
  for (const hours of [0, 0.5, 1, 3, 8, 20, 60]) {
    const p = S.planCadence(S.PLATFORM_IDS, hours);
    assert.ok(p.usedPerWeek * 4 <= hours * 60 * 4 + 3, `${hours}h over budget`);
    for (const r of p.rows) assert.ok(r.perMonth <= S.FORMATS[r.format].ideal);
  }
  const tiny = S.planCadence(["linkedin", "youtube"], 1);
  assert.equal(tiny.rows.find((r) => r.format === "youtube-video").status, "skipped");
  assert.match(tiny.notes.join(" "), /Not enough time for YouTube long video/);
  const lots = S.planCadence(["linkedin", "newsletter"], 40);
  assert.ok(lots.rows.every((r) => r.status === "ideal"));
  assert.match(lots.notes.join(" "), /replying to comments/);
  assert.match(S.planCadence([], 5).notes[0], /Pick at least one platform/);
  assert.match(S.planCadence(["x"], 0).notes[0], /hours/);
});

test("plan: each platform gets its main format before any platform gets a second piece", () => {
  const p = S.planCadence(["x", "linkedin", "tiktok"], 1.5); // 360 min / 4 weeks
  for (const id of ["x-post", "linkedin-post", "tiktok-video"]) assert.ok(p.rows.find((r) => r.format === id).perMonth >= 1, id);
});

test("dates: Monday helper and day arithmetic in UTC", () => {
  assert.equal(S.nextMonday("2026-10-20"), "2026-10-26");
  assert.equal(S.nextMonday("2026-10-26"), "2026-10-26");
  assert.equal(S.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(S.isISODate("2026-02-30"), false);
});

test("calendar: 28 days, counts match the plan, weekday-only formats avoid weekends", () => {
  const plan = S.planCadence(answers.platforms, answers.hours);
  const slots = S.buildCalendar(plan, START, answers);
  const days = new Set(slots.map((s) => s.date));
  for (const d of days) assert.ok(d >= START && d <= S.addDays(START, 27), d);
  for (const r of plan.rows) assert.equal(slots.filter((s) => s.format === r.format).length, r.perMonth, r.format);
  for (const s of slots) if (S.FORMATS[s.format].weekdays) assert.ok(![0, 6].includes(S.weekday(s.date)), `${s.format} on ${s.date}`);
  assert.equal(new Set(slots.map((s) => s.id)).size, slots.length, "slot ids are unique");
  for (const s of slots.filter((x) => x.format === "reddit-post")) assert.notEqual(s.angle.kind, "offer");
  for (const s of slots.filter((x) => S.FORMATS[x.format].deep)) assert.ok(["story", "opinion", "tip", "problem", "about"].includes(s.angle.kind), s.id);
  // Offer at most about one piece in five.
  const offers = slots.filter((s) => s.angle.kind === "offer").length;
  assert.ok(offers > 0 && offers <= Math.ceil(slots.length / 4), `${offers} offers in ${slots.length}`);
});

test("angle sequence: problem first, materials interleaved, offer every fifth", () => {
  const seq = S.angleSequence(answers);
  assert.equal(seq[0].kind, "problem");
  assert.deepEqual(seq.slice(1, 5).map((a) => a.kind), ["story", "opinion", "tip", "offer"]);
  assert.deepEqual(S.angleSequence(S.emptyAnswers()), []);
});

test("drafts: every draft fits its hard limits and uses no number the user did not give", () => {
  const { drafts } = S.generate(interview, START);
  assert.ok(drafts.length > 50);
  const given = new Set(JSON.stringify(answers).match(/\d+/g));
  for (const d of drafts) {
    const f = S.FORMATS[d.format];
    for (const spec of f.fields) if (spec.max && !spec.soft) assert.ok(S.measure(d.fields[spec.key] || "", spec.unit) <= spec.max, `${d.slotId} ${spec.key}`);
    if (f.parts) {
      if (f.parts.maxItems) assert.ok(d.parts.length <= f.parts.maxItems, d.slotId);
      for (const p of d.parts) assert.ok(!f.parts.max || S.measure(p, f.parts.unit) <= f.parts.max, `${d.slotId} part`);
    }
    assert.ok(d.text.trim().length > 0, `${d.slotId} empty`);
    // Numbers allowed: the user's own, and thread numbering (n/N). Rendered labels
    // ("Slide 2") and the spoken-length estimate are the tool's, so check content only.
    const text = [...Object.entries(d.fields).filter(([k]) => k !== "duration").map(([, v]) => v), ...d.parts.map((p) => p.replace(/ \d+\/\d+$/, ""))].join(" ");
    for (const n of text.match(/\d+/g) || []) assert.ok(given.has(n), `${d.slotId} invented ${n}`);
  }
});

test("drafts: platform-specific shapes", () => {
  const { drafts } = S.generate(interview, START);
  const one = (f) => drafts.find((d) => d.format === f);
  assert.ok(one("x-thread").parts.every((p, i, all) => p.endsWith(`${i + 1}/${all.length}`)));
  for (const f of ["instagram-feed", "instagram-reel", "instagram-carousel", "tiktok-video"]) {
    for (const d of drafts.filter((x) => x.format === f)) assert.doesNotMatch(d.fields.caption, /https?:\/\//, `${f} caption has a link`);
  }
  for (const d of drafts.filter((x) => x.format === "reddit-post")) assert.doesNotMatch(d.text, /https?:\/\//);
  const blog = one("blog-article");
  assert.ok(blog.fields.seoTitle.length <= 60 && blog.fields.meta.length <= 160);
  assert.equal(blog.fields.slug, S.slugify(blog.fields.seoTitle));
  assert.match(blog.fields.body, /^# /);
  const nl = one("newsletter");
  assert.ok(nl.fields.subject && nl.fields.body.includes("Rosa at Juniper Bakery"));
  const reel = one("instagram-reel");
  assert.ok(reel.fields.hook && reel.parts.length >= 1 && reel.fields.cta);
  assert.match(reel.fields.duration, /seconds/);
  const car = one("instagram-carousel");
  assert.ok(car.parts.length >= 2 && car.parts.length <= 10);
  assert.ok(one("youtube-video").fields.title.length <= 100);
  assert.ok(one("pinterest-pin").fields.description.length <= 500);
});

test("drafts: banned words are avoided in scaffolding and flagged in the user's own text", () => {
  const a = { ...answers, banned: ["Unpopular", "Hot", "I'll", "Quick", "Try"], opinions: ["Fewer breads is a game-changer."], tips: ["Try smaller orders."] };
  const { drafts } = S.generate({ ...interview, answers: a }, START);
  const op = drafts.find((d) => d.angle.kind === "opinion" && d.format === "linkedin-post");
  if (op) assert.doesNotMatch(op.text, /Unpopular opinion|Hot take|I'll say it/);
  const a2 = { ...answers, banned: ["game-changer"], opinions: ["Fewer breads is a game-changer."] };
  const flagged = S.generate({ ...interview, answers: a2 }, START).drafts.filter((d) => d.angle.kind === "opinion");
  assert.ok(flagged.length && flagged.every((d) => d.warnings.some((w) => /banned list: game-changer/.test(w))));
});

test("drafts: an almost empty interview still yields something honest, never invented", () => {
  const a = S.normalizeAnswers({ about: "I fix bikes in Bristol.", platforms: ["x", "linkedin"], hours: 2 });
  const { drafts } = S.generate({ ...interview, answers: a }, START);
  assert.ok(drafts.length > 0);
  for (const d of drafts) assert.match(d.text, /I fix bikes in Bristol/);
  const none = S.generate({ ...interview, answers: S.normalizeAnswers({ platforms: ["x"], hours: 2 }) }, START).drafts;
  for (const d of none) assert.ok(d.warnings.some((w) => /answer more of the interview/.test(w)));
});

test("fitDraft cuts over-long model text and warns", () => {
  const d = { slotId: "s", date: START, format: "x-post", platform: "x", title: "", fields: { text: "a ".repeat(400) }, parts: [], text: "", warnings: [], source: "model", angle: { kind: "story", index: 0 } };
  const out = S.fitDraft(d, answers);
  assert.ok(S.measure(out.text, "x") <= 280);
  assert.match(out.warnings.join(" "), /cut to 280/);
  const soft = S.fitDraft({ ...d, format: "newsletter", platform: "newsletter", fields: { subject: "s".repeat(80), preview: "p", body: "b" } }, answers);
  assert.equal(soft.fields.subject.length, 80, "soft limits warn but do not cut");
  assert.match(soft.warnings.join(" "), /usual guideline/);
});

test("CSV: header, quoting, formula injection guard", () => {
  const { drafts } = S.generate(interview, START);
  const csv = S.toCSV(drafts);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "date,platform,format,title,text");
  assert.ok(csv.includes('"'), "multi-line text is quoted");
  assert.equal(S.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(S.csvCell("-1"), "'-1");
  assert.equal(S.csvCell("plain"), "plain");
  // Row count: parse quoted fields properly.
  let rows = 0, inQ = false;
  for (let i = 0; i < csv.length; i++) { const c = csv[i]; if (c === '"') inQ = !inQ; else if (c === "\n" && !inQ) rows++; }
  assert.equal(rows, drafts.length + 1);
});

test("Markdown and JSON exports carry the posting note and every draft", () => {
  const { plan, drafts } = S.generate(interview, START);
  const md = S.toMarkdown(drafts, plan, interview);
  assert.match(md, /does not post anywhere/);
  assert.match(md, /fake reviews/);
  assert.equal((md.match(/^### /gm) || []).length, drafts.length);
  const js = JSON.parse(S.toJSON(drafts, plan, interview));
  assert.equal(js.drafts.length, drafts.length);
  assert.match(js.note, /label AI-generated content/);
});

test("generate is deterministic", () => {
  assert.deepEqual(S.generate(interview, START), S.generate(interview, START));
});
