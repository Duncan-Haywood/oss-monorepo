#!/usr/bin/env node
/**
 * Render the pages `local-site-studio` delivers to a paying customer.
 *
 * Every other accessibility corpus this portfolio has measured came from a
 * build directory. `local-site-studio`'s product does not appear in one: a
 * customer's live site is the `/preview/[slug]` route rendered per-request from
 * that customer's lead record and served on their own domain (see
 * `src/lib/deploy/custom-domain-routing.ts`). A `next build` emits no HTML for
 * it, so `portfolio/research/a11y-own-sites/` — which walks `.next/server/` —
 * audited this venture's marketing and docs pages and could not see the thing
 * it sells. That directory's own closing note says so:
 *
 *   "`local-site-studio`'s delivered product is not in this corpus ... That is
 *    the corpus worth auditing next, and it is the one that carries the actual
 *    liability — every defect in a generated theme ships to every customer who
 *    buys one."
 *
 * This script produces that corpus. It renders the real component tree
 * (`RootLayout` wrapping the `/preview/[slug]` page body) with
 * `renderToStaticMarkup`, through Vite's SSR module loader so the venture's TSX
 * and its `@/` alias resolve exactly as they do in the app. Nothing is fetched,
 * no server is listened on, no database is read: the leads are fixtures chosen
 * to cover every branch in the tree.
 *
 * Usage, from anywhere::
 *
 *     cd ventures/local-site-studio && npm ci      # once; node_modules needed
 *     node portfolio/research/a11y-generated-sites/render_corpus.mjs --out corpus/
 *
 * The corpus is committed, so `audit_generated_sites.py` re-derives every
 * number offline without this script or a `node_modules`.
 *
 * ## What this corpus is not
 *
 * `renderToStaticMarkup` is the server's pre-hydration output, which is the
 * same limit every static engine in this portfolio already carries: a name
 * attached by client JavaScript reads as missing here, and one removed on the
 * client reads as present. It is the right approximation for a first paint and
 * for a customer with JavaScript disabled, and it is not an audit of the
 * hydrated page.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, "../../..");
const VENTURE = path.join(REPO_ROOT, "ventures/local-site-studio");

const require = createRequire(path.join(VENTURE, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);

// ---------------------------------------------------------------------------
// Fixtures
//
// One variant per branch that changes the delivered markup. The axes are read
// off the component tree, not guessed: category selects a theme, `dataSource`
// gates the demo banner, a non-empty catalog mounts the commerce section,
// `address` and `email` are optional, and `recommendedTier` moves the
// highlighted card in the upsell.
// ---------------------------------------------------------------------------

/** A paid customer's own record: no demo provenance, so no placeholder banner. */
function paid(lead, overrides = {}) {
  return { ...lead, dataSource: "manual_entry", stage: "live", ...overrides };
}

const CATALOG = [
  {
    id: "sku_loaf",
    name: "Country sourdough loaf",
    description: "800g naturally leavened, baked the morning of pickup.",
    priceCents: 1200,
  },
  { id: "sku_box", name: "Pastry box (6)", priceCents: 2400 },
];

function variants(demoLeads, resolvePreviewLead) {
  const bySlug = Object.fromEntries(demoLeads.map((l) => [l.slug, l]));
  const restaurant = bySlug["example-bakery"];
  const salon = bySlug["serene-salon"];
  const trades = bySlug["mountain-plumbing"];
  // No demo lead is `generic`; the slug-inference path produces that theme.
  const generic = resolvePreviewLead("harbor-supply-co");

  return [
    // The four themes as a prospect first sees them (demo banner on).
    { name: "demo-restaurant", lead: restaurant, items: [] },
    { name: "demo-salon", lead: salon, items: [] },
    { name: "demo-trades", lead: trades, items: [] },
    { name: "demo-generic", lead: generic, items: [] },

    // The same four as a paying customer's live site. This is the shape that
    // carries the liability: it is served on the customer's domain, under the
    // customer's name, with no banner disclaiming it.
    { name: "live-restaurant", lead: paid(restaurant), items: [] },
    { name: "live-salon", lead: paid(salon), items: [] },
    { name: "live-trades", lead: paid(trades), items: [] },
    { name: "live-generic", lead: paid(generic), items: [] },

    // Commerce add-on mounted (a second interactive section with per-SKU
    // controls), with and without SKU descriptions.
    { name: "live-restaurant-commerce", lead: paid(restaurant), items: CATALOG },
    {
      name: "live-generic-commerce",
      lead: paid(generic),
      items: [CATALOG[1]],
    },

    // Optional fields absent — the map falls back to city/state, and the
    // contact block drops a row.
    {
      name: "live-trades-no-address",
      lead: paid(trades, { address: undefined }),
      items: [],
    },
    {
      name: "live-salon-no-email",
      lead: paid(salon, { email: undefined }),
      items: [],
    },

    // Each upsell tier, since the recommended card renders differently.
    {
      name: "live-restaurant-tier-starter",
      lead: paid(restaurant, { recommendedTier: "starter" }),
      items: [],
    },
    {
      name: "live-restaurant-tier-growth",
      lead: paid(restaurant, { recommendedTier: "growth" }),
      items: [],
    },
    {
      name: "live-restaurant-tier-complete",
      lead: paid(restaurant, { recommendedTier: "complete" }),
      items: [],
    },

    // Content extremes a real lead record can hold: a long business name and
    // a single service, versus the maximum services the intake writes.
    {
      name: "live-generic-long-name",
      lead: paid(generic, {
        businessName:
          "Harbor Supply Co. Marine Outfitters & Dockside Provisioning Company",
        services: ["Single service"],
      }),
      items: [],
    },
  ];
}

