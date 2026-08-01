"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio, Target } from "lucide-react";
import {
  getRetargetingEnvStatus,
  type RetargetingEventSummary,
} from "@/lib/retargeting-events";
import { getPartnerCredentialEnvFromProcess } from "@/lib/partner-credentials";
import { fetchOperatorJson, type OperatorFetchResult } from "@/lib/operator-client";
import OperatorAccessNotice from "./OperatorAccessNotice";

export default function CheckoutRetargetingPanel() {
  const env = useMemo(() => getPartnerCredentialEnvFromProcess(), []);
  const envStatus = useMemo(() => getRetargetingEnvStatus(env), [env]);
  const [result, setResult] = useState<OperatorFetchResult<RetargetingEventSummary> | null>(null);
  const summary = result?.state === "ok" ? result.data : null;

  useEffect(() => {
    fetchOperatorJson<RetargetingEventSummary>("/api/retargeting/events").then(setResult);
  }, []);

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Target className="h-6 w-6 text-violet-600" />
        <div>
          <h3 className="text-lg font-bold text-stone-900">Checkout abandon retargeting</h3>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            When <code className="text-xs">POST /api/stripe/checkout</code> creates a session,
            Meta, Google, and Pinterest server-side events fire live when credentials pass.
          </p>
        </div>
      </div>

      <OperatorAccessNotice result={result} />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Platforms ready</p>
          <p className="text-2xl font-bold">{envStatus.platformsReady}/3</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Sessions tracked</p>
          <p className="text-2xl font-bold">{summary?.uniqueSessions ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Pixel events</p>
          <p className="text-2xl font-bold">{summary?.totalEvents ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Meta CAPI live</p>
          <p className="text-2xl font-bold text-emerald-700">
            {summary?.liveFiredEvents ?? 0}
          </p>
        </div>
      </div>

      {envStatus.blockers.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {envStatus.blockers.map((blocker) => (
            <li key={blocker}>Missing: {blocker}</li>
          ))}
        </ul>
      )}

      {summary && summary.recentEvents.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <Radio className="h-3 w-3" />
            Recent session events
          </p>
          {summary.recentEvents.slice(0, 6).map((event) => (
            <div
              key={event.eventId}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-stone-700">{event.sessionId}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-bold uppercase ${
                    event.pixelReady
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {event.platform}
                </span>
              </div>
              <p className="mt-1 text-stone-500">
                {event.eventName} · ${(event.cartValueCents / 100).toFixed(2)} ·{" "}
                {event.lineItemSlugs.join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
