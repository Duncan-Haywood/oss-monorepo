// Discovers the venture's learner-facing calculators in `tools/` and turns
// them into a browsable section of the built site.
//
// The tools are authored as standalone, dependency-free static pages: each
// one works when opened straight off disk, and none of them knows the site
// exists. That independence is deliberate, so this module never edits the
// sources. It *reads* each tool's own `<title>` and `<meta name=description>`
// as the single source of truth for how the tool is described, and injects
// the site chrome into the copies written to `dist/`. A tool therefore
// cannot drift out of sync with the hub page that lists it — there is no
// second place to update.

/** Tool directories are exposed at this path within the built site. */
export const TOOLS_DIR = "tools";

/**
 * Inline SVG favicon for the site's own pages. The tools each ship their
 * own; these pages had none, so every visit cost a 404 on /favicon.ico and
 * left the tab unlabelled. A data URI keeps it a zero-request asset.
 */
export const SITE_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%232b6cb0'/%3E%3Cpath d='M9 22 L16 9 L23 22' stroke='white' stroke-width='2.5' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M12 18 H20' stroke='white' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pulls the display metadata for one tool out of its own `index.html`.
 * Throws rather than emitting a half-described card: a tool that reaches
 * the hub page with a missing title or description is a build-time bug,
 * not something a visitor should discover.
 */
