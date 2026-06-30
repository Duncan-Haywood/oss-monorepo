import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";

const sections = [
  {
    title: "Lead pipeline",
    description: "Track scraped leads, outreach status, and preview links sent.",
    href: "/dashboard/leads",
  },
  {
    title: "Preview sites",
    description: "Manage pre-built client sites hosted on preview subdomains.",
    href: "/preview/example-bakery",
  },
  {
    title: "Stripe checkout",
    description: "Payment flow for the $500 website package.",
    href: "/checkout",
  },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <PlaceholderBanner
        title="Internal ops dashboard (scaffold)"
        description="This area will become the operator console for lead management, site generation, and sales tracking."
        docsHref="/docs/ARCHITECTURE.md"
      />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-zinc-600">
        Operator tools for Local Site Studio. Not yet connected to a database or
        external services.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-zinc-200 p-6 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <h2 className="font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-zinc-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
