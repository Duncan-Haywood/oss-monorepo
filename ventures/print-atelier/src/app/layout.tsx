import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import UsageTracker from "@/components/shared/UsageTracker";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Print Atelier - Business Plan",
  description: "AI-First Digitization & Distribution for Artists",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <UsageTracker />
        {children}
      </body>
    </html>
  );
}
