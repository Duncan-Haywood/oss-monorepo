import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Print Atelier | Business Plan",
  description: "Software-first, AI-first, digital-first art commerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-gray-50 dark:bg-gray-900">
      <body className={`${inter.className} h-full overflow-hidden flex`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-4xl">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
