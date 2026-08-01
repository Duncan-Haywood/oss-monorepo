import type { Metadata } from "next";
import "./globals.css";

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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
