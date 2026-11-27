// Writes the static site to dist/: pages, sitemap/robots/llms/feed, styles and public/ files.
//
//   SITE_URL=https://marisstella.app/payapps pnpm build   (default: DEFAULT_SITE_URL in src/shared/site.ts)
//
// Files go under dist/<base path>/ (dist/payapps/pricing.html is served at /payapps/pricing), so
// Workers static assets need no base_path setting. public/_headers is the exception: it must sit at
// the assets root (dist/_headers).
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { basePathOf, DEFAULT_SITE_URL } from "@shared/site";
import { buildSite } from "@site/build";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const siteUrl = (process.env.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
const out = join(dist, ...basePathOf(siteUrl).split("/").filter(Boolean));

rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const write = (rel: string, contents: string) => {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
};

const files = buildSite({ siteUrl });
for (const [rel, contents] of files) write(rel, contents);

copyFileSync(join(root, "src/site/styles.css"), join(out, "styles.css"));
for (const name of readdirSync(join(root, "public"))) {
  copyFileSync(
    join(root, "public", name),
    name === "_headers" ? join(dist, name) : join(out, name),
  );
}

console.log(`Built ${files.size} files for ${siteUrl} into ${out}`);
