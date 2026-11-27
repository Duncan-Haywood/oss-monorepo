// Shared HTML: escaping, the page shell (head, header, footer) and small helpers. Used by the static
// build (scripts/build.ts) and by the worker's own pages (confirm / remove), so both look the same.
// No inline scripts or styles anywhere: public/_headers sets a strict CSP.
import {
  absoluteUrl,
  basePathOf,
  NO_WARRANTY_NOTE,
  NOT_AIA_NOTE,
  PAGES,
  PRODUCT_NAME,
  type PublicPage,
} from "@shared/site";
import { type LaunchInput, launchOf, plansSentence, signupUrl } from "./launch";

export interface SiteContext extends LaunchInput {
  /** Origin + base path, e.g. "https://marisstella.app/payapps". */
  siteUrl: string;
  /**
   * Served as plain static files with no Worker in front (the catalogue at marisstella.app/payapps,
   * `scripts/export-static.ts`): the early-access form and its status pages need the Worker's API, so
   * they are left out. Only allowed once the app is open (APP_URL set); before launch the early-access
   * list is the only call to action and needs the Worker.
   */
  staticHost?: boolean;
}

/** A string that is already safe HTML. */
export interface Html {
  readonly __html: string;
}

export const raw = (s: string): Html => ({ __html: s });

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tagged template: interpolated strings are escaped, Html values and arrays of them are not. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += render(v) + (strings[i + 1] ?? "");
  });
  return raw(out);
}

function render(v: unknown): string {
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  if (typeof v === "object" && "__html" in v) return (v as Html).__html;
  return esc(String(v));
}

/** Site-relative href with the base path, e.g. href(ctx, "/pricing") → "/payapps/pricing". */
export function href(ctx: SiteContext, path: string): string {
  // The catalogue may serve its tree under another base (check.mjs refuses root-absolute links), and
  // every static page sits in the base directory itself, so links there are relative.
  if (ctx.staticHost) return path === "/" ? "./" : path.slice(1);
  const base = basePathOf(ctx.siteUrl);
  if (path === "/") return `${base}/`;
  return `${base}${path}`;
}

/** JSON for a <script type="application/ld+json"> block (no "</" can close the tag early). */
export function jsonLdScript(data: unknown): Html {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return raw(`<script type="application/ld+json">${json}</script>`);
}

const NAV: readonly PublicPage[] = [PAGES.features, PAGES.pricing];

/** The page's main call to action: early access before launch, "Start free" after (launch.ts). */
export function primaryCta(ctx: SiteContext, from: string, label?: string): Html {
  const l = launchOf(ctx);
  if (l.appUrl) {
    return html`<a class="btn" href="${signupUrl(l.appUrl, from)}">${label ?? "Start free on one job"}</a>`;
  }
  return html`<a class="btn" href="${href(ctx, PAGES.earlyAccess.path)}">${label ?? "Join early access"}</a>`;
}

/** The footer's status line. */
export function statusLine(ctx: SiteContext): string {
  const l = launchOf(ctx);
  return l.open
    ? `${PRODUCT_NAME} is open now. ${plansSentence(l)}`
    : `${PRODUCT_NAME} is in development. Early access is open; nothing is for sale yet.`;
}

function headerCta(ctx: SiteContext): Html {
  const l = launchOf(ctx);
  return l.appUrl
    ? html`<a href="${`${l.appUrl}/`}">Sign in</a> <a class="btn btn-small" href="${signupUrl(l.appUrl, "header")}">Start free</a>`
    : html`<a class="btn btn-small" href="${href(ctx, PAGES.earlyAccess.path)}">Join early access</a>`;
}

export interface ShellOptions {
  page: PublicPage;
  main: Html;
  /** JSON-LD nodes for this page (rendered as one @graph). */
  jsonLd?: readonly Record<string, unknown>[];
  /** Status shown to crawlers; worker pages pass false. */
  indexable?: boolean;
}

export function pageShell(ctx: SiteContext, opts: ShellOptions): string {
  const { page, main } = opts;
  const indexable = opts.indexable ?? page.indexable;
  const canonical = absoluteUrl(ctx.siteUrl, page.path);
  const ogImage = absoluteUrl(ctx.siteUrl, "/og.svg");
  const graph = opts.jsonLd?.length
    ? jsonLdScript({ "@context": "https://schema.org", "@graph": opts.jsonLd })
    : "";
  const doc = html`<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
${indexable ? html`<link rel="canonical" href="${canonical}">` : raw('<meta name="robots" content="noindex, nofollow">')}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${PRODUCT_NAME}">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${page.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#1d3a5c">
<link rel="icon" href="${href(ctx, "/favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${href(ctx, "/styles.css")}">
<link rel="alternate" type="application/atom+xml" title="${PRODUCT_NAME} updates" href="${href(ctx, "/feed.xml")}">
${graph}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="${href(ctx, "/")}"><span class="logo-mark" aria-hidden="true"></span>${PRODUCT_NAME}</a>
    <nav aria-label="Main">
      ${NAV.map((p) => html`<a href="${href(ctx, p.path)}"${p.path === page.path ? raw(' aria-current="page"') : ""}>${p.label}</a>`)}
      ${headerCta(ctx)}
    </nav>
  </div>
</header>
<main id="main">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>${statusLine(ctx)}</p>
    <p class="fine">${NOT_AIA_NOTE}</p>
    <p class="fine">${NO_WARRANTY_NOTE}</p>
    <p class="footer-links">
      <a href="${href(ctx, PAGES.features.path)}">Features</a>
      <a href="${href(ctx, PAGES.pricing.path)}">Pricing</a>
      ${launchOf(ctx).appUrl ? html`<a href="${`${launchOf(ctx).appUrl}/`}">Sign in</a>` : html`<a href="${href(ctx, PAGES.earlyAccess.path)}">Early access</a>`}
      <a href="${href(ctx, PAGES.privacy.path)}">Privacy</a>
      <a href="${href(ctx, "/llms.txt")}">llms.txt</a>
    </p>
  </div>
</footer>
</body>
</html>
`;
  return doc.__html;
}
