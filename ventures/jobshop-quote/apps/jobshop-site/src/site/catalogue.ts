// The static copy of the site that the catalogue build serves at https://marisstella.app/jobshop/
// (platform/pages/jobshop-site.mjs copies catalogue-export/ into the catalogue's dist/jobshop/).
//
// Why a committed copy: the catalogue build runs plain Node with no pnpm install, so it cannot run
// this TypeScript build; and a Worker of its own would need a deploy workflow, a D1 database and a
// route for an early-access list nobody needs now that the app is open (the same call PayApps made,
// apps/payapps-site/src/site/catalogue.ts). So the copy is built at the launch switch (LAUNCH in
// ./config, open), has no forms, and test/unit/catalogue-export.test.ts fails when catalogue-export/
// drifts from this function. Regenerate with `pnpm export:catalogue` after any change to the pages,
// plans or launch switch.
//
// Node only (reads public/ from disk); never imported by the Worker.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build";
import { DEFAULT_SITE_URL, LAUNCH } from "./config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOGUE_EXPORT_DIR = join(ROOT, "catalogue-export");
/** The path the catalogue serves the copy under; every internal link carries it. */
export const CATALOGUE_BASE_PATH = "/jobshop";

/**
 * Not copied: public/_headers (the catalogue Worker sets its own security headers) and a 404 page
 * (the catalogue serves its root 404.html for every unknown path).
 */
const PUBLIC_FILES = ["styles.css", "favicon.svg", "og.png"] as const;

/** Every file of the catalogue copy, path under /jobshop/ -> contents, at the launch switch. */
export function catalogueFiles(): Map<string, string | Buffer> {
  if (!LAUNCH.open) throw new Error("The catalogue copy has no form handler: open the site first");
  const files = new Map<string, string | Buffer>(
    buildSite({ siteUrl: DEFAULT_SITE_URL, basePath: CATALOGUE_BASE_PATH, launch: LAUNCH }),
  );
  for (const name of PUBLIC_FILES) {
    const buf = readFileSync(join(ROOT, "public", name));
    files.set(name, name.endsWith(".png") ? buf : buf.toString("utf8"));
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}
