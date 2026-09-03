import Link from "next/link";
import { brand, marketingFooterLine } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">{brand.name}</p>
            <p className="mt-1 text-xs text-zinc-500">
              A {brand.legalEntity} company · {brand.legalLocation}
            </p>
            {!brand.isConfigured && (
              <p className="mt-2 text-xs text-amber-700">
                Set NEXT_PUBLIC_BRAND_NAME in .env.local to replace the placeholder
                brand.
              </p>
            )}
            <p className="mt-4 text-xs text-zinc-500">{marketingFooterLine()}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            <Link href="/privacy" className="hover:text-zinc-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-900">
              Terms
            </Link>
            <Link href="/accessibility-evidence" className="hover:text-zinc-900">
              Evidence
            </Link>
            <Link href="/docs" className="hover:text-zinc-900">
              Docs
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
