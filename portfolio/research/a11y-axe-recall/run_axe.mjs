#!/usr/bin/env node
/**
 * Run axe-core against a list of local, prerendered HTML files and print one
 * JSON object per line (JSONL) to stdout: {"path", "violations", "error"}.
 *
 * Reads JSON lines from stdin: {"path": "<page>.html", "appDir": "<app root
 * holding .next/ and public/>"}. A prerendered page under `.next/server/...`
 * references its CSS and other build assets by *absolute* URL
 * (`/_next/static/css/x.css`) — the path Next.js serves at in production.
 * Loaded via a bare `file://` URL that resolves to nothing, so every
 * style-dependent axe rule (contrast, visibility) runs against unstyled
 * markup. `appDir` lets this script intercept those requests and serve the
 * real files from `<appDir>/.next/...` and `<appDir>/public/...`, so the DOM
 * axe sees matches what a browser would actually render.
 *
 * Each violation is reduced to what the Python side needs: the axe rule id
 * and, for each node it matched, the CSS target selector and the outer HTML
 * snippet axe recorded — nothing else, so the output stays small across a
 * 118-page corpus.
 *
 * Requires `axe-core` in this directory's node_modules (not committed — see
 * README) and the Playwright Chromium build this environment ships at
 * /opt/pw-browsers.
 */
import playwright from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = playwright;
import { readFileSync, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AXE_SOURCE = readFileSync(resolve(HERE, "node_modules/axe-core/axe.min.js"), "utf-8");

// URL path prefix Next.js serves build assets at -> the directory holding
// them on disk, relative to the app root. Longest/most-specific first.
const ASSET_ROOTS = [
  { prefix: "/_next/", dir: ".next/" },
  { prefix: "/", dir: "public/" },
];

function resolveAsset(appDir, urlPath) {
  for (const { prefix, dir } of ASSET_ROOTS) {
    if (urlPath.startsWith(prefix)) {
      const candidate = join(appDir, dir, urlPath.slice(prefix.length));
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

async function auditFile(page, path, appDir) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.isNavigationRequest()) {
      // The page itself — a plain file:// load of the audited HTML.
      return route.continue();
    }
    // Every sub-resource (stylesheet, script, font, image) is requested by
    // the *absolute* URL path Next.js serves it at in production
    // (`/_next/static/...`). Loaded via `file://`, that resolves to
    // `file:///_next/...` — filesystem root, not this build's output — so
    // route by pathname regardless of the (bogus) file:// origin.
    const asset = resolveAsset(appDir, url.pathname);
    if (asset) {
      return route.fulfill({ path: asset });
    }
    // Unresolvable absolute-URL asset (a font CDN, an API call, an image the
    // build didn't emit under public/) — abort rather than hit the network,
    // consistent with every other measurement in this repository: no
    // credentials, no external fetch, offline-reproducible.
    return route.abort();
  });
  await page.goto("file://" + resolve(path), { waitUntil: "load" });
  await page.addScriptTag({ content: AXE_SOURCE });
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, { resultTypes: ["violations"] });
  });
  await page.unroute("**/*");
  return results.violations.map((v) => ({
    id: v.id,
    tags: v.tags,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      html: n.html,
    })),
  }));
}

async function main() {
  const rows = [];
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) rows.push(JSON.parse(trimmed));
  }

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  let done = 0;
  for (const { path, appDir } of rows) {
    let violations = [];
    let error = null;
    try {
      violations = await auditFile(page, path, appDir);
    } catch (e) {
      error = String(e && e.message ? e.message : e);
    }
    process.stdout.write(JSON.stringify({ path, violations, error }) + "\n");
    done += 1;
    if (done % 20 === 0) {
      process.stderr.write(`axe: ${done}/${rows.length}\n`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
