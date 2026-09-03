import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import UsageTracker from "@/components/shared/UsageTracker";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vendor Watch — vendor page change monitor",
  description:
    "Paste a vendor's public terms, privacy, or subprocessor page and get a timestamped, source-linked diff when it changes. Free evidence feed, not legal advice.",
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
