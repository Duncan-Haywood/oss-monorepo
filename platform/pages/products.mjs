// The marketing pages for the company's products: /products/ (every product
// line and the hardware designs), /industries/ (the index of the industries the
// lines serve) and a plain page per industry at industries/<slug>/. Every word
// about a product comes from business.mjs, so a status change is one edit.
//
// The industry pages written here are the floor, not the finished page: a
// sibling module that writes a richer industries/<slug>/index.html later in
// the build replaces it (build.mjs calls buildProducts before the hub).
//
// Site conventions (README.md): readable without JavaScript, both colour
// schemes, phone width, the "no warranty" disclaimer check.mjs looks for, and
// the site's local-only usage counter (pf-site.js with data-pf-slug).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SITE_NAME, renderSiteFooterNav, siteTitle, withSiteHeader } from './site-nav.mjs';
import {
  CONTACT_EMAIL,
  INDUSTRIES,
  PRODUCT_LINES,
  STATUS,
  buildFirstHref,
  earlyAccessHref,
  hardwareLines,
  industriesWithProducts,
  industriesWithoutProducts,
  linesForIndustry,
  softwareLines,
} from './business.mjs';

export const PRODUCTS_PATH = 'products/';
export const INDUSTRIES_PATH = 'industries/';
export const industryPath = (slug) => `${INDUSTRIES_PATH}${slug}/`;

// The same names build.mjs uses (CHROME_MODULE_FILE, CHROME_SLUG_ATTR); repeated
// here because build.mjs imports this module. products.test.mjs holds them equal.
export const COUNTER_SCRIPT = 'pf-site.js';
export const COUNTER_ATTR = 'data-pf-slug';
// build.mjs's CUSTOM_DEV_PATH, repeated for the same reason; products.test.mjs holds them equal.
export const CUSTOM_DEV_PATH = 'custom-development/';

// "Small nonprofits" -> "small nonprofits" after "For", but "CNC machine shops" keeps its acronym.
const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Card styles, for any page that defines --ink, --muted, --line, --panel and --accent. */
export const PRODUCT_CARD_CSS = `
    .pl-grid { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 14px;
               grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
    .pl-card { display: flex; flex-direction: column; gap: 8px; background: var(--panel); border: 1px solid var(--line);
               border-radius: 14px; padding: 18px; min-width: 0; scroll-margin-top: 16px; }
    .pl-card h3 { margin: 0; font-size: 1.15rem; line-height: 1.3; }
    .pl-card h3 a { color: var(--ink); text-decoration: none; }
    .pl-card h3 a:hover { text-decoration: underline; }
    .pl-who { margin: 0; color: var(--muted); font-size: .9rem; }
    .pl-status { align-self: flex-start; font-size: .75rem; font-weight: 650; letter-spacing: .02em; padding: 3px 9px;
                 border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
    .pl-status[data-status="live"] { border-color: var(--accent); color: var(--accent); }
    .pl-card ul { margin: 2px 0 0; padding-left: 1.15em; font-size: .92rem; line-height: 1.45; }
    .pl-card li { margin: 0 0 4px; }
    .pl-what { margin: 0; font-size: .92rem; line-height: 1.5; }
    .pl-tools { margin: 0; font-size: .85rem; color: var(--muted); line-height: 1.5; }
    .pl-cta { margin: auto 0 0; padding-top: 6px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: .92rem; }
    .pl-cta .pl-go { display: inline-block; font-weight: 650; padding: 8px 14px; border-radius: 9px; text-decoration: none;
                     border: 1px solid var(--accent); color: var(--accent); }
    .pl-cta .pl-go[data-status="live"] { background: var(--accent); color: var(--accent-ink, #fff); }
`;

/**
 * One product card. `published`, when given, is the Set (or Map to short name) of
 * tool slugs the build published: a tool not in it is left out rather than
 * linked to a 404.
 */
