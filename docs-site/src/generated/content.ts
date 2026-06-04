/* Placeholder — replaced by `npm run prebuild` / `node scripts/build-docs.mjs`. */
export type IngestedPageKind = "html" | "markdown";

export interface IngestedPage {
  kind: IngestedPageKind;
  slug: string;
  title: string;
  sourceFile: string;
  styles: string;
  bodyHtml: string;
}

export const INGESTED_PAGES: IngestedPage[] = [];

export function getIngestedPage(slug: string): IngestedPage | undefined {
  return INGESTED_PAGES.find((p) => p.slug === slug);
}

export const HTML_REPORT_SLUGS: string[] = [];
export const MARKDOWN_ARCHIVE_SLUGS: string[] = [];
