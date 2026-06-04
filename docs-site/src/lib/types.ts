export type HtmlReportPage = {
  slug: string;
  title: string;
  sourceFile: string;
  href: string;
};

export type HtmlReportManifest = {
  pages: readonly HtmlReportPage[];
};

export type GeneratedHtmlReport = {
  slug: string;
  sourceFile: string;
  title: string;
  styles: string;
  bodyHtml: string;
  builtAt: string;
};

export type MarkdownDocEntry = {
  slug: string;
  title: string;
  description: string;
  sourcePath: string;
  href: string;
  category: "product" | "legal" | "engineering" | "internal";
};
