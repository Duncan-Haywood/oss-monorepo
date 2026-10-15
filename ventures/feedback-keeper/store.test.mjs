import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "./store.mjs";
import { findSimilar, tokens } from "./similar.mjs";

const mk = () => { const s = S.newState(); return s; };
const add = (s, title, body = "", opt = {}) => S.submit(s, { title, body, voter: opt.voter }, { moderate: false, now: opt.now ?? 1000 });

test("a vote counts once per voter and toggles off", () => {
  const s = mk(); const p = add(s, "Dark mode please");
  assert.deepEqual(S.vote(s, p.id, "v1", 1), { voted: true, count: 1 });
  assert.deepEqual(S.vote(s, p.id, "v2", 2), { voted: true, count: 2 });
  assert.deepEqual(S.vote(s, p.id, "v1", 3), { voted: false, count: 1 });
});

test("moderated posts stay hidden and unvotable until approved", () => {
  const s = mk(); const p = S.submit(s, { title: "Export to CSV" }, { moderate: true, now: 1 });
  assert.equal(S.visible(s).length, 0);
  assert.throws(() => S.vote(s, p.id, "v", 1), /No such post/);
  S.setStatus(s, p.id, "planned", 2);
  assert.equal(S.visible(s).length, 1);
});

test("titles that are too short are rejected", () => assert.throws(() => add(s0(), "hi"), /at least 4/));
const s0 = () => S.newState();

test("merge keeps each vote once and carries subscribers and comments", () => {
  const s = mk(); const a = add(s, "Dark theme", "", { voter: "v1" }); const b = add(s, "Night mode", "", { voter: "v1" });
  S.vote(s, a.id, "v2", 5); S.subscribe(s, a.id, "A@x.com"); S.comment(s, a.id, "me too", false, 6);
  const into = S.merge(s, a.id, b.id);
  assert.deepEqual(into.votes.sort(), ["v1", "v2"]);
  assert.deepEqual(into.subs, ["a@x.com"]);
  assert.equal(into.comments.length, 1);
  assert.equal(S.visible(s).length, 1);
  assert.throws(() => S.merge(s, b.id, b.id), /Cannot merge/);
});

test("status change notifies subscribers only for real moves off 'open'", () => {
  const s = mk(); const p = add(s, "Slack integration"); S.subscribe(s, p.id, "u@x.com");
  assert.deepEqual(S.setStatus(s, p.id, "planned", 1).notify, ["u@x.com"]);
  assert.deepEqual(S.setStatus(s, p.id, "planned", 2).notify, []);
  assert.throws(() => S.setStatus(s, p.id, "nope", 3), /status must be/);
});

test("trending favours recent votes over old totals", () => {
  const s = mk(); const DAY = 86_400_000, now = 100 * DAY;
  const old = add(s, "Old popular idea", "", { now: now - 60 * DAY });
  for (let i = 0; i < 5; i++) { old.votes.push("o" + i); old.votesAt.push(now - 50 * DAY); }
  const hot = add(s, "Fresh hot idea", "", { now: now - 3 * DAY });
  for (let i = 0; i < 3; i++) { hot.votes.push("h" + i); hot.votesAt.push(now - DAY); }
  assert.equal(S.list(s, { sort: "top", now })[0].id, old.id);
  assert.equal(S.list(s, { sort: "trending", now })[0].id, hot.id);
});

test("list hides shipped and declined by default and filters by status", () => {
  const s = mk(); const a = add(s, "Alpha thing"); const b = add(s, "Beta thing");
  S.setStatus(s, b.id, "shipped", 1);
  assert.deepEqual(S.list(s).map((p) => p.id), [a.id]);
  assert.deepEqual(S.list(s, { status: "shipped" }).map((p) => p.id), [b.id]);
});

test("similar-post detection finds reworded duplicates and ignores unrelated ones", () => {
  const docs = [
    { id: "1", title: "Dark mode", body: "The white background hurts my eyes at night" },
    { id: "2", title: "Export reports as PDF", body: "Send monthly report to my accountant" },
    { id: "3", title: "Slack notifications", body: "Post new signups into a Slack channel" },
  ];
  const r = findSimilar(docs, "Please add a dark theme, white screen is painful at night", 3, 0.2);
  assert.equal(r[0].id, "1");
  assert.ok(!r.some((x) => x.id === "2"));
  assert.deepEqual(findSimilar(docs, "the and of", 3, 0.1), []);
  assert.ok(tokens("Exporting reports").includes("export"));
});

test("unsubscribe tokens are bound to the email and the secret", () => {
  const t = S.unsubToken("k", "a@x.com");
  assert.ok(S.unsubOk("k", "a@x.com", t));
  assert.ok(!S.unsubOk("k", "b@x.com", t));
  assert.ok(!S.unsubOk("other", "a@x.com", t));
});

test("duplicateGroups clusters reworded requests and leaves the rest alone", async () => {
  const { duplicateGroups } = await import("./similar.mjs");
  const docs = [
    { id: "0", title: "Dark mode", body: "the white dashboard hurts my eyes at night" },
    { id: "1", title: "Night theme for the app", body: "" },
    { id: "2", title: "Export reports to PDF", body: "send the monthly report to my accountant" },
    { id: "3", title: "Download report as PDF", body: "" },
    { id: "4", title: "Slack notifications", body: "post new signups into a channel" },
  ];
  const g = duplicateGroups(docs, 0.3).map((x) => x.map((d) => d.id).sort());
  assert.ok(g.some((x) => x.join() === "2,3"), JSON.stringify(g));
  assert.ok(!g.flat().includes("4"));
});
