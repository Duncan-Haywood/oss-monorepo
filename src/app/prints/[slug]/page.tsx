import PrintLandingPage from "@/components/PrintLandingPage";
import {
  getAllSeoSlugs,
  getSeoPageBySlug,
  getSeoPagesWithPublishState,
} from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return getAllSeoSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getSeoPageBySlug(params.slug);
  if (!page) {
    return { title: "Print not found — Print Atelier" };
  }

  const withState = getSeoPagesWithPublishState().find((item) => item.slug === params.slug);
  const robots = withState?.publishState.publishable ? "index, follow" : "noindex, nofollow";

  return {
    title: page.title,
    description: page.metaDescription,
    robots,
  };
}

export default function PrintSlugPage({ params }: PageProps) {
  const page = getSeoPageBySlug(params.slug);
  if (!page) {
    notFound();
  }

  const withState = getSeoPagesWithPublishState().find((item) => item.slug === params.slug);

  return <PrintLandingPage page={page} publishState={withState?.publishState} />;
}
