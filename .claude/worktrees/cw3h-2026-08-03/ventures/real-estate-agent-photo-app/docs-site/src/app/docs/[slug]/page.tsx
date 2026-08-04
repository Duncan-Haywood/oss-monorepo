import Link from "next/link";
import { notFound } from "next/navigation";

import { DocsShell } from "@/components/DocsShell";
import { Markdown } from "@/components/Markdown";
import { getDocBySlug, getDocPages, getDocSlugs } from "@/lib/docs";

type DocPageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: DocPageProps) {
  const doc = getDocBySlug(params.slug);
  if (!doc) {
    return { title: "Not Found" };
  }

  return {
    title: `${doc.title} — Listing Lens Docs`,
    description: doc.description,
    robots: { index: false, follow: false },
  };
}

export default function DocPage({ params }: DocPageProps) {
  const doc = getDocBySlug(params.slug);
  if (!doc) {
    notFound();
  }

  const pages = getDocPages();

  return (
    <DocsShell pages={pages} activeSlug={doc.slug}>
      <div className="space-y-6">
        <Link href="/" className="text-sm text-slate-500 transition-colors hover:text-slate-300">
          ← Back to docs home
        </Link>
        <Markdown>{doc.content}</Markdown>
      </div>
    </DocsShell>
  );
}
