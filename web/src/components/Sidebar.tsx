import Link from "next/link";
import { 
  BookOpen, 
  BarChart3, 
  Target, 
  TrendingUp, 
  Store, 
  Home
} from "lucide-react";

export function Sidebar() {
  const links = [
    { href: "/", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/business-plan", label: "Executive Summary", icon: <BookOpen className="w-4 h-4" /> },
    { href: "/business-plan/market-research", label: "Market Research", icon: <BarChart3 className="w-4 h-4" /> },
    { href: "/business-plan/gtm-strategy", label: "GTM Strategy", icon: <Target className="w-4 h-4" /> },
    { href: "/business-plan/profitability", label: "Profitability", icon: <TrendingUp className="w-4 h-4" /> },
    { href: "/demo", label: "Store Demo", icon: <Store className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 h-screen fixed top-0 left-0 overflow-y-auto">
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Print Atelier</h1>
        <p className="text-xs text-gray-500 mt-1">AI-First Art Commerce</p>
      </div>
      <nav className="px-4 pb-6">
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link 
                href={link.href}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {link.icon}
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
