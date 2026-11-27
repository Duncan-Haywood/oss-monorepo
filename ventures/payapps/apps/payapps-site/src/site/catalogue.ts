// The static copy of the site that the catalogue build serves at https://marisstella.app/payapps/
// (platform/pages/payapps-site.mjs copies catalogue-export/ into the catalogue's dist/payapps/).
//
// Why a committed copy: the catalogue build runs plain Node with no pnpm install, so it cannot run
// this TypeScript build; and a Worker of its own (README.md, "Deploying") would need a deploy
// workflow, a D1 database and a route for an early-access list nobody needs now that the app is
// open. So the copy has no early-access pages (`earlyAccess: false`), only files, and
// test/unit/catalogue-export.test.ts fails when catalogue-export/ drifts from this function.
// Regenerate with `pnpm export:catalogue` after any change to the pages, plans or launch switch.
//
// Node only (reads public/ and styles.css from disk); never imported by the Worker.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SITE_URL } from "@shared/site";
import { buildSite } from "./build";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOGUE_EXPORT_DIR = join(ROOT, "catalogue-export");

/**
 * Not copied: the site's own 404 (the catalogue serves its root 404.html for every unknown path) and
 * public/_headers (the catalogue Worker sets its own security headers).
 */
const LEFT_OUT = new Set(["404.html", "_headers"]);

/** Every file of the catalogue copy, path under /payapps/ -> contents, at the constants' launch state. */
export function catalogueFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const built = buildSite({ siteUrl: DEFAULT_SITE_URL, earlyAccess: false });
  for (const [rel, contents] of built) if (!LEFT_OUT.has(rel)) files.set(rel, contents);
  files.set("styles.css", readFileSync(join(ROOT, "src/site/styles.css"), "utf8"));
  for (const name of ["favicon.svg", "og.svg"]) {
    files.set(name, readFileSync(join(ROOT, "public", name), "utf8"));
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}
