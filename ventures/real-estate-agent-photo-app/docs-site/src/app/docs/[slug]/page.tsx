import Link from "next/link";
import { notFound } from "next/navigation";

import { DocsShell } from "@/components/DocsShell";
import { Markdown } from "@/components/Markdown";
import { getDocBySlug, getDocPages, getDocSlugs } from "@/lib/docs";

// Next 15+ passes params as a Promise; reading params.slug directly gave undefined, so every doc page was built as
// "Page not found" (found 2026-11-25 while moving the site to AWS).
type DocPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocPageProps) {
  const doc = getDocBySlug((await params).slug);
  if (!doc) {
    return { title: "Not Found" };
  }

  return {
    title: `${doc.title} — Listing Lens Docs`,
    description: doc.description,
    robots: { index: false, follow: false },
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const doc = getDocBySlug((await params).slug);
  if (!doc) {
    notFound();
  }

  const pages = getDocPages();

  return (
    <DocsShell pages={pages} activeSlug={doc.slug}>
      <div className="space-y-6">
        <Link href="/" className="text-sm text-slate-400 transition-colors hover:text-slate-300">
          ← Back to docs home
        </Link>
        <Markdown>{doc.content}</Markdown>
      </div>
    </DocsShell>
  );
}
