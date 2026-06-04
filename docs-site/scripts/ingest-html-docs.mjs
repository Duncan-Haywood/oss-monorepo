#!/usr/bin/env node
/**
 * Build-time ingest: copy standalone HTML reports from ../docs into the site
 * and emit a manifest consumed by Next.js routes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_SITE_ROOT = path.resolve(__dirname, "..");
const SOURCE_DOCS_DIR = path.resolve(DOCS_SITE_ROOT, "..", "docs");
const HTML_OUT_DIR = path.join(DOCS_SITE_ROOT, "public", "generated", "html");
const MANIFEST_DIR = path.join(DOCS_SITE_ROOT, "src", "generated");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "html-manifest.json");

function slugFromFilename(filename) {
  const base = filename.replace(/\.html$/i, "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function main() {
  if (!fs.existsSync(SOURCE_DOCS_DIR)) {
    console.error(`Source docs directory not found: ${SOURCE_DOCS_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(HTML_OUT_DIR, { recursive: true });
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });

  const entries = fs
    .readdirSync(SOURCE_DOCS_DIR)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort();

  const pages = [];
  const slugCounts = new Map();

  for (const filename of entries) {
    const sourcePath = path.join(SOURCE_DOCS_DIR, filename);
    const html = fs.readFileSync(sourcePath, "utf8");
    let slug = slugFromFilename(filename);
    const count = (slugCounts.get(slug) ?? 0) + 1;
    slugCounts.set(slug, count);
    if (count > 1) {
      slug += `-${count}`;
    }

    const destName = `${slug}.html`;
    const destPath = path.join(HTML_OUT_DIR, destName);
    fs.copyFileSync(sourcePath, destPath);

    pages.push({
      slug,
      title: extractTitle(html) ?? filename.replace(/\.html$/i, ""),
      sourceFile: filename,
      publicPath: `/generated/html/${destName}`,
      ingestedAt: new Date().toISOString(),
    });
  }

  const manifest = {
    schemaVersion: 1,
    sourceDirectory: "docs",
    pageCount: pages.length,
    pages,
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Ingested ${pages.length} HTML report(s) from ${SOURCE_DOCS_DIR} -> ${HTML_OUT_DIR}`,
  );
}

main();