export function renderProductCard(l, { toRoot = '', published = null, heading = 'h3', anchor = false } = {}) {
  const tools = l.tools.filter((slug) => !published || published.has(slug));
  // `published` may be a Map of slug to the tool's short name; a Set or nothing falls back to the slug.
  const toolNames = (slug) => (published instanceof Map && published.get(slug)) || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const status = STATUS[l.status];
  // An app on its own subdomain has an absolute href; a page on this site a relative one.
  const hrefOf = (h) => (/^https:\/\//.test(h) ? h : toRoot + h);
  const title = l.href
    ? `<a href="${esc(hrefOf(l.href))}" data-pf-to="${esc(l.id)}">${esc(l.name)}</a>`
    : anchor ? `<a href="${esc(`${toRoot}${PRODUCTS_PATH}#${l.id}`)}">${esc(l.name)}</a>` : esc(l.name);
  const toolLabel = l.kind === 'hardware' ? 'The design' : 'Free tools that do part of it today';
  const cta = l.status === 'live'
    ? `<a class="pl-go" data-status="live" href="${esc(hrefOf(l.href))}" data-pf-to="${esc(l.id)}">Open ${esc(l.name)}</a>`
    : l.status === 'early-access'
      ? `<a class="pl-go" href="${esc(earlyAccessHref(l))}">Ask for early access</a>`
      : '';
  return `<li class="pl-card" id="${esc(l.id)}">
  <span class="pl-status" data-status="${esc(l.status)}">${esc(status.label)}</span>
  <${heading}>${title}</${heading}>
  <p class="pl-who">For ${esc(lowerFirst(l.customer))}</p>
  <ul>${l.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  <p class="pl-what">${esc(l.product)}</p>
${tools.length ? `  <p class="pl-tools">${toolLabel}: ${tools.map((slug) => `<a href="${esc(`${toRoot}${slug}/`)}" data-pf-to="${esc(slug)}">${esc(toolNames(slug))}</a>`).join(', ')}</p>\n` : ''}${cta ? `  <p class="pl-cta">${cta}</p>\n` : ''}</li>`;
}

export function renderProductGrid(lines, opts = {}) {
  return `<ul class="pl-grid">\n${lines.map((l) => renderProductCard(l, opts)).join('\n')}\n</ul>`;
}

const PAGE_CSS = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#18202b; --muted:#56616f; --line:#dde3ea; --accent:#1f5fa8; --accent-ink:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542;
    --accent:#8fbcef; --accent-ink:#0f141a; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:24px 16px 72px; }
  a { color:var(--accent); }
  h1 { font-size:clamp(1.9rem,4.4vw,2.7rem); line-height:1.15; margin:.3em 0 .3em; letter-spacing:-.01em; }
  h2 { font-size:1.4rem; margin:0 0 .2em; letter-spacing:-.01em; }
  .eyebrow { margin:0; font-size:.8rem; font-weight:650; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
  .dek { max-width:62ch; font-size:1.05rem; color:var(--ink); margin:0 0 .6em; }
  .band { margin:36px 0 0; }
  .band-lede { max-width:66ch; color:var(--muted); margin:.2em 0 0; }
  .jump { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; padding:0; list-style:none; }
  .jump a { display:inline-block; padding:5px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel);
    text-decoration:none; color:var(--ink); font-size:.9rem; }
  .jump a:hover { border-color:var(--accent); }
  .ind-list { list-style:none; margin:18px 0 0; padding:0; display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
  .ind-list a { display:block; height:100%; padding:16px 18px; background:var(--panel); border:1px solid var(--line); border-radius:14px;
    text-decoration:none; color:var(--ink); }
  .ind-list a:hover { border-color:var(--accent); }
  .ind-list b { display:block; font-size:1.1rem; }
  .ind-list span { display:block; color:var(--muted); font-size:.9rem; margin-top:4px; }
  .jobs { max-width:66ch; margin:12px 0 0; padding-left:1.2em; }
  .jobs li { margin:0 0 6px; }
  .tool-list { list-style:none; margin:14px 0 0; padding:0; display:grid; gap:10px; grid-template-columns:repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
  .tool-list a { display:block; padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; text-decoration:none; color:var(--ink); }
  .tool-list a:hover { border-color:var(--accent); }
  .cta-row { display:flex; flex-wrap:wrap; gap:10px 16px; margin:14px 0 0; align-items:center; }
  .cta-row .go { display:inline-block; font-weight:650; padding:9px 16px; border-radius:9px; text-decoration:none; background:var(--accent); color:var(--accent-ink); }
  footer { margin-top:52px; border-top:1px solid var(--line); padding-top:24px; font-size:.87rem; line-height:1.6; color:var(--muted); }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
${PRODUCT_CARD_CSS}`;

const DISCLAIMER = `<p>Product descriptions say what each product is for and whether it is live. Anything marked
  “in development” or “long-term” is not for sale yet, and nothing here is a promise of a feature, a price or a date. Free tools and
  open designs are provided as-is, with no warranty of any kind, and are not legal, tax, accounting, engineering or professional advice.
  Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`;

function page({ toRoot, current, slug, title, description, canonical, crumbs, body, jsonLd }) {
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(siteTitle(title))}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
<main id="main">
${body}
</main>
<footer>
  ${DISCLAIMER}
  ${renderSiteFooterNav({ toRoot })}
</footer>
</div>
<script src="${esc(toRoot + COUNTER_SCRIPT)}" ${COUNTER_ATTR}="${esc(slug)}" defer></script>
</body>
</html>
`, { toRoot, current, crumbs });
}

const PRODUCTS_TITLE = 'Software and hardware for small businesses';
const PRODUCTS_DESCRIPTION =
  'Products built for one kind of business at a time: subcontractors, machine shops, resellers, EU invoicing and nonprofits. One live, the rest in early access.';

export function renderProductsPage({ baseUrl = '', published = null, lines = PRODUCT_LINES } = {}) {
  const toRoot = '../';
  const software = softwareLines(lines);
  const hardware = hardwareLines(lines);
  const canonical = baseUrl ? `${baseUrl}${PRODUCTS_PATH}` : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: PRODUCTS_TITLE,
    description: PRODUCTS_DESCRIPTION,
    url: canonical || undefined,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl || undefined },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: lines.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.name, url: baseUrl ? `${baseUrl}${PRODUCTS_PATH}#${l.id}` : undefined })),
    },
  };
  const body = `<header>
<p class="eyebrow">Products</p>
<h1>${esc(PRODUCTS_TITLE)}</h1>
<p class="dek">Each product is built for one kind of business and the jobs it struggles with most. ${esc(lines.find((l) => l.status === 'live')?.name ?? 'None')} is live today;
the others are in development, and the free tools beside each already do part of the job.</p>
<ul class="jump">${INDUSTRIES.filter((i) => linesForIndustry(i.slug, lines).length).map((i) => `<li><a href="${esc(toRoot + industryPath(i.slug))}">${esc(i.name)}</a></li>`).join('')}<li><a href="#hardware">Hardware</a></li></ul>
</header>
<section class="band" id="software" aria-labelledby="software-h">
<h2 id="software-h">Software</h2>
<p class="band-lede">Live means you can sign up and use it now. Early access means it is being built: write to us and you will hear when it opens.</p>
${renderProductGrid(software, { toRoot, published })}
</section>
<section class="band" id="hardware" aria-labelledby="hardware-h">
<h2 id="hardware-h">Hardware</h2>
<p class="band-lede">Open designs for machines that take routine physical work off a crew. Each has CAD, firmware and a parts list in the open.
Nothing has been physically built or tested yet, and a manufactured product is a long-term plan. More on each design's stage: <a href="${esc(toRoot)}hardware/">open hardware for businesses</a>.</p>
${renderProductGrid(hardware, { toRoot, published })}
</section>
<section class="band" id="yours" aria-labelledby="yours-h">
<h2 id="yours-h">Don’t see your business?</h2>
<p class="band-lede">Tell us the job that costs you the most time. <a href="${esc(toRoot)}custom-development/">Describe your problem</a>,
or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Free tools for the same businesses are on the <a href="${esc(toRoot)}c/">tools pages</a>.</p>
</section>`;
  return page({ toRoot, current: 'products', slug: 'products', title: PRODUCTS_TITLE, description: PRODUCTS_DESCRIPTION, canonical, body, jsonLd });
}

