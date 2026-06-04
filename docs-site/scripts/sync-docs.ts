/**
 * Build-time sync: ingest ../docs/*.html and ../docs/*.md into generated TSX routes.
 * Run before `next build` / `next dev` via `npm run sync`.
 */
import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCS_SITE_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_DOCS_ROOT = path.resolve(DOCS_SITE_ROOT, "..", "docs");
const GENERATED_ROOT = path.join(DOCS_SITE_ROOT, "src", "generated");
const APP_ROOT = path.join(DOCS_SITE_ROOT, "src", "app");

type DocEntry = {
  slug: string;
  title: string;
  kind: "html" | "markdown";
  section: "reports" | "internal";
  sourcePath: string;
  routePath: string;
};

function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.(html|md)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(relativePath: string, used: Set<string>): string {
  const base = slugFromFilename(path.basename(relativePath));
  const parent = path.dirname(relativePath);
  const candidates = [
    base,
    parent !== "." ? `${slugFromFilename(parent)}-${base}` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }
  const slug = `${base}-${index}`;
  used.add(slug);
  return slug;
}

function escapeTemplateLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function extractHtmlParts(html: string): { title: string; css: string; bodyHtml: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || "Untitled document";

  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    styleBlocks.push(styleMatch[1].trim());
  }

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let bodyHtml = mainMatch?.[1] ?? bodyMatch?.[1] ?? html;
  bodyHtml = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();

  return { title, css: styleBlocks.join("\n\n"), bodyHtml };
}

function sectionForFile(relativePath: string, kind: "html" | "markdown"): "reports" | "internal" {
  if (kind === "html") return "reports";
  const base = path.basename(relativePath).toUpperCase();
  if (base.startsWith("COMMERCIAL_") || base.includes("VIABILITY")) return "reports";
  return "internal";
}

function collectSourceFiles(dir: string, baseDir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "superpowers") continue;
      collectSourceFiles(full, baseDir, acc);
      continue;
    }
    if (/\.(html|md)$/i.test(entry.name)) {
      if (entry.name === "CONTINUATION_NOTES.md") continue;
      acc.push(path.relative(baseDir, full));
    }
  }
  return acc;
}

function writeHtmlPage(entry: DocEntry, parts: { title: string; css: string; bodyHtml: string }): void {
  const pageDir = path.join(APP_ROOT, entry.section, entry.slug);
  fs.mkdirSync(pageDir, { recursive: true });

  const pageTsx = `/* AUTO-GENERATED from ${entry.sourcePath} — do not edit by hand */
import type { Metadata } from "next";
import { HtmlDocument } from "@/components/HtmlDocument";

export const metadata: Metadata = {
  title: ${JSON.stringify(parts.title)},
  robots: { index: false, follow: false },
};

const documentCss = \`${escapeTemplateLiteral(parts.css)}\`;
const documentHtml = \`${escapeTemplateLiteral(parts.bodyHtml)}\`;

export default function Page() {
  return (
    <HtmlDocument
      title={${JSON.stringify(parts.title)}}
      css={documentCss}
      html={documentHtml}
      sourceFile={${JSON.stringify(entry.sourcePath)}}
    />
  );
}
`;
  fs.writeFileSync(path.join(pageDir, "page.tsx"), pageTsx, "utf8");
}

function writeMarkdownPage(entry: DocEntry, markdown: string, title: string): void {
  const pageDir = path.join(APP_ROOT, entry.section, entry.slug);
  fs.mkdirSync(pageDir, { recursive: true });

  const pageTsx = `/* AUTO-GENERATED from ${entry.sourcePath} — do not edit by hand */
import type { Metadata } from "next";
import { MarkdownDocument } from "@/components/MarkdownDocument";

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  robots: { index: false, follow: false },
};

const markdownSource = \`${escapeTemplateLiteral(markdown)}\`;

export default function Page() {
  return (
    <MarkdownDocument
      title={${JSON.stringify(title)}}
      source={markdownSource}
      sourceFile={${JSON.stringify(entry.sourcePath)}}
    />
  );
}
`;
  fs.writeFileSync(path.join(pageDir, "page.tsx"), pageTsx, "utf8");
}

