// Internal-link planner engine. Pure functions, no network, no filesystem: the
// browser page, the CLI and the tests all call this same code.

const STOP = new Set("a an and are as at be by can do for from how i if in into is it its of on or our so than that the their then this to up us was we what when where which who why will with you your vs not no new best top guide get".split(" "));
const BOILERPLATE = new Set(["nav", "header", "footer", "aside"]);
const VOID = new Set(["br", "img", "input", "meta", "link", "hr", "source", "area", "base", "col", "embed", "wbr"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));
const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag); return m ? decode(m[1] ?? m[2] ?? m[3]) : null; };

/** Canonical form used as a page's identity: https-agnostic host, no hash, no tracking query, no index.html, no trailing slash except the root. */
export function normalizeUrl(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(k)) u.searchParams.delete(k);
  let p = u.pathname.replace(/\/index\.html?$/i, "/").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/$/, "");
  return `${u.protocol}//${u.host.toLowerCase()}${p}${u.search}`;
}

/** Reads one HTML document: title, h1, robots/canonical hints, visible text, and every link with whether it sits in the page body or in site chrome. */
export function parsePage(html, url) {
  const out = { url, title: "", h1: "", noindex: false, canonical: null, text: "", links: [] };
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  const stack = []; let m, skip = 0, a = null, inTitle = false, inH1 = false, boiler = 0; const text = [];
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const t = decode(m[4]);
      if (inTitle) out.title += t; else if (!skip) { if (inH1) out.h1 += t; if (a) a.text += t; if (!boiler) text.push(t); }
      continue;
    }
    if (!m[2]) continue;
    const close = m[1] === "/", tag = m[2].toLowerCase(), raw = m[3] || "";
    if (close) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) { for (const t of stack.splice(i)) { if (t === "script" || t === "style" || t === "noscript") skip--; if (BOILERPLATE.has(t)) boiler--; } }
      if (tag === "title") inTitle = false; if (tag === "h1") inH1 = false;
      if (tag === "a" && a) { if (a.href != null) out.links.push({ href: a.href, text: a.text.replace(/\s+/g, " ").trim(), nofollow: a.nofollow, body: !a.boiler }); a = null; }
      text.push(" "); continue;
    }
    if (tag === "meta") {
      const n = (attr(raw, "name") || "").toLowerCase();
      if (n === "robots" && /noindex/i.test(attr(raw, "content") || "")) out.noindex = true;
    }
    if (tag === "link" && /canonical/i.test(attr(raw, "rel") || "")) out.canonical = attr(raw, "href");
    if (VOID.has(tag) || /\/\s*$/.test(raw)) continue;
    stack.push(tag);
    if (tag === "script" || tag === "style" || tag === "noscript") skip++;
    if (BOILERPLATE.has(tag)) boiler++;
    if (tag === "title") inTitle = true;
    if (tag === "h1" && !out.h1) inH1 = true;
    if (tag === "a") a = { href: attr(raw, "href"), text: "", nofollow: /nofollow|ugc|sponsored/i.test(attr(raw, "rel") || ""), boiler: boiler > 0 };
  }
  out.title = out.title.replace(/\s+/g, " ").trim(); out.h1 = out.h1.replace(/\s+/g, " ").trim();
  out.text = text.join(" ").replace(/\s+/g, " ").replace(/\s+([.,;:!?)])/g, "$1").trim();
  return out;
}

const words = (s) => (s.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []);
const content = (s) => words(s).filter((w) => !STOP.has(w) && w.length > 1);

/** PageRank by power iteration. weights: Map<from, Map<to, w>>. Dangling mass is spread evenly. */
export function pageRank(ids, weights, d = 0.85, iters = 100) {
  const n = ids.length; if (!n) return new Map();
  let r = new Map(ids.map((i) => [i, 1 / n]));
  const outW = new Map(ids.map((i) => [i, [...(weights.get(i) || new Map()).values()].reduce((s, x) => s + x, 0)]));
  for (let k = 0; k < iters; k++) {
    const next = new Map(ids.map((i) => [i, (1 - d) / n])); let dangling = 0;
    for (const i of ids) {
      const ow = outW.get(i), ri = r.get(i);
      if (!ow) { dangling += ri; continue; }
      for (const [j, w] of weights.get(i)) next.set(j, next.get(j) + d * ri * w / ow);
    }
    const share = d * dangling / n; let diff = 0;
    for (const i of ids) { const v = next.get(i) + share; diff += Math.abs(v - r.get(i)); next.set(i, v); }
    r = next; if (diff < 1e-10) break;
  }
  return r;
}

