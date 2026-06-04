import { Link, useParams } from "react-router-dom";
import { HtmlReportView } from "../components/HtmlReportView";
import { DocLayout } from "../components/DocLayout";
import { docSourceManifest } from "../generated/source-manifest";

export function ArchiveReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const entry = docSourceManifest.find((e) => e.slug === slug);

  if (!slug || !entry) {
    return (
      <DocLayout title="Report not found">
        <p className="stub">
          Unknown archive slug. See <Link to="/archive">archive index</Link>.
        </p>
      </DocLayout>
    );
  }

  return (
    <DocLayout title={entry.title} subtitle={`Archive · ${entry.sourcePath}`}>
      <HtmlReportView slug={slug} />
      <footer>
        <Link to="/archive">← All reports</Link>
        {" · "}
        <Link to="/commercial-viability">Commercial viability (TSX)</Link>
      </footer>
    </DocLayout>
  );
}
