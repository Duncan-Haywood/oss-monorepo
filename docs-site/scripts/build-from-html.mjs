/**
 * Build-time sync: reads ../docs/*.html and emits typed TSX modules + manifest.
 * Run via `npm run prebuild` or `npm run sync-html`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsSiteRoot = path.resolve(__dirname, "..");
const repoDocsDir = path.resolve(docsSiteRoot, "..", "docs");
const outDir = path.join(docsSiteRoot, "src", "generated", "html-docs");
const manifestPath = path.join(docsSiteRoot, "src", "generated", "html-manifest.json");

function slugFromFilename(filename) {
  return filename
    .replace(/\.html$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractDoc(html, filename) {
  const root = parse(html, { lowerCaseTagName: true });
  const title =
    root.querySelector("title")?.text?.trim() ||
    filename.replace(/\.html$/i, "").replace(/[-_]/g, " ");
  const styleEl = root.querySelector("style");
  const styles = styleEl?.innerHTML?.trim() ?? "";
  const body = root.querySelector("body");
  const bodyHtml = body ? body.innerHTML.trim() : root.innerHTML.trim();
  return { title, styles, bodyHtml, slug: slugFromFilename(filename), sourceFile: filename };
}

function escapeForTemplateLiteral(value) {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function writeDocModule(doc) {
  const moduleName = doc.slug.replace(/-/g, "_");
  const outFile = path.join(outDir, `${doc.slug}.tsx`);
  const content = `/* eslint-disable */
// AUTO-GENERATED from docs/${doc.sourceFile} — do not edit by hand.
import { HtmlDoc } from "@/components/HtmlDoc";
import type { GeneratedHtmlDoc } from "@/lib/generated-html";

export const htmlDoc: GeneratedHtmlDoc = {
  slug: ${JSON.stringify(doc.slug)},
  title: ${JSON.stringify(doc.title)},
  sourceFile: ${JSON.stringify(doc.sourceFile)},
  styles: \`${escapeForTemplateLiteral(doc.styles)}\`,
  bodyHtml: \`${escapeForTemplateLiteral(doc.bodyHtml)}\`,
};

export default function GeneratedHtmlPage() {
  return <HtmlDoc doc={htmlDoc} />;
}
`;
  fs.writeFileSync(outFile, content, "utf8");
  return moduleName;
}

function main() {
  if (!fs.existsSync(repoDocsDir)) {
    console.error(`Docs directory not found: ${repoDocsDir}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const htmlFiles = fs
    .readdirSync(repoDocsDir)
    .filter((name) => name.toLowerCase().endsWith(".html"))
    .sort();

  const manifest = [];
  const usedSlugs = new Map();

  for (const filename of htmlFiles) {
    const fullPath = path.join(repoDocsDir, filename);
    const html = fs.readFileSync(fullPath, "utf8");
    const doc = extractDoc(html, filename);
    let slug = doc.slug;
    if (usedSlugs.has(slug)) {
      let n = 2;
      while (usedSlugs.has(`${doc.slug}-${n}`)) {
        n += 1;
      }
      slug = `${doc.slug}-${n}`;
      doc.slug = slug;
    }
    usedSlugs.set(slug, filename);
    writeDocModule(doc);
    manifest.push({
      slug: doc.slug,
      title: doc.title,
      sourceFile: doc.sourceFile,
      href: `/reports/${doc.slug}`,
    });
    console.log(`  built ${doc.slug} <- ${filename}`);
  }

  // Remove stale generated modules
  const expected = new Set(manifest.map((m) => `${m.slug}.tsx`));
  for (const existing of fs.readdirSync(outDir)) {
    if (existing.endsWith(".tsx") && !expected.has(existing)) {
      fs.unlinkSync(path.join(outDir, existing));
      console.log(`  removed stale ${existing}`);
    }
  }

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), docs: manifest }, null, 2),
    "utf8"
  );

  console.log(`Generated ${manifest.length} HTML doc module(s) -> ${outDir}`);
}

main();
