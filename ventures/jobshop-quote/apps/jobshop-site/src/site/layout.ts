// The document shell around every page: head tags (title, description, canonical, OG/Twitter,
// JSON-LD), header, status strip and footer. Same tag set as apps/grants' prerender.

import { appLink, CMMC_SITE_URL, CONTACT_EMAIL, PUBLISHER, SITE_NAME, TAGLINE } from "./config";
import { type Html, html, raw } from "./html";
import { href, primaryCta, type RenderContext } from "./pages";
import type { PublicRoute } from "./routes";

export interface DocumentContext extends RenderContext {
  /** Origin + base path, no trailing slash. */
  siteUrl: string;
}

export const canonical = (ctx: DocumentContext, path: string): string =>
  `${ctx.siteUrl}${path === "/" ? "/" : path}`;

const NAV: readonly { path: string; label: string }[] = [
  { path: "/how-it-works", label: "How it works" },
  { path: "/pricing", label: "Pricing" },
  { path: "/for-cmmc-shops", label: "Defense shops" },
  { path: "/faq", label: "FAQ" },
];

const LOGO = raw(
  `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="currentColor"/><path d="M9 10h14M9 16h9M9 22h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="22.5" cy="21.5" r="3.5" fill="none" stroke="#fff" stroke-width="2.2"/></svg>`,
);

function headTags(ctx: DocumentContext, route: PublicRoute, jsonLd: unknown): Html {
  const url = canonical(ctx, route.path);
  const image = `${ctx.siteUrl}/og.png`;
  const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return html`<title>${route.title}</title>
    <meta name="description" content="${route.description}">
    <link rel="canonical" href="${url}">
    ${route.noindex ? html`<meta name="robots" content="noindex">` : ""}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:locale" content="en_US">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${route.title}">
    <meta property="og:description" content="${route.description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${SITE_NAME}: ${TAGLINE}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${route.title}">
    <meta name="twitter:description" content="${route.description}">
    <meta name="twitter:image" content="${image}">
    <link rel="icon" href="${href(ctx, "/favicon.svg")}" type="image/svg+xml">
    <link rel="stylesheet" href="${href(ctx, "/styles.css")}">
    <script type="application/ld+json">${raw(json)}</script>`;
}

/** The strip under the header: what a visitor can do today, in one line. */
export function statusLine(ctx: RenderContext): string {
  const { open, paidPlans } = ctx.launch;
  if (!open) return "In development · early access is free · nothing is for sale yet";
  return `Open · free Early access plan, no card${paidPlans ? "" : " · paid plans not on sale yet"}`;
}

export function renderDocument(
  ctx: DocumentContext,
  route: PublicRoute,
  body: Html,
  jsonLd: unknown,
): string {
  const open = ctx.launch.open;
  const doc = html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#226955">
    ${headTags(ctx, route, jsonLd)}
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="container header-row">
        <a class="brand" href="${href(ctx, "/")}">${LOGO}<span>${SITE_NAME}</span></a>
        <nav aria-label="Main">
          <ul>
            ${NAV.map(
              (n) =>
                html`<li><a href="${href(ctx, n.path)}"${n.path === route.path ? html` aria-current="page"` : ""}>${n.label}</a></li>`,
            )}
            ${
              open
                ? html`<li><a href="${appLink(ctx.launch, "/sign-in")}">Sign in</a></li>
            <li>${primaryCta(ctx, "btn btn-primary btn-sm")}</li>`
                : html`<li><a class="btn btn-primary btn-sm" href="${href(ctx, "/early-access")}">Early access</a></li>`
            }
          </ul>
        </nav>
      </div>
    </header>
    <p class="status-strip">${statusLine(ctx)}</p>
    <main id="main">
${body}
    </main>
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <p class="brand">${LOGO}<span>${SITE_NAME}</span></p>
          <p class="fineprint">${TAGLINE}.${open ? "" : " In development."}</p>
        </div>
        <nav aria-label="Footer">
          <ul>
            ${NAV.map((n) => html`<li><a href="${href(ctx, n.path)}">${n.label}</a></li>`)}
            ${
              open
                ? html`<li><a href="${appLink(ctx.launch, "/sign-up")}">Start free</a></li>
            <li><a href="${appLink(ctx.launch, "/legal/terms")}">Terms</a></li>`
                : html`<li><a href="${href(ctx, "/early-access")}">Early access</a></li>`
            }
            <li><a href="${href(ctx, "/privacy")}">Privacy</a></li>
            <li><a href="${CMMC_SITE_URL}">CMMC workspace (coming)</a></li>
          </ul>
        </nav>
        <div>
          <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
          <p class="fineprint">© 2026 ${PUBLISHER}</p>
        </div>
      </div>
      <div class="container">
        <p class="fineprint">${SITE_NAME} is provided as is, with no warranty: check every price,
        time and quantity before you send a quote. Nothing on this site is engineering, legal or tax
        advice.${open ? " Use of the app is governed by its Terms of Service." : ""}</p>
      </div>
    </footer>
  </body>
</html>
`;
  return doc.value;
}
