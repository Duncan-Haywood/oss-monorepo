// "Try the live demo" CTA for the marketing pages. In production it links to the live demo deployment
// (VITE_DEMO_URL), or to the static /demo sandbox when none is configured. On the demo host itself it
// starts a one-click session (POST /api/demo/start: throwaway visitor + fictional charity) and opens
// the seeded org. Renders as a plain link, so it prerenders and works without JavaScript.

import { HrefLink } from "@client/components/layout/href-link";
import { type ButtonSize, type ButtonVariant, buttonClass } from "@client/components/ui";
import { ApiError, api } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import { ArrowRight, Loader2 } from "lucide-react";
import * as React from "react";
import { demoConfig, resolveDemoTarget, safeRedirect } from "./demo-links";

const GENERIC_ERROR = "We couldn't start the demo just now. Please try again in a moment.";

export function TryLiveDemo({
  label = "Try the live demo",
  variant = "secondary",
  size = "lg",
  className,
}: {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();
  // Origin is unknown while prerendering; the href is the same either way, so hydration matches.
  const target = resolveDemoTarget({ ...demoConfig, origin: null });
  // Same-origin paths (the /demo sandbox) navigate client-side; the demo host is another origin.
  const Anchor = target.href.startsWith("/") ? HrefLink : "a";

  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const here = resolveDemoTarget({ ...demoConfig, origin: window.location.origin });
    if (!here.startsSession) return; // follow the link to the demo host / sandbox
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ orgId: string; redirect: string }>("/api/demo/start", {
        method: "POST",
      });
      // Full navigation so the app boots with the new session (no stale signed-out cache).
      window.location.assign(
        appPath(safeRedirect(res.redirect) ?? `/orgs/${encodeURIComponent(res.orgId)}`),
      );
    } catch (err) {
      // 429 / 503 carry friendly messages from the API; anything else gets a generic one.
      const friendly = err instanceof ApiError && (err.status === 429 || err.status === 503);
      setError(friendly ? err.message : GENERIC_ERROR);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <Anchor
        href={target.href}
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => void onClick(e)}
        aria-disabled={busy || undefined}
        aria-describedby={error ? errorId : undefined}
        className={buttonClass({ variant, size, className })}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {busy ? "Setting up your demo…" : label}
        {busy ? null : <ArrowRight aria-hidden />}
      </Anchor>
      {error ? (
        <span id={errorId} role="alert" className="max-w-sm text-sm text-danger-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
