import DemoNav from "@/components/shared/DemoNav";
import ProductDetailPreviewCTA from "@/components/ProductDetailPreviewCTA";
import RoomPreviewExperiment from "@/components/RoomPreviewExperiment";
import { calculatePrintEconomics, catalogArtworks } from "@/lib/marketplace";
import { ShoppingBag, Search, Heart, Image as ImageIcon } from "lucide-react";

type StorefrontPageProps = {
  searchParams?: {
    style?: string;
  };
};

export default function StorefrontPage({ searchParams }: StorefrontPageProps) {
  const cartCount = 2;
  const liveArtworks = catalogArtworks.filter((artwork) => artwork.status === "Live");
  const filters = ["All", ...Array.from(new Set(liveArtworks.map((artwork) => artwork.style)))];
  const requestedFilter = searchParams?.style;
  const activeFilter = filters.includes(requestedFilter ?? "") ? requestedFilter ?? "All" : "All";
  const visibleArtworks =
    activeFilter === "All"
      ? liveArtworks
      : liveArtworks.filter((artwork) => artwork.style === activeFilter);
  const listingLabel = visibleArtworks.length === 1 ? "listing" : "listings";

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/storefront" />

      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search by style, color, artist..."
              className="w-full pl-10 pr-4 py-2 bg-stone-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button className="text-stone-600 hover:text-stone-900">Artists</button>
            <button className="text-stone-600 hover:text-stone-900">Collections</button>
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
            {liveArtworks.length} launch-ready pieces digitized with AI-enhanced capture. Printed on archival paper and shipped directly to your door. 30% of net profit goes to the artist.
          </p>
          <div className="flex gap-3">
            <button className="bg-white text-stone-900 px-6 py-3 rounded-md font-medium hover:bg-stone-100 transition">
              Shop Collection
            </button>
            <button className="border border-white/30 px-6 py-3 rounded-md font-medium hover:bg-white/10 transition">
              Room Visualizer
            </button>
          </div>
        </div>
      </section>

      <section id="catalog" className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">Trending This Week</h2>
            <p className="text-sm text-stone-500">{visibleArtworks.length} shared-catalog {listingLabel} in this view</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {filters.map((f) => (
              <a
                key={f}
                href={f === "All" ? "/storefront" : `/storefront?style=${encodeURIComponent(f)}`}
                style={{ marginRight: 8, marginBottom: 8 }}
                className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm transition last:mr-0 ${
                  activeFilter === f
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
                }`}
              >
                {f}
              </a>
            ))}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          {visibleArtworks.slice(0, 3).map((art) => {
            const economics = calculatePrintEconomics({
              retailPrice: art.retailPrice,
              fulfillmentCost: art.fulfillmentCost,
            });

            return (
              <div key={`${art.slug}-preview`} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                <div className={`h-16 w-14 shrink-0 rounded-xl ${art.imageClass}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">{art.title}</p>
                  <p className="text-xs text-stone-500">{art.artistName} • ${art.retailPrice}</p>
                  <p className="text-xs font-medium text-emerald-700">Artist earns ${economics.artistShare.toFixed(2)} per print</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleArtworks.map((art) => {
            const economics = calculatePrintEconomics({
              retailPrice: art.retailPrice,
              fulfillmentCost: art.fulfillmentCost,
            });

            return (
              <div key={art.id} className="group cursor-pointer">
                <div className={`relative aspect-[4/5] ${art.imageClass} rounded-lg overflow-hidden mb-3`}>
                  {art.badge && (
                    <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-stone-700">
                      {art.badge}
                    </span>
                  )}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition">
                    <button className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                      <Heart className="w-4 h-4 text-stone-600" />
                    </button>
                  </div>
                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-stone-700 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> {art.hasRoomMockups ? "Room Preview" : "Preview Soon"}
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-end justify-center pb-4">
                    <button className="opacity-0 group-hover:opacity-100 bg-white text-stone-900 px-4 py-2 rounded-md text-sm font-medium transition shadow-lg">
                      Quick View — ${art.retailPrice}
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-stone-900">{art.title}</h3>
                <p className="text-sm text-stone-500">{art.artistName}</p>
                <p className="text-sm font-medium text-stone-900 mt-1">From ${art.retailPrice}</p>
                <p className="text-xs text-stone-400 mt-1">Artist earns ${economics.artistShare.toFixed(2)} per print</p>
              </div>
            );
          })}
        </div>

        <ProductDetailPreviewCTA />
        <RoomPreviewExperiment />
      </section>

      <footer className="bg-stone-900 text-stone-400 text-sm py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>Print Atelier — Interactive Storefront Demo</p>
          <p className="text-xs mt-1 text-stone-500">Programmatic SEO pages and dynamic ads drive traffic to pages like this</p>
        </div>
      </footer>
    </div>
  );
}
