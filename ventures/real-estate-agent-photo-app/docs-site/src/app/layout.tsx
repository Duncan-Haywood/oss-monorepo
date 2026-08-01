import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Listing Lens Docs",
  description:
    "Internal documentation for Listing Lens. Cloudflare Access is applied and " +
    "verified by the deploy pipeline; see docs-site/scripts/verify-access-gate.sh.",
  robots: {
    index: false,
    follow: false,
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
