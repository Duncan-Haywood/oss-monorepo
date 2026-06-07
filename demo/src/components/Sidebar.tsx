"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BookOpen, 
  Target, 
  Users, 
  Settings, 
  DollarSign, 
  LayoutDashboard,
  Palette
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: "Business Plan", href: "/", icon: BookOpen },
  { name: "Strategy", href: "/strategy", icon: Target },
  { name: "Artist Pitch", href: "/artist-pitch", icon: Users },
  { name: "Operations", href: "/operations", icon: Settings },
  { name: "Revenue Model", href: "/revenue-model", icon: DollarSign },
  { name: "Platform Demo", href: "/demo", icon: LayoutDashboard },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-200">
        <Palette className="h-6 w-6 text-indigo-600 mr-2" />
        <span className="text-lg font-bold text-gray-900">Print Atelier</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                isActive
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                "group flex items-center rounded-md px-2 py-2 text-sm font-medium"
              )}
            >
              <item.icon
                className={cn(
                  isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-indigo-600",
                  "mr-3 h-5 w-5 shrink-0"
                )}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
