import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Palette } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Print Atelier | Business Plan & Demo",
  description: "AI-first, software-driven fine art print distribution platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-stone-50 text-stone-900 antialiased min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
              <Palette className="w-5 h-5 text-indigo-600" />
              <span>Print Atelier</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-stone-600">
              <Link href="/" className="hover:text-stone-900 transition-colors">Home (Demo)</Link>
              <Link href="/artist-portal" className="hover:text-stone-900 transition-colors">Artist Portal</Link>
              <div className="h-4 w-px bg-stone-300"></div>
              <Link href="/business-plan" className="hover:text-stone-900 transition-colors">Business Plan</Link>
              <Link href="/strategy" className="hover:text-stone-900 transition-colors">Strategy</Link>
              <Link href="/ai-digital-strategy" className="hover:text-stone-900 transition-colors">AI & Digital</Link>
              <Link href="/market-research" className="hover:text-stone-900 transition-colors">Market</Link>
              <Link href="/operations" className="hover:text-stone-900 transition-colors">Operations</Link>
              <Link href="/gtm-strategy" className="hover:text-stone-900 transition-colors">GTM</Link>
              <Link href="/revenue" className="hover:text-stone-900 transition-colors">Revenue</Link>
              <Link href="/profitability-analysis" className="hover:text-stone-900 transition-colors">Profitability</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <footer className="bg-stone-900 text-stone-400 py-8 text-center text-sm mt-auto">
          <p>© {new Date().getFullYear()} Print Atelier. Software-first art distribution.</p>
        </footer>
      </body>
    </html>
  );
}
