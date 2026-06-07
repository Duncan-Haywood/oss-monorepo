"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  FileText, 
  Target, 
  Settings, 
  DollarSign, 
  Megaphone 
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Business Plan", href: "/business-plan", icon: FileText },
  { name: "Strategy", href: "/strategy", icon: Target },
  { name: "Operations", href: "/operations", icon: Settings },
  { name: "Revenue Model", href: "/revenue-model", icon: DollarSign },
  { name: "Artist Pitch", href: "/artist-pitch", icon: Megaphone },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex w-64 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-200 dark:border-gray-800">
        <span className="text-lg font-bold text-gray-900 dark:text-white">Print Atelier</span>
      </div>
      <nav className="flex flex-1 flex-col px-4 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                isActive
                  ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white",
                "group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors"
              )}
            >
              <item.icon
                className={cn(
                  isActive 
                    ? "text-gray-900 dark:text-white" 
                    : "text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white",
                  "mr-3 h-5 w-5 flex-shrink-0 transition-colors"
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
