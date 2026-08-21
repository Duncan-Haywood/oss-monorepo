import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { ReportWidget } from "@/components/ReportWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quick pick",
  description: "Two options at a time. Find out what you actually want.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Quick pick" },
  // The app shows one person's private preference data; there's no reason
  // for any of it to be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // No `maximumScale` / `userScalable` here on purpose. Pinning the page at
  // 1x fails WCAG 2.2 AA 1.4.4 (Resize Text) on every screen in the app, and
  // it was only ever asked for by the card deck — a fixed-height surface that
  // feels broken if a double-tap zooms it. That surface already carries
  // `touch-pan-x` (see `CardViews.tsx`), and any `touch-action` other than
  // `auto`/`manipulation` suppresses double-tap zoom on that element by
  // itself. So the deck keeps the behaviour it wanted and someone with low
  // vision can still zoom the settings, insights and profile screens.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <ReportWidget />
        <BottomNav />
      </body>
    </html>
  );
}
