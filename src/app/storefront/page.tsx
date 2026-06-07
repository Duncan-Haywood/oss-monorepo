"use client";

import DemoNav from "@/components/shared/DemoNav";
import { ShoppingBag, Search, Heart, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

const artworks = [
  { id: 1, title: "Midnight Coast", artist: "Elena Rostova", price: 85, image: "bg-gradient-to-br from-blue-950 to-indigo-800", tag: "Bestseller" },
  { id: 2, title: "Urban Geometry", artist: "Marcus Chen", price: 110, image: "bg-gradient-to-br from-gray-800 to-gray-600", tag: "New" },
  { id: 3, title: "Spring Bloom", artist: "Sarah Jenkins", price: 65, image: "bg-gradient-to-br from-emerald-800 to-green-600" },
  { id: 4, title: "Desert Sun", artist: "Elena Rostova", price: 95, image: "bg-gradient-to-br from-orange-900 to-amber-700" },
  { id: 5, title: "Abstract No. 4", artist: "Marcus Chen", price: 120, image: "bg-gradient-to-br from-purple-950 to-violet-700" },
  { id: 6, title: "Morning Light", artist: "Sarah Jenkins", price: 75, image: "bg-gradient-to-br from-yellow-700 to-amber-500" },
  { id: 7, title: "Coastal Mist", artist: "Elena Rostova", price: 90, image: "bg-gradient-to-br from-slate-700 to-blue-900" },
  { id: 8, title: "City at Dusk", artist: "Marcus Chen", price: 105, image: "bg-gradient-to-br from-rose-900 to-purple-900", tag: "Trending" },
];

const filters = ["All", "Abstract", "Landscape", "Portrait", "Minimal"];

export default function StorefrontPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [cartCount] = useState(2);

  return (
    <div className="min-h-screen bg-stone-50">
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
            <button className="relative">
              <ShoppingBag className="w-5 h-5 text-stone-700" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <section className="relative bg-stone-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900 via-stone-900/95 to-transparent z-10" />
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-br from-indigo-900 to-purple-900 opacity-60" />
        <div className="relative z-20 max-w-7xl mx-auto px-4 py-20">
          <p className="text-indigo-300 text-sm font-medium mb-3 tracking-wide uppercase">AI-Curated Collection</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 max-w-xl">
            Museum-quality prints from independent artists
          </h1>
          <p className="text-stone-300 max-w-lg mb-8">
            Every piece digitized with AI-enhanced capture. Printed on archival paper and shipped directly to your door. 30% of profits go to the artist.
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

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-stone-900">Trending This Week</h2>
          <div className="flex gap-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  activeFilter === f
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {artworks.map((art) => (
            <div key={art.id} className="group cursor-pointer">
              <div className={`relative aspect-[4/5] ${art.image} rounded-lg overflow-hidden mb-3`}>
                {art.tag && (
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-stone-700">
                    {art.tag}
                  </span>
                )}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition">
                  <button className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                    <Heart className="w-4 h-4 text-stone-600" />
                  </button>
                </div>
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-stone-700 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Room Preview
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-end justify-center pb-4">
                  <button className="opacity-0 group-hover:opacity-100 bg-white text-stone-900 px-4 py-2 rounded-md text-sm font-medium transition shadow-lg">
                    Quick View — ${art.price}
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-stone-900">{art.title}</h3>
              <p className="text-sm text-stone-500">{art.artist}</p>
              <p className="text-sm font-medium text-stone-900 mt-1">From ${art.price}</p>
            </div>
          ))}
        </div>
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
