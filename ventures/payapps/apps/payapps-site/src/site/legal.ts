// The Terms of Service, Refund Policy and Acceptable Use Policy pages. Each one renders the app's own
// document (apps/payapps/docs/legal/*.md, bundled in legal-docs.ts by `pnpm sync:legal`), so the
// marketing site and the app can never say different things. A payment provider's website review
// (Paddle, apps/payapps/docs/BILLING.md) reads these pages next to the pricing page; they are plain
// HTML so they read without the app's JavaScript.
import { absoluteUrl, LEGAL_PAGES, type LegalPageKey, PAGES } from "@shared/site";
import { type Html, href, html, raw, type SiteContext } from "./html";
import { launchOf } from "./launch";
import { SITE_LEGAL_MARKDOWN } from "./legal-docs";
import { markdownToHtml } from "./markdown";

export interface LegalDoc {
  title: string;
  /** The document's own "**Version YYYY-MM-DD**" date. */
  version: string;
  operator: string;
  markdown: string;
}

/** Title, version date and operator read from the document's first lines. */
export function legalDoc(key: LegalPageKey): LegalDoc {
  const markdown = SITE_LEGAL_MARKDOWN[LEGAL_PAGES[key]];
  const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim();
  const versionLine = /^\*\*Version (\d{4}-\d{2}-\d{2})\*\* · (.+)$/m.exec(markdown);
  if (!title || !versionLine) {
    throw new Error(
      `${LEGAL_PAGES[key]}.md needs a "# Title" and a "**Version YYYY-MM-DD** · Operator" line`,
    );
  }
  return {
    title,
    version: versionLine[1] as string,
    operator: (versionLine[2] as string).trim(),
    markdown,
  };
}

/** The document body as HTML, without its title and version line (the page head shows them). */
export function legalBodyHtml(doc: LegalDoc): string {
  const body = doc.markdown.replace(/^\*\*Version \d{4}-\d{2}-\d{2}\*\* · .+$/m, "");
  return markdownToHtml(body, { dropTitle: true });
}

export interface LegalBuilt {
  main: Html;
  jsonLd: Record<string, unknown>[];
}

export function legalPage(ctx: SiteContext, key: LegalPageKey): LegalBuilt {
  const page = PAGES[key];
  const doc = legalDoc(key);
  const appUrl = launchOf(ctx).appUrl;
  const others = (Object.keys(LEGAL_PAGES) as LegalPageKey[]).filter((k) => k !== key);
  const main = html`
<section class="page-head">
  <div class="wrap narrow">
    <p class="eyebrow">Legal</p>
    <h1>${doc.title}</h1>
    <p class="lede">Version ${doc.version} · ${doc.operator}. This is the same text the ${appUrl ? html`<a href="${`${appUrl}/legal/${LEGAL_PAGES[key]}`}">app</a>` : "app"} asks every account to accept.</p>
  </div>
</section>
<div class="wrap narrow section prose">
${raw(legalBodyHtml(doc))}
<h2>Related</h2>
<ul>
  ${others.map((k) => html`<li><a href="${href(ctx, PAGES[k].path)}">${legalDoc(k).title}</a></li>`)}
  <li><a href="${appUrl ? `${appUrl}/legal/privacy` : href(ctx, PAGES.privacy.path)}">Privacy Policy</a> (your account and jobs) and this website's <a href="${href(ctx, PAGES.privacy.path)}">privacy notice</a></li>
  <li><a href="${href(ctx, PAGES.pricing.path)}">Pricing</a></li>
</ul>
</div>`;
  const url = absoluteUrl(ctx.siteUrl, page.path);
  return {
    main,
    jsonLd: [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        dateModified: doc.version,
        isPartOf: { "@id": `${absoluteUrl(ctx.siteUrl, "/")}#website` },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [PAGES.home, page].map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.label,
          item: absoluteUrl(ctx.siteUrl, p.path),
        })),
      },
    ],
  };
}
