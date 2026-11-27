// The site as plain static files for a host with no Worker in front: the catalogue at
// https://marisstella.app/payapps/, which publishes ventures/payapps/site/ as /payapps/
// (platform/pages/build.mjs, ENTRY_CANDIDATES). `scripts/export-static.ts` writes it there and
// test/unit/static-export.test.ts fails when the committed copy drifts from this.
//
// Differences from the Worker build (scripts/build.ts): no early-access form or status pages (they
// post to the Worker's API), a privacy notice for pages that store nothing, and no `_headers` (the
// catalogue sets its own headers). Only once the app is open: before launch buildSite refuses.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SITE_URL } from "@shared/site";
import { buildSite } from "./build";
import type { LaunchInput } from "./launch";

/** ventures/payapps/site, relative to apps/payapps-site. */
export const STATIC_EXPORT_DIR = "../../site";

/** Every file of the static copy, path (under the base path) → contents. */
export function staticFiles(root: string, launch: LaunchInput = {}): Map<string, string> {
  const files = buildSite({ siteUrl: DEFAULT_SITE_URL, staticHost: true, ...launch });
  files.set("styles.css", readFileSync(join(root, "src/site/styles.css"), "utf8"));
  for (const name of readdirSync(join(root, "public")).sort()) {
    if (name === "_headers") continue;
    files.set(name, readFileSync(join(root, "public", name), "utf8"));
  }
  return files;
}