export function extractToolMetadata(html, slug) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    throw new Error(`tool "${slug}": index.html has no <title> to name it by`);
  }

  const descMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i
  );
  if (!descMatch) {
    throw new Error(
      `tool "${slug}": index.html has no <meta name="description">, which the hub page lists it by`
    );
  }

  const iconMatch = html.match(
    /<link\s+rel=["']icon["']\s+href=["']([^"']*)["']\s*\/?>/i
  );

  return {
    slug,
    title: decodeEntities(titleMatch[1].trim()),
    description: decodeEntities(descMatch[1].trim().replace(/\s+/g, " ")),
    icon: iconMatch ? decodeEntities(iconMatch[1]) : null,
  };
}

/**
 * Site chrome injected into each tool page's `dist/` copy. The tools have
 * no shared stylesheet, so this carries its own scoped styles and reuses
 * the CSS custom properties every tool already defines (`--panel`,
 * `--border`, `--accent`), which keeps it correct in both light and dark
 * without the tool having to cooperate.
 */
export function toolPageNav(tools, activeSlug) {
  const siblings = tools
    .filter((t) => t.slug !== activeSlug)
    .map(
      (t) =>
        `<a href="../${t.slug}/">${escapeHtml(shortName(t.title))}</a>`
    )
    .join("");

  return `<nav class="site-strip" aria-label="Site">
  <a href="../" class="site-strip-home">&#8592; All free calculators</a>
  <span class="site-strip-links">${siblings}</span>
</nav>
<style>
  .site-strip {
    display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: baseline;
    justify-content: space-between;
    padding: 0.6rem 1.25rem; font-size: 0.85rem;
    background: var(--panel, #f7f7f8);
    border-bottom: 1px solid var(--border, #d8d8d8);
  }
  .site-strip a { color: var(--accent, #2b6cb0); text-decoration: none; }
  .site-strip a:hover, .site-strip a:focus { text-decoration: underline; }
  .site-strip-home { font-weight: 600; }
  .site-strip-links { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
</style>`;
}

/**
 * Trims a tool's `<title>` down to something that fits a one-line nav
 * strip. Titles here are written for search results ("Resistor Color Code,
 * LED Resistor & Ohm's Law Calculator"), which is right for a `<title>` and
 * far too long for a cross-link, so drop the trailing noun and then keep
 * only the leading clause of a multi-part name.
 */
const NAV_LABEL_MAX = 28;

export function shortName(title) {
  const trimmed = title.replace(/\s*Calculator$/i, "").trim() || title;
  if (trimmed.length <= NAV_LABEL_MAX) return trimmed;

  const clause = trimmed.split(/\s*[,&]\s*/)[0].trim();
  return clause || trimmed;
}

/**
 * Rewrites a tool's `index.html` for its place inside the built site:
 * adds the nav strip, and repoints the repo-relative README link at the
 * site's own overview page (a `.md` href would 404 for a visitor). The
 * tool's own sibling links (`../other-tool/`) already resolve correctly
 * once the directory is copied, so they are left alone.
 */
export function rewriteToolPage(html, tools, activeSlug) {
  let out = html.replace(
    /href="(?:\.\.\/)+README\.md"/g,
    'href="../../index.html"'
  );

  const nav = toolPageNav(tools, activeSlug);
  if (out.includes("<body>")) {
    out = out.replace("<body>", `<body>\n${nav}`);
  } else {
    // No <body> to anchor to — prepending still renders, and failing the
    // build over it would take a working calculator offline for no gain.
    out = `${nav}\n${out}`;
  }
  return out;
}

/** The hub page: the venture's front door for people who came for a calculator. */
export function renderToolsHub(tools, { siteName = "AI Engineering Academy" } = {}) {
  const cards = tools
    .map(
      (t) => `      <li class="tool-card">
        <h2><a href="${t.slug}/">${escapeHtml(t.title)}</a></h2>
        <p>${escapeHtml(t.description)}</p>
        <p class="tool-card-cta"><a href="${t.slug}/">Open the calculator &#8594;</a></p>
      </li>`
    )
    .join("\n");

  const listing = tools.length
    ? `<ul class="tool-list">\n${cards}\n    </ul>`
    : `<p class="empty">No calculators are published yet. They will appear here as they ship.</p>`;

  // Machine-readable listing so search engines and AI assistants can
  // enumerate the tools without executing or scraping the page.
  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Free engineering calculators — ${siteName}`,
      description:
        "Free, browser-local electrical engineering calculators. No signup, no ads, and no data leaves your device.",
      itemListElement: tools.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "SoftwareApplication",
          name: t.title,
          description: t.description,
          applicationCategory: "EducationalApplication",
          operatingSystem: "Any (runs in a web browser)",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          url: `${t.slug}/`,
        },
      })),
    },
    null,
    2
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Free Engineering Calculators — ${siteName}</title>
<meta name="description" content="Free electrical engineering calculators that run entirely in your browser: resistor color codes, Ohm's law, LED series resistors, voltage dividers, 555 timers, and RC filters. No signup, no ads, no data leaves your device.">
<meta name="robots" content="index, follow">
<link rel="canonical" href=".">
<meta property="og:title" content="Free Engineering Calculators">
<meta property="og:description" content="Browser-local electrical engineering calculators. No signup, no ads, no data leaves your device.">
<meta property="og:type" content="website">
<script type="application/ld+json">
${jsonLd}
</script>
<link rel="icon" href="${SITE_FAVICON}">
<style>
  /* Self-contained on purpose. The constitution's style.css lays out around
     a fixed sidebar this page doesn't have, and its serif book styling reads
     as a different product from the calculators it links to. Matching the
     tools' own idiom instead means the hub and the tool it hands you off to
     look like one thing. */
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1a1a1a; --muted: #5a5a5a; --border: #d8d8d8;
    --accent: #2b6cb0; --panel: #f7f7f8;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161a; --fg: #eaeaea; --muted: #a3a3a3; --border: #33363c; --panel: #1d2026; --accent: #6ea8ff; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 1.9rem; margin: 0 0 0.4rem; }
  p.lede { color: var(--muted); margin-top: 0; font-size: 1.05rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 0.5rem; }
  a { color: var(--accent); }
  .tool-list { list-style: none; padding: 0; margin: 2rem 0 0; display: grid; gap: 1rem; }
  .tool-card {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 1.15rem 1.35rem;
  }
  .tool-card h2 { margin: 0 0 0.4rem; font-size: 1.2rem; }
  .tool-card h2 a { text-decoration: none; }
  .tool-card h2 a:hover, .tool-card h2 a:focus { text-decoration: underline; }
  .tool-card p { margin: 0 0 0.6rem; color: var(--fg); }
  .tool-card-cta { margin: 0; font-weight: 600; }
  .fine { color: var(--muted); font-size: 0.9rem; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em; background: var(--panel); padding: 0.1em 0.35em; border-radius: 4px;
  }
  footer {
    border-top: 1px solid var(--border); margin-top: 2.5rem; padding-top: 1.25rem;
    font-size: 0.85rem; color: var(--muted);
  }
</style>
</head>
<body>
<main>
  <article>
    <h1>Free engineering calculators</h1>
    <p class="lede">
      Small, focused calculators for the Circuits corner of ${siteName}'s
      planned Electrical Engineering track. Every one of them is free and
      full-featured, runs entirely in your browser, and needs no account.
    </p>
    ${listing}

    <h2>Privacy</h2>
    <p class="fine">
      Your inputs never leave your device. There are no accounts, no
      tracking cookies, and no analytics vendor. Each calculator counts
      anonymous, aggregate feature-use events (for example &#8220;a
      calculation was run&#8221;) in your own browser's
      <code>localStorage</code>, purely so this project's maintainers can
      tell whether a tool is used at all. Nothing is transmitted, and each
      page has a one-click switch to turn even that off.
    </p>

    <h2>Disclaimer</h2>
    <p class="fine">
      <strong>No warranty.</strong> These tools are provided free and
      as-is, without warranty of any kind, express or implied. They are not
      engineering advice and do not replace measuring the built circuit.
      <strong>You are responsible for reviewing and verifying their output
      before relying on it</strong>, including for anything
      safety-critical. To the maximum extent permitted by law, the authors
      accept no liability for any loss or damage arising from their use.
    </p>
  </article>
  <footer>
    <p>Part of <a href="../index.html">${siteName}</a>. MIT licensed.</p>
  </footer>
</main>
</body>
</html>
`;
}

/**
 * A sitemap so the calculators are crawlable and enumerable the moment the
 * site goes live. `baseUrl` is only known at deploy time; without one the
 * caller gets null rather than a sitemap full of placeholder hostnames,
 * which is worse than no sitemap at all.
 */
export function renderSitemap(paths, baseUrl) {
  if (!baseUrl) return null;
  const root = baseUrl.replace(/\/+$/, "");
  const urls = paths
    .map((p) => `  <url><loc>${escapeHtml(`${root}/${p}`.replace(/\/+$/, "/"))}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** Crawlable by default; the tools are only useful if people can find them. */
export function renderRobots(baseUrl) {
  const lines = ["User-agent: *", "Allow: /"];
  if (baseUrl) {
    lines.push("", `Sitemap: ${baseUrl.replace(/\/+$/, "")}/sitemap.xml`);
  }
  return `${lines.join("\n")}\n`;
}
