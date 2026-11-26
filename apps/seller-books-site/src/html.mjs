// HTML shell shared by the prerendered pages (build.mjs) and the few pages the Worker renders
// (early-access confirm / unsubscribe / form errors). No JavaScript anywhere: the CSP is script-src 'none'.
import {
  BASE_PATH,
  CONTACT_EMAIL,
  EARLY_ACCESS_CONSENT_TEXT,
  EARLY_ACCESS_CONSENT_VERSION,
  NOT_TAX_ADVICE,
  PLATFORMS,
  SITE_NAME,
  SITE_URL,
  VOLUME_BANDS,
} from "./content.mjs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML element content and attribute values. */
export const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

/** Site path ("/pricing") → served path ("/seller-books/pricing"). "/" → "/seller-books/". */
export const href = (path) => `${BASE_PATH}${path === "/" ? "/" : path}`;

/** Site path → absolute canonical URL. */
export const canonicalUrl = (path) => `${SITE_URL}${path === "/" ? "/" : path}`;

/** "Pricing" → "Pricing · Seller Books"; titles that already name the site are left alone. */
export const pageTitle = (title) => (title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`);

export const API = {
  subscribe: `${BASE_PATH}/api/early-access/subscribe`,
  confirm: `${BASE_PATH}/api/early-access/confirm`,
  unsubscribe: `${BASE_PATH}/api/early-access/unsubscribe`,
};

export const HEADER_NAV = [
  { path: "/platforms", label: "Platforms" },
  { path: "/schedule-c-worksheet", label: "Schedule C" },
  { path: "/pricing", label: "Pricing" },
  { path: "/faq", label: "FAQ" },
];

/** JSON-LD inside <script type="application/ld+json">: escape "<" so the data can't close the tag. */
const jsonLdTag = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/**
 * Full HTML document.
 * page: { path, title, description, body, jsonLd?: object[], noindex?: boolean }
 */
export function layout(page) {
  const title = pageTitle(page.title);
  const url = canonicalUrl(page.path);
  const nav = HEADER_NAV.map(
    (n) =>
      `<a href="${href(n.path)}"${page.path.startsWith(n.path) ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`,
  ).join("");
  const ld = (page.jsonLd ?? []).map(jsonLdTag).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${BASE_PATH}/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${BASE_PATH}/assets/site.css">
<link rel="alternate" type="text/plain" href="${BASE_PATH}/llms.txt" title="llms.txt">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="${href("/")}">${esc(SITE_NAME)}<span class="badge">Early access</span></a>
    <nav aria-label="Main">${nav}<a class="button small" href="${href("/early-access")}">Join early access</a></nav>
  </div>
</header>
<main id="main">
${page.body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <p><strong>${esc(SITE_NAME)}</strong> is in early access. Nothing is for sale yet. “${esc(SITE_NAME)}” is a working name.</p>
      <p class="muted">${esc(NOT_TAX_ADVICE)}</p>
    </div>
    <nav aria-label="Platforms">
      <p class="footer-head">Platforms</p>
      ${PLATFORMS.map((p) => `<a href="${href(`/platforms/${p.slug}`)}">${esc(p.name)}</a>`).join("\n      ")}
    </nav>
    <nav aria-label="Site">
      <p class="footer-head">Site</p>
      <a href="${href("/schedule-c-worksheet")}">Schedule C worksheet</a>
      <a href="${href("/pricing")}">Pricing</a>
      <a href="${href("/faq")}">Questions</a>
      <a href="${href("/privacy")}">Privacy</a>
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
}

/**
 * The early-access form. Works without JavaScript: a plain POST that the Worker answers with a 303 to
 * the thanks page. `source` records the page it was on (consent record).
 */
export function earlyAccessForm(
  sourcePath,
  { heading = "Get early access", idPrefix = "ea" } = {},
) {
  const platformBoxes = PLATFORMS.map(
    (p) =>
      `<label class="check"><input type="checkbox" name="platforms" value="${p.slug}"> ${esc(p.name)}</label>`,
  ).join("\n        ");
  const bands = VOLUME_BANDS.map((b) => `<option value="${b.value}">${esc(b.label)}</option>`).join(
    "",
  );
  return `<section class="signup" aria-labelledby="${idPrefix}-h">
  <h2 id="${idPrefix}-h">${esc(heading)}</h2>
  <form method="post" action="${API.subscribe}">
    <input type="hidden" name="source" value="${esc(sourcePath)}">
    <input type="hidden" name="consentVersion" value="${EARLY_ACCESS_CONSENT_VERSION}">
    <div class="hp" aria-hidden="true"><label for="${idPrefix}-website">Leave this empty</label><input id="${idPrefix}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
    <label for="${idPrefix}-email">Email</label>
    <input id="${idPrefix}-email" name="email" type="email" required maxlength="254" autocomplete="email">
    <fieldset>
      <legend>Where do you sell? <span class="muted">(optional)</span></legend>
      <div class="checks">
        ${platformBoxes}
      </div>
    </fieldset>
    <label for="${idPrefix}-volume">Orders a month, all platforms <span class="muted">(optional)</span></label>
    <select id="${idPrefix}-volume" name="volume"><option value="">Prefer not to say</option>${bands}</select>
    <p class="consent">${esc(EARLY_ACCESS_CONSENT_TEXT)} <a href="${href("/privacy")}">Privacy</a>.</p>
    <button class="button" type="submit">Join early access</button>
  </form>
</section>`;
}

/** Breadcrumb JSON-LD for a page below home. */
export function breadcrumbs(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: canonicalUrl(t.path),
    })),
  };
}

export function webPage(path, title, description) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle(title),
    description,
    url: canonicalUrl(path),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
  };
}
