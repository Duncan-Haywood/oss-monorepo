"use client";

import { useState } from "react";
import { Target, Mail, CheckCircle } from "lucide-react";

export default function SalesPortal() {
  const [activeCampaign, setActiveCampaign] = useState("artist-outreach");

  const campaigns = [
    { id: "artist-outreach", label: "Artist Acquisition", count: 1247, status: "Active" },
    { id: "buyer-nurture", label: "Buyer Nurture", count: 8920, status: "Active" },
    { id: "retargeting", label: "Ad Retargeting", count: 3456, status: "Optimizing" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Sales Outreach Command Center</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Digital-first, AI-orchestrated outreach for both supply & demand</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
              All Systems Automated • 0 Human SDRs
            </div>
            <a href="/" className="text-sm font-medium px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition">
              Return to Docs
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCampaign(c.id)}
              className={`p-6 rounded-xl border text-left transition-all ${
                activeCampaign === c.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
              }`}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{c.label}</div>
                  <div className="text-3xl font-mono mt-2 text-gray-900 dark:text-white">{c.count.toLocaleString()}</div>
                </div>
                <Target className="w-8 h-8 text-blue-500" />
              </div>
              <div className="text-xs mt-3 text-emerald-600">{c.status}</div>
            </button>
          ))}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col justify-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">AI Response Rate</div>
            <div className="text-4xl font-bold mt-1 text-gray-900 dark:text-white">41%</div>
            <div className="text-xs text-emerald-500 mt-1">+12% vs last month</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-3 text-gray-900 dark:text-white">
            <Mail className="w-6 h-6" /> Live AI Outreach Sequences
          </h2>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-gray-700 dark:text-gray-300 pr-4">
                Instagram DM to @risingabstract — &quot;Your brushwork on the coastal series matches our top 3% performers. Ready to digitize?&quot;
              </div>
              <div className="flex items-center gap-2 text-emerald-600 shrink-0">
                <CheckCircle className="w-4 h-4" /> Replied • Onboarding
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-gray-700 dark:text-gray-300 pr-4">
                Email nurture #3 to &quot;Minimalist Lovers&quot; — personalized room mockup of recently viewed piece
              </div>
              <div className="flex items-center gap-2 text-emerald-600 shrink-0">
                <CheckCircle className="w-4 h-4" /> Opened • 34% CTR
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-gray-700 dark:text-gray-300 pr-4">
                TikTok comment reply to @landscapeoil — &quot;We turned your Yosemite piece into 4 mockups. Link in bio to see earnings potential.&quot;
              </div>
              <div className="flex items-center gap-2 text-emerald-600 shrink-0">
                <CheckCircle className="w-4 h-4" /> Clicked • Signup started
              </div>
            </div>
          </div>
          <p className="text-xs text-center mt-8 text-gray-400">100% automated via proprietary AI agents • Full audit trail available</p>
        </div>
      </div>
    </div>
  );
}
