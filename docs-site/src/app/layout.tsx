import type { Metadata } from "next";
import { docsSiteOrigin } from "@/lib/site";
import "./globals.css";

const siteOrigin = docsSiteOrigin();

export const metadata: Metadata = {
  metadataBase: siteOrigin ? new URL(siteOrigin) : undefined,
  title: "ShootFlow Private Docs",
  description: "Internal product, architecture, and viability documentation.",
  robots: { index: false, follow: false },
  alternates: siteOrigin ? { canonical: "/" } : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
