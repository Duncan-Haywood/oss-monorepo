import PrintLandingPage from "@/components/PrintLandingPage";
import {
  getAllSeoSlugs,
  getCatalogArtworkSlugs,
  getSeoPagesWithPublishState,
  buildPrintStructuredData,
  resolvePrintPage,
} from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  const slugs = Array.from(new Set(getAllSeoSlugs().concat(getCatalogArtworkSlugs())));
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = resolvePrintPage(slug);
  if (!page) {
    return { title: "Print not found — Print Atelier" };
  }

  const withState = getSeoPagesWithPublishState().find((item) => item.slug === page.slug);
  const robots = withState?.publishState.publishable ? "index, follow" : "noindex, nofollow";

  return {
    title: page.title,
    description: page.metaDescription,
    robots,
  };
}

export default async function PrintSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const page = resolvePrintPage(slug);
  if (!page) {
    notFound();
  }

  const withState = getSeoPagesWithPublishState().find((item) => item.slug === page.slug);
  const structuredData = buildPrintStructuredData(
    page,
    withState?.publishState ?? { publishable: false, blockers: ["Publish state unavailable"], consentBlocked: true },
    process.env.NEXT_PUBLIC_SITE_URL,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PrintLandingPage page={page} publishState={withState?.publishState} />
    </>
  );
}
