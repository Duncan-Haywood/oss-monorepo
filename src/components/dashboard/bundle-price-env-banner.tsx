"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bootstrapStripePricesAction } from "@/app/dashboard/actions";
import type { BundlePriceEnvReadiness } from "@/lib/pricing/price-env-readiness";

type BundlePriceEnvBannerProps = {
  readiness: BundlePriceEnvReadiness;
  /** True when ALLOW_STRIPE_BOOTSTRAP=1 — enables the one-click Run bootstrap button. */
  bootstrapAllowed: boolean;
};

/**
 * Sale-blocking alert when required STRIPE_PRICE_ID_* env vars are missing.
 * Hidden when ready — not a pipeline-health metric card.
 * When bootstrapAllowed, offers an operator-auth'd Run bootstrap action that
 * returns a copyable envSnippet (paste + unset flag still required).
 */
export function BundlePriceEnvBanner({
  readiness,
  bootstrapAllowed,
}: BundlePriceEnvBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [envSnippet, setEnvSnippet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  if (readiness.ready && !envSnippet) {
    return null;
  }

  const preview = readiness.missing.slice(0, 3);
  const more = readiness.missing.length - preview.length;

  const handleBootstrap = () => {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await bootstrapStripePricesAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setEnvSnippet(res.envSnippet);
      setCreatedCount(res.results.filter((r) => r.created).length);
    });
  };

  const handleCopy = async () => {
    if (!envSnippet) return;
    try {
      await navigator.clipboard.writeText(envSnippet);
      setCopied(true);
    } catch {
      setError("Copy failed — select the snippet and copy manually.");
    }
  };

  return (
    <div
      className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
      role="status"
    >
      {!readiness.ready ? (
        <>
          <p className="font-medium">
            Checkout blocked — Stripe Price env vars missing
          </p>
          <p className="mt-1 text-rose-900">
            {readiness.missing.length} of {readiness.required.length} required{" "}
            <code className="text-xs">STRIPE_PRICE_ID_*</code> secrets are unset.
            Bundle and Commerce checkout will return 501 until they are pasted.
          </p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs text-rose-900">
            {preview.map((name) => (
              <li key={name}>{name}</li>
            ))}
            {more > 0 ? <li>+{more} more</li> : null}
          </ul>
        </>
      ) : (
        <p className="font-medium">
          Stripe Prices bootstrapped — paste envSnippet into secrets
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {bootstrapAllowed ? (
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={isPending}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-950 shadow-sm hover:bg-rose-100 disabled:opacity-50"
          >
            {isPending ? "Bootstrapping…" : "Run bootstrap"}
          </button>
        ) : (
          <p className="text-rose-900">
            To enable one-click bootstrap, set{" "}
            <code className="text-xs">ALLOW_STRIPE_BOOTSTRAP=1</code> on this
            deploy, then reload — or{" "}
            <code className="text-xs">POST /api/stripe/bootstrap-prices</code>.
          </p>
        )}
        <Link
          href="/docs/launch-checklist"
          className="text-rose-900 underline underline-offset-2"
        >
          Launch checklist
        </Link>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-800">{error}</p> : null}

      {envSnippet ? (
        <div className="mt-3 space-y-2">
          <p className="text-rose-900">
            {createdCount !== null
              ? `Bootstrap ok${createdCount > 0 ? ` (${createdCount} new Price${createdCount === 1 ? "" : "s"})` : " (reused existing)"} — `
              : "Bootstrap ok — "}
            paste into .env.local / hosting secrets, then{" "}
            <strong>unset</strong>{" "}
            <code className="text-xs">ALLOW_STRIPE_BOOTSTRAP</code>.
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-rose-200 bg-white p-3 font-mono text-xs text-zinc-800 whitespace-pre-wrap">
            {envSnippet}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-950 shadow-sm hover:bg-rose-100"
          >
            {copied ? "Copied" : "Copy envSnippet"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