const INDUSTRIES_TITLE = 'Industries we build for';
const INDUSTRIES_DESCRIPTION =
  'Construction, restaurants, salons, clinics, shops, trucking, farms and more: the small businesses we build for, the jobs each finds hardest, and free tools.';

function industryItem(i, toRoot, lines) {
  const names = linesForIndustry(i.slug, lines).map((l) => l.name).join(', ');
  return `<li><a href="${esc(toRoot + industryPath(i.slug))}"><b>${esc(i.name)}</b><span>${esc(i.who)}</span>${names ? `<span>${esc(names)}</span>` : ''}</a></li>`;
}

export function renderIndustriesPage({ baseUrl = '', lines = PRODUCT_LINES } = {}) {
  const toRoot = '../';
  const canonical = baseUrl ? `${baseUrl}${INDUSTRIES_PATH}` : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: INDUSTRIES_TITLE,
    description: INDUSTRIES_DESCRIPTION,
    url: canonical || undefined,
    hasPart: INDUSTRIES.map((i) => ({ '@type': 'WebPage', name: i.name, url: baseUrl ? `${baseUrl}${industryPath(i.slug)}` : undefined })),
  };
  const withProducts = industriesWithProducts(lines);
  const next = industriesWithoutProducts(lines);
  const body = `<header>
<p class="eyebrow">Industries</p>
<h1>${esc(INDUSTRIES_TITLE)}</h1>
<p class="dek">Software for most kinds of small business, built around the job each finds hardest. Pick yours.</p>
</header>
<section class="band" aria-labelledby="ind-products-h">
<h2 id="ind-products-h">Products in development</h2>
<p class="band-lede">Each of these has a product being built for it, and free tools that already do part of the job.</p>
<ul class="ind-list">
${withProducts.map((i) => industryItem(i, toRoot, lines)).join('\n')}
</ul>
</section>
${next.length ? `<section class="band" aria-labelledby="ind-next-h">
<h2 id="ind-next-h">Free tools today, products next</h2>
<p class="band-lede">No paid product for these yet. Each page lists the jobs we are starting from and the free tools that help today, and asks you which job to build first.</p>
<ul class="ind-list">
${next.map((i) => industryItem(i, toRoot, lines)).join('\n')}
</ul>
</section>
` : ''}<section class="band" aria-labelledby="all-h">
<h2 id="all-h">Not listed, or need something specific?</h2>
<p class="band-lede">Every product line, with its status, and the hardware designs: <a href="${esc(toRoot + PRODUCTS_PATH)}">see all products</a>.
Any small business can also <a href="${esc(toRoot + CUSTOM_DEV_PATH)}">ask for a tool to be built</a>, free and in public.</p>
</section>`;
  return page({ toRoot, current: 'industries', slug: 'industries', title: INDUSTRIES_TITLE, description: INDUSTRIES_DESCRIPTION, canonical, body, jsonLd });
}

