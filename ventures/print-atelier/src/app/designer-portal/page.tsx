"use client";

import DemoNav from "@/components/shared/DemoNav";
import { Briefcase, FolderOpen, ShoppingCart, Users, Plus, Search } from "lucide-react";
import { useState } from "react";

const projects = [
  { id: 1, name: "Meridian Hotel Lobby", client: "Meridian Hospitality", pieces: 24, budget: 8400, status: "In Progress" },
  { id: 2, name: "Oakwood Office Suite", client: "Oakwood Properties", pieces: 12, budget: 3200, status: "Draft" },
  { id: 3, name: "Coastal Restaurant Chain", client: "Blue Plate Group", pieces: 48, budget: 15600, status: "Approved" },
];

const catalog = [
  { title: "Midnight Coast", artist: "Elena Rostova", trade: 59.50, retail: 85, image: "bg-blue-900" },
  { title: "Urban Geometry", artist: "Marcus Chen", trade: 77.00, retail: 110, image: "bg-gray-800" },
  { title: "Spring Bloom", artist: "Sarah Jenkins", trade: 45.50, retail: 65, image: "bg-emerald-700" },
  { title: "Desert Sun", artist: "Elena Rostova", trade: 66.50, retail: 95, image: "bg-orange-800" },
];

export default function DesignerPortalPage() {
  const [activeTab, setActiveTab] = useState<"projects" | "catalog" | "orders">("projects");

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/designer-portal" />

      <div className="flex h-[calc(100vh-52px)]">
        <aside className="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 hidden md:block">
          <div className="flex items-center gap-2 mb-8 px-2">
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-gray-900 dark:text-gray-100">Trade Portal</span>
          </div>
          <nav className="space-y-1">
            {[
              { id: "projects" as const, icon: FolderOpen, label: "Projects" },
              { id: "catalog" as const, icon: Search, label: "Catalog" },
              { id: "orders" as const, icon: ShoppingCart, label: "Orders" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  activeTab === item.id
                    ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-xs text-indigo-800 dark:text-indigo-300">
            <p className="font-bold mb-1">Trade Pricing</p>
            <p>30% off retail on all prints. Net-30 invoicing available.</p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Studio West Interiors</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 mt-1">
                <Users className="w-4 h-4" /> Trade Account • Verified Designer
              </p>
            </div>
            <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> New Project
            </button>
          </div>

          {activeTab === "projects" && (
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">{project.name}</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-400 mt-1">{project.client}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      project.status === "Approved" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" :
                      project.status === "In Progress" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                      "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  <div className="flex gap-6 mt-4 text-sm">
                    <div><span className="text-gray-500 dark:text-gray-400">Pieces:</span> <span className="font-medium dark:text-gray-100">{project.pieces}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Budget:</span> <span className="font-medium dark:text-gray-100">${project.budget.toLocaleString()}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "catalog" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {catalog.map((item) => (
                <div key={item.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className={`aspect-square ${item.image}`} />
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                    <p className="text-xs text-gray-800 dark:text-gray-400">{item.artist}</p>
                    <div className="flex justify-between items-center mt-3">
                      <div>
                        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">${item.trade.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-through">${item.retail} retail</p>
                      </div>
                      <button className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded-md font-medium">
                        Add to Project
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "orders" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p>3 orders in the last 90 days totaling $12,400</p>
              <p className="text-sm mt-2">Net-30 invoicing • Bulk shipping to project sites</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
