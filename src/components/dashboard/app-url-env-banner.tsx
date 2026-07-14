import Link from "next/link";
import type { AppUrlEnvReadiness } from "@/lib/seo/app-url-env-readiness";

type AppUrlEnvBannerProps = {
  readiness: AppUrlEnvReadiness;
};

/**
 * Canonical-origin alert when NEXT_PUBLIC_APP_URL is missing, localhost, or a
 * placeholder. Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe / Resend / Anthropic / digest / auth banners.
 */
export function AppUrlEnvBanner({ readiness }: AppUrlEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  const title = readiness.localhostDetected
    ? "Canonical URL still localhost — NEXT_PUBLIC_APP_URL needs a public origin"
    : readiness.placeholderDetected
      ? "Canonical URL is still a placeholder — NEXT_PUBLIC_APP_URL"
      : "Canonical URL missing — NEXT_PUBLIC_APP_URL unset";

  return (
    <div
      className="mb-6 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950"
      role="status"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-orange-900">
        Without a real public <code className="text-xs">NEXT_PUBLIC_APP_URL</code>, checkout
        cancel/success URLs, digest dashboard links, unsubscribe/footer canonicals, pack preview
        links, and SEO <code className="text-xs">siteUrl()</code> fall back to request origin or{" "}
        <code className="text-xs">http://localhost:3000</code> — buyers and clients get wrong
        links once Stripe/Resend secrets are live. Set the production domain before first outreach
        or paid checkout.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-orange-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-orange-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/architecture"
          className="text-orange-900 underline underline-offset-2"
        >
          Architecture
        </Link>
      </p>
    </div>
  );
}
