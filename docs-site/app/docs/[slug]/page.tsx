import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { HtmlDocContent } from "@/components/HtmlDocContent";
import { findEntry } from "@/lib/manifest";
import { loadDocPayload } from "@/lib/load-doc";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { docsManifest } = await import("@/lib/manifest");
  return docsManifest.entries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const entry = findEntry(slug);
  return {
    title: entry ? `${entry.title} · ShootFlow Docs` : "ShootFlow Docs",
    robots: { index: false, follow: false },
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = findEntry(slug);
  if (!entry) {
    notFound();
  }

  const doc = await loadDocPayload(slug);
  if (!doc) {
    notFound();
  }

  return (
    <SiteShell activeSlug={slug}>
      <HtmlDocContent doc={doc} />
    </SiteShell>
  );
}
