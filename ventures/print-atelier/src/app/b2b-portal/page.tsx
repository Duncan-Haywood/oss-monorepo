"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Package, Percent, FolderOpen, Plus, Search } from "lucide-react";

export default function B2BPortal() {
  const [activeProject, setActiveProject] = useState("hospitality-lobby");

  const projects = [
    { id: "hospitality-lobby", name: "Marriott Lobby Refresh", client: "Studio North Design", pieces: 12, budget: "$4,200" },
    { id: "corporate-hq", name: "Tech HQ Floor 3", client: "Meridian Interiors", pieces: 8, budget: "$2,800" },
    { id: "restaurant", name: "Farm-to-Table Restaurant", client: "Elena Rostova (direct)", pieces: 6, budget: "$1,650" },
  ];

  const catalog = [
    { title: "Midnight Coast", artist: "Elena Rostova", trade: "$58", retail: "$85", size: "16x20" },
    { title: "Urban Geometry", artist: "Marcus Chen", trade: "$75", retail: "$110", size: "20x24" },
    { title: "Spring Bloom", artist: "Sarah Jenkins", trade: "$44", retail: "$65", size: "11x14" },
    { title: "Desert Sun", artist: "Elena Rostova", trade: "$65", retail: "$95", size: "18x24" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Designer Trade Portal</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">Bulk ordering • Trade pricing • Project boards</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-medium flex items-center gap-1">
              <Percent className="w-3 h-3" /> 32% trade discount
            </span>
            <Link href="/" className="text-sm px-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 transition">
              Return to Docs
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex gap-6">
        <aside className="w-72 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4" /> Projects
              </h2>
              <button className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded"><Plus className="w-4 h-4 text-indigo-600" /></button>
            </div>
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProject(p.id)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    activeProject === p.id
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
                      : "hover:bg-slate-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">{p.client}</div>
                  <div className="text-xs text-slate-400 mt-1">{p.pieces} pieces • {p.budget}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Catalog — Trade Pricing</h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by style, color, artist..."
                  className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400">
                  <th className="text-left py-2">Artwork</th>
                  <th className="text-left py-2">Artist</th>
                  <th className="text-left py-2">Size</th>
                  <th className="text-right py-2">Trade</th>
                  <th className="text-right py-2">Retail</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-gray-300">
                {catalog.map((item) => (
                  <tr key={item.title} className="border-b border-slate-100 dark:border-gray-700/50">
                    <td className="py-3 font-medium">{item.title}</td>
                    <td className="py-3">{item.artist}</td>
                    <td className="py-3">{item.size}</td>
                    <td className="py-3 text-right font-mono text-indigo-600 dark:text-indigo-400">{item.trade}</td>
                    <td className="py-3 text-right font-mono text-slate-400 line-through">{item.retail}</td>
                    <td className="py-3 text-right">
                      <button className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-500">Add to Project</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" /> Bulk Order Summary
            </h3>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 dark:text-gray-400">12 pieces • Mixed sizes • White-glove packaging</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">$4,200</div>
                <div className="text-xs text-emerald-600">Est. delivery: 7–10 business days</div>
              </div>
            </div>
            <button className="mt-4 w-full bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-lg font-medium hover:opacity-90 transition">
              Submit Bulk Order
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
