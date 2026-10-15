// Feedback board state. Pure functions over one JSON-serialisable object, no I/O.
import { createHash, randomBytes } from "node:crypto";
import { similar } from "./similar.mjs";

export const STATUSES = ["open", "planned", "in-progress", "shipped", "declined"];
export const newState = () => ({ posts: {}, changelog: [], seq: 0, salt: randomBytes(16).toString("hex") });

const clip = (s, n) => String(s ?? "").replace(/\u0000/g, "").trim().slice(0, n);
// Voters are an opaque cookie id. Only a salted hash is stored, so a leaked state file cannot be replayed as cookies.
export const voterHash = (state, voterId) => createHash("sha256").update(state.salt + String(voterId)).digest("hex").slice(0, 16);

export function addPost(state, { title, body, email, voterId }, now) {
  const t = clip(title, 120);
  if (t.length < 4) throw Object.assign(new Error("title required (4+ characters)"), { status: 400 });
  const id = `p${++state.seq}`;
  const post = { id, title: t, body: clip(body, 2000), status: "open", created: now, votes: [], comments: [], mergedInto: null, email: email ? clip(email, 200).toLowerCase() : null };
  if (voterId) post.votes.push(voterHash(state, voterId));
  state.posts[id] = post;
  return post;
}

// Toggle: a second click removes the vote. Returns {voted, count}.
export function toggleVote(state, id, voterId) {
  const p = live(state, id);
  const h = voterHash(state, voterId);
  const i = p.votes.indexOf(h);
  if (i >= 0) p.votes.splice(i, 1); else p.votes.push(h);
  return { voted: i < 0, count: p.votes.length };
}

export const hasVoted = (state, p, voterId) => Boolean(voterId) && p.votes.includes(voterHash(state, voterId));

export function addComment(state, id, { text, author, admin = false }, now) {
  const p = live(state, id);
  const t = clip(text, 1000);
  if (!t) throw Object.assign(new Error("comment text required"), { status: 400 });
  if (p.comments.length >= 200) throw Object.assign(new Error("comment limit reached"), { status: 429 });
  const c = { at: now, author: admin ? "Team" : clip(author, 40) || "Anonymous", text: t, admin };
  p.comments.push(c);
  return c;
}

function live(state, id) {
  const p = state.posts[id];
  if (!p) throw Object.assign(new Error("no such post"), { status: 404 });
  if (p.mergedInto) return live(state, p.mergedInto);
  return p;
}

export function setStatus(state, id, status, now) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${STATUSES.join(", ")}`), { status: 400 });
  const p = live(state, id);
  if (p.status !== status) { p.status = status; p.statusAt = now; }
  return p;
}

// Merge a duplicate into a target: voters are unioned (no double counting), comments move, the old link redirects.
export function merge(state, fromId, intoId) {
  if (fromId === intoId) throw Object.assign(new Error("cannot merge a post into itself"), { status: 400 });
  const from = state.posts[fromId], into = live(state, intoId);
  if (!from) throw Object.assign(new Error("no such post"), { status: 404 });
  if (into.id === fromId) throw Object.assign(new Error("that would make a loop"), { status: 400 });
  for (const v of from.votes) if (!into.votes.includes(v)) into.votes.push(v);
  into.comments.push(...from.comments);
  into.comments.sort((a, b) => a.at - b.at);
  from.votes = []; from.comments = []; from.mergedInto = into.id;
  // anything already merged into `from` follows it
  for (const q of Object.values(state.posts)) if (q.mergedInto === fromId) q.mergedInto = into.id;
  return into;
}

export function removePost(state, id) {
  if (!state.posts[id]) return false;
  delete state.posts[id];
  for (const q of Object.values(state.posts)) if (q.mergedInto === id) q.mergedInto = null;
  return true;
}

export const visible = (state) => Object.values(state.posts).filter((p) => !p.mergedInto);

// sort: top (default) | new. Declined posts sink unless asked for by status.
export function list(state, { status, sort = "top", q } = {}) {
  let posts = visible(state);
  if (status) posts = posts.filter((p) => p.status === status);
  else posts = posts.filter((p) => p.status !== "declined" && p.status !== "shipped");
  if (q) { const hit = new Map(similar(q, posts.map((p) => ({ id: p.id, text: `${p.title} ${p.body}` })), { min: 0.1, limit: 50 }).map((r) => [r.id, r.score])); posts = posts.filter((p) => hit.has(p.id)).sort((a, b) => hit.get(b.id) - hit.get(a.id)); return posts; }
  return posts.sort(sort === "new" ? (a, b) => b.created - a.created : (a, b) => b.votes.length - a.votes.length || b.created - a.created);
}

export function similarTo(state, text, limit = 5) {
  const pool = visible(state).map((p) => ({ id: p.id, text: `${p.title} ${p.body}` }));
  return similar(text, pool, { min: 0.3, limit }).map((r) => ({ ...r, post: state.posts[r.id] }));
}

export function publish(state, { title, body, tags = [], date }, now) {
  const t = clip(title, 120);
  if (!t) throw Object.assign(new Error("title required"), { status: 400 });
  const entry = { id: `c${state.changelog.length + 1}-${Math.floor(now / 1000)}`, title: t, body: clip(body, 5000), tags: tags.slice(0, 5).map((x) => clip(x, 20)).filter(Boolean), date: clip(date, 10) || new Date(now).toISOString().slice(0, 10) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { status: 400 });
  state.changelog.unshift(entry);
  state.changelog.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entry;
}

export function summary(state) {
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let votes = 0;
  for (const p of visible(state)) { by[p.status]++; votes += p.votes.length; }
  return { posts: visible(state).length, votes, ...by, changelog: state.changelog.length };
}
