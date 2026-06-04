import { DocShell } from "@/components/DocShell";
import type { GeneratedHtmlDoc } from "@/lib/generated-html";

type HtmlDocProps = {
  doc: GeneratedHtmlDoc;
};

export function HtmlDoc({ doc }: HtmlDocProps) {
  return (
    <DocShell
      title={doc.title}
      description={`Synced from docs/${doc.sourceFile} at build time.`}
    >
      <div className="html-doc">
        {doc.styles ? <style dangerouslySetInnerHTML={{ __html: doc.styles }} /> : null}
        <div
          className="html-doc-body"
          dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
        />
      </div>
    </DocShell>
  );
}
