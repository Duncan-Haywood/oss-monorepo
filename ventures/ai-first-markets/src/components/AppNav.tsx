import Link from "next/link";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/market-map", label: "Market Map" },
  { href: "/reports", label: "Reports" },
  { href: "/ideas", label: "Ideas" },
];

export function AppNav() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-300">
            AI
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-50">AI-First Markets</p>
            <p className="text-xs text-zinc-300">Markets · Ideas · Execution</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
