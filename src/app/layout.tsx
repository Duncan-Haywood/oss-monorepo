import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Print Atelier Docs",
  description: "Business plan, strategy, and operations documentation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 font-sans min-h-screen flex`}
      >
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-xl font-bold tracking-tight">Print Atelier</h1>
          </div>
          <nav className="p-4 flex-1 space-y-1 overflow-y-auto">
            <Link href="/" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Overview
            </Link>
            <Link href="/business-plan" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Business Plan
            </Link>
            <Link href="/strategy" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Strategy
            </Link>
            <Link href="/revenue-model" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Revenue Model
            </Link>
            <Link href="/operations" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Operations
            </Link>
            <Link href="/artist-pitch" className="block px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100">
              Artist Pitch
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 md:p-12 overflow-x-hidden">
          <div className="max-w-4xl mx-auto bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl p-8 md:p-12">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
