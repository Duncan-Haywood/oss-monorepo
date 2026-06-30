import Link from "next/link";
import { company, legalFooterLine } from "@/lib/company";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">
        {company.legalName} · {company.location}
      </p>

      <div className="prose prose-zinc mt-8 max-w-none text-zinc-600">
        <p>
          <strong>Placeholder.</strong> A full Privacy Policy for {company.legalName}{" "}
          (operator of {company.productName}) will be published here before launch.
        </p>
        <p>
          The policy will describe what business contact data we collect from public
          sources, how we use email and AI voice agents for outreach, payment processing
          via Stripe, and your opt-out rights.
        </p>
        <p>
          Draft outline and compliance notes:{" "}
          <code className="text-sm">docs/LEGAL.md</code> and{" "}
          <code className="text-sm">docs/COMPLIANCE.md</code>.
        </p>
        <p>
          Questions:{" "}
          <a href={`mailto:${company.supportEmail}`} className="text-zinc-900 underline">
            {company.supportEmail}
          </a>
        </p>
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
      <p className="mt-4 text-xs text-zinc-400">{legalFooterLine()}</p>
    </main>
  );
}