/** The phrases that name a page, strongest first: its h1, its title minus the site-name tail, its slug. */
export function keyphrases(page, siteTail) {
  let title = page.title;
  if (siteTail) title = title.replace(new RegExp(`\\s*[|\\-–—:·]\\s*${siteTail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  const slug = decodeURIComponent(new URL(page.url).pathname.split("/").filter(Boolean).pop() || "").replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ");
  const seen = new Set(), list = [];
  for (const p of [page.h1, title, slug]) {
    const ws = content(p); if (!ws.length) continue;
    // The full phrase, then its leading and trailing 2-3 word runs (long titles are rarely linked verbatim).
    const cands = [ws.join(" ")];
    for (const n of [3, 2]) if (ws.length > n) { cands.push(ws.slice(0, n).join(" "), ws.slice(-n).join(" ")); }
    for (const c of cands) if (c.split(" ").length >= 2 || c.length >= 6) if (!seen.has(c)) { seen.add(c); list.push(c); }
  }
  return list;
}

function siteTailOf(pages) {
  const tails = new Map();
  for (const p of pages) { const m = /\s[|\-–—·]\s([^|\-–—·]+)$/.exec(p.title); if (m) tails.set(m[1].trim(), (tails.get(m[1].trim()) || 0) + 1); }
  const best = [...tails].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= Math.max(2, pages.length * 0.5) ? best[0] : null;
}

const NOFOLLOW_W = 0, BODY_W = 1, CHROME_W = 0.25;

/**
 * pages: [{url, html}] (or already-parsed pages). Options:
 *   home       URL of the home page (default: the shortest path)
 *   priority   URLs or path suffixes to treat as the pages that must rank
 *   maxPerSource, maxPerTarget, minScore: suggestion limits
 */
export function analyze(input, opts = {}) {
  const parsed = input.map((p) => (p.links ? p : parsePage(p.html, p.url)));
  const byId = new Map();
  for (const p of parsed) { const id = normalizeUrl(p.url, p.url); if (id && !byId.has(id)) byId.set(id, { ...p, id }); }
  const pages = [...byId.values()];
  const host = pages.length ? new URL(pages[0].id).host : "";
  const homeId = opts.home ? normalizeUrl(opts.home, pages[0]?.id) : [...pages].sort((a, b) => a.id.length - b.id.length)[0]?.id;
  const indexable = pages.filter((p) => !p.noindex);
  const ids = indexable.map((p) => p.id), idSet = new Set(ids);

  // Edges: one per (from, to) pair; a page linking twice counts once, at its best weight.
  const edges = new Map(), broken = [], external = new Map();
  for (const p of indexable) {
    const row = new Map();
    for (const l of p.links) {
      const to = l.href == null ? null : normalizeUrl(l.href, p.id);
      if (!to) continue;
      if (new URL(to).host !== host) { external.set(p.id, (external.get(p.id) || 0) + 1); continue; }
      if (to === p.id) continue;
      if (!byId.has(to)) { broken.push({ from: p.id, to, text: l.text }); continue; }
      if (!idSet.has(to)) continue;
      const w = l.nofollow ? NOFOLLOW_W : l.body ? BODY_W : CHROME_W;
      row.set(to, Math.max(row.get(to) || 0, w));
    }
    edges.set(p.id, row);
  }
  const pr = pageRank(ids, edges);
  const bodyIn = new Map(ids.map((i) => [i, 0])), anyIn = new Map(ids.map((i) => [i, 0]));
  for (const [from, row] of edges) for (const [to, w] of row) { if (w >= BODY_W) bodyIn.set(to, bodyIn.get(to) + 1); if (w > 0) anyIn.set(to, anyIn.get(to) + 1); }

  const depth = new Map(); if (homeId && idSet.has(homeId)) { depth.set(homeId, 0); const q = [homeId]; while (q.length) { const c = q.shift(); for (const [t, w] of edges.get(c)) if (w > 0 && !depth.has(t)) { depth.set(t, depth.get(c) + 1); q.push(t); } } }

  const rows = indexable.map((p) => ({
    url: p.id, title: p.title, words: words(p.text).length, rank: pr.get(p.id) * ids.length,
    inlinks: anyIn.get(p.id), bodyInlinks: bodyIn.get(p.id), outlinks: edges.get(p.id).size, bodyOutlinks: [...edges.get(p.id).values()].filter((w) => w >= BODY_W).length,
    depth: depth.has(p.id) ? depth.get(p.id) : null,
  }));
  const isHome = (id) => id === homeId;
  const orphans = rows.filter((r) => r.inlinks === 0 && !isHome(r.url)).map((r) => r.url);
  const unreachable = rows.filter((r) => r.depth === null && r.inlinks > 0).map((r) => r.url);
  const weak = rows.filter((r) => r.bodyInlinks === 0 && r.inlinks > 0 && !isHome(r.url)).map((r) => r.url);
  const deep = rows.filter((r) => r.depth != null && r.depth > 3).map((r) => r.url);
  const dead = rows.filter((r) => r.bodyOutlinks === 0).map((r) => r.url);

  const { list: suggestions, effect } = suggest(indexable, edges, pr, ids, rows, homeId, opts);
  return {
    summary: { pages: pages.length, indexable: ids.length, noindex: pages.length - ids.length, internalLinks: [...edges.values()].reduce((s, m) => s + m.size, 0), orphans: orphans.length, bodyOrphans: weak.length, deepPages: deep.length, deadEnds: dead.length, brokenInternal: broken.length, home: homeId },
    pages: rows.sort((a, b) => b.rank - a.rank), orphans, bodyOrphans: weak, deepPages: deep, deadEnds: dead, unreachable, broken, suggestions, effect,
  };
}

function pickTargets(indexable, rows, homeId, opts) {
  const want = (opts.priority || []).map((s) => s.toLowerCase());
  const rowOf = new Map(rows.map((r) => [r.url, r]));
  const prio = indexable.filter((p) => want.some((w) => p.id.toLowerCase() === w || p.id.toLowerCase().endsWith(w.startsWith("/") ? w.replace(/\/$/, "") : w)));
  const rest = indexable.filter((p) => p.id !== homeId && !prio.includes(p) && words(p.text).length >= 150);
  rest.sort((a, b) => rowOf.get(a.id).bodyInlinks - rowOf.get(b.id).bodyInlinks || rowOf.get(a.id).rank - rowOf.get(b.id).rank);
  return [...prio, ...rest.slice(0, opts.autoTargets ?? 30)];
}

function suggest(indexable, edges, pr, ids, rows, homeId, opts) {
  if (indexable.length < 3) return { list: [], effect: [] };
  const maxPerSource = opts.maxPerSource ?? 3, maxPerTarget = opts.maxPerTarget ?? 5, minScore = opts.minScore ?? 0.0;
  const tail = siteTailOf(indexable);
  // TF-IDF vectors for topical similarity between a source page and a target page.
  const docs = new Map(indexable.map((p) => [p.id, content(`${p.title} ${p.h1} ${p.text}`)]));
  const df = new Map(); for (const ws of docs.values()) for (const w of new Set(ws)) df.set(w, (df.get(w) || 0) + 1);
  const N = indexable.length, vec = new Map();
  for (const [id, ws] of docs) {
    const tf = new Map(); for (const w of ws) tf.set(w, (tf.get(w) || 0) + 1);
    const v = new Map(); let norm = 0;
    for (const [w, c] of tf) { const x = (1 + Math.log(c)) * Math.log(1 + N / df.get(w)); v.set(w, x); norm += x * x; }
    vec.set(id, { v, norm: Math.sqrt(norm) || 1 });
  }
  const cos = (a, b) => { const A = vec.get(a), B = vec.get(b); const [s, l] = A.v.size < B.v.size ? [A, B] : [B, A]; let dot = 0; for (const [w, x] of s.v) { const y = l.v.get(w); if (y) dot += x * y; } return dot / (A.norm * B.norm); };

  const targets = pickTargets(indexable, rows, homeId, opts), perSource = new Map(), out = [];
  const meanRank = 1; // ranks are scaled so the average page is 1
  const rankOf = new Map(rows.map((r) => [r.url, r.rank]));
  for (const t of targets) {
    const phrases = keyphrases(t, tail); if (!phrases.length) continue;
    const found = [];
    for (const s of indexable) {
      if (s.id === t.id || (edges.get(s.id).get(t.id) || 0) >= BODY_W) continue; // a menu link does not count: a body link is what is missing
      let best = null;
      for (const ph of phrases) {
        const stem = (w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[^a-z0-9])(${ph.split(" ").map((w) => `${stem(w)}(?:es|s)?`).join("[\\s-]+")})(?![a-z0-9])`, "i");
        const m = re.exec(s.text); if (!m) continue;
        const n = ph.split(" ").length;
        if (!best || n > best.n) best = { n, ph, m };
      }
      if (best) {
        const { ph, m } = best, at = m.index + m[1].length, anchor = m[2];
        const sim = cos(s.id, t.id), pw = (rankOf.get(s.id) ?? meanRank) / (edges.get(s.id).size + 1);
        const specificity = Math.min(1, ph.split(" ").length / 3);
        found.push({ from: s.id, to: t.id, anchor, context: s.text.slice(Math.max(0, at - 60), at + anchor.length + 60).trim(), phrase: ph, score: sim * 0.6 + Math.min(1, pw) * 0.25 + specificity * 0.15 });
      }
    }
    found.sort((a, b) => b.score - a.score);
    let n = 0;
    for (const f of found) {
      if (n >= maxPerTarget || f.score < minScore) break;
      if ((perSource.get(f.from) || 0) >= maxPerSource) continue;
      perSource.set(f.from, (perSource.get(f.from) || 0) + 1); out.push(f); n++;
    }
  }
  // Re-rank the whole graph with every suggestion applied, to say what the plan is worth.
  const edges2 = new Map([...edges].map(([k, v]) => [k, new Map(v)]));
  for (const f of out) edges2.get(f.from).set(f.to, BODY_W);
  const pr2 = pageRank(ids, edges2);
  const byTarget = new Map();
  for (const f of out) { if (!byTarget.has(f.to)) byTarget.set(f.to, { to: f.to, links: 0, rankBefore: rankOf.get(f.to), rankAfter: pr2.get(f.to) * ids.length }); byTarget.get(f.to).links++; }
  return { list: out, effect: [...byTarget.values()] };
}

