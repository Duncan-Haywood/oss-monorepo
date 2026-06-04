import { notFound } from "next/navigation";
import { DocsShell } from "@/components/DocsShell";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { getMarkdownDoc, markdownDocs } from "@/lib/docs-registry";
import { readRepoMarkdown } from "@/lib/load-markdown";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return markdownDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = getMarkdownDoc(slug);
  return { title: doc?.title ?? "Document" };
}

export default async function MarkdownDocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getMarkdownDoc(slug);
  if (!doc) notFound();

  const source = await readRepoMarkdown(doc.sourcePath);

  return (
    <DocsShell
      title={doc.title}
      description={doc.description}
      breadcrumb={[
        { label: "Docs", href: "/docs" },
        { label: doc.title },
      ]}
    >
      <MarkdownDocument source={source} />
    </DocsShell>
  );
}
