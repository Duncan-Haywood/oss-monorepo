import type { Metadata } from "next";
import Link from "next/link";
import { brand, legalEntityLine, marketingFooterLine } from "@/lib/brand";
import { staticPageMetadata } from "@/lib/seo";

export const metadata: Metadata = staticPageMetadata({
  title: `Terms of Service — ${brand.name}`,
  description: `Terms governing purchases of ${brand.name} website packages from ${brand.legalEntity}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">{legalEntityLine()}</p>

      <div className="prose prose-zinc mt-8 max-w-none text-zinc-600">
        <p>
          <strong>Placeholder.</strong> Terms governing purchases of {brand.name}{" "}
          website packages from {brand.legalEntity} will be published here before launch.
        </p>
        <p>
          Terms will cover the $500 website package, preview evaluation, payment via
          Stripe, deliverables, intellectual property, refunds, and governing law
          (Colorado, USA).
        </p>
        <p>
          Draft outline:{" "}
          <Link href="/docs/legal" className="underline">
            Legal
          </Link>
          .
        </p>
        <p>
          Contact:{" "}
          <a href={`mailto:${brand.supportEmail}`} className="text-zinc-900 underline">
            {brand.supportEmail}
          </a>
        </p>
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
      <p className="mt-4 text-xs text-zinc-400">{marketingFooterLine()}</p>
    </main>
  );
}
