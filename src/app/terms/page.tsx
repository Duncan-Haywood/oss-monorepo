import Link from "next/link";
import { company, legalFooterLine } from "@/lib/company";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">
        {company.legalName} · {company.location}
      </p>

      <div className="prose prose-zinc mt-8 max-w-none text-zinc-600">
        <p>
          <strong>Placeholder.</strong> Terms governing purchases of {company.productName}{" "}
          website packages from {company.legalName} will be published here before launch.
        </p>
        <p>
          Terms will cover the $500 website package, preview evaluation, payment via
          Stripe, deliverables, intellectual property, refunds, and governing law
          (Colorado, USA).
        </p>
        <p>
          Draft outline: <code className="text-sm">docs/LEGAL.md</code>.
        </p>
        <p>
          Contact:{" "}
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
