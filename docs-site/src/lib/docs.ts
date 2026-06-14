import fs from "node:fs";
import path from "node:path";

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  order: number;
};

const CONTENT_DIR = path.join(process.cwd(), "content");

const DOC_REGISTRY: Array<DocPage & { file: string }> = [
  {
    slug: "strategy",
    file: "strategy.md",
    title: "Strategy",
    description: "Product strategy, positioning, GTM, and success criteria.",
    order: 1,
  },
  {
    slug: "replication",
    file: "replication.md",
    title: "Replication Prompt",
    description: "Bootstrap instructions for reproducing this repository.",
    order: 2,
  },
  {
    slug: "deployment",
    file: "deployment.md",
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

  const filePath = path.join(CONTENT_DIR, entry.file);
  const content = fs.readFileSync(filePath, "utf8");

  return {
    slug: entry.slug,
    title: extractTitle(content) || entry.title,
    description: entry.description,
    content,
  };
}
