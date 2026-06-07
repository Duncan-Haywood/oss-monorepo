"use client";

import { BarChart3, Zap, Users } from "lucide-react";

export default function MarketingPortal() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Marketing Automation Hub</h1>
            <p className="text-gray-500 dark:text-gray-400">AI-driven creative generation, testing, and distribution at scale</p>
          </div>
          <a href="/" className="text-sm font-medium px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition">
            Return to Docs
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4">
              <BarChart3 className="text-violet-500" />
              <span className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded">LIVE</span>
            </div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">18,492</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Creative variants tested today</div>
            <div className="text-xs text-emerald-500 mt-2">Winning variant CTR: 4.8%</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4"><Zap className="text-amber-500" /></div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">312k</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Impressions served via AI bidding</div>
            <div className="text-xs text-emerald-500 mt-2">eCPM optimized -18%</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between mb-4"><Users className="text-blue-500" /></div>
            <div className="text-4xl font-mono text-gray-900 dark:text-white">41,203</div>
            <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Personalized pages generated</div>
            <div className="text-xs text-emerald-500 mt-2">Avg. time on site +27%</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Top Performing AI-Generated Assets (Last 24h)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              "Room Mockup - Midnight Coast",
              "Lifestyle Reel Script - Urban Geometry",
              "Email Subject: 'Your walls deserve this'",
              "IG Carousel - 5 prints under $100",
            ].map((asset, i) => (
              <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">{asset}</div>
            ))}
          </div>
          <p className="text-center text-xs mt-8 text-gray-400">All creatives generated, tested, and deployed by autonomous AI agents</p>
        </div>
      </div>
    </div>
  );
}
