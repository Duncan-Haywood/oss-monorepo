import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { DashboardAuthChrome } from "./auth-chrome";

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

type DashboardPageProps = {
  searchParams: Promise<{ auth?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <DashboardAuthChrome authNotice={params.auth} />

      <PlaceholderBanner
        title="Internal ops dashboard"
        description="Operator console for lead management, outreach, and sales tracking. Protected when OPERATOR_DASHBOARD_PASSWORD is set."
        docsHref="/docs/launch-checklist"
      />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-zinc-600">
        Operator tools for Maris Stella Labs (Local Site Studio). Lead mutations and CSV import
        require a signed operator session when auth is configured.
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
