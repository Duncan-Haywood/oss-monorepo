"use client";

import { ShoppingCart, Search, Filter, Home, User, Heart, ChevronLeft } from "lucide-react";
import { useState } from "react";

export default function BuyerPortal() {
  const [category, setCategory] = useState("all");

  const artworks = [
    { id: 1, title: "Midnight Ocean", artist: "Alex Jenkins", price: "$85", size: "16x20", image: "bg-blue-900" },
    { id: 2, title: "Summer Valley", artist: "Sarah Chen", price: "$150", size: "24x36", image: "bg-orange-300" },
    { id: 3, title: "Abstract No. 4", artist: "Marcus Doe", price: "$55", size: "11x14", image: "bg-purple-700" },
    { id: 4, title: "Urban Decay", artist: "Elena Rostova", price: "$120", size: "20x24", image: "bg-gray-600" },
    { id: 5, title: "Golden Hour", artist: "Alex Jenkins", price: "$95", size: "18x24", image: "bg-yellow-500" },
    { id: 6, title: "Deep Forest", artist: "Chen Wei", price: "$110", size: "20x30", image: "bg-green-800" },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-stone-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-serif font-bold text-stone-900 dark:text-white">Print Atelier</h1>
            <nav className="hidden md:flex gap-6">
              <button className="text-sm font-medium text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white pb-1">Shop All</button>
              <button className="text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white pb-1">Curated Collections</button>
              <button className="text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white pb-1">Artists</button>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-stone-600 dark:text-gray-300">
            <button className="p-2 hover:bg-stone-100 dark:hover:bg-gray-700 rounded-full transition"><Search className="w-5 h-5" /></button>
            <button className="p-2 hover:bg-stone-100 dark:hover:bg-gray-700 rounded-full transition"><User className="w-5 h-5" /></button>
            <button className="p-2 hover:bg-stone-100 dark:hover:bg-gray-700 rounded-full transition"><Heart className="w-5 h-5" /></button>
            <button className="p-2 hover:bg-stone-100 dark:hover:bg-gray-700 rounded-full transition relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full"></span>
            </button>
            <a href="/" className="ml-4 text-sm font-medium px-4 py-2 border border-stone-300 dark:border-gray-600 rounded-full hover:bg-stone-100 dark:hover:bg-gray-700 transition">Return to Docs</a>
          </div>
        </div>
      </header>

      {/* Main Shop */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 flex gap-8">
        {/* Filters Sidebar */}
        <aside className="w-64 hidden lg:block shrink-0">
          <div className="sticky top-24 space-y-8">
            <div>
              <h3 className="font-bold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filters
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-blue-600" />
                  <span className="text-sm text-stone-600 dark:text-gray-300">Abstract</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-blue-600" />
                  <span className="text-sm text-stone-600 dark:text-gray-300">Landscape</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-blue-600" />
                  <span className="text-sm text-stone-600 dark:text-gray-300">Photography</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-stone-900 dark:text-white mb-4">Size</h3>
              <div className="grid grid-cols-2 gap-2">
                {["Small", "Medium", "Large", "Oversized"].map(s => (
                  <button key={s} className="px-3 py-2 text-xs border border-stone-200 dark:border-gray-700 rounded-md hover:border-stone-900 dark:hover:border-gray-400 text-stone-600 dark:text-gray-300">
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
              <h4 className="font-bold text-blue-900 dark:text-blue-100 text-sm mb-1">AI Visualization</h4>
              <p className="text-xs text-blue-800 dark:text-blue-200 mb-3">Upload a photo of your room to see how the art will look.</p>
              <button className="w-full bg-white dark:bg-gray-800 text-sm font-medium py-2 rounded-lg text-blue-600 dark:text-blue-400 shadow-sm">Try it now</button>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <p className="text-sm text-stone-500 dark:text-gray-400">Showing 6 of 1,492 AI-enhanced prints</p>
            <select className="text-sm bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-lg px-3 py-2 text-stone-700 dark:text-gray-300">
              <option>Recommended</option>
              <option>Newest Arrivals</option>
              <option>Price: Low to High</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {artworks.map((art) => (
              <div key={art.id} className="group cursor-pointer">
                {/* AI Mockup visualization container */}
                <div className="relative aspect-[4/5] mb-4 bg-stone-200 dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all">
                  {/* Fake room mockup background */}
                  <div className="absolute inset-0 bg-stone-100 dark:bg-gray-700 opacity-50"></div>
                  {/* The artwork itself */}
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-1/2 ${art.image} shadow-xl border-4 border-white transition-transform group-hover:scale-105 duration-500`}></div>
                  
                  <button className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-xs font-medium px-3 py-1.5 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity">
                    Quick View
                  </button>
                </div>
                
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-stone-900 dark:text-white truncate pr-4">{art.title}</h3>
                    <span className="font-medium text-stone-900 dark:text-white">{art.price}</span>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-gray-400 mb-1">{art.artist}</p>
                  <p className="text-xs text-stone-400 dark:text-gray-500">Archival Print • {art.size}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
