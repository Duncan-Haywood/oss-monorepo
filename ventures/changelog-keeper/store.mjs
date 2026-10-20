// Changelog rules. Pure functions over a plain-object state; no I/O.
// The server, the feeds and the landing-page demo all use this file.

export const LIMITS = { title: 120, body: 4000, maxEntries: 2000 };
export const TAGS = ["new", "improved", "fixed", "removed", "security", "announcement"];

export const newState = () => ({ entries: [] });

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, max);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function parseWhen(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 && t < 4102444800000 ? t : null;
}

// status "draft" is never public; "published" goes public once publishAt has passed,
// which is how a release note is scheduled for a launch.
export function createEntry(state, input, { id, now }) {
  const title = clean(input.title, LIMITS.title), body = clean(input.body, LIMITS.body);
  if (!title) return { error: "title is required" };
  if (!body) return { error: "body is required" };
  const tag = input.tag === undefined || input.tag === "" ? "new" : String(input.tag);
  if (!TAGS.includes(tag)) return { error: `tag must be one of ${TAGS.join(", ")}` };
  const status = input.status === undefined || input.status === "" ? "published" : String(input.status);
  if (!["draft", "published"].includes(status)) return { error: "status must be draft or published" };
  const publishAt = parseWhen(input.publishAt, now);
  if (publishAt === null) return { error: "publishAt must be a date" };
  if (state.entries.length >= LIMITS.maxEntries) return { error: "entry limit reached" };
  const entry = { id, title, body, tag, status, publishAt, createdAt: now, updatedAt: now };
  state.entries.push(entry);
  return { entry };
}

export function updateEntry(state, id, input, now) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return { error: "no such entry" };
  const next = { ...e };
  if (input.title !== undefined) next.title = clean(input.title, LIMITS.title);
  if (input.body !== undefined) next.body = clean(input.body, LIMITS.body);
  if (input.tag !== undefined) next.tag = String(input.tag);
  if (input.status !== undefined) next.status = String(input.status);
  if (input.publishAt !== undefined) next.publishAt = parseWhen(input.publishAt, e.publishAt);
  if (!next.title || !next.body) return { error: "title and body cannot be empty" };
  if (!TAGS.includes(next.tag)) return { error: `tag must be one of ${TAGS.join(", ")}` };
  if (!["draft", "published"].includes(next.status)) return { error: "status must be draft or published" };
  if (next.publishAt === null) return { error: "publishAt must be a date" };
  Object.assign(e, next, { updatedAt: now });
  return { entry: e };
}

export function remove(state, id) {
  const i = state.entries.findIndex((x) => x.id === id);
  if (i < 0) return { error: "no such entry" };
  state.entries.splice(i, 1);
  return { ok: true };
}

export const isPublic = (e, now) => e.status === "published" && e.publishAt <= now;

// Public view: published and due, newest first.
export function publicEntries(state, now, { limit = 50, tag } = {}) {
  return state.entries.filter((e) => isPublic(e, now) && (!tag || e.tag === tag))
    .sort((a, b) => b.publishAt - a.publishAt || (a.id < b.id ? 1 : -1)).slice(0, limit);
}

export function stats(state, now) {
  const s = { total: state.entries.length, published: 0, scheduled: 0, draft: 0, latest: null };
  for (const e of state.entries) {
    if (e.status === "draft") s.draft++; else if (e.publishAt > now) s.scheduled++; else { s.published++; if (!s.latest || e.publishAt > s.latest) s.latest = e.publishAt; }
  }
  return s;
}

// A small, safe Markdown subset: paragraphs, "## " headings, "- " lists, **bold**, *italic*,
// `code` and [text](https://...) links. Everything is escaped first, so entry text can
// never inject markup; only http(s) links are allowed.
function inline(raw) {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener nofollow ugc">$1</a>');
  return s;
}

export function renderMarkdown(body) {
  return String(body ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (!lines.length) return "";
    if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
    if (/^#{1,3} /.test(lines[0]) && lines.length === 1) return `<h3>${inline(lines[0].replace(/^#{1,3} /, ""))}</h3>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

// Plain text for the widget, which never renders HTML.
export const plainText = (body) => String(body ?? "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)").replace(/(\*\*|`|^#{1,3} |^\s*[-*] )/gm, "").replace(/\*([^*\n]+)\*/g, "$1");
