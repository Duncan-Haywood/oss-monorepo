import Link from "next/link";
import { DocsShell } from "@/components/DocsShell";
import { markdownDocs } from "@/lib/docs-registry";

export const metadata = {
  title: "Markdown documentation",
};

export default function DocsIndexPage() {
  return (
    <DocsShell
      title="Markdown documentation"
      description="Guides authored as markdown in the repo and rendered through TSX routes."
      breadcrumb={[{ label: "Docs" }]}
    >
      <ul className="doc-index">
        {markdownDocs.map((doc) => (
          <li key={doc.slug}>
            <Link href={doc.href}>
              <strong>{doc.title}</strong>
            </Link>
            <p className="muted">{doc.description}</p>
            <p className="muted">
              <code>docs/{doc.sourcePath}</code>
            </p>
          </li>
        ))}
      </ul>
    </DocsShell>
  );
}
