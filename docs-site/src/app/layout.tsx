import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShootFlow Private Docs",
  description: "Internal product, architecture, and viability documentation.",
  robots: { index: false, follow: false },
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
