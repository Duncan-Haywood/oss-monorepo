// Help-center state and reports. Pure functions over one plain object.
import { slugify, plain, headings } from "./markdown.mjs";
import { buildIndex, search, tokens } from "./search.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const oneLine = (s, n) => clean(s, n).replace(/\s+/g, " ");

export function newState() {
  return { settings: { name: "Help Center", tagline: "Search for answers", contact: "" }, articles: {}, queries: {}, feedback: [], seq: 1, rev: 0 };
}

export function updateSettings(state, f) {
  const s = state.settings;
  if (f.name !== undefined) s.name = oneLine(f.name, 80) || "Help Center";
  if (f.tagline !== undefined) s.tagline = oneLine(f.tagline, 140);
  if (f.contact !== undefined) {
    const c = oneLine(f.contact, 300);
    if (c && !/^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+)$/i.test(c)) throw new Error("contact must be an https:// link or an email address");
    s.contact = c;
  }
  state.rev++; return s;
}
export const contactHref = (c) => (!c ? "" : /^https?:|^mailto:/i.test(c) ? c : `mailto:${c}`);

export function saveArticle(state, f, now) {
  const title = oneLine(f.title, 140); if (!title) throw new Error("give the article a title");
  const body = clean(f.body, 60_000); if (!body) throw new Error("the article is empty");
  const existing = f.id ? state.articles[f.id] : null;
  if (f.id && !existing) throw new Error("no such article");
  let slug = slugify(f.slug || title) || "article";
  const taken = (s) => Object.values(state.articles).some((a) => a.slug === s && a.id !== existing?.id);
  if (f.slug && taken(slug)) throw new Error(`the address "${slug}" is already used by another article`);
  for (let n = 2; taken(slug); n++) slug = `${slugify(f.slug || title).slice(0, 55)}-${n}`;
  const status = f.status === "published" ? "published" : "draft";
  const tags = [...new Set(String(f.tags || "").split(",").map((t) => oneLine(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10);
  const a = existing || { id: `a${state.seq++}`, created: now, views: 0, yes: 0, no: 0 };
  Object.assign(a, { slug, title, body, tags, status, collection: oneLine(f.collection, 60) || "General", updated: now });
  state.articles[a.id] = a; state.rev++; return a;
}
export const removeArticle = (state, id) => (state.articles[id] ? (delete state.articles[id], state.rev++, true) : false);
export const published = (state) => Object.values(state.articles).filter((a) => a.status === "published");
export const bySlug = (state, slug) => Object.values(state.articles).find((a) => a.slug === slug);

// Bulk import: articles separated by a line of =====, each optionally starting with --- front matter --- (title, collection, tags, status, slug).
export function importMarkdown(state, text, now) {
  let n = 0; const errors = [];
  for (const [i, doc] of String(text).replace(/\r\n?/g, "\n").split(/^={5,}\s*$/m).entries()) {
    if (!doc.trim()) continue;
    const m = /^\s*---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(doc);
    const meta = {}; let body = doc.trim();
    if (m) { for (const line of m[1].split("\n")) { const k = /^(\w+):\s*(.*)$/.exec(line); if (k) meta[k[1].toLowerCase()] = k[2].trim(); } body = m[2].trim(); }
    if (!meta.title) { const h = /^#\s+(.+)$/m.exec(body); if (h) { meta.title = h[1].trim(); body = body.replace(/^#\s+.+\n?/m, "").trim(); } }
    try { saveArticle(state, { ...meta, body, status: meta.status || "draft", slug: undefined }, now); n++; } catch (e) { errors.push(`article ${i + 1}: ${e.message}`); }
  }
  return { imported: n, errors };
}

let cache = new WeakMap();
export function indexOf(state, { drafts = false } = {}) {
  let c = cache.get(state); if (!c || c.rev !== state.rev) { c = { rev: state.rev }; cache.set(state, c); }
  const key = drafts ? "all" : "pub";
  if (!c[key]) c[key] = buildIndex((drafts ? Object.values(state.articles) : published(state)).map((a) => ({ id: a.id, title: a.title, headings: headings(a.body), tags: a.tags, body: plain(a.body) })));
  return c[key];
}
export function find(state, query, limit = 10) { return search(indexOf(state), query, { limit }).map((r) => ({ ...r, article: state.articles[r.id] })); }

// Queries are kept as normalized word lists. Anything that looks like an email address or a long number is dropped before storing.
export function normalizeQuery(q) {
  const s = String(q ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 100 || /@|\d{6,}|https?:/.test(s)) return "";
  return (s.match(/[\p{L}\p{N}]+/gu) || []).join(" ");
}
// `count` is how many results matched every word of the query: a result that matches only some words does not answer the question.
export function logSearch(state, q, count, now) {
  const key = normalizeQuery(q); if (!key) return false;
  const r = state.queries[key] || (state.queries[key] = { q: key, n: 0, zero: 0, clicks: 0, last: 0 });
  r.n++; r.last = now; r.count = count; if (!count) r.zero++;
  const keys = Object.keys(state.queries);
  if (keys.length > 3000) for (const k of keys.sort((a, b) => state.queries[a].last - state.queries[b].last).slice(0, 500)) if (state.queries[k].n < 3) delete state.queries[k];
  return true;
}
export function logClick(state, from) { const r = state.queries[normalizeQuery(from)]; if (r) r.clicks++; }

export function vote(state, id, helpful, comment, now) {
  const a = state.articles[id]; if (!a || a.status !== "published") return false;
  if (helpful) a.yes++; else a.no++;
  const c = oneLine(comment, 500);
  if (!helpful && c) { state.feedback.unshift({ article: id, comment: c, t: now }); state.feedback.length = Math.min(state.feedback.length, 300); }
  return true;
}

// The report this product exists for: what people searched for that the help center could not answer.
export function gaps(state, { minSearches = 1 } = {}) {
  const rows = Object.values(state.queries).filter((r) => r.n >= minSearches).map((r) => ({ ...r, kind: r.count === 0 ? "no results" : r.n >= 3 && r.clicks / r.n < 0.2 ? "results ignored" : "" })).filter((r) => r.kind);
  return rows.sort((a, b) => b.n - a.n || b.last - a.last);
}
export function weakArticles(state, minVotes = 3) {
  return Object.values(state.articles).filter((a) => a.yes + a.no >= minVotes).map((a) => ({ a, share: a.no / (a.yes + a.no) })).filter((x) => x.share >= 0.4).sort((x, y) => y.share - x.share);
}
export function stats(state) {
  const arts = Object.values(state.articles), searches = Object.values(state.queries).reduce((s, r) => s + r.n, 0), zero = Object.values(state.queries).reduce((s, r) => s + r.zero, 0);
  return { articles: arts.length, published: arts.filter((a) => a.status === "published").length, views: arts.reduce((s, a) => s + a.views, 0), searches, zero, helpfulPct: (() => { const y = arts.reduce((s, a) => s + a.yes, 0), n = arts.reduce((s, a) => s + a.no, 0); return y + n ? Math.round((100 * y) / (y + n)) : null; })() };
}

const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function gapsCsv(state) {
  return [["search", "times", "no_result_times", "opened", "kind", "last_seen_utc"], ...gaps(state).map((r) => [r.q, r.n, r.zero, r.clicks, r.kind, new Date(r.last).toISOString()])].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
export function collections(state) {
  const m = new Map();
  for (const a of published(state)) { const k = a.collection; if (!m.has(k)) m.set(k, { name: k, slug: slugify(k) || "general", articles: [] }); m.get(k).articles.push(a); }
  for (const c of m.values()) c.articles.sort((x, y) => x.title.localeCompare(y.title));
  return [...m.values()].sort((x, y) => x.name.localeCompare(y.name));
}
export { tokens };
