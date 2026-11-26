// Shape of a resources-library article. Articles are plain TS modules (no React) so the prerender and
// sitemap scripts can read them too. Copy rules: plain language, no invented statistics, every rule or
// number traceable to an official page listed in `sources`, and "check the current requirements" where
// details vary or change.

export interface ResourceSource {
  title: string;
  /** Absolute https URL, or a site path ("/trust") for our own pages. */
  url: string;
}

export interface ResourceArticle {
  /** URL segment: /resources/{slug}. Lowercase words joined by hyphens. */
  slug: string;
  /**
   * "glossary": the body is "### Term" headings each followed by its definition; the prerender adds
   * DefinedTermSet JSON-LD built from them. Defaults to a regular guide.
   */
  kind?: "guide" | "glossary";
  /** Page h1 and document title (without the site name). */
  title: string;
  /** One or two plain sentences for the index card, meta description and link previews. */
  description: string;
  /** ISO date (YYYY-MM-DD) the content was last reviewed. */
  updated: string;
  readingMinutes: number;
  /** Markdown rendered with the safe <Markdown> component. Starts at "##" (the page owns the h1). */
  body: string;
  sources: readonly ResourceSource[];
  /** Slugs to suggest at the end of the article, most relevant first. */
  related?: readonly string[];
}

/** Words in a markdown body, ignoring link targets and markup characters. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[#>*_`|[\]-]+/g, " ")
    .trim();
  return text ? text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

/** Reading time at roughly 220 words a minute, rounded up. */
export const readingMinutesFor = (markdown: string) =>
  Math.max(1, Math.ceil(countWords(markdown) / 220));
