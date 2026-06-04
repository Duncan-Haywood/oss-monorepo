/**
 * Syncs repo HTML/Markdown documentation into the TSX docs app at build time.
 * Outputs JSON bundles under apps/docs/public/generated/ and a TS manifest.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/docs/public/generated");
const manifestPath = join(root, "apps/docs/src/generated/source-manifest.ts");

interface SourceBundle {
  slug: string;
  title: string;
  sourcePath: string;
  kind: "html" | "markdown";
  css: string;
  html: string;
}

function slugify(filePath: string): string {
  return basename(filePath)
    .replace(/\.(html|md)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractHtmlParts(raw: string): { title: string; css: string; html: string } {
  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || "Untitled report";

  const styles: string[] = [];
  for (const m of raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    styles.push(m[1] ?? "");
  }

  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let html = bodyMatch?.[1]?.trim() ?? raw;
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  return { title, css: styles.join("\n"), html };
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listType) {
      out.push(listType === "ul" ? "</ul>" : "</ol>");
      listType = null;
    }
  }

  function flushCode() {
    if (!inCode) return;
    out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
    codeBuf = [];
    inCode = false;
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) flushCode();
      else inCode = true;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (listType !== "ul") {
        flushList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inlineMd(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (listType !== "ol") {
        flushList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inlineMd(ol[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  flushList();
  flushCode();
  return out.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

function collectFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (entry.toLowerCase().endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function ingestHtml(filePath: string): SourceBundle {
  const raw = readFileSync(filePath, "utf8");
  const { title, css, html } = extractHtmlParts(raw);
  const rel = relative(root, filePath).replace(/\\/g, "/");
  return {
    slug: slugify(basename(filePath)),
    title,
    sourcePath: rel,
    kind: "html",
    css,
    html,
  };
}

function ingestMarkdown(filePath: string): SourceBundle {
  const raw = readFileSync(filePath, "utf8");
  const rel = relative(root, filePath).replace(/\\/g, "/");
  const titleLine = raw.match(/^#\s+(.+)$/m);
  const title = titleLine?.[1]?.trim() ?? basename(filePath, ".md");
  return {
    slug: slugify(basename(filePath)),
    title,
    sourcePath: rel,
    kind: "markdown",
    css: "",
    html: markdownToHtml(raw),
  };
}

const htmlFiles = [
  ...collectFiles(join(root, "docs"), ".html"),
  ...collectFiles(join(root, "reports"), ".html"),
];

const mdFiles = collectFiles(join(root, "docs"), ".md").filter(
  (f) => basename(f).toLowerCase() !== "readme.md" || true,
);

const bundles: SourceBundle[] = [
  ...htmlFiles.map(ingestHtml),
  ...mdFiles.map(ingestMarkdown),
];

const slugSeen = new Set<string>();
for (const b of bundles) {
  if (slugSeen.has(b.slug)) {
    throw new Error(`Duplicate doc slug "${b.slug}" — rename source files.`);
  }
  slugSeen.add(b.slug);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(manifestPath), { recursive: true });

const manifestEntries = bundles.map(({ slug, title, sourcePath, kind }) => ({
  slug,
  title,
  sourcePath,
  kind,
}));

for (const bundle of bundles) {
  const jsonPath = join(outDir, `${bundle.slug}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({
      slug: bundle.slug,
      title: bundle.title,
      sourcePath: bundle.sourcePath,
      kind: bundle.kind,
      css: bundle.css,
      html: bundle.html,
    }),
    "utf8",
  );
}

const builtAt = new Date().toISOString();
const manifestTs = `/** Generated by scripts/build-doc-sources.ts — do not edit. */
export type DocSourceKind = "html" | "markdown";

export interface DocSourceEntry {
  slug: string;
  title: string;
  sourcePath: string;
  kind: DocSourceKind;
}

export const docSourceManifest: DocSourceEntry[] = ${JSON.stringify(manifestEntries, null, 2)} as const;

export const docSourcesBuiltAt = ${JSON.stringify(builtAt)};
`;

writeFileSync(manifestPath, manifestTs, "utf8");

console.log(`✓ Built ${bundles.length} doc source bundle(s) → apps/docs/public/generated/`);
for (const b of bundles) {
  console.log(`  · ${b.slug} ← ${b.sourcePath}`);
}
