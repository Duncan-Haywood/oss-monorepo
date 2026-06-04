import manifest from "@/generated/html-manifest.json";

export type HtmlManifestPage = {
  slug: string;
  title: string;
  sourceFile: string;
  publicPath: string;
  ingestedAt: string;
};

export type HtmlManifest = {
  schemaVersion: number;
  sourceDirectory: string;
  pageCount: number;
  pages: HtmlManifestPage[];
};

const typed = manifest as HtmlManifest;

export function getHtmlManifest(): HtmlManifest {
  return typed;
}

export function getHtmlReportBySlug(slug: string): HtmlManifestPage | undefined {
  return typed.pages.find((page) => page.slug === slug);
}

export function listHtmlReports(): HtmlManifestPage[] {
  return [...typed.pages].sort((a, b) => a.title.localeCompare(b.title));
}