const pct = (a, b) => (b ? `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(0)}%` : "n/a");
const path = (u) => { const x = new URL(u); return x.pathname + x.search || "/"; };

export function renderMarkdown(r) {
  const s = r.summary, L = [];
  L.push("# Internal link audit", "", `${s.pages} pages read (${s.indexable} indexable, ${s.noindex} noindex), ${s.internalLinks} internal links.`, "");
  L.push("| Finding | Pages |", "|---|---|", `| Orphans (nothing links to them) | ${s.orphans} |`, `| Only linked from menus/footers, never from page text | ${s.bodyOrphans} |`, `| More than 3 clicks from the home page | ${s.deepPages} |`, `| Dead ends (no internal links in the page text) | ${s.deadEnds} |`, `| Links to pages not in this crawl | ${s.brokenInternal} |`, "");
  const list = (t, a) => { if (a.length) { L.push(`## ${t}`, "", ...a.slice(0, 50).map((u) => `- ${path(u)}`), a.length > 50 ? `- ... and ${a.length - 50} more` : "", ""); } };
  list("Orphan pages", r.orphans); list("Pages linked only from site chrome", r.bodyOrphans); list("Deep pages", r.deepPages);
  if (r.broken.length) L.push("## Links to pages that were not read", "", "Either broken, or pages missing from the crawl.", "", ...r.broken.slice(0, 50).map((b) => `- ${path(b.from)} -> ${path(b.to)} ("${b.text}")`), "");
  if (r.suggestions.length) {
    L.push(`## Suggested links (${r.suggestions.length})`, "", "Each anchor text already appears in the source page. Add the link where it reads naturally; skip it where it does not.", "", "| From | Anchor text | To | Score |", "|---|---|---|---|");
    for (const f of r.suggestions) L.push(`| ${path(f.from)} | ${f.anchor} | ${path(f.to)} | ${f.score.toFixed(2)} |`);
    L.push("", "### Expected effect on internal link equity (PageRank, 1.00 = average page)", "", "| Page | Before | After | Change |", "|---|---|---|---|");
    for (const t of r.effect) L.push(`| ${path(t.to)} | ${t.rankBefore.toFixed(2)} | ${t.rankAfter.toFixed(2)} | ${pct(t.rankAfter, t.rankBefore)} |`);
    L.push("", "This is link equity inside your own site under a simplified model. It is not a ranking or traffic forecast.", "");
  }
  return L.join("\n");
}
