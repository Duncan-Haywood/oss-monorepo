import B2BPortalBoard from "@/components/B2BPortalBoard";
import DemoNav from "@/components/shared/DemoNav";
import { filterTradeCatalog } from "@/lib/b2b-catalog";
import { catalogArtworks } from "@/lib/marketplace";
import { resolvePrintHref } from "@/lib/seo";

export const dynamic = "force-dynamic";

type B2BPortalPageProps = {
  searchParams: Promise<{
    q?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function B2BPortalPage({ searchParams }: B2BPortalPageProps) {
  const params = await searchParams;
  const query = firstParam(params.q);
  const liveCount = filterTradeCatalog(catalogArtworks).length;
  const listings = filterTradeCatalog(catalogArtworks, { query }).map((artwork) => ({
    ...artwork,
    href: resolvePrintHref(artwork),
  }));

  return (
    <div>
      <DemoNav current="/b2b-portal" />
      <B2BPortalBoard query={query} listings={listings} liveCount={liveCount} />
    </div>
  );
}
