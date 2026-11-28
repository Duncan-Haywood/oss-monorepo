// On the cash page's "Interest earned on late payments": send an application's interest to
// QuickBooks as its own invoice to the GC, or mark it as already entered there (docs/QUICKBOOKS.md,
// "Late-payment interest"). Sending marks the interest billed if it was not. Hidden while the
// integration is dark, QuickBooks is not connected or the plan leaves it out.
import type { QuickBooksInterestInvoicesDto } from "@shared/api/types";
import type { CashReportProject, PaidLateApp } from "@shared/cash-report";
import { formatCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, orgPath, projectPath } from "../lib/api";
import { ErrorText } from "./error";

export const interestInvoicesKey = (orgId: string) => ["quickbooks-interest", orgId];

export function useInterestInvoices(orgId: string) {
  return useQuery({
    queryKey: interestInvoicesKey(orgId),
    queryFn: () =>
      api<QuickBooksInterestInvoicesDto>(orgPath(orgId, "/quickbooks/interest-invoices")),
  });
}

export function InterestQuickBooks({
  orgId,
  job,
  app,
  data,
}: {
  orgId: string;
  job: CashReportProject;
  app: PaidLateApp;
  data: QuickBooksInterestInvoicesDto | undefined;
}) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: (already: boolean) =>
      api<QuickBooksInterestInvoicesDto>(
        projectPath(
          orgId,
          job.id,
          `/pay-apps/${encodeURIComponent(app.payAppId)}/quickbooks/interest-invoice${already ? "?already=1" : ""}`,
        ),
        { method: "POST" },
      ),
    onSuccess: (out) => {
      qc.setQueryData(interestInvoicesKey(orgId), out);
      void qc.invalidateQueries({ queryKey: ["cash", orgId] });
    },
  });
  if (!data?.status.available) return null;
  if (app.settled?.kind === "waived") return null;
  const sent = data.invoices.find((i) => i.payAppId === app.payAppId);
  if (sent) {
    return (
      <span className="text-xs text-slate-500">
        {sent.byHand
          ? "Marked as invoiced in QuickBooks"
          : `In QuickBooks as invoice ${sent.docNumber ?? ""}`}
        {sent.otherCompany ? " (another QuickBooks company)" : ""}
      </span>
    );
  }
  const { connection, planIncludes } = data.status;
  if (!connection || !planIncludes) return null;
  const cents = app.settled?.cents ?? app.interestCents;
  return (
    <span className="flex flex-wrap items-baseline gap-3 text-sm">
      <button
        type="button"
        className="underline"
        disabled={send.isPending}
        title={`One line, ${formatCents(cents)}, to ${job.gcName}, on the item "Late Payment Interest"`}
        onClick={() => send.mutate(false)}
      >
        {send.isPending ? "Sending…" : "Invoice in QuickBooks"}
      </button>
      <button
        type="button"
        className="text-xs underline"
        disabled={send.isPending}
        onClick={() => send.mutate(true)}
      >
        Already in QuickBooks
      </button>
      {send.error && <ErrorText error={send.error} />}
    </span>
  );
}
