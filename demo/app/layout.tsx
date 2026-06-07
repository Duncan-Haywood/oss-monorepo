import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Print Atelier | AI-First Art Distribution",
  description: "A software-first, AI-driven two-sided art commerce platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto bg-white p-10 rounded-xl shadow-sm border border-gray-100">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
