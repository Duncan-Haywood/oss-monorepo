"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Target, Users, Cog, DollarSign, BarChart } from "lucide-react";

const navItems = [
  { name: "Demo Landing", href: "/", icon: LayoutDashboard },
  { name: "Business Plan", href: "/business-plan", icon: FileText },
  { name: "Strategy", href: "/strategy", icon: Target },
  { name: "Artist Pitch", href: "/artist-pitch", icon: Users },
  { name: "Operations", href: "/operations", icon: Cog },
  { name: "Revenue Model", href: "/revenue-model", icon: DollarSign },
  { name: "Market Research", href: "/market-research", icon: BarChart },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Print Atelier</h1>
        <p className="text-sm text-gray-500 mt-1">AI-First Art Commerce</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  isActive ? "text-indigo-700" : "text-gray-400"
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
