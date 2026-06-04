import type { DocPayload } from "@/lib/load-doc";

type HtmlDocContentProps = {
  doc: DocPayload;
};

export function HtmlDocContent({ doc }: HtmlDocContentProps) {
  return (
    <article>
      <header className="doc-hero">
        <h1>{doc.title}</h1>
        <div className="doc-meta">
          <span>{doc.kind === "html" ? "Built from HTML" : "Built from Markdown"}</span>
          <span>{doc.source}</span>
        </div>
      </header>
      <div
        className="doc-html"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </article>
  );
}
