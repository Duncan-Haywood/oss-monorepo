// Quote log: every quote with status, value and win rate.

import type { QuoteDto, QuoteExpiryEmailsDto, QuoteStatsDto } from "@shared/api";
import { QUOTE_STATUSES } from "@shared/enums";
import { quoteLabel } from "@shared/quote-label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FollowUpQueueCard } from "../components/follow-up";
import { Badge, Card, Select, STATUS_TONE } from "../components/ui";
import { api, money, orgApi, queryClient } from "../lib/api";
import { canAdmin, canEstimate, useOrg, useOrgId, useShopDay } from "./layout";

export function QuoteLogPage() {
  const orgId = useOrgId();
  const shopDayOf = useShopDay(orgId);
  const role = useOrg(orgId).data?.role;
  const [status, setStatus] = useState("");
  const quotes = useQuery({
    queryKey: ["quotes", orgId, status],
    queryFn: () =>
      api<{ items: QuoteDto[] }>(orgApi(orgId, `/quotes${status ? `?status=${status}` : ""}`)),
  });
  const stats = useQuery({
    queryKey: ["quote-stats", orgId],
    queryFn: () => api<QuoteStatsDto>(orgApi(orgId, "/quotes/stats")),
  });
  const s = stats.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open (sent)" value={String(s?.byStatus.sent ?? "—")} />
        <Stat
          label="Win rate"
          value={s?.winRate == null ? "—" : `${Math.round(s.winRate * 100)}%`}
          hint={s ? `${s.byStatus.won} won / ${s.decided} decided` : undefined}
        />
        <Stat label="Won" value={money(s?.wonCents)} />
        <Stat label="Quoted (sent)" value={money(s?.quotedCents)} hint="Smallest-quantity totals" />
      </div>
      <FollowUpQueueCard orgId={orgId} canEdit={canEstimate(role)} isAdmin={canAdmin(role)} />
      <Card
        title="Quote log"
        actions={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </Select>
        }
      >
        {quotes.data?.items.length === 0 ? (
          <p className="text-sm text-stone-600">
            No quotes yet.{" "}
            <Link to="/app/$orgId/rfqs" params={{ orgId }} className="text-sky-800 underline">
              Start from an RFQ
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1">Quote</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-right">Value</th>
                <th className="text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {quotes.data?.items.map((q) => (
                <tr key={q.id} className="border-t border-stone-100">
                  <td className="py-1.5">
                    <Link
                      to="/app/$orgId/quotes/$quoteId"
                      params={{ orgId, quoteId: q.id }}
                      className="font-medium text-sky-800 underline"
                    >
                      {quoteLabel(q.quoteNumber, q.revNumber)}
                    </Link>
                  </td>
                  <td>{q.customerCompany}</td>
                  <td>
                    <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                    {q.lostReason && (
                      <span className="ml-1 text-xs text-stone-500">{q.lostReason}</span>
                    )}
                  </td>
                  <td className="text-right">
                    {money(q.status === "won" ? q.wonAmountCents : q.headlineTotalCents)}
                  </td>
                  <td className="text-right text-stone-500">{shopDayOf(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ExpiryEmails orgId={orgId} />
      </Card>
    </div>
  );
}

/** The member's own "email me the day before my sent quotes expire" (services/quotes/expiry-reminders.ts). */
function ExpiryEmails({ orgId }: { orgId: string }) {
  const key = ["quote-expiry-emails", orgId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<QuoteExpiryEmailsDto>(orgApi(orgId, "/notifications/quote-expiry")),
  });
  const save = useMutation({
    mutationFn: (quoteExpiry: boolean) =>
      api<QuoteExpiryEmailsDto>(orgApi(orgId, "/notifications/quote-expiry"), {
        method: "PUT",
        body: { quoteExpiry },
      }),
    onSuccess: (dto) => queryClient.setQueryData(key, dto),
  });
  if (!q.data) return null;
  return (
    <label className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={q.data.quoteExpiry}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.checked)}
      />
      Email me the day before a quote I sent expires, so I can follow up or revise it
    </label>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  );
}
