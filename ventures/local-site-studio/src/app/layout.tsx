import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";
import { ENTRY_SETUP_PRICE_USD } from "@/lib/pricing/bundles";
import "./globals.css";

const geistSans = { variable: "" };
const geistMono = { variable: "" };

export const metadata: Metadata = {
  title: `${brand.name} — Pre-built websites for local businesses`,
  description: `${brand.name} builds professional websites before you buy. Preview your site, pay $${ENTRY_SETUP_PRICE_USD}, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-zinc-900">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
