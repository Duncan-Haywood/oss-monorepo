// Writes the site to dist/: every page from PUBLIC_ROUTES (src/site/routes.ts) as static HTML,
// sitemap.xml, robots.txt, llms.txt, llms-full.txt, plus everything in public/.
//
//   pnpm build                                   # local: links at the host root
//   BASE_PATH=/jobshop pnpm build                # production under marisstella.app/jobshop
//
// Env: SITE_URL (default DEFAULT_SITE_URL in src/site/config.ts) for canonical/OG URLs, sitemap,
// robots.txt and llms.txt; BASE_PATH (default "") prefixed to every internal link. With a base path
// the files are written under dist/<base path>/ so Workers static assets serves them at the public
// path; _headers stays at the dist/ root, where the asset server reads it.
import { cpSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, resolveBuildOptions } from "../src/site/build.ts";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const opts = resolveBuildOptions(process.env);
const ROOT = join(APP, "dist");
const DIST = join(ROOT, opts.basePath);

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(APP, "public"), DIST, { recursive: true });
if (DIST !== ROOT) renameSync(join(DIST, "_headers"), join(ROOT, "_headers"));

const files = buildSite(opts);
for (const [rel, content] of files) {
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
}
// Served for unknown paths (assets.not_found_handling "404-page").
writeFileSync(
  join(DIST, "404.html"),
  (files.get("index.html") ?? "")
    .replace(/<main id="main">[\s\S]*<\/main>/, () =>
      [
        '<main id="main"><section class="page-head"><div class="container narrow">',
        "<h1>Page not found</h1>",
        `<p class="lead"><a class="link" href="${opts.basePath}/">Go to the home page</a></p>`,
        "</div></section></main>",
      ].join(""),
    )
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "")
    .replace(/<link rel="canonical"[^>]*>/, "")
    .replace(/<title>[^<]*<\/title>/, "<title>Page not found</title>")
    .replace(/<meta name="description"[^>]*>/, '<meta name="robots" content="noindex">'),
);

console.log(
  `[build] ${files.size + 1} files -> dist/ (site: ${opts.siteUrl}, base path: ${opts.basePath || "none"})`,
);
