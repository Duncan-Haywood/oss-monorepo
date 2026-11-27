// Writes the static site to dist/: pages, sitemap/robots/llms/feed, styles and public/ files.
//
//   SITE_URL=https://marisstella.app/payapps pnpm build   (default: DEFAULT_SITE_URL in src/shared/site.ts)
//   APP_URL=https://payapps.example.com PAID_PLANS_ON=1 pnpm build   (default: APP_URL and PAID_PLANS_ON
//   in src/shared/site.ts; APP_URL= with nothing builds the pre-launch copy)
//
// Files go under dist/<base path>/ (dist/payapps/pricing.html is served at /payapps/pricing), so
// Workers static assets need no base_path setting. public/_headers is the exception: it must sit at
// the assets root (dist/_headers).
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { basePathOf, DEFAULT_SITE_URL } from "@shared/site";
import { buildSite } from "@site/build";
import { launchOf } from "@site/launch";

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

const appUrl = process.env.APP_URL === undefined ? undefined : process.env.APP_URL.trim() || null;
const paidOn =
  process.env.PAID_PLANS_ON === undefined
    ? undefined
    : /^(1|true|yes)$/i.test(process.env.PAID_PLANS_ON);
const files = buildSite({ siteUrl, appUrl, paidOn });
for (const [rel, contents] of files) write(rel, contents);

copyFileSync(join(root, "src/site/styles.css"), join(out, "styles.css"));
for (const name of readdirSync(join(root, "public"))) {
  // shots/ (the app screenshots) is a folder; everything else is a file.
  cpSync(join(root, "public", name), name === "_headers" ? join(dist, name) : join(out, name), {
    recursive: true,
  });
}

const launch = launchOf({ appUrl, paidOn });
console.log(
  `Built ${files.size} files for ${siteUrl} into ${out} (${launch.open ? `open, sign-up at ${launch.appUrl}${launch.paidOn ? ", paid plans on sale" : ""}` : "pre-launch: early access"})`,
);
