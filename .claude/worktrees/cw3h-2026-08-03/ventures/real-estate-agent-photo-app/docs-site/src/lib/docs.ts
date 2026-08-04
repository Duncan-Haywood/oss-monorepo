import fs from "node:fs";
import path from "node:path";

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  order: number;
};

// Repo root, one level up from docs-site/ (this package's cwd during build).
const REPO_ROOT = path.join(process.cwd(), "..");

/**
 * `file` is resolved relative to REPO_ROOT, not CONTENT_DIR — strategy and
 * replication docs are read live from their single canonical source
 * (root STRATEGY.md, docs/REPLICATION_PROMPT.md) instead of a manually
 * copied duplicate. A prior hand-synced copy in content/strategy.md drifted
 * for weeks (STRATEGY.md answered 3 open questions that the docs-site copy
 * kept showing as unanswered) before anyone noticed — see
 * process/decisions-log.ts. deployment.md has no canonical source elsewhere
 * in the repo, so it stays a real file directly under content/.
 */
const DOC_REGISTRY: Array<DocPage & { file: string }> = [
  {
    slug: "strategy",
    file: "STRATEGY.md",
    title: "Strategy",
    description: "Product strategy, positioning, GTM, and success criteria.",
    order: 1,
  },
  {
    slug: "replication",
    file: "docs/REPLICATION_PROMPT.md",
    title: "Replication Prompt",
    description: "Bootstrap instructions for reproducing this repository.",
    order: 2,
  },
  {
    slug: "deployment",
    file: "docs-site/content/deployment.md",
    title: "Deployment",
    description: "Cloudflare Pages and Access configuration.",
    order: 3,
  },
];

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1] ?? "Untitled";
}

export function getDocPages(): DocPage[] {
  return DOC_REGISTRY.map(({ slug, title, description, order }) => ({
    slug,
    title,
    description,
    order,
  })).sort((a, b) => a.order - b.order);
}

export function getDocSlugs(): string[] {
  return DOC_REGISTRY.map((doc) => doc.slug);
}

export function getDocBySlug(slug: string): {
  slug: string;
  title: string;
  description: string;
  content: string;
} | null {
  const entry = DOC_REGISTRY.find((doc) => doc.slug === slug);
  if (!entry) {
    return null;
  }

  const filePath = path.join(REPO_ROOT, entry.file);
  const content = fs.readFileSync(filePath, "utf8");

  return {
    slug: entry.slug,
    title: extractTitle(content) || entry.title,
    description: entry.description,
    content,
  };
}