// ---------------------------------------------------------------------------
// Head reconstruction
// ---------------------------------------------------------------------------

const escapeAttr = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Splice in the `<head>` Next builds from the route's `generateMetadata`.
 *
 * `RootLayout` renders `<html>` and `<body>` and no `<head>` at all — Next
 * injects that during its own render, so `renderToStaticMarkup` on the layout
 * alone emits a document with no `<title>`. Left uncorrected, that shows up as
 * a 2.4.2 finding on all 16 pages: a defect in the harness reported as a defect
 * in the product, which is precisely the error
 * `portfolio/research/a11y-own-sites/` measured at 11.9% of its findings and
 * asked the next corpus to avoid.
 *
 * The tags below mirror `src/app/preview/[slug]/page.tsx`'s `generateMetadata`
 * field for field, computed from the same `src/lib/seo.ts` helpers it calls, so
 * the reconstruction tracks the route rather than restating it.
 */
function withHead(markup, lead, seo) {
  const title = seo.leadMetaTitle(lead);
  const description = seo.leadMetaDescription(lead);
  const url = seo.previewUrl(lead.slug);

  const head =
    "<head>" +
    `<title>${escapeAttr(title)}</title>` +
    `<meta name="description" content="${escapeAttr(description)}"/>` +
    `<link rel="canonical" href="${escapeAttr(url)}"/>` +
    `<meta property="og:title" content="${escapeAttr(title)}"/>` +
    `<meta property="og:description" content="${escapeAttr(description)}"/>` +
    `<meta property="og:url" content="${escapeAttr(url)}"/>` +
    `<meta property="og:type" content="website"/>` +
    `<meta name="twitter:card" content="summary"/>` +
    `<meta name="twitter:title" content="${escapeAttr(title)}"/>` +
    `<meta name="twitter:description" content="${escapeAttr(description)}"/>` +
    "</head>";

  const openTag = markup.match(/^<html[^>]*>/);
  if (!openTag) throw new Error("layout did not render an <html> element");
  return markup.slice(0, openTag[0].length) + head + markup.slice(openTag[0].length);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function main() {
  const outArg = process.argv.indexOf("--out");
  const outDir = path.resolve(
    outArg === -1 ? path.join(HERE, "corpus") : process.argv[outArg + 1],
  );

  const server = await createServer({
    root: VENTURE,
    configFile: false,
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: {
      alias: {
        "@": path.join(VENTURE, "src"),
        // Next applies a `react-server` export condition that makes this
        // package a no-op; plain SSR resolution does not, and its default
        // export throws. The venture already keeps a stub for its own tests.
        "server-only": path.join(VENTURE, "test/server-only-stub.ts"),
      },
    },
  });

  const load = (p) => server.ssrLoadModule(p);
  const { default: RootLayout } = await load("/src/app/layout.tsx");
  const { CategoryPreview } = await load(
    "/src/components/preview/category-preview.tsx",
  );
  const { PreviewOpenBeacon } = await load(
    "/src/components/preview/preview-open-beacon.tsx",
  );
  const { DEMO_LEADS, resolvePreviewLead } = await load(
    "/src/lib/leads/demo-catalog.ts",
  );
  const seo = await load("/src/lib/seo.ts");

  const h = React.createElement;
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  for (const { name, lead, items } of variants(DEMO_LEADS, resolvePreviewLead)) {
    // Mirrors `src/app/preview/[slug]/page.tsx`: the JSON-LD script, the
    // attribution beacon, then the themed page.
    const body = h(
      React.Fragment,
      null,
      h("script", {
        type: "application/ld+json",
        dangerouslySetInnerHTML: {
          __html: seo.safeJsonLdScript(seo.leadLocalBusinessJsonLd(lead)),
        },
      }),
      h(PreviewOpenBeacon, {
        slug: lead.slug,
        src: null,
        utmSource: null,
        trackByStage:
          lead.stage === "outreach_sent" || lead.stage === "discovery_call",
      }),
      h(CategoryPreview, { lead, commerceItems: items }),
    );

    const html = "<!DOCTYPE html>" + withHead(
      renderToStaticMarkup(h(RootLayout, null, body)),
      lead,
      seo,
    );
    const file = path.join(outDir, `${name}.html`);
    fs.writeFileSync(file, html + "\n", "utf8");
    written.push({ name, bytes: html.length });
  }

  await server.close();

  for (const { name, bytes } of written) {
    process.stdout.write(`${name.padEnd(32)} ${String(bytes).padStart(7)} bytes\n`);
  }
  process.stdout.write(`\n${written.length} pages -> ${outDir}\n`);
}

await main();
