"use client";

import { BarChart3, Image as ImageIcon, Settings, Wallet, Bell, Menu, X } from "lucide-react";
import { useState } from "react";

export default function ArtistPortal() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-stone-200 dark:border-gray-700 flex flex-col hidden md:flex">
        <div className="p-6">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <span className="text-blue-700 dark:text-blue-200 font-bold text-lg">AJ</span>
          </div>
          <h2 className="font-bold text-stone-900 dark:text-white">Alex Jenkins</h2>
          <p className="text-sm text-stone-500 dark:text-gray-400">Fine Art Painter</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {[
            { id: "overview", icon: <BarChart3 className="w-5 h-5" />, label: "Overview" },
            { id: "portfolio", icon: <ImageIcon className="w-5 h-5" />, label: "Portfolio" },
            { id: "payouts", icon: <Wallet className="w-5 h-5" />, label: "Payouts" },
            { id: "settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                activeTab === item.id 
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 font-medium" 
                  : "text-stone-600 hover:bg-stone-50 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white dark:bg-gray-800 border-b border-stone-200 dark:border-gray-700 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white capitalize">{activeTab}</h1>
          <div className="flex gap-4">
             <button className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white transition">
               Return to Docs
             </button>
             <button className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-gray-300 rounded-full hover:bg-stone-50 dark:hover:bg-gray-700">
               <Bell className="w-5 h-5" />
             </button>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                  <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Total Earnings</p>
                  <h3 className="text-3xl font-bold text-stone-900 dark:text-white">$4,250.00</h3>
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                    <TrendingUpIcon className="w-4 h-4" /> +12% this month
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                  <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Prints Sold</p>
                  <h3 className="text-3xl font-bold text-stone-900 dark:text-white">142</h3>
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                    <TrendingUpIcon className="w-4 h-4" /> +5 this week
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm">
                  <p className="text-sm text-stone-500 dark:text-gray-400 font-medium mb-1">Active Pieces</p>
                  <h3 className="text-3xl font-bold text-stone-900 dark:text-white">18</h3>
                  <button className="text-sm text-blue-600 dark:text-blue-400 mt-2 hover:underline">Schedule new capture →</button>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-200 dark:border-gray-700 flex justify-between items-center">
                  <h3 className="font-bold text-stone-900 dark:text-white">Recent Sales</h3>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-gray-700">
                  {[
                    { piece: "Midnight Ocean", size: "16x20", price: "$85", royalty: "$16.34", time: "2 hours ago" },
                    { piece: "Summer Valley", size: "24x36", price: "$150", royalty: "$34.50", time: "5 hours ago" },
                    { piece: "Abstract No. 4", size: "11x14", price: "$55", royalty: "$9.80", time: "1 day ago" },
                  ].map((sale, i) => (
                    <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-gray-750 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-stone-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-stone-400 dark:text-gray-500">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-medium text-stone-900 dark:text-white">{sale.piece}</p>
                          <p className="text-sm text-stone-500 dark:text-gray-400">{sale.size} Archival Print • Sold {sale.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600 dark:text-green-400">+{sale.royalty}</p>
                        <p className="text-xs text-stone-400 dark:text-gray-500 font-mono">Net 30% of {sale.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "portfolio" && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm p-12 text-center">
              <ImageIcon className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-2">Portfolio View</h3>
              <p className="text-stone-500 dark:text-gray-400 mb-6 max-w-md mx-auto">View your digitized pieces, manage AI-generated mockups, and track individual performance.</p>
              <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium hover:bg-blue-700 transition-colors">
                Upload New Piece
              </button>
            </div>
          )}
          
          {(activeTab === "payouts" || activeTab === "settings") && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 shadow-sm p-12 text-center text-stone-500 dark:text-gray-400">
              <p>This module is currently in development for the demo.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TrendingUpIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
