import Link from "next/link";
import { Filter, Heart, ShoppingCart, User } from "lucide-react";
import DemoNav from "@/components/shared/DemoNav";
import BuyerPortalSearchForm from "@/components/BuyerPortalSearchForm";
import {
  BUYER_PRINT_SIZES,
  BUYER_SORTS,
  buildBuyerPortalHref,
  parseBuyerCatalogSearchParams,
  searchBuyerCatalog,
  type BuyerCatalogQuery,
  type BuyerSort,
} from "@/lib/buyer-catalog";

export const dynamic = "force-dynamic";

type BuyerPortalPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function filterHref(query: BuyerCatalogQuery, patch: Partial<BuyerCatalogQuery>): string {
  return buildBuyerPortalHref({ ...query, ...patch });
}

const sortLabels: Record<BuyerSort, string> = {
  recommended: "Recommended",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  artist: "Artist A–Z",
};

export default async function BuyerPortalPage({ searchParams }: BuyerPortalPageProps) {
  const params = await searchParams;
  const query = parseBuyerCatalogSearchParams(params);
  const catalog = searchBuyerCatalog(query);
  const listingNoun = catalog.totalLive === 1 ? "print" : "prints";

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex flex-col text-stone-900 dark:text-gray-100">
      <DemoNav current="/buyer-portal" />
      <header className="bg-white dark:bg-gray-800 border-b border-stone-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-8">
            <Link href="/buyer-portal" className="text-2xl font-serif font-bold text-stone-900 dark:text-white">
              Print Atelier
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link
                href="/buyer-portal"
                className={`text-sm font-medium pb-1 ${
                  !query.styles?.length && !query.artists?.length
                    ? "text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white"
                    : "text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white"
                }`}
              >
                Shop All
              </Link>
              <Link
                href={filterHref(query, { styles: ["Landscape"], artists: [] })}
                className="text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white pb-1"
              >
                Landscapes
              </Link>
              <Link
                href={filterHref(query, { artists: catalog.artists, styles: [] })}
                className="text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white pb-1"
              >
                Artists
              </Link>
            </nav>
          </div>
          <div className="flex flex-1 items-center gap-4 lg:max-w-xl">
            <div className="flex-1">
              <BuyerPortalSearchForm
                defaultQuery={query.query ?? ""}
                styles={query.styles}
                sizes={query.sizes}
                artists={query.artists}
                checkoutReadyOnly={query.checkoutReadyOnly}
                sort={query.sort}
              />
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
              <span className="sr-only">Account and saved prints are demo-only</span>
              <span className="p-2 rounded-full" aria-hidden="true">
                <User className="w-5 h-5" />
              </span>
              <span className="p-2 rounded-full" aria-hidden="true">
                <Heart className="w-5 h-5" />
              </span>
              <Link href="/checkout" aria-label="Open checkout" className="p-2 hover:bg-stone-100 dark:hover:bg-gray-700 rounded-full transition relative">
                <ShoppingCart className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 flex gap-8">
        <aside className="w-64 hidden lg:block shrink-0">
          <form action="/buyer-portal" method="get" className="sticky top-24 space-y-8">
            {query.query ? <input type="hidden" name="q" value={query.query} /> : null}
            {query.sort && query.sort !== "recommended" ? <input type="hidden" name="sort" value={query.sort} /> : null}
            <div>
              <h2 className="font-bold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filters
              </h2>
              <div className="space-y-3">
                {catalog.styles.map((style) => (
                  <label key={style} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="style"
                      value={style}
                      defaultChecked={query.styles?.includes(style)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-stone-600 dark:text-gray-300">{style}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-bold text-stone-900 dark:text-white mb-4">Size</h2>
              <div className="grid grid-cols-2 gap-2">
                {BUYER_PRINT_SIZES.map((size) => (
                  <label
                    key={size}
                    className={`px-3 py-2 text-xs border rounded-md cursor-pointer text-center ${
                      query.sizes?.includes(size)
                        ? "border-stone-900 bg-stone-900 text-white dark:border-white"
                        : "border-stone-200 dark:border-gray-700 text-stone-600 dark:text-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="size"
                      value={size}
                      defaultChecked={query.sizes?.includes(size)}
                      className="sr-only"
                    />
                    {size}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-stone-500">Size bands follow retail price until framed dimensions ship with the catalog.</p>
            </div>
            <div>
              <h2 className="font-bold text-stone-900 dark:text-white mb-4">Artist</h2>
              <div className="space-y-2">
                {catalog.artists.map((artist) => (
                  <label key={artist} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="artist"
                      value={artist}
                      defaultChecked={query.artists?.includes(artist)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-stone-600 dark:text-gray-300">{artist}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" name="ready" value="1" defaultChecked={query.checkoutReadyOnly} className="mt-0.5 rounded text-blue-600" />
              <span className="text-sm text-stone-600 dark:text-gray-300">Only prints ready for checkout</span>
            </label>
            <button type="submit" className="w-full bg-stone-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-stone-700">
              Apply filters
            </button>
            <Link href="/buyer-portal" className="block text-center text-sm text-stone-500 hover:text-stone-900">
              Clear all
            </Link>
          </form>
        </aside>

        <div className="flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
            <p className="text-sm text-stone-500 dark:text-gray-400">
              Showing {catalog.matched} of {catalog.totalLive} live {listingNoun}
              {query.query ? ` for “${query.query}”` : ""}
            </p>
            <form action="/buyer-portal" method="get" className="flex items-center gap-2">
              {query.query ? <input type="hidden" name="q" value={query.query} /> : null}
              {(query.styles ?? []).map((style) => (
                <input key={`sort-style-${style}`} type="hidden" name="style" value={style} />
              ))}
              {(query.sizes ?? []).map((size) => (
                <input key={`sort-size-${size}`} type="hidden" name="size" value={size} />
              ))}
              {(query.artists ?? []).map((artist) => (
                <input key={`sort-artist-${artist}`} type="hidden" name="artist" value={artist} />
              ))}
              {query.checkoutReadyOnly ? <input type="hidden" name="ready" value="1" /> : null}
              <label htmlFor="buyer-sort" className="sr-only">
                Sort prints
              </label>
              <select
                id="buyer-sort"
                name="sort"
                defaultValue={query.sort ?? "recommended"}
                className="text-sm bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-lg px-3 py-2 text-stone-700 dark:text-gray-300"
              >
                {BUYER_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {sortLabels[sort]}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-gray-700">
                Sort
              </button>
            </form>
          </div>

          {catalog.listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
              <h2 className="text-lg font-semibold text-stone-900">No prints match this search</h2>
              <p className="mt-2 text-sm text-stone-500">
                Try a color, artist name, or style — or browse every live listing.
              </p>
              <Link
                href="/buyer-portal"
                className="mt-4 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
              >
                Browse all live prints
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {catalog.listings.map((listing) => {
                const { artwork } = listing;
                return (
                  <article key={artwork.id} className="group">
                    <Link href={listing.printHref} className="block">
                      <div className="relative aspect-[4/5] mb-4 bg-stone-200 dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all">
                        <div className={`absolute inset-0 ${artwork.imageClass}`} />
                        {artwork.badge ? (
                          <span className="absolute top-4 left-4 bg-white/90 text-xs font-medium px-3 py-1.5 rounded-full shadow">
                            {artwork.badge}
                          </span>
                        ) : null}
                        <span className="absolute bottom-4 left-4 bg-white/90 backdrop-blur text-xs font-medium px-3 py-1.5 rounded-full shadow">
                          {listing.size} · {artwork.style}
                        </span>
                      </div>
                      <div className="flex justify-between items-start mb-1">
                        <h2 className="font-medium text-stone-900 dark:text-white truncate pr-4 group-hover:underline">
                          {artwork.title}
                        </h2>
                        <span className="font-medium text-stone-900 dark:text-white">${artwork.retailPrice}</span>
                      </div>
                    </Link>
                    <p className="text-sm text-stone-500 dark:text-gray-400 mb-1">
                      <Link href={filterHref(query, { artists: [artwork.artistName] })} className="hover:underline">
                        {artwork.artistName}
                      </Link>
                    </p>
                    <p className="text-xs text-stone-500 dark:text-gray-400">
                      Artist earns ${listing.artistShare.toFixed(2)} · Archival print
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {listing.checkoutEligible ? (
                        <Link
                          href={listing.checkoutHref}
                          className="inline-flex rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-700"
                        >
                          Add to checkout
                        </Link>
                      ) : (
                        <span className="inline-flex rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          Preview only — {listing.checkoutBlockers[0] ?? "not ready to sell"}
                        </span>
                      )}
                      <Link
                        href={listing.printHref}
                        className="inline-flex rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-gray-600 dark:text-gray-200"
                      >
                        View print
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-stone-200 dark:border-gray-800 px-6 py-6 text-xs text-stone-500 dark:text-gray-400">
        <div className="max-w-7xl mx-auto space-y-2">
          <p>
            Buyer shop search runs in this demo only. Filters do not collect payment details, identity, or
            third-party tracking. Checkout is free to try; Stripe keys stay optional. Listings without
            storefront consent stay preview-only.
          </p>
          <p>
            Print Atelier makes no earnings, conversion, fulfillment, or compliance warranty. Sponsorship is
            optional and does not change product features.
          </p>
          <p>
            <Link href="/storefront" className="underline hover:text-stone-800">Storefront</Link>
            {" · "}
            <Link href="/checkout" className="underline hover:text-stone-800">Checkout</Link>
            {" · "}
            <a href="https://github.com/sponsors/Duncan-Haywood" className="underline hover:text-stone-800" rel="noreferrer">
              Optional GitHub Sponsors
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
