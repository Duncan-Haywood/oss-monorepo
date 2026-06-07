"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, Palette, TrendingUp, Image as ImageIcon, ExternalLink } from "lucide-react";

export default function Demo() {
  const [view, setView] = useState<"storefront" | "artist">("storefront");

  const fullDemos = [
    { href: "/storefront", label: "Full Storefront" },
    { href: "/buyer-portal", label: "Buyer Portal" },
    { href: "/artist-portal", label: "Artist Portal" },
    { href: "/designer-portal", label: "Designer Portal" },
    { href: "/capture", label: "Capture App" },
    { href: "/ops", label: "Ops Console" },
    { href: "/admin-portal", label: "Admin Console" },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap gap-2 mb-6">
        {fullDemos.map((demo) => (
          <Link
            key={demo.href}
            href={demo.href}
            className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition"
          >
            {demo.label}
            <ExternalLink className="w-3 h-3" />
          </Link>
        ))}
      </div>

      <div className="flex justify-between items-end mb-8 border-b pb-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Platform Demo</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Interactive mockup — open full demos above for standalone pages</p>
        </div>
        <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setView("storefront")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              view === "storefront" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Storefront (Demand)
          </button>
          <button
            onClick={() => setView("artist")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              view === "artist" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Artist Portal (Supply)
          </button>
        </div>
      </div>

      {view === "storefront" ? <StorefrontDemo /> : <ArtistPortalDemo />}
    </div>
  );
}

function StorefrontDemo() {
  const artworks = [
    { id: 1, title: "Midnight Coast", artist: "Elena Rostova", price: 85, image: "bg-blue-900" },
    { id: 2, title: "Urban Geometry", artist: "Marcus Chen", price: 110, image: "bg-gray-800" },
    { id: 3, title: "Spring Bloom", artist: "Sarah Jenkins", price: 65, image: "bg-emerald-700" },
    { id: 4, title: "Desert Sun", artist: "Elena Rostova", price: 95, image: "bg-orange-800" },
    { id: 5, title: "Abstract No. 4", artist: "Marcus Chen", price: 120, image: "bg-purple-900" },
    { id: 6, title: "Morning Light", artist: "Sarah Jenkins", price: 75, image: "bg-yellow-600" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Storefront Header */}
      <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
        <div className="font-serif text-xl tracking-wider">PRINT ATELIER</div>
        <div className="flex space-x-6 text-sm">
          <span className="hover:text-gray-300 cursor-pointer">Shop</span>
          <span className="hover:text-gray-300 cursor-pointer">Artists</span>
          <span className="hover:text-gray-300 cursor-pointer">About</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm">Log in</span>
          <ShoppingBag className="w-5 h-5" />
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gray-100 py-16 px-8 text-center border-b border-gray-200">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Museum-Quality Prints from Independent Artists</h2>
        <p className="text-gray-600 max-w-2xl mx-auto mb-8">
          We partner directly with working painters to digitize their original works. Every print sold directly supports the artist.
        </p>
        <button className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800">
          Explore the Collection
        </button>
      </div>

      {/* Grid */}
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">Trending This Week</h3>
          <span className="text-indigo-600 text-sm font-medium cursor-pointer">View all →</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {artworks.map((art) => (
            <div key={art.id} className="group cursor-pointer">
              <div className={`w-full aspect-[4/5] ${art.image} rounded-lg mb-4 relative overflow-hidden`}>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 bg-white text-gray-900 px-4 py-2 rounded-md font-medium text-sm transition-opacity transform translate-y-4 group-hover:translate-y-0">
                    Quick View
                  </div>
                </div>
                {/* AI Mockup Badge */}
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-gray-700 flex items-center">
                  <ImageIcon className="w-3 h-3 mr-1" /> Room Preview
                </div>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-900">{art.title}</h4>
                  <p className="text-sm text-gray-500">{art.artist}</p>
                </div>
                <span className="font-medium text-gray-900">${art.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtistPortalDemo() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-sm flex h-[800px]">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-6 flex flex-col">
        <div className="flex items-center space-x-3 mb-10">
          <Palette className="w-6 h-6 text-indigo-400" />
          <span className="font-bold text-lg">Artist Portal</span>
        </div>
        
        <div className="space-y-6 flex-1">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Overview</div>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-indigo-400 bg-gray-800 px-3 py-2 rounded-md">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">Dashboard</span>
              </div>
              <div className="flex items-center space-x-3 text-gray-400 hover:text-white px-3 py-2 rounded-md cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                <span className="text-sm font-medium">My Catalog</span>
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Finance</div>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-gray-400 hover:text-white px-3 py-2 rounded-md cursor-pointer">
                <span className="text-sm font-medium">Sales & Payouts</span>
              </div>
              <div className="flex items-center space-x-3 text-gray-400 hover:text-white px-3 py-2 rounded-md cursor-pointer">
                <span className="text-sm font-medium">Tax Documents</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pt-6 border-t border-gray-800 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm">
            ER
          </div>
          <div className="text-sm">
            <div className="font-medium">Elena Rostova</div>
            <div className="text-gray-400 text-xs">elena@example.com</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, Elena</h2>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
            Schedule Capture Session
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Total Earnings (YTD)</div>
            <div className="text-3xl font-bold text-gray-900">$4,285.50</div>
            <div className="text-sm text-green-600 mt-2 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> +12% from last month
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Prints Sold</div>
            <div className="text-3xl font-bold text-gray-900">264</div>
            <div className="text-sm text-gray-500 mt-2">Across 12 active pieces</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-1">Next Payout</div>
            <div className="text-3xl font-bold text-gray-900">$842.10</div>
            <div className="text-sm text-gray-500 mt-2">Scheduled for Oct 1st</div>
          </div>
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-bold text-gray-900">Action Items</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-amber-200 rounded flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <div className="font-bold text-gray-900">Proof Approval Required</div>
                  <div className="text-sm text-gray-600">"Autumn Canopy" has been digitized and needs your approval.</div>
                </div>
              </div>
              <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50">
                Review Proof
              </button>
            </div>
          </div>
        </div>

        {/* Top Performing */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Top Performing Pieces</h3>
            <span className="text-indigo-600 text-sm font-medium cursor-pointer">View full catalog</span>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Artwork</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Units Sold</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Your Profit</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-900 rounded mr-3"></div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Midnight Coast</div>
                      <div className="text-xs text-gray-500">Added Jan 2026</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">84</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">$1,372.56</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-orange-800 rounded mr-3"></div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Desert Sun</div>
                      <div className="text-xs text-gray-500">Added Mar 2026</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">62</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">$1,136.46</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
