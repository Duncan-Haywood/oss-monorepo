import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Local Site Studio. All rights reserved.</p>
        <div className="flex gap-6">
          <Link href="/docs" className="hover:text-zinc-900">
            Docs
          </Link>
          <Link href="/dashboard/leads" className="hover:text-zinc-900">
            Lead pipeline
          </Link>
        </div>
      </div>
    </footer>
  );
}
