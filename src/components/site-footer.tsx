import Link from "next/link";
import { company, legalFooterLine } from "@/lib/company";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">{company.legalName}</p>
            <p className="mt-1 text-sm text-zinc-600">{company.location}</p>
            <p className="mt-3 text-xs text-zinc-500">
              {company.productName} — a website service by {company.legalName}
            </p>
            <p className="mt-4 text-xs text-zinc-500">{legalFooterLine()}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            <Link href="/privacy" className="hover:text-zinc-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-900">
              Terms
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
