import { Navigate, useParams } from "react-router-dom";
import { docSourceManifest } from "../generated/source-manifest";
import { htmlReportManifest } from "../generated/htmlReportManifest";

/** Legacy /reports/:slug URLs from sync-html-docs → inline archive view. */
function archiveSlugForReportSlug(reportSlug: string): string | null {
  const entry = htmlReportManifest.find((r) => r.slug === reportSlug);
  if (!entry) return null;
  const base = entry.sourceLabel.replace(/\.html$/i, "");
  const file = base.split("/").pop() ?? "";
  const stem = file.replace(/\.html$/i, "");
  const match = docSourceManifest.find(
    (d) => d.kind === "html" && d.sourcePath.endsWith(`${stem}.html`),
  );
  return match?.slug ?? null;
}

export function HtmlReportPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/" replace />;

  const archiveSlug = archiveSlugForReportSlug(slug);
  if (archiveSlug) {
    return <Navigate to={`/archive/${archiveSlug}`} replace />;
  }

  return <Navigate to="/archive" replace />;
}
