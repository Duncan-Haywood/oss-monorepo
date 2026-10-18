// On-page SEO and AI-readiness audit of one page's HTML. Pure and
// dependency-free: the browser page, the CLI and the tests share it. It reads
// the markup it is given and nothing else, so it cannot see rendering, speed,
// backlinks or rankings, and says so.

const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const squash = (s) => decode(s).replace(/\s+/g, " ").trim();

function attrs(tag) {
  const out = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const inner = tag.replace(/^<\s*[a-z0-9-]+/i, "").replace(/\/?>$/, "");
  let m;
  while ((m = re.exec(inner))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

export function parse(html) {
  const src = String(html || "");
  const raw = src.replace(/<!--[\s\S]*?-->/g, "");
  // Non-JSON-LD script, style and template bodies can hold markup-looking
  // strings that are not part of the page; blank them before reading tags.
  const body = raw.replace(/<(script|style|template)\b([^>]*)>[\s\S]*?<\/\1>/gi, (m, n, a) =>
    /ld\+json/i.test(a) ? m : `<${n}${a}></${n}>`);
  const tags = (name) => body.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
  const metas = tags("meta").map(attrs);
  const meta = (key, val) => {
    const hit = metas.find((a) => (a[key] || "").toLowerCase() === val);
    return hit && hit.content != null ? squash(hit.content) : null;
  };
  const links = tags("link").map(attrs);
  const rel = (r) => links.find((a) => (a.rel || "").toLowerCase().split(/\s+/).includes(r));
  const titleM = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const headings = [];
  const hre = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let h;
  while ((h = hre.exec(body))) headings.push({ level: +h[1], text: squash(h[2].replace(/<[^>]+>/g, " ")) });
  const imgs = tags("img").map(attrs);
  const anchors = [];
  const are = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let a;
  while ((a = are.exec(body))) anchors.push({ ...attrs(`<a ${a[1]}>`), text: squash(a[2].replace(/<[^>]+>/g, " ")) });
  const jsonld = [];
  const jre = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let j;
  while ((j = jre.exec(body))) {
    try { jsonld.push({ ok: true, data: JSON.parse(j[1]) }); }
    catch (e) { jsonld.push({ ok: false, error: e.message }); }
  }
  const scripts = (body.match(/<script\b/gi) || []).length;
  const visible = squash(
    body
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<head\b[\s\S]*?<\/head>/i, " ")
      .replace(/<[^>]+>/g, " "),
  );
  const htmlTag = (body.match(/<html\b[^>]*>/i) || [""])[0];
  return {
    title: titleM ? squash(titleM[1]) : null,
    description: meta("name", "description"),
    viewport: meta("name", "viewport"),
    robots: meta("name", "robots"),
    lang: htmlTag ? attrs(htmlTag).lang || null : null,
    canonical: rel("canonical")?.href ?? null,
    icon: Boolean(links.find((l) => /(^|\s)icon(\s|$)/i.test(l.rel || ""))),
    og: Object.fromEntries(metas.filter((m) => /^og:/i.test(m.property || "")).map((m) => [m.property.toLowerCase(), squash(m.content || "")])),
    twitterCard: meta("name", "twitter:card"),
    headings, imgs, anchors, jsonld, scripts,
    words: visible ? visible.split(" ").length : 0,
  };
}

const typesOf = (data, out = []) => {
  if (Array.isArray(data)) data.forEach((d) => typesOf(d, out));
  else if (data && typeof data === "object") {
    if (data["@type"]) [].concat(data["@type"]).forEach((t) => out.push(String(t)));
    if (data["@graph"]) typesOf(data["@graph"], out);
  }
  return out;
};

const WEIGHT = { critical: 20, warning: 7, info: 2 };
const GENERIC = /^(click here|here|read more|more|learn more|link|this|this link|details)$/i;

export function audit(html, { url = "" } = {}) {
  if (!String(html || "").trim()) return { ok: false, error: "Paste the page's HTML (View source, then copy all) or give the CLI a file or URL." };
  if (!/<(html|head|body|title|h1|p|div)\b/i.test(html)) return { ok: false, error: "That does not look like HTML. Paste the page source, not the visible text." };
  const p = parse(html);
  const f = [];
  const add = (id, severity, title, detail, fix) => f.push({ id, severity, title, detail, fix });

  if (/noindex/i.test(p.robots || "")) add("noindex", "critical", "Page is set to noindex", `The robots meta tag says \`${p.robots}\`. Search engines are told to leave this page out.`, "Remove noindex unless you mean to hide the page.");
  if (p.title == null || !p.title) add("title", "critical", "No <title>", "The title is the headline in search results and the strongest on-page signal.", "Add a unique <title> of about 30–60 characters leading with what the page is.");
  else if (p.title.length < 20 || p.title.length > 65) add("title-length", "warning", `Title is ${p.title.length} characters`, `"${p.title}". Under ~20 wastes the line; over ~60–65 is usually cut off in results.`, "Aim for 30–60 characters, main topic first.");
  if (p.description == null || !p.description) add("description", "warning", "No meta description", "Without one, engines pick a snippet from the page, often a poor one.", "Add a meta description of about 70–160 characters that says what the visitor gets.");
  else if (p.description.length < 50 || p.description.length > 170) add("description-length", "info", `Meta description is ${p.description.length} characters`, "Under ~50 reads thin; over ~160 is truncated.", "Aim for 70–160 characters.");
  const h1 = p.headings.filter((x) => x.level === 1);
  if (h1.length === 0) add("h1", "warning", "No <h1>", "The h1 tells readers and crawlers what the page is about.", "Add exactly one h1 that matches the page's purpose.");
  else if (h1.length > 1) add("h1-many", "info", `${h1.length} <h1> headings`, "More than one top heading blurs the page's topic.", "Keep one h1; demote the rest to h2.");
  const skips = p.headings.filter((x, i) => i && x.level > p.headings[i - 1].level + 1);
  if (skips.length) add("heading-skip", "info", "Heading levels skip", `Example: "${skips[0].text.slice(0, 50)}" jumps to h${skips[0].level}. Skipped levels weaken the outline screen readers and AI summarisers use.`, "Nest headings one level at a time.");
  if (!p.canonical) add("canonical", "warning", "No canonical link", "Without rel=canonical, URL variants (tracking parameters, www vs bare) can split ranking signals.", "Add <link rel=\"canonical\" href=\"https://…\"> pointing at this page's preferred URL.");
  else if (!/^https?:\/\//i.test(p.canonical)) add("canonical-relative", "warning", "Canonical is not an absolute URL", `Found \`${p.canonical}\`. Engines expect a full https:// URL.`, "Use the full absolute URL.");
  if (!p.viewport) add("viewport", "warning", "No viewport meta tag", "Pages without it render zoomed-out on phones and fail mobile-friendly checks.", "Add <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">.");
  if (!p.lang) add("lang", "info", "<html> has no lang", "The language attribute helps engines, translators and screen readers.", "Add lang=\"en\" (or your language) to <html>.");
  const missingOg = ["og:title", "og:description", "og:image"].filter((k) => !p.og[k]);
  if (missingOg.length) add("og", "warning", `Link preview incomplete (${missingOg.join(", ")} missing)`, "Open Graph tags control the card shown when the page is shared in chat apps and social feeds.", "Add the missing og: meta tags; og:image should be an absolute URL, about 1200×630.");
  if (!p.twitterCard) add("twitter", "info", "No twitter:card", "Some platforms read twitter:card to choose the preview size.", "Add <meta name=\"twitter:card\" content=\"summary_large_image\">.");
  const badLd = p.jsonld.filter((x) => !x.ok);
  const types = p.jsonld.filter((x) => x.ok).flatMap((x) => typesOf(x.data));
  if (badLd.length) add("jsonld-invalid", "critical", "Structured data does not parse", `${badLd.length} JSON-LD block(s) are invalid JSON (${badLd[0].error}). Engines ignore them.`, "Fix the JSON; validate it with a JSON linter before publishing.");
  else if (!types.length) add("jsonld", "warning", "No structured data (JSON-LD)", "Schema.org markup is how engines and AI assistants read facts such as what the page offers, its FAQ answers and who runs the site.", "Add JSON-LD matching the page: Organization, Product, SoftwareApplication, Article or FAQPage.");
  if (!types.includes("FAQPage") && p.headings.filter((x) => /\?$/.test(x.text)).length >= 2)
    add("faq", "info", "Question headings without FAQPage markup", "Two or more headings are questions, a pattern AI assistants quote directly.", "Mirror them as FAQPage JSON-LD with the same visible answers.");
  const noAlt = p.imgs.filter((i) => i.alt == null);
  if (noAlt.length) add("alt", "warning", `${noAlt.length} of ${p.imgs.length} image(s) have no alt`, `Example: \`${(noAlt[0].src || "").slice(0, 60)}\`. Alt text feeds image search and accessibility.`, "Add descriptive alt text; use alt=\"\" for purely decorative images.");
  const generic = p.anchors.filter((x) => GENERIC.test(x.text));
  if (generic.length) add("anchor-text", "info", `${generic.length} link(s) with vague text`, `Example: "${generic[0].text}". Anchor text is how engines learn what the target is about.`, "Name the destination in the link text.");
  if (p.anchors.length === 0) add("links", "info", "No links on the page", "Pages with no links out are dead ends for crawlers and visitors.", "Link to related pages on your site.");
  if (p.words < 150) add("thin", p.scripts > 3 && p.words < 40 ? "critical" : "warning", `Only ${p.words} words in the static HTML`,
    p.scripts > 3 && p.words < 40 ? "Almost no text before JavaScript runs. Many crawlers and most AI assistants read the raw HTML only, so they may see an empty page." : "Thin pages rarely rank for more than their own name.", "Put the main content in the served HTML (server-render or pre-render).");

  const score = Math.max(0, 100 - f.reduce((s, x) => s + WEIGHT[x.severity], 0));
  const counts = { critical: 0, warning: 0, info: 0 };
  f.forEach((x) => counts[x.severity]++);
  const order = { critical: 0, warning: 1, info: 2 };
  f.sort((a, b) => order[a.severity] - order[b.severity]);
  const ai = [!/noindex/i.test(p.robots || ""), types.length > 0, p.words >= 150, Boolean(p.description), h1.length === 1, Boolean(p.canonical)];
  return {
    ok: true, url, score, grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D",
    counts, findings: f, aiReadiness: Math.round((ai.filter(Boolean).length / ai.length) * 100),
    facts: { title: p.title, description: p.description, words: p.words, headings: p.headings.length, images: p.imgs.length, links: p.anchors.length, schemaTypes: [...new Set(types)] },
  };
}
