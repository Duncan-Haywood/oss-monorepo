import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Print Atelier",
  description: "A software-first, AI-driven two-sided art commerce platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center space-x-8">
                <a href="/" className="text-xl font-bold text-gray-900">Print Atelier</a>
                <nav className="hidden md:flex space-x-4">
                  <a href="/docs/business-plan" className="text-gray-600 hover:text-gray-900">Business Plan</a>
                  <a href="/docs/strategy" className="text-gray-600 hover:text-gray-900">Strategy</a>
                  <a href="/docs/gtm" className="text-gray-600 hover:text-gray-900">GTM</a>
                  <a href="/demo" className="text-gray-600 hover:text-gray-900">Demo</a>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
