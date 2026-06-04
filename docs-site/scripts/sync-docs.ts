/**
 * Pre-build step: ingest ../docs HTML and Markdown into generated JSON
 * consumed by TSX doc routes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const REPO_DOCS = path.resolve(__dirname, "../../docs");
const OUT_DIR = path.resolve(__dirname, "../generated");
const HTML_DIR = path.join(OUT_DIR, "html");

const SKIP_MD = new Set(["CONTINUATION_NOTES.md"]);

export type DocKind = "html" | "markdown";

export type DocEntry = {
  slug: string;
  title: string;
  kind: DocKind;
  source: string;
  section: "reports" | "guides" | "legal";
};

export type DocPayload = DocEntry & {
  html: string;
};

function slugify(filename: string): string {
  return filename
    .replace(/\.(html|md)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractHtmlTitle(raw: string): string | null {
  const match = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractHtmlBody(raw: string): string {
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) {
    return raw;
  }
  let inner = bodyMatch[1];
  const mainMatch = inner.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (mainMatch) {
    inner = mainMatch[1];
  }
  return inner.trim();
}

function sectionFor(filename: string, kind: DocKind): DocEntry["section"] {
  if (kind === "html") {
    return "reports";
  }
  const lower = filename.toLowerCase();
  if (lower.includes("terms") || lower.includes("legal")) {
    return "legal";
  }
  return "guides";
}

function titleFromMarkdown(raw: string, filename: string): string {
  const h1 = raw.match(/^#\s+(.+)$/m);
  if (h1?.[1]) {
    return h1[1].trim();
  }
  return filename.replace(/\.md$/i, "").replace(/_/g, " ");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function main(): Promise<void> {
  await ensureDir(HTML_DIR);

  const entries: DocEntry[] = [];
  const names = await fs.readdir(REPO_DOCS);

  for (const name of names.sort()) {
    const full = path.join(REPO_DOCS, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) {
      continue;
    }

    if (name.endsWith(".html")) {
      const raw = await fs.readFile(full, "utf8");
      const slug = slugify(name);
      const title = extractHtmlTitle(raw) ?? name;
      const html = extractHtmlBody(raw);
      const entry: DocPayload = {
        slug,
        title,
        kind: "html",
        source: path.relative(path.resolve(__dirname, "../.."), full),
        section: sectionFor(name, "html"),
        html,
      };
      await fs.writeFile(
        path.join(HTML_DIR, `${slug}.json`),
        JSON.stringify(entry, null, 2),
        "utf8"
      );
      entries.push({
        slug: entry.slug,
        title: entry.title,
        kind: entry.kind,
        source: entry.source,
        section: entry.section,
      });
      continue;
    }

    if (name.endsWith(".md") && !SKIP_MD.has(name)) {
      const raw = await fs.readFile(full, "utf8");
      const slug = slugify(name);
      const title = titleFromMarkdown(raw, name);
      const html = await marked.parse(raw);
      const entry: DocPayload = {
        slug,
        title,
        kind: "markdown",
        source: path.relative(path.resolve(__dirname, "../.."), full),
        section: sectionFor(name, "markdown"),
        html,
      };
      await fs.writeFile(
        path.join(HTML_DIR, `${slug}.json`),
        JSON.stringify(entry, null, 2),
        "utf8"
      );
      entries.push({
        slug: entry.slug,
        title: entry.title,
        kind: entry.kind,
        source: entry.source,
        section: entry.section,
      });
    }
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));

  const manifest = {
    generatedAt: new Date().toISOString(),
    docsRoot: "docs",
    entries,
  };

  await fs.writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(
    `sync-docs: wrote ${entries.length} documents to ${path.relative(process.cwd(), OUT_DIR)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
