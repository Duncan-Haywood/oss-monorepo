import Link from "next/link";
import { brand, legalEntityLine, marketingFooterLine } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">{legalEntityLine()}</p>

      <div className="prose prose-zinc mt-8 max-w-none text-zinc-600">
        <p>
          <strong>Placeholder.</strong> A full Privacy Policy for {brand.legalEntity}{" "}
          (operator of {brand.name}) will be published here before launch.
        </p>
        <p>
          The policy will describe what business contact data we collect from public
          sources, how we use email and AI voice agents for outreach, payment processing
          via Stripe, and your opt-out rights.
        </p>
        <p>
          Draft outline and compliance notes:{" "}
          <Link href="/docs/legal" className="underline">
            Legal
          </Link>{" "}
          and{" "}
          <Link href="/docs/compliance" className="underline">
            Compliance
          </Link>
          .
        </p>
        <p>
          Questions:{" "}
          <a href={`mailto:${brand.supportEmail}`} className="text-zinc-900 underline">
            {brand.supportEmail}
          </a>
        </p>
      </div>

      <p className="mt-12 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
      <p className="mt-4 text-xs text-zinc-500">{marketingFooterLine()}</p>
    </main>
  );
}
