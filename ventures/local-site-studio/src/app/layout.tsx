import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";
<<<<<<< HEAD
import { ENTRY_SETUP_PRICE_USD } from "@/lib/pricing/bundles";
=======
import { BUNDLES, formatPriceUsd } from "@/lib/pricing/bundles";
>>>>>>> origin/agent/customer-claim-control-2026-08-03
import "./globals.css";

const geistSans = { variable: "" };
const geistMono = { variable: "" };

const entryPrice = formatPriceUsd(
  Math.min(...BUNDLES.map((bundle) => bundle.setupPriceUsd)),
);

export const metadata: Metadata = {
  title: `${brand.name} — Pre-built websites for local businesses`,
<<<<<<< HEAD
  description: `${brand.name} builds professional websites before you buy. Preview your site, pay $${ENTRY_SETUP_PRICE_USD}, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`,
=======
  description: `${brand.name} builds professional websites before you buy. Preview your site, pay ${entryPrice}, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`,
>>>>>>> origin/agent/customer-claim-control-2026-08-03
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