/** The default page for one industry: its lines, their problems and the free tools. */
export function renderIndustryPage(industry, { baseUrl = '', published = null, lines = PRODUCT_LINES } = {}) {
  const mine = linesForIndustry(industry.slug, lines);
  return mine.length
    ? renderIndustryWithProducts(industry, mine, { baseUrl, published })
    : renderIndustryWithoutProducts(industry, { baseUrl, published });
}

function otherIndustries(industry, toRoot) {
  return `<section class="band" aria-labelledby="more-h">
<h2 id="more-h">Other industries</h2>
<ul class="jump">${INDUSTRIES.filter((i) => i.slug !== industry.slug).map((i) => `<li><a href="${esc(toRoot + industryPath(i.slug))}">${esc(i.name)}</a></li>`).join('')}<li><a href="${esc(toRoot + PRODUCTS_PATH)}">All products</a></li></ul>
</section>`;
}

function industryPage(industry, { toRoot, title, description, canonical, body, jsonLd }) {
  return page({
    toRoot,
    current: 'industries',
    slug: `industries/${industry.slug}`,
    title,
    description,
    canonical,
    crumbs: [{ label: 'Industries', href: `${toRoot}${INDUSTRIES_PATH}` }, { label: industry.name }],
    body,
    jsonLd,
  });
}

