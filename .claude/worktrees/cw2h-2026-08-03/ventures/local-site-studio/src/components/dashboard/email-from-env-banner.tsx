import Link from "next/link";
import type { EmailFromEnvReadiness } from "@/lib/email/email-from-env-readiness";

type EmailFromEnvBannerProps = {
  readiness: EmailFromEnvReadiness;
};

/**
 * Outreach From-address alert when EMAIL_FROM is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Resend API-key / brand-name / company-address banners.
 */
export function EmailFromEnvBanner({ readiness }: EmailFromEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Outreach From blocked — EMAIL_FROM is still a placeholder"
          : "Outreach From blocked — EMAIL_FROM missing"}
      </p>
      <p className="mt-1 text-lime-900">
        Without a real <code className="text-xs">EMAIL_FROM</code>, Resend sends
        fall back via <code className="text-xs">brand.emailFrom</code> (or used
        to hardcode a platform domain) — Resend API key / brand can look ready
        while the From address is still wrong for your verified sending domain.
        Set a Resend-verified From address before the first outreach batch
        (then SPF / DKIM / DMARC on that domain).
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-lime-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-lime-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/compliance"
          className="text-lime-900 underline underline-offset-2"
        >
          Compliance
        </Link>
      </p>
    </div>
  );
}
