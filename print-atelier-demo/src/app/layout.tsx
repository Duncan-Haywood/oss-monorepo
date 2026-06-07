import Link from "next/link";
import { 
  BookOpen, 
  DollarSign, 
  Settings, 
  Mic, 
  Home,
  LayoutDashboard,
  Store
} from "lucide-react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-gray-900">
            <span className="bg-black text-white px-2 py-1 rounded">PA</span>
            Print Atelier
          </Link>
          <p className="text-xs text-gray-500 mt-2">Business Plan & Demo</p>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Business Plan
          </div>
          <ul className="space-y-1 px-2 mb-6">
            <li>
              <Link href="/docs" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <BookOpen className="w-4 h-4" />
                Strategy & GTM
              </Link>
            </li>
            <li>
              <Link href="/docs/revenue" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <DollarSign className="w-4 h-4" />
                Revenue & Profitability
              </Link>
            </li>
            <li>
              <Link href="/docs/operations" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <Settings className="w-4 h-4" />
                Operations Playbook
              </Link>
            </li>
            <li>
              <Link href="/docs/pitch" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <Mic className="w-4 h-4" />
                Artist Pitch
              </Link>
            </li>
          </ul>

          <div className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Platform Demo
          </div>
          <ul className="space-y-1 px-2">
            <li>
              <Link href="/" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <Home className="w-4 h-4" />
                Landing Page
              </Link>
            </li>
            <li>
              <Link href="/demo/dashboard" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <LayoutDashboard className="w-4 h-4" />
                Artist Dashboard
              </Link>
            </li>
            <li>
              <Link href="/demo/store" className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                <Store className="w-4 h-4" />
                Consumer Store
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
      
      <main className="flex-1 overflow-y-auto bg-white shadow-sm m-4 rounded-xl border border-gray-200">
        {children}
      </main>
    </div>
  );
}
