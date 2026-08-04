import Link from "next/link";
import type { ResendEmailEnvReadiness } from "@/lib/email/resend-env-readiness";

type ResendEnvBannerProps = {
  readiness: ResendEmailEnvReadiness;
};

/**
 * Outreach alert when RESEND_API_KEY is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe core / Price-ID banners; show all when each gaps.
 */
export function ResendEnvBanner({ readiness }: ResendEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Outreach blocked — Resend API key is still a placeholder"
          : "Outreach blocked — Resend API key missing"}
      </p>
      <p className="mt-1 text-sky-900">
        Without a real <code className="text-xs">RESEND_API_KEY</code>, every automated send
        (Email 1–3, receipts, abandoned-cart recovery, marketing/voice pack delivery, Starter
        upsell, daily digest) silently mock-logs success — no customer inbox is reached. Set a
        live Resend key before the first outreach batch.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-sky-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-sky-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
      </p>
    </div>
  );
}
