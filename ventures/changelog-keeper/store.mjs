// Changelog rules. Pure functions over a plain-object state; no I/O.
// Entries are written in a tiny Markdown subset and rendered to HTML by
// renderBody(), which escapes everything first, so an entry cannot inject markup.

export const CATEGORIES = ["new", "improved", "fixed", "breaking"];
export const LIMITS = { title: 120, body: 8000, maxEntries: 2000, tags: 5, tag: 24 };
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export const newState = () => ({ entries: [] });

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, max);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// Escape first, then add only <p>, <ul><li>, <strong>, <em>, <code> and http(s) links.
export function renderBody(md) {
  const inline = (line) => esc(line)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" rel="noopener noreferrer">${t}</a>`);
  const out = []; let list = false, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const close = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (!line.trim()) { flush(); close(); }
    else if (li) { flush(); if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(li[1])}</li>`); }
    else { close(); para.push(inline(line)); }
  }
  flush(); close();
  return out.join("");
}

const normTags = (tags) => (Array.isArray(tags) ? tags : String(tags ?? "").split(","))
  .map((t) => slugify(clean(t, LIMITS.tag))).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, LIMITS.tags);

export function createEntry(state, input, { id, now }) {
  const title = clean(input.title, LIMITS.title), body = clean(input.body, LIMITS.body);
  if (!title) return { error: "title is required" };
  if (!body) return { error: "body is required" };
  const category = input.category === undefined || input.category === "" ? "new" : String(input.category);
  if (!CATEGORIES.includes(category)) return { error: `category must be one of ${CATEGORIES.join(", ")}` };
  if (state.entries.length >= LIMITS.maxEntries) return { error: "entry limit reached" };
  let slug = String(input.slug || "").toLowerCase() || slugify(title);
  if (!input.slug && slug.length < 2) slug = `entry-${id}`; // one-character or non-latin titles
  if (!SLUG_RE.test(slug)) return { error: "slug must be 2-64 characters: a-z, 0-9 or -" };
  const base = slug; for (let n = 2; state.entries.some((e) => e.slug === slug); n++) slug = `${base}-${n}`.slice(0, 64);
  const entry = { id, slug, title, body, category, tags: normTags(input.tags), status: "draft", createdAt: now, publishedAt: null, updatedAt: now };
  state.entries.push(entry);
  return { entry };
}

export function updateEntry(state, id, input, now) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return { error: "no such entry" };
  if (input.title !== undefined) { const t = clean(input.title, LIMITS.title); if (!t) return { error: "title is required" }; e.title = t; }
  if (input.body !== undefined) { const b = clean(input.body, LIMITS.body); if (!b) return { error: "body is required" }; e.body = b; }
  if (input.category !== undefined) { if (!CATEGORIES.includes(input.category)) return { error: `category must be one of ${CATEGORIES.join(", ")}` }; e.category = input.category; }
  if (input.tags !== undefined) e.tags = normTags(input.tags);
  e.updatedAt = now;
  return { entry: e };
}

// publishedAt may be back-dated (importing history) but never set in the future.
export function setStatus(state, id, status, now, when) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return { error: "no such entry" };
  if (!["draft", "published"].includes(status)) return { error: "status must be draft or published" };
  if (status === "published") {
    let at = now;
    if (when !== undefined && when !== null && when !== "") { at = Date.parse(when); if (!Number.isFinite(at) || at > now) return { error: "publishedAt must be a past date" }; }
    if (!e.publishedAt || when) e.publishedAt = at;
  }
  e.status = status; e.updatedAt = now;
  return { entry: e };
}

export function remove(state, id) {
  const i = state.entries.findIndex((x) => x.id === id);
  if (i < 0) return { error: "no such entry" };
  state.entries.splice(i, 1);
  return { removed: id };
}

export function published(state, { tag, category, limit = 50 } = {}) {
  return state.entries
    .filter((e) => e.status === "published" && (!tag || e.tags.includes(tag)) && (!category || e.category === category))
    .sort((a, b) => b.publishedAt - a.publishedAt || (a.id < b.id ? 1 : -1))
    .slice(0, limit);
}

// What the widget and JSON endpoint expose: no ids of drafts, no internal timestamps.
export const publicEntry = (e) => ({ slug: e.slug, title: e.title, category: e.category, tags: e.tags, publishedAt: new Date(e.publishedAt).toISOString(), html: renderBody(e.body) });

const xml = (s) => esc(s).replace(/&#39;/g, "&apos;");

export function toRss(state, { title, link, description }) {
  const items = published(state, { limit: 30 }).map((e) => `<item><title>${xml(e.title)}</title><link>${xml(`${link}/e/${e.slug}`)}</link><guid isPermaLink="true">${xml(`${link}/e/${e.slug}`)}</guid><pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate><category>${xml(e.category)}</category><description>${xml(renderBody(e.body))}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(title)}</title><link>${xml(link)}</link><description>${xml(description)}</description>${items}</channel></rss>`;
}

export function toJsonFeed(state, { title, link }) {
  return { version: "https://jsonfeed.org/version/1.1", title, home_page_url: link, feed_url: `${link}/feed.json`, items: published(state, { limit: 30 }).map((e) => ({ id: e.slug, url: `${link}/e/${e.slug}`, title: e.title, content_html: renderBody(e.body), date_published: new Date(e.publishedAt).toISOString(), tags: [e.category, ...e.tags] })) };
}

export function stats(state) {
  const pub = state.entries.filter((e) => e.status === "published");
  return { total: state.entries.length, published: pub.length, drafts: state.entries.length - pub.length, latest: pub.length ? new Date(Math.max(...pub.map((e) => e.publishedAt))).toISOString() : null };
}
