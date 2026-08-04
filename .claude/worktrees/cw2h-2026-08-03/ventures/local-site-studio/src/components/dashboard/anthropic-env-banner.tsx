import Link from "next/link";
import type { AnthropicEnvReadiness } from "@/lib/ai/anthropic-env-readiness";

type AnthropicEnvBannerProps = {
  readiness: AnthropicEnvReadiness;
};

/**
 * Sold-capability alert when ANTHROPIC_API_KEY is missing or a placeholder.
 * Hidden when ready — not a pipeline-health metric card.
 * Distinct from Stripe / Resend banners; show all when each gaps.
 */
export function AnthropicEnvBanner({ readiness }: AnthropicEnvBannerProps) {
  if (readiness.ready) {
    return null;
  }

  return (
    <div
      className="mb-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"
      role="status"
    >
      <p className="font-medium">
        {readiness.placeholderDetected
          ? "AI packs on stub — Anthropic API key is still a placeholder"
          : "AI packs on stub — Anthropic API key missing"}
      </p>
      <p className="mt-1 text-teal-900">
        Without a real <code className="text-xs">ANTHROPIC_API_KEY</code>, Growth/Complete{" "}
        <strong>Generate pack</strong> and Complete <strong>Generate voice</strong> silently use
        Stub* generators — operators still get a pack, but sold AI marketing / phone-script copy
        is template quality. Set a live Anthropic key before fulfilling paid Growth/Complete
        clients.
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-teal-900">
        {readiness.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          href="/docs/launch-checklist"
          className="text-teal-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
        {" · "}
        <Link
          href="/docs/marketing-automation"
          className="text-teal-900 underline underline-offset-2"
        >
          Marketing automation
        </Link>
      </p>
    </div>
  );
}
