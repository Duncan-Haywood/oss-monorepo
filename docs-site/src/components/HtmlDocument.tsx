import type { GeneratedHtmlReport } from "@/lib/types";

type HtmlDocumentProps = {
  report: GeneratedHtmlReport;
};

/**
 * Renders body HTML extracted from repo docs/*.html at build time.
 * Scoped styles are injected per report to preserve standalone report layout.
 */
export function HtmlDocument({ report }: HtmlDocumentProps) {
  const scopeClass = `html-report-${report.slug.replace(/[^a-z0-9-]/g, "-")}`;
  const scopedCss = report.styles
    ? report.styles.replace(/:root/g, `.${scopeClass}`)
    : "";

  return (
    <article className={`html-doc ${scopeClass}`}>
      {scopedCss ? (
        <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
      ) : null}
      <div
        className="html-doc-body"
        dangerouslySetInnerHTML={{ __html: report.bodyHtml }}
      />
      <footer className="html-doc-meta">
        <p>
          Built from <code>{report.sourceFile}</code> at {report.builtAt}
        </p>
      </footer>
    </article>
  );
}
