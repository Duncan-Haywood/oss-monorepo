import DemoNav from "@/components/shared/DemoNav";
import ProductDetailPreviewCTA from "@/components/ProductDetailPreviewCTA";
import RoomPreviewExperiment from "@/components/RoomPreviewExperiment";
import StorefrontSearchForm from "@/components/StorefrontSearchForm";
import StorefrontCheckoutCTA from "@/components/StorefrontCheckoutCTA";
import { calculatePrintEconomics, catalogArtworks } from "@/lib/marketplace";
import { validateCheckoutLineItem } from "@/lib/checkout";
import { resolvePrintHref } from "@/lib/seo";
import {
  buildStorefrontHref,
  filterStorefrontListings,
  listStorefrontArtists,
  listStorefrontStyles,
} from "@/lib/storefront-catalog";
import { ShoppingBag, Heart, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type StorefrontPageProps = {
  searchParams: Promise<{
    style?: string;
    q?: string;
    artist?: string;
    view?: string;
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function StorefrontPage({ searchParams }: StorefrontPageProps) {
  const params = await searchParams;
  const cartCount = 2;
  const query = firstParam(params.q);
  const artist = firstParam(params.artist).trim();
  const styles = listStorefrontStyles(catalogArtworks);
  const artists = listStorefrontArtists(catalogArtworks);
  const styleChips = ["All", ...styles];
  const requestedFilter = firstParam(params.style);
  const activeFilter = styleChips.includes(requestedFilter) ? requestedFilter : "All";
  const view = firstParam(params.view) === "artists" ? "artists" : "catalog";
  const visibleArtworks = filterStorefrontListings(catalogArtworks, {
    query,
    style: activeFilter,
    artist,
  });
  const listingLabel = visibleArtworks.length === 1 ? "listing" : "listings";
  const liveCount = filterStorefrontListings(catalogArtworks).length;
  const hasActiveSearch = Boolean(query.trim() || artist || activeFilter !== "All");

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/storefront" />

      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <StorefrontSearchForm defaultQuery={query} style={activeFilter} artist={artist} />
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/storefront?view=artists"
              className={`hover:text-stone-900 ${view === "artists" ? "font-medium text-stone-900" : "text-stone-600"}`}
            >
              Artists
            </Link>
            <a href="#catalog" className="text-stone-600 hover:text-stone-900">
              Collections
            </a>
            <a href="/checkout" className="relative" aria-label="View checkout">
              <ShoppingBag className="w-5 h-5 text-stone-700" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </a>
          </div>
        </div>
      </div>

      <section className="relative bg-stone-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900 via-stone-900/95 to-transparent z-10" />
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-br from-indigo-900 to-purple-900 opacity-60" />
        <div className="relative z-20 max-w-7xl mx-auto px-4 py-12 md:py-16">
          <p className="text-indigo-300 text-sm font-medium mb-3 tracking-wide uppercase">AI-Curated Collection</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 max-w-xl">
            Museum-quality prints from independent artists
          </h1>
          <p className="text-stone-300 max-w-lg mb-8">
            {liveCount} launch-ready pieces digitized with AI-enhanced capture. Printed on archival paper and shipped directly to your door. 30% of net profit goes to the artist.
          </p>
          <div className="flex gap-3">
            <a href="#catalog" className="bg-white text-stone-900 px-6 py-3 rounded-md font-medium hover:bg-stone-100 transition">
              Shop Collection
            </a>
            <a href="#visualizer" className="border border-white/30 px-6 py-3 rounded-md font-medium hover:bg-white/10 transition">
              Room Visualizer
            </a>
          </div>
        </div>
      </section>

      <section id="catalog" className="max-w-7xl mx-auto px-4 py-8">
        {view === "artists" ? (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-stone-900">Artists in this catalog</h2>
            <p className="text-sm text-stone-500 mt-1">
              Filter the live storefront by the artist who made the work.
            </p>
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {artists.map((name) => {
                const count = filterStorefrontListings(catalogArtworks, { artist: name }).length;
                return (
                  <li key={name}>
                    <Link
                      href={buildStorefrontHref({ artist: name, query, style: activeFilter })}
                      className={`block rounded-2xl border p-4 transition ${
                        artist === name
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 bg-white hover:border-stone-400"
                      }`}
                    >
                      <p className="font-semibold">{name}</p>
                      <p className={`text-sm ${artist === name ? "text-stone-300" : "text-stone-500"}`}>
                        {count} live {count === 1 ? "print" : "prints"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">
              {query.trim() ? `Results for “${query.trim()}”` : "Trending This Week"}
            </h2>
            <p className="text-sm text-stone-500">
              {visibleArtworks.length} shared-catalog {listingLabel}
              {artist ? ` by ${artist}` : ""}
              {activeFilter !== "All" ? ` in ${activeFilter}` : ""}
              {" in this view"}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {styleChips.map((styleName) => (
              <Link
                key={styleName}
                href={buildStorefrontHref({
                  query,
                  artist,
                  style: styleName,
                })}
                className={`mb-2 px-3 py-1.5 rounded-full text-sm transition ${
                  activeFilter === styleName
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
                }`}
              >
                {styleName}
              </Link>
            ))}
          </div>
        </div>

        {hasActiveSearch ? (
          <p className="mb-4 text-sm">
            <Link href="/storefront" className="text-indigo-700 hover:underline">
              Clear search and filters
            </Link>
          </p>
        ) : null}

        {visibleArtworks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-stone-900">No prints match this search</h3>
            <p className="mt-2 text-sm text-stone-500">
              Try a color, artist name, or style — or browse the full live catalog.
            </p>
            <Link
              href="/storefront"
              className="mt-4 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Browse all live prints
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
              {visibleArtworks.slice(0, 3).map((art) => {
                const economics = calculatePrintEconomics({
                  retailPrice: art.retailPrice,
                  fulfillmentCost: art.fulfillmentCost,
                });
                const href = resolvePrintHref(art);

                return (
                  <Link
                    key={`${art.slug}-preview`}
                    href={href}
                    className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm hover:border-stone-400"
                  >
                    <div className={`h-16 w-14 shrink-0 rounded-xl ${art.imageClass}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">{art.title}</p>
                      <p className="text-xs text-stone-500">{art.artistName} • ${art.retailPrice}</p>
                      <p className="text-xs font-medium text-emerald-700">Artist earns ${economics.artistShare.toFixed(2)} per print</p>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {visibleArtworks.map((art) => {
                const economics = calculatePrintEconomics({
                  retailPrice: art.retailPrice,
                  fulfillmentCost: art.fulfillmentCost,
                });
                const href = resolvePrintHref(art);

                return (
                  <article key={art.id} className="group">
                    <Link href={href} className="block">
                      <div className={`relative aspect-[4/5] ${art.imageClass} rounded-lg overflow-hidden mb-3`}>
                        {art.badge && (
                          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-stone-700">
                            {art.badge}
                          </span>
                        )}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition">
                          <span className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                            <Heart className="w-4 h-4 text-stone-600" aria-hidden="true" />
                          </span>
                        </div>
                        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-stone-700 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> {art.hasRoomMockups ? "Room Preview" : "Preview Soon"}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-end justify-center pb-4">
                          <span className="opacity-0 group-hover:opacity-100 bg-white text-stone-900 px-4 py-2 rounded-md text-sm font-medium transition shadow-lg">
                            Quick View — ${art.retailPrice}
                          </span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-stone-900 group-hover:text-indigo-700 group-hover:underline">{art.title}</h3>
                    </Link>
                    <p className="text-sm text-stone-500">
                      <Link
                        href={buildStorefrontHref({ artist: art.artistName })}
                        className="hover:underline"
                      >
                        {art.artistName}
                      </Link>
                    </p>
                    <p className="text-sm font-medium text-stone-900 mt-1">From ${art.retailPrice}</p>
                    <p className="text-xs text-stone-400 mt-1">Artist earns ${economics.artistShare.toFixed(2)} per print</p>
                    {(() => {
                      const eligibility = validateCheckoutLineItem(art);
                      return (
                        <StorefrontCheckoutCTA
                          artworkSlug={art.slug}
                          eligible={eligibility.eligible}
                          blockers={eligibility.blockers}
                        />
                      );
                    })()}
                  </article>
                );
              })}
            </div>
          </>
        )}

        <ProductDetailPreviewCTA />
        <div id="visualizer">
          <RoomPreviewExperiment />
        </div>
      </section>

      <footer className="bg-stone-900 text-stone-400 text-sm py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>Print Atelier — Interactive Storefront Demo</p>
          <p className="text-xs mt-1 text-stone-500">Programmatic SEO pages and dynamic ads drive traffic to pages like this</p>
          <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-stone-500">
            Search and catalog filters run in this demo only. They do not collect payment, identity,
            or third-party tracking. Estimates in the visualizer are illustrative scenarios, not
            financial, legal, tax, or investment advice. Print Atelier makes no earnings,
            conversion, fulfillment, or compliance warranty.
          </p>
        </div>
      </footer>
    </div>
  );
}
