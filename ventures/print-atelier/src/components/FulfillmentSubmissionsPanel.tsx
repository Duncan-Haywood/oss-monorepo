"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Truck } from "lucide-react";
import type { FulfillmentSubmissionSummary } from "@/lib/fulfillment-submissions";

export default function FulfillmentSubmissionsPanel() {
  const [summary, setSummary] = useState<FulfillmentSubmissionSummary | null>(null);

  useEffect(() => {
    fetch("/api/fulfillment/submissions")
      .then((response) => response.json())
      .then((data: FulfillmentSubmissionSummary) => setSummary(data))
      .catch(() => setSummary(null));
  }, []);

  return (
    <section className="rounded-2xl border border-stone-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Truck className="h-6 w-6 text-amber-700" />
        <div>
          <h3 className="text-lg font-bold text-stone-900">Fulfillment submissions</h3>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Printful and Gelato order payloads from Stripe{" "}
            <code className="text-xs">payment_intent.succeeded</code> webhooks — tracks dry-run vs
            live API submit status by partner.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Total</p>
          <p className="text-2xl font-bold text-stone-900">{summary?.totalSubmissions ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Submitted</p>
          <p className="text-2xl font-bold text-emerald-700">{summary?.submittedCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Queued</p>
          <p className="text-2xl font-bold text-stone-900">{summary?.queuedCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Blocked</p>
          <p className="text-2xl font-bold text-rose-700">{summary?.blockedCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Printful / Gelato</p>
          <p className="text-2xl font-bold text-stone-900">
            {summary?.printfulCount ?? 0}/{summary?.gelatoCount ?? 0}
          </p>
        </div>
      </div>

      {summary && summary.blockers.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {summary.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      {summary && summary.recentSubmissions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <PackageCheck className="h-3 w-3" />
            Recent submissions
          </p>
          {summary.recentSubmissions.slice(0, 6).map((submission) => {
            const countryCode =
              submission.partner === "gelato"
                ? submission.payload.shippingAddress.country
                : submission.payload.recipient.countryCode;

            return (
              <div
                key={`${submission.partner}-${submission.orderId}-${submission.status}`}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-stone-700">{submission.orderId}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold uppercase text-stone-600">
                      {submission.partner}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-bold uppercase ${
                        submission.status === "submitted"
                          ? "bg-emerald-50 text-emerald-700"
                          : submission.status === "blocked"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {submission.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-stone-500">
                  {submission.mode} · {submission.payload.items.length} item(s) · {countryCode}
                  {submission.httpStatus ? ` · HTTP ${submission.httpStatus}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
