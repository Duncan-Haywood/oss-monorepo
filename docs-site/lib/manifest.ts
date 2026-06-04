import manifest from "@/generated/manifest.json";

export type DocEntry = {
  slug: string;
  title: string;
  kind: "html" | "markdown";
  source: string;
  section: "reports" | "guides" | "legal";
};

export type DocsManifest = {
  generatedAt: string;
  docsRoot: string;
  entries: DocEntry[];
};

export const docsManifest = manifest as DocsManifest;

export function entriesBySection(section: DocEntry["section"]): DocEntry[] {
  return docsManifest.entries.filter((e) => e.section === section);
}

export function findEntry(slug: string): DocEntry | undefined {
  return docsManifest.entries.find((e) => e.slug === slug);
}
