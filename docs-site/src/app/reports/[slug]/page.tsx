import { notFound } from "next/navigation";
import htmlManifest from "@/generated/html-manifest.json";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return htmlManifest.docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = htmlManifest.docs.find((entry) => entry.slug === slug);
  return { title: doc?.title ?? "Report" };
}

export default async function HtmlReportPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = htmlManifest.docs.find((entry) => entry.slug === slug);
  if (!doc) {
    notFound();
  }

  try {
    const module = await import(`@/generated/html-docs/${slug}.tsx`);
    const Page = module.default;
    return <Page />;
  } catch {
    notFound();
  }
}
