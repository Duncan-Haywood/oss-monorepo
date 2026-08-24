import Link from "next/link";
import type { ConvexApiSecretEnvReadiness } from "@/lib/convex/convex-api-secret-env-readiness";

type ConvexApiSecretEnvBannerProps = {
  readiness: ConvexApiSecretEnvReadiness;
};

/**
 * Warns when NEXT_PUBLIC_CONVEX_URL is configured but CONVEX_API_SECRET is
 * not. Every convex/*.ts public function is protected by requireApiSecret,
 * so a missing secret makes every Convex call fail closed and fall back to
 * instance-local SQLite (same degraded path as a Convex outage) with no
 * other dashboard signal. Hidden when Convex isn't configured at all
 * (ConvexUrlEnvBanner already owns that case) or when the secret is set.
 */
export function ConvexApiSecretEnvBanner({
  readiness,
}: ConvexApiSecretEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-950"
      role="status"
    >
      <p className="font-medium">
        Convex writes blocked — CONVEX_API_SECRET missing
      </p>
      <p className="mt-1 text-pink-900">
        NEXT_PUBLIC_CONVEX_URL is set, but the server-only{" "}
        <code className="text-xs">CONVEX_API_SECRET</code> is not. Every
        Convex function requires it, so every call is failing closed and
        silently falling back to instance-local SQLite — CRM writes, paid
        checkouts, deploy handoffs, and inquiries look normal but never
        reach the shared Convex database on a multi-instance deploy. Set
        CONVEX_API_SECRET on this app&apos;s host to the same value
        configured via <code className="text-xs">npx convex env set
        CONVEX_API_SECRET</code> on the Convex deployment itself.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-pink-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-pink-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/architecture"
          className="text-pink-900 underline underline-offset-2"
        >
          Architecture
        </Link>
      </p>
    </div>
  );
}
