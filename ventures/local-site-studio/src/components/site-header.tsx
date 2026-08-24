import Link from "next/link";
import { brand } from "@/lib/brand";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/accessibility-evidence", label: "Evidence" },
  { href: "/#faq", label: "FAQ" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-900">
          {brand.name}
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-zinc-900"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/checkout?source=nav"
            className="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
