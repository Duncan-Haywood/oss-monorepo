import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import {
  getLeads,
  listDeployHandoffs,
  listClientInquiries,
  listOrders,
  listOpenCheckoutSessions,
} from "@/lib/db";
import { computePipelineHealth, formatUsd } from "@/lib/metrics/pipeline-health";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const [leads, handoffs, inquiries, orders, openCheckoutSessions] = await Promise.all([
    getLeads(),
    listDeployHandoffs(),
    listClientInquiries(20),
    listOrders(),
    listOpenCheckoutSessions(),
  ]);
  const health = computePipelineHealth({
    leads,
    orders,
    handoffs,
    inquiries,
    openCheckoutSessions,
    nowMs: Date.now(),
  });

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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Revenue
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {formatUsd(health.revenueTotalUsd)}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.openHandoffCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Open handoffs
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.openHandoffCount}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.recoveryDueCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Recovery due
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.recoveryDueCount}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {health.abandonedCheckoutCount} abandoned cart
            {health.abandonedCheckoutCount === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            health.leadsMissingEmailCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-zinc-200"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Missing email
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
            {health.leadsMissingEmailCount}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Full funnel breakdown on{" "}
        <Link href="/dashboard/leads" className="underline underline-offset-2">
          Lead pipeline
        </Link>
        .
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
