import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, addPost, toggleVote, hasVoted, addComment, setStatus, merge, removePost, list, similarTo, publish, summary } from "./board.mjs";

const T = 1_700_000_000_000;

test("a post starts open with its author's vote, and the vote is stored hashed", () => {
  const s = newState();
  const p = addPost(s, { title: "Export to CSV", voterId: "cookie-1" }, T);
  assert.equal(p.status, "open");
  assert.equal(p.votes.length, 1);
  assert.ok(!JSON.stringify(s).includes("cookie-1"));
  assert.ok(hasVoted(s, p, "cookie-1") && !hasVoted(s, p, "cookie-2"));
});

test("votes toggle and never double count", () => {
  const s = newState(); const p = addPost(s, { title: "Dark mode" }, T);
  assert.deepEqual(toggleVote(s, p.id, "a"), { voted: true, count: 1 });
  assert.deepEqual(toggleVote(s, p.id, "b"), { voted: true, count: 2 });
  assert.deepEqual(toggleVote(s, p.id, "a"), { voted: false, count: 1 });
});

test("short titles and unknown ids are rejected with a status", () => {
  const s = newState();
  assert.throws(() => addPost(s, { title: "no" }, T), (e) => e.status === 400);
  assert.throws(() => toggleVote(s, "p99", "a"), (e) => e.status === 404);
  assert.throws(() => setStatus(s, addPost(s, { title: "Something" }, T).id, "bogus", T), (e) => e.status === 400);
});

test("merge unions voters, moves comments, redirects later votes and chains", () => {
  const s = newState();
  const a = addPost(s, { title: "CSV export", voterId: "x" }, T);
  const b = addPost(s, { title: "Export as CSV file", voterId: "x" }, T);
  toggleVote(s, b.id, "y");
  addComment(s, b.id, { text: "need this" }, T + 1);
  merge(s, b.id, a.id);
  assert.equal(a.votes.length, 2, "x counted once, y added");
  assert.equal(a.comments.length, 1);
  assert.equal(toggleVote(s, b.id, "z").count, 3, "a vote on the old link lands on the target");
  const c = addPost(s, { title: "Third duplicate" }, T);
  merge(s, a.id, c.id);
  assert.equal(s.posts[b.id].mergedInto, c.id, "earlier merges follow the target");
  assert.throws(() => merge(s, c.id, b.id), (e) => e.status === 400);
  assert.equal(list(s).length, 1);
});

test("list ranks by votes, hides shipped and declined, and filters by status", () => {
  const s = newState();
  const a = addPost(s, { title: "Alpha feature" }, T), b = addPost(s, { title: "Beta feature" }, T + 1), c = addPost(s, { title: "Gamma feature" }, T + 2);
  toggleVote(s, a.id, "1"); toggleVote(s, a.id, "2"); toggleVote(s, b.id, "1");
  setStatus(s, c.id, "shipped", T);
  assert.deepEqual(list(s).map((p) => p.id), [a.id, b.id]);
  assert.deepEqual(list(s, { status: "shipped" }).map((p) => p.id), [c.id]);
  assert.deepEqual(list(s, { sort: "new" }).map((p) => p.id), [b.id, a.id]);
});

test("similarTo finds a reworded duplicate before posting", () => {
  const s = newState();
  addPost(s, { title: "Export reports to CSV" }, T); addPost(s, { title: "Dark mode" }, T);
  const r = similarTo(s, "csv export of my reports");
  assert.equal(r[0].post.title, "Export reports to CSV");
});

test("changelog is newest first and validates the date", () => {
  const s = newState();
  publish(s, { title: "v1", date: "2026-01-01" }, T); publish(s, { title: "v2", date: "2026-03-01", tags: ["new"] }, T);
  assert.deepEqual(s.changelog.map((c) => c.title), ["v2", "v1"]);
  assert.throws(() => publish(s, { title: "x", date: "March 3" }, T), (e) => e.status === 400);
});

test("removePost frees merged children and summary counts visible posts", () => {
  const s = newState();
  const a = addPost(s, { title: "Target post" }, T), b = addPost(s, { title: "Duplicate one" }, T);
  merge(s, b.id, a.id);
  assert.equal(summary(s).posts, 1);
  removePost(s, a.id);
  assert.equal(s.posts[b.id].mergedInto, null);
  assert.equal(summary(s).posts, 1);
});
