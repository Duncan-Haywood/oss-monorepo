import Link from "next/link";
import type { ConvexUrlEnvReadiness } from "@/lib/convex/convex-url-env-readiness";

type ConvexUrlEnvBannerProps = {
  readiness: ConvexUrlEnvReadiness;
};

/**
 * Multi-instance persistence alert when NEXT_PUBLIC_CONVEX_URL is missing or a
 * placeholder. Hidden when ready — not a pipeline-health metric card.
 * Distinct pink banner (other readiness colors already reserved).
 */
export function ConvexUrlEnvBanner({ readiness }: ConvexUrlEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "Multi-instance persistence blocked — NEXT_PUBLIC_CONVEX_URL is still a placeholder"
          : "Multi-instance persistence blocked — NEXT_PUBLIC_CONVEX_URL missing"}
      </p>
      <p className="mt-1 text-pink-900">
        Without a real <code className="text-xs">NEXT_PUBLIC_CONVEX_URL</code>, serverless /
        multi-instance deploys stay on instance-local SQLite — paid checkouts, CRM writes, deploy
        handoffs, and inquiries can succeed on one box and stay invisible everywhere else. Paste
        the Convex deployment URL before first paid order on Vercel (or any multi-instance host).
        Local single-process SQLite remains fine for solo demos.
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
