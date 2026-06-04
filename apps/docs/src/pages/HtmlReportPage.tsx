import { Link, useParams } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import { HtmlDocumentView } from "../components/HtmlDocumentView";
import { htmlDocBySlug } from "../generated/htmlDocBySlug";

export function HtmlReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const doc = slug ? htmlDocBySlug[slug] : undefined;

  if (!doc) {
    return (
      <DocLayout title="Report not found">
        <p>
          No synced document for slug <code>{slug ?? "(missing)"}</code>. Run{" "}
          <code>pnpm docs:sync</code> after adding HTML under <code>docs/</code>{" "}
          or <code>reports/</code>.
        </p>
        <p>
          <Link to="/reports">← All reports</Link>
        </p>
      </DocLayout>
    );
  }

  return (
    <DocLayout
      title={doc.meta.title}
      subtitle={`Imported ${doc.meta.category} · ${doc.meta.sourcePath}`}
      footer={
        <p>
          <Link to="/reports">← All imported reports</Link>
        </p>
      }
    >
      <HtmlDocumentView meta={doc.meta} bodyHtml={doc.bodyHtml} />
    </DocLayout>
  );
}
