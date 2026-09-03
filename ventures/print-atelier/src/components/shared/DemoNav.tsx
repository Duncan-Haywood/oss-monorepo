import Link from "next/link";

const demos = [
  { href: "/docs", label: "Docs Hub" },
  { href: "/investor", label: "Investor" },
  { href: "/battlecards", label: "Battlecards" },
  { href: "/seo-lab", label: "SEO Lab" },
  { href: "/catalog-intelligence", label: "Catalog AI" },
  { href: "/payout-simulator", label: "Payout Sim" },
  { href: "/storefront", label: "Storefront" },
  { href: "/print-file-preflight", label: "Print Preflight" },
  { href: "/checkout", label: "Checkout" },
  { href: "/buyer-portal", label: "Buyer Portal" },
  { href: "/artist-portal", label: "Artist Portal" },
  { href: "/artist-onboard", label: "Artist Onboard" },
  { href: "/b2b-portal", label: "B2B Portal" },
  { href: "/designer-portal", label: "Designer Portal" },
  { href: "/capture", label: "Capture App" },
  { href: "/capture-demo", label: "Capture Demo" },
  { href: "/sales-portal", label: "Sales Hub" },
  { href: "/marketing-portal", label: "Marketing Hub" },
  { href: "/ad-catalog", label: "Ad Catalog" },
  { href: "/ad-sync-health", label: "Ad Sync" },
  { href: "/partner-setup", label: "Partners" },
  { href: "/ops", label: "Ops Console" },
  { href: "/admin-portal", label: "Admin Console" },
];

export default function DemoNav({ current }: { current?: string }) {
  return (
    <header className="bg-gray-900 text-white border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-serif text-lg tracking-wider hover:text-gray-300 transition-colors">
            PRINT ATELIER
          </Link>
          <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded-full font-medium">Demo</span>
        </div>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {demos.map((demo) => (
            <Link
              key={demo.href}
              href={demo.href}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                current === demo.href
                  ? "bg-white/10 text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {demo.label}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-2 px-3 py-1.5 rounded-md border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
          >
            Business Plan
          </Link>
        </nav>
      </div>
    </header>
  );
}
