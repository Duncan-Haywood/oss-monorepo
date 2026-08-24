import type { Metadata } from "next";
import Link from "next/link";

import { PhotoCheckTool } from "@/components/PhotoCheckTool";

export const metadata: Metadata = {
  title: "Free MLS Listing Photo Preflight Check | Listing Lens",
  description:
    "Check real estate listing photos against a dated floor spec — resolution, file size, format, aspect ratio, branding/watermark filenames, and staged-photo pairing — entirely in your browser. Free, no upload, no account.",
};

export default function PhotoCheckPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <Link href="/" className="text-sm font-medium text-brand-300 hover:text-brand-200">
          ← Listing Lens
        </Link>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          MLS Listing Photo Preflight Check
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
          Drop a folder of listing photos in and get a dated findings report — resolution,
          file size, format, aspect ratio, branding/watermark filenames, and staged-photo
          pairing. Free, unlimited, and your photos never leave this browser tab.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Export a dated JSON evidence report after each check to share with a photographer or keep with the delivery.
        </p>
        <PhotoCheckTool />
      </div>
    </main>
  );
}
