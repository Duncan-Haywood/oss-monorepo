// State for the board. Plain JSON so a backup is `cp`. All functions mutate and return; the server saves.
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { findSimilar } from "./similar.mjs";

export const STATUSES = ["open", "planned", "in-progress", "shipped", "declined"];
const LIMITS = { title: 120, body: 4000, comment: 2000, email: 254 };
const clip = (s, n) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const newState = () => ({ seq: 1, posts: {}, changelog: [] });
export const cleanEmail = (e) => { const v = clip(e, LIMITS.email).toLowerCase(); return EMAIL.test(v) ? v : null; };
export const newVoterId = () => randomBytes(16).toString("hex");

export function submit(state, { title, body, email, voter }, { moderate, now }) {
  const t = clip(title, LIMITS.title);
  if (t.length < 4) throw Object.assign(new Error("Give the idea a title of at least 4 characters."), { status: 400 });
  const id = String(state.seq++);
  const em = cleanEmail(email);
  const post = { id, title: t, body: clip(body, LIMITS.body), status: "open", createdAt: now, approved: !moderate, votes: voter ? [voter] : [], subs: em ? [em] : [], comments: [], mergedInto: null, votesAt: voter ? [now] : [] };
  state.posts[id] = post;
  return post;
}

// One vote per voter id per post; voting again removes it (a toggle, like every board users know).
export function vote(state, id, voter, now) {
  const p = state.posts[id];
  if (!p || !p.approved || p.mergedInto) throw Object.assign(new Error("No such post."), { status: 404 });
  if (!voter) throw Object.assign(new Error("Missing voter."), { status: 400 });
  const i = p.votes.indexOf(voter);
  if (i >= 0) { p.votes.splice(i, 1); p.votesAt.splice(i, 1); return { voted: false, count: p.votes.length }; }
  p.votes.push(voter); p.votesAt.push(now);
  return { voted: true, count: p.votes.length };
}

export function subscribe(state, id, email) {
  const p = state.posts[id]; const em = cleanEmail(email);
  if (!p || !em) return false;
  if (!p.subs.includes(em)) p.subs.push(em);
  return true;
}
export function unsubscribeAll(state, email) { let n = 0; for (const p of Object.values(state.posts)) { const i = p.subs.indexOf(email); if (i >= 0) { p.subs.splice(i, 1); n++; } } return n; }

export function comment(state, id, body, admin, now) {
  const p = state.posts[id];
  if (!p || !p.approved) throw Object.assign(new Error("No such post."), { status: 404 });
  const b = clip(body, LIMITS.comment);
  if (!b) throw Object.assign(new Error("Empty comment."), { status: 400 });
  const c = { id: String(p.comments.length + 1), body: b, at: now, admin: Boolean(admin) };
  p.comments.push(c);
  return c;
}

// Returns {post, notify}: notify lists subscribers to email when the move is one they care about.
export function setStatus(state, id, status, now) {
  const p = state.posts[id];
  if (!p) throw Object.assign(new Error("No such post."), { status: 404 });
  if (!STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${STATUSES.join(", ")}`), { status: 400 });
  const changed = p.status !== status;
  p.status = status; p.statusAt = now; p.approved = true;
  return { post: p, notify: changed && status !== "open" ? [...p.subs] : [] };
}

// Folding a duplicate into the original keeps every vote exactly once and every subscriber.
export function merge(state, fromId, intoId) {
  const a = state.posts[fromId], b = state.posts[intoId];
  if (!a || !b || a === b || b.mergedInto) throw Object.assign(new Error("Cannot merge those posts."), { status: 400 });
  a.votes.forEach((v, i) => { if (!b.votes.includes(v)) { b.votes.push(v); b.votesAt.push(a.votesAt[i] ?? a.createdAt); } });
  for (const s of a.subs) if (!b.subs.includes(s)) b.subs.push(s);
  b.comments.push(...a.comments.map((c, i) => ({ ...c, id: String(b.comments.length + i + 1) })));
  a.mergedInto = intoId; a.votes = []; a.votesAt = []; a.subs = []; a.approved = true;
  return b;
}

export function addEntry(state, { title, body, postIds }, now) {
  const e = { id: String(state.changelog.length + 1), title: clip(title, LIMITS.title), body: clip(body, LIMITS.body), at: now, postIds: (postIds || []).filter((i) => state.posts[i]) };
  if (!e.title) throw Object.assign(new Error("Entry needs a title."), { status: 400 });
  state.changelog.unshift(e);
  return e;
}

const DAY = 86_400_000;
export function visible(state) { return Object.values(state.posts).filter((p) => p.approved && !p.mergedInto); }

// sort: top (all votes), new, trending (votes in the last 7 days, newer posts get a short head start).
export function list(state, { sort = "top", status = "", q = "", now = Date.now() } = {}) {
  let ps = visible(state);
  if (status) ps = ps.filter((p) => p.status === status);
  else ps = ps.filter((p) => p.status !== "declined" && p.status !== "shipped");
  if (q) { const hits = new Map(findSimilar(ps, q, 50, 0.08).map((r) => [r.id, r.score])); ps = ps.filter((p) => hits.has(p.id)).sort((a, b) => hits.get(b.id) - hits.get(a.id)); return ps; }
  const recent = (p) => p.votesAt.filter((t) => now - t < 7 * DAY).length + (now - p.createdAt < 2 * DAY ? 1 : 0);
  const key = { top: (p) => p.votes.length, new: (p) => p.createdAt, trending: recent }[sort] || ((p) => p.votes.length);
  return ps.sort((a, b) => key(b) - key(a) || b.createdAt - a.createdAt);
}

export const similarTo = (state, text, k = 5) => {
  const ps = visible(state);
  return findSimilar(ps, text, k, 0.25).map((r) => ({ ...r, post: state.posts[r.id] }));
};

export const publicPost = (p, voter) => ({ id: p.id, title: p.title, body: p.body, status: p.status, votes: p.votes.length, voted: Boolean(voter && p.votes.includes(voter)), createdAt: p.createdAt, comments: p.comments.map((c) => ({ id: c.id, body: c.body, at: c.at, team: c.admin })) });

export function summary(state) {
  const ps = Object.values(state.posts);
  const by = Object.fromEntries(STATUSES.map((s) => [s, ps.filter((p) => !p.mergedInto && p.approved && p.status === s).length]));
  return { posts: ps.length, pending: ps.filter((p) => !p.approved).length, merged: ps.filter((p) => p.mergedInto).length, votes: ps.reduce((n, p) => n + p.votes.length, 0), byStatus: by, changelog: state.changelog.length };
}

export const unsubToken = (secret, email) => createHmac("sha256", secret).update(`unsub:${email}`).digest("hex").slice(0, 32);
export function unsubOk(secret, email, tok) {
  const a = Buffer.from(unsubToken(secret, email)), b = Buffer.from(String(tok || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}
