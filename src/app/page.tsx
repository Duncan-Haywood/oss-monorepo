"use client";

import { useState } from "react";
import Strategy from "@/components/Strategy";
import RevenueModel from "@/components/RevenueModel";
import Operations from "@/components/Operations";
import ArtistPitch from "@/components/ArtistPitch";
import MarketResearch from "@/components/MarketResearch";
import GTMStrategy from "@/components/GTMStrategy";
import { Menu, X } from "lucide-react";

const tabs = [
  { id: "strategy", label: "Strategy & Vision" },
  { id: "revenue", label: "Revenue & Profitability" },
  { id: "operations", label: "AI Operations" },
  { id: "pitch", label: "Artist Pitch" },
  { id: "research", label: "Market Research" },
  { id: "gtm", label: "GTM Strategy" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("strategy");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex-shrink-0`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Print Atelier</h1>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 font-medium"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
          
          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
            <a 
              href="/artist-portal"
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <span>Artist Portal Demo</span>
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full font-medium">New</span>
            </a>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 md:hidden">
          <button onClick={() => setIsSidebarOpen(true)} className="mr-4">
            <Menu className="w-6 h-6 text-gray-500" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Business Plan</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            {activeTab === "strategy" && <Strategy />}
            {activeTab === "revenue" && <RevenueModel />}
            {activeTab === "operations" && <Operations />}
            {activeTab === "pitch" && <ArtistPitch />}
            {activeTab === "research" && <MarketResearch />}
            {activeTab === "gtm" && <GTMStrategy />}
          </div>
        </main>
      </div>
    </div>
  );
}
