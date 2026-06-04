import type { Metadata } from "next";
import "./globals.css";

const domain = process.env.NEXT_PUBLIC_DOCS_SITE_DOMAIN;

export const metadata: Metadata = {
  title: {
    default: "ShootFlow Docs",
    template: "%s · ShootFlow Docs",
  },
  description: "Private ShootFlow product and engineering documentation.",
  robots: { index: false, follow: false },
  ...(domain ? { metadataBase: new URL(`https://${domain}`) } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