function renderIndustryWithProducts(industry, mine, { baseUrl, published }) {
  const toRoot = '../../';
  const canonical = baseUrl ? `${baseUrl}${industryPath(industry.slug)}` : '';
  const title = `${industry.name}: products and free tools`;
  const description = `${industry.who}: the jobs they struggle with most, the products we are building for them, and free tools that help today.`.slice(0, 158);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical || undefined,
    about: mine.map((l) => ({ '@type': 'SoftwareApplication', name: l.name, applicationCategory: 'BusinessApplication' })),
  };
  const body = `<header>
<p class="eyebrow">${esc(industry.name)}</p>
<h1>${esc(title)}</h1>
<p class="dek">For ${esc(lowerFirst(industry.who))}. What follows is each product we are building for you,
the jobs it is for, and the free tools that already do part of it.</p>
</header>
${renderProductGrid(mine, { toRoot, published, heading: 'h2' })}
${otherIndustries(industry, toRoot)}`;
  return industryPage(industry, { toRoot, title, description, canonical, body, jsonLd });
}

/** An industry with free tools and no paid product yet: the jobs, the tools, and "which first?". */
function renderIndustryWithoutProducts(industry, { baseUrl, published }) {
  const toRoot = '../../';
  const canonical = baseUrl ? `${baseUrl}${industryPath(industry.slug)}` : '';
  const title = `${industry.name}: free tools, and what we build next`;
  const description = `${industry.who}: free tools for the jobs that take the most time, and a say in which job we build a product for first.`.slice(0, 158);
  const tools = industry.tools.filter((slug) => !published || published.has(slug));
  const toolName = (slug) => (published instanceof Map && published.get(slug)) || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical || undefined,
    hasPart: tools.map((slug) => ({ '@type': 'WebApplication', name: toolName(slug), url: baseUrl ? `${baseUrl}${slug}/` : undefined })),
  };
  const body = `<header>
<p class="eyebrow">${esc(industry.name)}</p>
<h1>${esc(title)}</h1>
<p class="dek">For ${esc(lowerFirst(industry.who))}. There is no paid product for you yet. Below are the jobs we are
starting from, the free tools that help with them today, and a way to tell us which one to build first.</p>
</header>
<section class="band" aria-labelledby="jobs-h">
<h2 id="jobs-h">The jobs we are starting from</h2>
<ul class="jobs">${industry.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
</section>
${tools.length ? `<section class="band" aria-labelledby="tools-h">
<h2 id="tools-h">Free tools that help today</h2>
<p class="band-lede">Free, in your browser, no account needed.</p>
<ul class="tool-list">${tools.map((slug) => `<li><a href="${esc(`${toRoot}${slug}/`)}" data-pf-to="${esc(slug)}">${esc(toolName(slug))}</a></li>`).join('')}</ul>
</section>
` : ''}<section class="band" aria-labelledby="first-h">
<h2 id="first-h">Which job should we build first?</h2>
<p class="band-lede">Tell us which of these costs your business the most time, or what is missing from the list. The answers decide which product we build next for ${esc(lowerFirst(industry.name))}.
If you need something specific for your own business, we build that too: free, in public, and you pay only what it costs to run.</p>
<p class="cta-row"><a class="go" href="${esc(buildFirstHref(industry))}">Tell us what to build first</a><a href="${esc(toRoot + CUSTOM_DEV_PATH)}">Ask for a custom tool</a></p>
</section>
${otherIndustries(industry, toRoot)}`;
  return industryPage(industry, { toRoot, title, description, canonical, body, jsonLd });
}

/** Every URL these pages add, site-relative, for the sitemap. */
export function productSitemapPaths() {
  return [PRODUCTS_PATH, INDUSTRIES_PATH, ...INDUSTRIES.map((i) => industryPath(i.slug))];
}

/** Write products/, industries/ and industries/<slug>/. */
export async function buildProducts(outDir, baseUrl = '', { published = null } = {}) {
  const write = async (rel, html) => {
    const dir = path.join(outDir, rel);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), html);
  };
  await write(PRODUCTS_PATH, renderProductsPage({ baseUrl, published }));
  await write(INDUSTRIES_PATH, renderIndustriesPage({ baseUrl }));
  for (const industry of INDUSTRIES) await write(industryPath(industry.slug), renderIndustryPage(industry, { baseUrl, published }));
}
