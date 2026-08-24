import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { DOCS_PAGES as docs } from "@/lib/docs/routes";
import { staticPageMetadata } from "@/lib/seo";

export const metadata: Metadata = staticPageMetadata({
  title: `Documentation — ${brand.name}`,
  description: `Product, architecture, marketing, compliance, and legal documentation for ${brand.name}.`,
  path: "/docs",
});

export default function DocsIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-3 text-zinc-600">
        {brand.name} · operated by {brand.legalEntity} ({brand.legalLocation}).
      </p>

      <div className="mt-10 space-y-4">
        {docs.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <h2 className="font-semibold text-zinc-900">{doc.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{doc.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 flex gap-6 text-sm">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </div>
    </main>
  );
}
