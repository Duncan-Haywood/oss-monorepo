// Payments received against one pay application: GCs often pay in pieces or short. Each check or
// transfer is one row; the application turns paid when the payments reach the amount expected (the
// GC-certified amount, else line 8). Deleting a payment from a paid application reopens it. A balance
// the GC will not pay (a backcharge, a dispute, a write-off) can be closed, and reopened.
import type { PayAppDetailDto, QuickBooksAutoSendDto } from "@shared/api/types";
import { SHORT_CLOSE_REASONS, type ShortCloseReason } from "@shared/enums";
import { centsToDecimal, formatCents, parseDollarsToCents } from "@shared/money";
import { SHORT_REASON_LABELS } from "@shared/payments";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsPanel(props: {
  base: string;
  app: PayAppDetailDto;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const { base, app } = props;
  const qc = useQueryClient();
  // The QuickBooks panel lists these payments too.
  const onChanged = (d: PayAppDetailDto) => {
    props.onChanged(d);
    void qc.invalidateQueries({ queryKey: ["pay-app-quickbooks", base] });
    void qc.invalidateQueries({ queryKey: ["quickbooks-unsent"] });
  };
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState("");
  // What the automatic QuickBooks send did with the payment just recorded, if it was tried.
  const [autoSent, setAutoSent] = useState<QuickBooksAutoSendDto | null>(null);
  const add = useMutation({
    mutationFn: () => {
      const cents = amount.trim() ? parseDollarsToCents(amount) : app.remainingCents;
      if (cents === null || cents <= 0) throw new Error("Enter the amount received");
      return api<PayAppDetailDto & { quickbooksAuto?: QuickBooksAutoSendDto | null }>(
        `${base}/payments`,
        {
          method: "POST",
          body: { amountCents: cents, receivedOn, reference: reference.trim() || null },
        },
      );
    },
    onMutate: () => setAutoSent(null),
    onSuccess: (d) => {
      setAmount("");
      setReference("");
      setAutoSent(d.quickbooksAuto ?? null);
      onChanged(d);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api<PayAppDetailDto>(`${base}/payments/${id}`, { method: "DELETE" });
      } catch (e) {
        // A payment (or a credit for the balance closed short) already in QuickBooks stays there:
        // ask before deleting it only here.
        if (
          !(e instanceof ApiError) ||
          (e.code !== "payment_in_quickbooks" && e.code !== "credit_in_quickbooks")
        )
          throw e;
        if (!window.confirm(`${e.message}\n\nDelete it here now?`)) return null;
        return api<PayAppDetailDto>(`${base}/payments/${id}?confirmQuickBooks=1`, {
          method: "DELETE",
        });
      }
    },
    onSuccess: (d) => {
      if (d) onChanged(d);
    },
  });
  if (app.status === "draft") return null;
  const open = app.status === "submitted" || app.status === "certified";
  const sc = app.shortClose;

  return (
    <section className="card max-w-2xl">
      <h2 className="mb-1 font-semibold">Payments received</h2>
      <p className="mb-2 text-sm text-slate-600">
        Expected {formatCents(app.expectedCents)}
        {app.certifiedAmountCents !== null ? " (certified)" : " (line 8)"} · received{" "}
        {formatCents(app.paidCents)} · still owed{" "}
        <span className={app.remainingCents > 0 ? "font-semibold" : ""}>
          {formatCents(app.remainingCents)}
        </span>
      </p>
      {app.payments.length > 0 && (
        <table className="mb-3 w-full">
          <thead>
            <tr>
              <th className="th">Received</th>
              <th className="th">Reference</th>
              <th className="th text-right">Amount</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {app.payments.map((p) => (
              <tr key={p.id}>
                <td className="td">{p.receivedOn}</td>
                <td className="td">{p.reference ?? ""}</td>
                <td className="td text-right tabular-nums">{formatCents(p.amountCents)}</td>
                <td className="td text-right">
                  <button
                    type="button"
                    className="text-sm text-red-700 underline"
                    disabled={remove.isPending}
                    onClick={() => {
                      const msg =
                        app.status === "paid"
                          ? "Delete this payment? The application will be reopened as unpaid."
                          : "Delete this payment?";
                      if (window.confirm(msg)) remove.mutate(p.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {app.unrecordedCents > 0 && <UnrecordedPayment base={base} app={app} onChanged={onChanged} />}
      {sc && <ClosedShort base={base} app={app} onChanged={onChanged} />}
      {open && (
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Amount ($)</span>
            <input
              className="input text-right"
              inputMode="decimal"
              placeholder={centsToDecimal(app.remainingCents)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Received on</span>
            <input
              type="date"
              className="input"
              max={today()}
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Check # or reference</span>
            <input
              className="input"
              maxLength={120}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn" disabled={add.isPending}>
              Record payment
            </button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-4">
            Leave the amount blank to record the full balance. Paid short? Record what came in; the
            cash report keeps the balance owed and ages it.
          </p>
        </form>
      )}
      {open && app.remainingCents > 0 && (
        <CloseShortForm base={base} app={app} onChanged={onChanged} />
      )}
      {autoSent?.sent && (
        <p role="status" className="mt-2 text-sm text-green-700">
          Sent to QuickBooks as a payment on this application's invoice.
        </p>
      )}
      {autoSent && !autoSent.sent && (
        <p role="alert" className="mt-2 text-sm text-amber-700">
          Recorded here, but not sent to QuickBooks: {autoSent.message}
        </p>
      )}
      <ErrorText error={add.error ?? remove.error} />
    </section>
  );
}

/**
 * An application marked paid in full with no date or check behind (part of) the money: offer to
 * record it as one payment, so it can go to QuickBooks and the history says when it came in.
 */
function UnrecordedPayment(props: {
  base: string;
  app: PayAppDetailDto;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState("");
  const record = useMutation({
    mutationFn: () =>
      api<PayAppDetailDto>(`${props.base}/payments/unrecorded`, {
        method: "POST",
        body: { receivedOn, reference: reference.trim() || null },
      }),
    onSuccess: props.onChanged,
  });
  const amount = formatCents(props.app.unrecordedCents);
  return (
    <form
      className="mb-2 grid gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm sm:grid-cols-4"
      aria-label="Record the payment behind marked paid"
      onSubmit={(e) => {
        e.preventDefault();
        record.mutate();
      }}
    >
      <p className="sm:col-span-4">
        Marked paid in full, but {amount} has no payment recorded. Record when it came in and the
        check number, so it can be sent to QuickBooks and the history shows the payment.
      </p>
      <label>
        <span className="text-slate-600">Received on</span>
        <input
          type="date"
          className="input"
          max={today()}
          value={receivedOn}
          onChange={(e) => setReceivedOn(e.target.value)}
          required
        />
      </label>
      <label>
        <span className="text-slate-600">Check # or reference</span>
        <input
          className="input"
          maxLength={120}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" className="btn" disabled={record.isPending}>
          Record {amount} as a payment
        </button>
      </div>
      <ErrorText error={record.error} />
    </form>
  );
}

const REASON_HELP: Record<ShortCloseReason, string> = {
  backcharge: "the GC deducted it for its own costs (cleanup, damage, work it did for you)",
  disputed: "you still claim it, but outside this application (a claim, a negotiation)",
  "written-off": "you will not collect it",
};

function ClosedShort(props: {
  base: string;
  app: PayAppDetailDto;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const sc = props.app.shortClose;
  const reopen = useMutation({
    mutationFn: async () => {
      try {
        return await api<PayAppDetailDto>(`${props.base}/close-short`, { method: "DELETE" });
      } catch (e) {
        // The balance is a credit memo in QuickBooks: it stays there, so ask before reopening.
        if (!(e instanceof ApiError) || e.code !== "credit_in_quickbooks") throw e;
        if (!window.confirm(`${e.message}\n\nReopen it here now?`)) return null;
        return api<PayAppDetailDto>(`${props.base}/close-short?confirmQuickBooks=1`, {
          method: "DELETE",
        });
      }
    },
    onSuccess: (d) => {
      if (d) props.onChanged(d);
    },
  });
  if (!sc) return null;
  return (
    <div className="mb-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm">
      <p>
        Balance closed on {sc.closedOn}: <strong>{formatCents(sc.cents)}</strong>{" "}
        {SHORT_REASON_LABELS[sc.reason].toLowerCase()}
        {sc.note ? ` (${sc.note})` : ""}. The cash report counts it as neither paid nor owed, and
        the unconditional waiver for this application covers only the{" "}
        {formatCents(props.app.paidCents)} received.
      </p>
      <button
        type="button"
        className="mt-1 text-sm underline"
        disabled={reopen.isPending}
        onClick={() => {
          if (window.confirm("Reopen the balance? It will be counted as owed again."))
            reopen.mutate();
        }}
      >
        Reopen the balance
      </button>
      <ErrorText error={reopen.error} />
    </div>
  );
}

function CloseShortForm(props: {
  base: string;
  app: PayAppDetailDto;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const { app } = props;
  const [showing, setShowing] = useState(false);
  const [reason, setReason] = useState<ShortCloseReason>("backcharge");
  const [closedOn, setClosedOn] = useState(today);
  const [note, setNote] = useState("");
  const close = useMutation({
    mutationFn: () =>
      api<PayAppDetailDto>(`${props.base}/close-short`, {
        method: "POST",
        body: { reason, closedOn, note: note.trim() || null },
      }),
    onSuccess: (d) => {
      setShowing(false);
      setNote("");
      props.onChanged(d);
    },
  });
  if (!showing) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        The rest will not be paid?{" "}
        <button type="button" className="underline" onClick={() => setShowing(true)}>
          Close the {formatCents(app.remainingCents)} balance
        </button>{" "}
        as a backcharge, disputed or written off.
      </p>
    );
  }
  return (
    <form
      className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3"
      aria-label="Close the balance"
      onSubmit={(e) => {
        e.preventDefault();
        close.mutate();
      }}
    >
      <p className="text-sm font-medium sm:col-span-3">
        Close the {formatCents(app.remainingCents)} balance
      </p>
      <label className="text-sm">
        <span className="text-slate-600">Reason</span>
        <select
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value as ShortCloseReason)}
        >
          {SHORT_CLOSE_REASONS.map((r) => (
            <option key={r} value={r}>
              {SHORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-slate-600">Date</span>
        <input
          type="date"
          className="input"
          min={app.applicationDate}
          max={today()}
          value={closedOn}
          onChange={(e) => setClosedOn(e.target.value)}
        />
      </label>
      <label className="text-sm">
        <span className="text-slate-600">Note (optional)</span>
        <input
          className="input"
          maxLength={500}
          placeholder="e.g. cleanup backcharge, GC letter 3/4"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-xs text-slate-500 sm:col-span-3">
        {SHORT_REASON_LABELS[reason]}: {REASON_HELP[reason]}. The application is marked paid, the
        balance leaves what is owed, and the cash report lists it under its reason. You can reopen
        it. If this application is in QuickBooks, record the same amount there too (a credit memo
        against the invoice); PayApps does not send it.
      </p>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className="btn" disabled={close.isPending}>
          Close the balance
        </button>
        <button type="button" className="underline text-sm" onClick={() => setShowing(false)}>
          Cancel
        </button>
      </div>
      <ErrorText error={close.error} />
    </form>
  );
}
