"use client";

import DemoNav from "@/components/shared/DemoNav";
import { Bot, Mail, MessageSquare, TrendingUp, Users, Zap } from "lucide-react";
import { useState } from "react";

const pipeline = [
  { name: "Elena Rostova", handle: "@elena_paints", followers: "12.4k", status: "Replied", score: 92, platform: "Instagram" },
  { name: "Marcus Chen", handle: "@marcus.art", followers: "8.2k", status: "Opened", score: 87, platform: "Instagram" },
  { name: "Sarah Jenkins", handle: "@sarahcreates", followers: "15.1k", status: "Sent", score: 85, platform: "TikTok" },
  { name: "David Okonkwo", handle: "@dokonkwo_studio", followers: "6.8k", status: "Onboarded", score: 90, platform: "Instagram" },
  { name: "Luna Martinez", handle: "@luna.watercolor", followers: "22.3k", status: "Draft", score: 78, platform: "Pinterest" },
  { name: "James Wu", handle: "@jameswu.art", followers: "4.5k", status: "Sent", score: 81, platform: "Instagram" },
];

const stats = [
  { label: "Prospects Identified", value: "2,847", change: "+142 this week", icon: Users },
  { label: "Outreach Sent", value: "486", change: "8.2% response rate", icon: Mail },
  { label: "Onboarded Artists", value: "94", change: "+12 this month", icon: Zap },
  { label: "Pipeline Value", value: "$38k/mo", change: "Projected platform rev", icon: TrendingUp },
];

export default function OpsPage() {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? pipeline : pipeline.filter((p) => p.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      <DemoNav current="/ops" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bot className="w-7 h-7 text-indigo-600" />
              Artist Outreach Console
            </h1>
            <p className="text-sm text-gray-500 mt-1">AI-powered supply-side acquisition CRM</p>
          </div>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Run Scraper Batch
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <stat.icon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-green-600 mt-1">{stat.change}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Outreach Pipeline</h2>
            <div className="flex gap-2">
              {["All", "Draft", "Sent", "Opened", "Replied", "Onboarded"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    filter === f ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Artist</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Followers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((artist) => (
                <tr key={artist.handle} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{artist.name}</div>
                    <div className="text-xs text-gray-500">{artist.handle}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{artist.platform}</td>
                  <td className="px-6 py-4 text-gray-600">{artist.followers}</td>
                  <td className="px-6 py-4">
                    <span className={`font-mono font-bold ${artist.score >= 90 ? "text-green-600" : artist.score >= 80 ? "text-blue-600" : "text-amber-600"}`}>
                      {artist.score}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      artist.status === "Onboarded" ? "bg-green-100 text-green-700" :
                      artist.status === "Replied" ? "bg-blue-100 text-blue-700" :
                      artist.status === "Opened" ? "bg-purple-100 text-purple-700" :
                      artist.status === "Sent" ? "bg-gray-100 text-gray-600" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {artist.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-1 ml-auto">
                      <MessageSquare className="w-3 h-3" />
                      {artist.status === "Draft" ? "Send DM" : "View Thread"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-indigo-800">
          <p className="font-medium mb-1">Sample AI Outreach Message (Draft for Elena Rostova)</p>
          <p className="text-indigo-700 italic">
            &quot;Hi Elena — your &apos;Midnight Coast&apos; series is stunning. We built software that turns phone photos into museum-quality prints with zero logistics on your end. Want to see a living-room mockup of your work in 60 seconds?&quot;
          </p>
        </div>
      </div>
    </div>
  );
}
