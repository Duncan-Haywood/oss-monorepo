#!/usr/bin/env node
/**
 * Run axe-core against delivered `local-site-studio` pages and print one JSON
 * object per line (JSONL) to stdout: {"path", "violations", "error"}.
 *
 * Reads JSON lines from stdin: {"path": "<page>.html", "css": "<css file>"}.
 *
 * Unlike `a11y-axe-recall/run_axe.mjs`, which audits Next.js *build output*
 * whose pages link their CSS by absolute URL, the pages here come from
 * `a11y-generated-sites/corpus/` — `renderToStaticMarkup` output of the
 * `/preview/[slug]` component tree, which links no stylesheet at all because
 * nothing in that render pipeline emits one. So there is no sub-resource
 * request to intercept: the stylesheet is injected directly into the document
 * before axe runs, which is also exactly what the Python side hands both
 * in-house engines. Same bytes to all three detectors, which is the only way
 * the comparison means anything.
 *
 * Requires `axe-core` in this directory's node_modules (not committed — see
 * README) and the Playwright Chromium build this environment ships at
 * /opt/pw-browsers.
 */
import playwright from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = playwright;
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AXE_SOURCE = readFileSync(resolve(HERE, "node_modules/axe-core/axe.min.js"), "utf-8");

async function auditFile(page, path, css) {
  // Never let a page reach the network. The delivered markup embeds a
  // third-party map frame and remote font/image URLs; every measurement in
  // this repository is offline-reproducible with no credentials, so anything
  // that is not the document itself is aborted.
  await page.route("**/*", (route) =>
    route.request().isNavigationRequest() ? route.continue() : route.abort(),
  );
  await page.goto("file://" + resolve(path), { waitUntil: "load" });
  if (css) {
    await page.addStyleTag({ content: css });
  }
  await page.addScriptTag({ content: AXE_SOURCE });
  // `resultTypes` is deliberately NOT narrowed to violations here. axe's
  // `incomplete` bucket is its "I could not decide this" answer, and a
  // detector that declines a check reports zero violations exactly like one
  // that checked and found nothing. Telling those apart is the entire subject
  // of this directory, so a run that discarded `incomplete` would reproduce on
  // the reference detector the same mistake it was built to measure.
  const results = await page.evaluate(async () => window.axe.run(document));
  await page.unroute("**/*");
  const reduce = (list) =>
    list.map((v) => ({
      id: v.id,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        // Why axe reached this verdict. For `incomplete` this is the reason it
        // declined, which is what distinguishes a real undecidable from one
        // this harness manufactured (an aborted background image, say).
        messages: [...(n.any || []), ...(n.all || []), ...(n.none || [])]
          .map((c) => c.message)
          .filter(Boolean),
      })),
    }));
  return {
    violations: reduce(results.violations),
    incomplete: reduce(results.incomplete),
    // Per-rule count of element checks that actually passed — the evidence
    // that a rule ran against this page at all.
    passes: Object.fromEntries(results.passes.map((v) => [v.id, v.nodes.length])),
  };
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
  const cssCache = new Map();
  for (const row of rows) {
    let result = { violations: [], incomplete: [], passes: {} };
    let error = null;
    try {
      let css = "";
      if (row.css) {
        if (!cssCache.has(row.css)) cssCache.set(row.css, readFileSync(row.css, "utf-8"));
        css = cssCache.get(row.css);
      }
      // `extraCss` is appended after the real stylesheet, so a mutation can
      // override a real declaration rather than merely compete with it.
      result = await auditFile(page, row.path, css + (row.extraCss || ""));
    } catch (e) {
      error = String(e && e.message ? e.message : e);
    }
    process.stdout.write(
      JSON.stringify({ path: row.path, label: row.label || null, ...result, error }) + "\n",
    );
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
