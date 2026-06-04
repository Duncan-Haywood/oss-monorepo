import Link from "next/link";
import type { ReactNode } from "react";
import { guideNav, reportNavFromManifest, type NavItem } from "@/lib/navigation";
import { listHtmlReports } from "@/lib/html-manifest";

function NavSection({
  heading,
  items,
}: {
  heading: string;
  items: NavItem[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {heading}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const reportNav = reportNavFromManifest(
    listHtmlReports().map((p) => ({ slug: p.slug, title: p.title })),
  );
  const guides = guideNav.filter((item) => item.section === "guides");
  const legal = guideNav.filter((item) => item.section === "legal");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            ShootFlow Docs
          </Link>
          <p className="hidden text-sm text-slate-400 sm:block">Private · password protected</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr] sm:px-6">
        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <NavSection heading="Guides" items={guides} />
          <NavSection heading="HTML reports" items={reportNav} />
          <NavSection heading="Legal" items={legal} />
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function DocsPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8 border-b border-slate-800 pb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-3xl text-slate-400">{description}</p>
      ) : null}
    </header>
  );
}
