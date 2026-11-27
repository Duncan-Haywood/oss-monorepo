// On the cash report: payments recorded on applications whose invoice is already in QuickBooks but
// not themselves sent there yet, usually an automatic send QuickBooks refused (docs/QUICKBOOKS.md,
// "Not yet in QuickBooks"). Editors send each one again, or mark it as entered by hand, through
// the pay application's own route, with every check the panel on that page runs. Hidden while
// the integration is dark or nothing is waiting.
import type { UnsentQuickBooksPaymentsDto } from "@shared/api/types";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { formatCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, orgPath } from "../lib/api";
import { ErrorText } from "./error";

export const unsentQuickBooksKey = (orgId: string) => ["quickbooks-unsent", orgId];

export function UnsentQuickBooksPayments(props: { orgId: string; role: MemberRole | null }) {
  const { orgId } = props;
  const qc = useQueryClient();
  const key = unsentQuickBooksKey(orgId);
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<UnsentQuickBooksPaymentsDto>(orgPath(orgId, "/quickbooks/unsent-payments")),
  });
  const send = useMutation({
    mutationFn: (v: { projectId: string; payAppId: string; paymentId: string; already: boolean }) =>
      api(
        orgPath(
          orgId,
          `/projects/${v.projectId}/pay-apps/${v.payAppId}/payments/${v.paymentId}/quickbooks${v.already ? "?already=1" : ""}`,
        ),
        { method: "POST" },
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["pay-app-quickbooks"] });
    },
  });
  const d = q.data;
  if (!d?.status.available || d.payments.length === 0) return null;
  const canEdit = props.role !== null && ROLE_RANK[props.role] >= ROLE_RANK.editor;
  const canSend = canEdit && d.status.planIncludes && d.status.connection !== null;
  const total = d.payments.reduce((s, p) => s + p.amountCents, 0);

  return (
    <section className="card" aria-labelledby="unsent-qbo">
      <h2 id="unsent-qbo" className="mb-1 font-semibold">
        Not yet in QuickBooks
      </h2>
      <p className="mb-2 text-sm text-slate-600">
        {d.payments.length === 1 ? "One payment" : `${d.payments.length} payments`} (
        {formatCents(total)}) recorded here on invoices already in QuickBooks, not sent there yet.
        Until they are, QuickBooks shows those invoices as more unpaid than they are.
      </p>
      {!d.status.connection ? (
        <p className="mb-2 text-sm text-slate-600">
          QuickBooks is not connected now. An admin can reconnect it on the{" "}
          <Link to="/orgs/$orgId/quickbooks" params={{ orgId }} className="underline">
            QuickBooks page
          </Link>
          .
        </p>
      ) : !d.status.planIncludes ? (
        <p className="mb-2 text-sm text-slate-600">
          Sending payments to QuickBooks is included in the Crew plan and up.
        </p>
      ) : null}
      <ErrorText error={q.error ?? send.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="td">Job</th>
              <th className="td">Invoice</th>
              <th className="td">Received</th>
              <th className="td text-right">Amount</th>
              <th className="td" />
            </tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.paymentId}>
                <td className="td">
                  <Link
                    to="/orgs/$orgId/projects/$projectId/pay-apps/$payAppId"
                    params={{ orgId, projectId: p.projectId, payAppId: p.payAppId }}
                    className="underline"
                  >
                    {p.projectName}
                    {p.projectNumber ? ` (${p.projectNumber})` : ""} #{p.payAppNumber}
                  </Link>
                </td>
                <td className="td">{p.docNumber}</td>
                <td className="td">
                  {p.receivedOn}
                  {p.reference ? ` · ${p.reference}` : ""}
                </td>
                <td className="td text-right tabular-nums">{formatCents(p.amountCents)}</td>
                <td className="td text-right">
                  {p.otherCompany ? (
                    <span className="text-slate-600">
                      Invoice is in another QuickBooks company: enter it there by hand
                    </span>
                  ) : canSend ? (
                    <span className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="btn"
                        disabled={send.isPending}
                        onClick={() => send.mutate({ ...p, already: false })}
                      >
                        Send to QuickBooks
                      </button>
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={send.isPending}
                        title="You already entered this payment in QuickBooks: record that, send nothing"
                        onClick={() => send.mutate({ ...p, already: true })}
                      >
                        Already in QuickBooks
                      </button>
                    </span>
                  ) : (
                    <span className="text-slate-600">Not sent</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Sending checks the invoice's open balance in QuickBooks first and sends nothing if it
        already shows a payment PayApps does not know about; the reason appears above. If the
        payment is there, mark it as already in QuickBooks.
      </p>
    </section>
  );
}
