"use client";

import { useState } from "react";
import Link from "next/link";
import Strategy from "@/components/Strategy";
import RevenueModel from "@/components/RevenueModel";
import Operations from "@/components/Operations";
import ArtistPitch from "@/components/ArtistPitch";
import MarketResearch from "@/components/MarketResearch";
import GTMStrategy from "@/components/GTMStrategy";
import TechStrategy from "@/components/TechStrategy";
import SalesOutreach from "@/components/SalesOutreach";
import MarketingSales from "@/components/MarketingSales";
import FinancialProjections from "@/components/FinancialProjections";
import PlatformDemo from "@/components/PlatformDemo";
import BusinessOverview from "@/components/BusinessOverview";
import { Menu, X, ExternalLink } from "lucide-react";

const tabs = [
  { id: "overview", label: "Business Overview" },
  { id: "strategy", label: "Strategy & Vision" },
  { id: "sales", label: "Sales & Outreach" },
  { id: "tech", label: "Tech Strategy" },
  { id: "revenue", label: "Revenue & Profitability" },
  { id: "financials", label: "Financial Model" },
  { id: "operations", label: "AI Operations" },
  { id: "marketing", label: "Marketing & Sales" },
  { id: "pitch", label: "Artist Pitch" },
  { id: "research", label: "Market Research" },
  { id: "gtm", label: "GTM Strategy" },
  { id: "demo", label: "Platform Demo" },
];

const demoLinks = [
  { href: "/docs", label: "Visual Docs Hub", badge: "New" },
  { href: "/investor", label: "Investor Dashboard", badge: "New" },
  { href: "/battlecards", label: "Competitive Battlecards", badge: "New" },
  { href: "/seo-lab", label: "Programmatic SEO Lab", badge: "New" },
  { href: "/storefront", label: "Storefront" },
  { href: "/print-file-preflight", label: "Print File Preflight", badge: "New" },
  { href: "/buyer-portal", label: "Buyer Portal", badge: "New" },
  { href: "/artist-portal", label: "Artist Portal" },
  { href: "/b2b-portal", label: "B2B Designer Portal", badge: "New" },
  { href: "/designer-portal", label: "Designer Portal" },
  { href: "/capture", label: "Capture App" },
  { href: "/capture-demo", label: "AI Capture Flow", badge: "New" },
  { href: "/sales-portal", label: "Sales Outreach", badge: "New" },
  { href: "/marketing-portal", label: "Marketing Hub", badge: "New" },
  { href: "/ops", label: "Ops Console" },
  { href: "/admin-portal", label: "Admin Console", badge: "New" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div
        className={`${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Print Atelier</h1>
          <button className="md:hidden" aria-label="Close navigation" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          <p className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Business Plan</p>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 font-medium"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Live Demos</p>
            {demoLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <span className="flex items-center gap-2">
                  {link.label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </span>
                {link.badge && (
                  <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full font-medium">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 md:hidden">
          <button onClick={() => setIsSidebarOpen(true)} className="mr-4" aria-label="Open navigation">
            <Menu className="w-6 h-6 text-gray-500" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Business Plan</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          <div
            className={`mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 ${
              activeTab === "demo" ? "max-w-6xl" : "max-w-4xl"
            }`}
          >
            {activeTab === "overview" && <BusinessOverview />}
            {activeTab === "strategy" && <Strategy />}
            {activeTab === "sales" && <SalesOutreach />}
            {activeTab === "tech" && <TechStrategy />}
            {activeTab === "revenue" && <RevenueModel />}
            {activeTab === "financials" && <FinancialProjections />}
            {activeTab === "operations" && <Operations />}
            {activeTab === "marketing" && <MarketingSales />}
            {activeTab === "pitch" && <ArtistPitch />}
            {activeTab === "research" && <MarketResearch />}
            {activeTab === "gtm" && <GTMStrategy />}
            {activeTab === "demo" && <PlatformDemo />}
          </div>
        </main>
      </div>
    </div>
  );
}