function writeRegistry(entries: DocEntry[]): void {
  const registryTs = `/* AUTO-GENERATED — do not edit by hand */
export type GeneratedDocEntry = {
  slug: string;
  title: string;
  kind: "html" | "markdown";
  section: "reports" | "internal";
  sourcePath: string;
  href: string;
};

export const generatedDocs: GeneratedDocEntry[] = ${JSON.stringify(
    entries.map((e) => ({
      slug: e.slug,
      title: e.title,
      kind: e.kind,
      section: e.section,
      sourcePath: e.sourcePath,
      href: `/${e.section}/${e.slug}`,
    })),
    null,
    2,
  )};
`;
  fs.mkdirSync(GENERATED_ROOT, { recursive: true });
  fs.writeFileSync(path.join(GENERATED_ROOT, "doc-registry.ts"), registryTs, "utf8");
}

function removeStaleGeneratedRoutes(currentRoutes: Set<string>): void {
  for (const section of ["reports", "internal"] as const) {
    const sectionDir = path.join(APP_ROOT, section);
    if (!fs.existsSync(sectionDir)) continue;
    for (const slugDir of fs.readdirSync(sectionDir, { withFileTypes: true })) {
      if (!slugDir.isDirectory()) continue;
      const pageFile = path.join(sectionDir, slugDir.name, "page.tsx");
      if (!fs.existsSync(pageFile)) continue;
      const rel = `${section}/${slugDir.name}`;
      if (!currentRoutes.has(rel)) {
        fs.rmSync(path.join(sectionDir, slugDir.name), { recursive: true, force: true });
      }
    }
  }
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim();
  return fallback;
}

function main(): void {
  if (!fs.existsSync(REPO_DOCS_ROOT)) {
    console.error(`Docs root not found: ${REPO_DOCS_ROOT}`);
    process.exit(1);
  }

  const sourceFiles = collectSourceFiles(REPO_DOCS_ROOT, REPO_DOCS_ROOT).sort();
  const entries: DocEntry[] = [];
  const routeKeys = new Set<string>();
  const usedSlugs = new Set<string>();

  for (const relativePath of sourceFiles) {
    const abs = path.join(REPO_DOCS_ROOT, relativePath);
    const ext = path.extname(relativePath).toLowerCase();
    const kind = ext === ".html" ? "html" : "markdown";
    const slug = uniqueSlug(relativePath, usedSlugs);
    const section = sectionForFile(relativePath, kind);
    const routeKey = `${section}/${slug}`;

    if (routeKeys.has(routeKey)) {
      console.warn(`Skipping duplicate route ${routeKey} for ${relativePath}`);
      continue;
    }
    routeKeys.add(routeKey);

    const raw = fs.readFileSync(abs, "utf8");
    let title = path.basename(relativePath, ext);

    if (kind === "html") {
      const parts = extractHtmlParts(raw);
      title = parts.title;
      const entry: DocEntry = {
        slug,
        title,
        kind,
        section,
        sourcePath: `docs/${relativePath.replace(/\\/g, "/")}`,
        routePath: routeKey,
      };
      writeHtmlPage(entry, parts);
      entries.push(entry);
    } else {
      title = titleFromMarkdown(raw, title.replace(/_/g, " "));
      const entry: DocEntry = {
        slug,
        title,
        kind,
        section,
        sourcePath: `docs/${relativePath.replace(/\\/g, "/")}`,
        routePath: routeKey,
      };
      writeMarkdownPage(entry, raw, title);
      entries.push(entry);
    }
  }

  removeStaleGeneratedRoutes(routeKeys);
  writeRegistry(entries);
  console.log(`Synced ${entries.length} documents from ${REPO_DOCS_ROOT}`);
}

main();
