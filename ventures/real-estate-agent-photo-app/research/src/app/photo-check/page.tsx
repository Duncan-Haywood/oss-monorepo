import type { Metadata } from "next";
import Link from "next/link";

import { PhotoCheckTool } from "@/components/PhotoCheckTool";

export const metadata: Metadata = {
  title: "Free MLS Listing Photo Preflight Check | Listing Lens",
  description:
    "Check real estate listing photos against a dated floor spec and get a copyable reshoot list — which rooms to recapture, which files to rename or recrop, and which staged shots still need an original. Free, no upload, no account.",
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
          Drop a folder of listing photos in and get a dated findings report plus a
          copyable reshoot list — which rooms to recapture, which files to rename or
          recrop, and which staged shots still need an original. Free, unlimited, and
          your photos never leave this browser tab.
        </p>
        <PhotoCheckTool />
      </div>
    </main>
  );
}
