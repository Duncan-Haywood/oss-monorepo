// One pay application in QuickBooks Online: the invoice it would become, a send button (editors),
// and the invoice number once sent; then each payment received, sent as a QuickBooks payment
// against that invoice. Hidden while the integration is dark on this server.
import type {
  PayAppQuickBooksDto,
  QuickBooksPaymentDto,
  QuickBooksShortCreditDto,
} from "@shared/api/types";
import { formatCents } from "@shared/money";
import { SHORT_REASON_LABELS } from "@shared/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { ErrorText } from "./error";

export function QuickBooksPanel(props: { orgId: string; base: string }) {
  const { orgId, base } = props;
  const qc = useQueryClient();
  const key = ["pay-app-quickbooks", base];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<PayAppQuickBooksDto>(`${base}/quickbooks`),
  });
  const send = useMutation({
    mutationFn: () => api<PayAppQuickBooksDto>(`${base}/quickbooks`, { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const sendPayment = useMutation({
    mutationFn: (v: { paymentId: string; already: boolean }) =>
      api<PayAppQuickBooksDto>(
        `${base}/payments/${v.paymentId}/quickbooks${v.already ? "?already=1" : ""}`,
        { method: "POST" },
      ),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      void qc.invalidateQueries({ queryKey: ["quickbooks-unsent"] });
    },
  });
  const sendCredit = useMutation({
    mutationFn: (already: boolean) =>
      api<PayAppQuickBooksDto>(`${base}/quickbooks/short-credit${already ? "?already=1" : ""}`, {
        method: "POST",
      }),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const d = q.data;
  if (!d?.status.available) return null;
  const connectLink = (
    <Link to="/orgs/$orgId/quickbooks" params={{ orgId }} className="underline">
      QuickBooks page
    </Link>
  );

  return (
    <section className="card max-w-2xl">
      <h2 className="mb-1 font-semibold">QuickBooks Online</h2>
      <ErrorText error={q.error ?? send.error ?? sendPayment.error ?? sendCredit.error} />
      {d.sent ? (
        <>
          <p className="text-sm">
            Sent on {new Date(d.sent.sentAt).toLocaleDateString()} as invoice {d.sent.docNumber} for{" "}
            {formatCents(d.sent.totalCents)}.
          </p>
          {d.payments.length > 0 && (
            <PaymentsInQuickBooks
              payments={d.payments}
              canSend={d.status.planIncludes && d.status.connection !== null}
              pending={sendPayment.isPending}
              onSend={(paymentId, already) => sendPayment.mutate({ paymentId, already })}
            />
          )}
          {d.shortCredit && (
            <ShortCreditInQuickBooks
              credit={d.shortCredit}
              canSend={d.status.planIncludes && d.status.connection !== null}
              pending={sendCredit.isPending}
              onSend={(already) => sendCredit.mutate(already)}
            />
          )}
        </>
      ) : !d.status.planIncludes ? (
        <p className="text-sm text-slate-600">
          Sending pay applications to QuickBooks is included in the Crew plan and up.
        </p>
      ) : d.previewProblem ? (
        <p className="text-sm text-slate-600">{d.previewProblem}</p>
      ) : d.preview ? (
        <>
          <p className="mb-2 text-sm text-slate-600">
            Invoice {d.preview.docNumber} to {d.preview.customerName}, work billed with the item "
            {d.preview.workItemName}":
          </p>
          <table className="mb-2 w-full text-sm">
            <tbody>
              {d.preview.lines.map((l) => (
                <tr key={l.sovLineId ?? l.kind}>
                  <td className="td">
                    {l.description}
                    {l.itemName && l.itemName !== d.preview?.workItemName && (
                      <span className="block text-slate-600">item "{l.itemName}"</span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{formatCents(l.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td className="td font-semibold">Total (line 8)</td>
                <td className="td text-right font-semibold tabular-nums">
                  {formatCents(d.preview.totalCents)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mb-2 text-sm text-slate-600">
            {d.preview.billEmail
              ? `Billing email on the invoice: ${d.preview.billEmail} (the job's GC billing contact), so "Send" in QuickBooks emails it there.`
              : d.preview.billEmailNote}
          </p>
          {!d.status.connection ? (
            <p className="text-sm text-slate-600">Connect QuickBooks first on the {connectLink}.</p>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? "Sending…" : "Send to QuickBooks"}
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}

function PaymentsInQuickBooks(props: {
  payments: QuickBooksPaymentDto[];
  canSend: boolean;
  pending: boolean;
  onSend: (paymentId: string, already: boolean) => void;
}) {
  const unsent = props.payments.filter((p) => !p.sent).length;
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-sm font-semibold">Payments received</h3>
      <table className="w-full text-sm">
        <tbody>
          {props.payments.map((p) => (
            <tr key={p.paymentId}>
              <td className="td">
                {p.receivedOn}
                {p.reference ? ` · ${p.reference}` : ""}
              </td>
              <td className="td text-right tabular-nums">{formatCents(p.amountCents)}</td>
              <td className="td text-right">
                {p.sent ? (
                  <span className="text-slate-600">
                    {p.sent.byHand ? "Entered in QuickBooks by hand" : "In QuickBooks"}
                  </span>
                ) : props.canSend ? (
                  <span className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn"
                      disabled={props.pending}
                      onClick={() => props.onSend(p.paymentId, false)}
                    >
                      Send to QuickBooks
                    </button>
                    <button
                      type="button"
                      className="text-sm underline"
                      disabled={props.pending}
                      title="You already entered this payment in QuickBooks: record that, send nothing"
                      onClick={() => props.onSend(p.paymentId, true)}
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
      {unsent > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Each payment is applied to the invoice in QuickBooks on the date received, with the check
          number as its reference. PayApps checks the invoice's open balance first and sends nothing
          if QuickBooks already shows a payment it does not know about.
        </p>
      )}
    </div>
  );
}

function ShortCreditInQuickBooks(props: {
  credit: QuickBooksShortCreditDto;
  canSend: boolean;
  pending: boolean;
  onSend: (already: boolean) => void;
}) {
  const c = props.credit;
  const label = SHORT_REASON_LABELS[c.reason].toLowerCase();
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-sm font-semibold">Balance closed short</h3>
      <p className="text-sm">
        {formatCents(c.cents)} closed as {label} on {c.closedOn}.{" "}
        {c.sent ? (
          c.sent.byHand ? (
            <span className="text-slate-600">Marked as credited in QuickBooks by hand.</span>
          ) : c.sent.applied ? (
            <span className="text-slate-600">
              In QuickBooks as credit memo {c.sent.docNumber}, applied to the invoice.
            </span>
          ) : (
            <span className="text-amber-700">
              In QuickBooks as credit memo {c.sent.docNumber}, but QuickBooks applied it to another
              invoice of this GC on its own. In QuickBooks, open the GC's payments and move the
              credit to this invoice.
            </span>
          )
        ) : (
          <span className="text-slate-600">
            QuickBooks still shows it open on the invoice until it is credited there.
          </span>
        )}
      </p>
      {!c.sent &&
        (c.waitingFor ? (
          <p className="mt-1 text-sm text-slate-600">{c.waitingFor}</p>
        ) : props.canSend ? (
          <span className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={props.pending}
              onClick={() => props.onSend(false)}
            >
              Send as a credit memo
            </button>
            <button
              type="button"
              className="text-sm underline"
              disabled={props.pending}
              title="You already entered a credit memo or write-off for this balance in QuickBooks: record that, send nothing"
              onClick={() => props.onSend(true)}
            >
              Already in QuickBooks
            </button>
          </span>
        ) : null)}
      {!c.sent && !c.waitingFor && props.canSend && (
        <p className="mt-1 text-xs text-slate-500">
          The credit memo goes to the GC on the date the balance was closed, on the same item as the
          invoice's work lines, and is applied to this invoice. PayApps checks the invoice's open
          balance first and sends nothing if QuickBooks shows anything else open.
        </p>
      )}
    </div>
  );
}
