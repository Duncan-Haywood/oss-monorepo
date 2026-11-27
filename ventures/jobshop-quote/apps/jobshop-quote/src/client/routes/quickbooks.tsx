// QuickBooks Online (docs/QUICKBOOKS.md): the connection card on the rate card page (admins connect
// and disconnect) and, on a won quote, "Send to QuickBooks" as an invoice at the quoted breaks.

import type {
  QuickBooksItemsDto,
  QuickBooksStatusDto,
  QuoteDetailDto,
  QuoteQuickBooksDto,
} from "@shared/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Select } from "../components/ui";
import { api, money, orgApi, queryClient } from "../lib/api";

const statusKey = (orgId: string) => ["quickbooks", orgId];
const quoteKey = (orgId: string, quoteId: string) => ["quickbooks", orgId, "quote", quoteId];

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "QuickBooks was not connected: access was not granted on Intuit's page.",
  expired: "That connection attempt took longer than 10 minutes. Try again.",
  exchange_failed: "Intuit did not accept the connection. Try again.",
  not_admin: "Only owners and admins can connect QuickBooks.",
  unknown_state: "That connection link was already used or is not yours. Start again here.",
};

/** The rate card page's QuickBooks card. */
export function QuickBooksCard({ orgId, admin }: { orgId: string; admin: boolean }) {
  const status = useQuery({
    queryKey: statusKey(orgId),
    queryFn: () => api<QuickBooksStatusDto>(orgApi(orgId, "/quickbooks")),
  });
  const connect = useMutation({
    mutationFn: () =>
      api<{ url: string }>(orgApi(orgId, "/quickbooks/connect"), { method: "POST" }),
    onSuccess: (r) => {
      window.location.assign(r.url);
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api<QuickBooksStatusDto>(orgApi(orgId, "/quickbooks"), { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["quickbooks", orgId] }),
  });
  const params = new URLSearchParams(window.location.search);
  const justConnected = params.get("quickbooks_connected") === "1";
  const callbackError = params.get("quickbooks_error");
  const s = status.data;
  return (
    <Card title="QuickBooks Online" className="scroll-mt-4">
      <div id="quickbooks" />
      {status.error ? <ErrorText error={status.error} /> : null}
      {s && !s.available && (
        <p className="text-sm text-stone-600">
          Not available on this server yet. Once it is, a won quote goes to QuickBooks as an invoice
          in one click: your customer, each part at the quoted quantity and price, and the PO.
        </p>
      )}
      {s?.available && (
        <div className="flex flex-col gap-2 text-sm">
          {justConnected && s.connection && (
            <p className="text-green-800">QuickBooks is connected.</p>
          )}
          {callbackError && (
            <p className="text-red-700" role="alert">
              {CALLBACK_ERRORS[callbackError] ?? `QuickBooks was not connected (${callbackError}).`}
            </p>
          )}
          {s.connection ? (
            <>
              <p>
                <Badge tone="green">Connected</Badge> company {s.connection.realmId}
                {s.connection.environment !== "production" ? ` (${s.connection.environment})` : ""},
                since {s.connection.connectedAt.slice(0, 10)}.
              </p>
              <p className="text-stone-600">
                {s.connection.invoiceItem.custom ? (
                  <>
                    Won quotes go in as invoices under your item &ldquo;
                    {s.connection.invoiceItem.name}&rdquo;, posting to its income account.
                  </>
                ) : (
                  <>
                    Won quotes go in as invoices under the item &ldquo;Machined parts&rdquo;
                    (created on the first send if your company has none, posting to Sales of Product
                    Income).
                  </>
                )}{" "}
                Customers are matched by name; one your books already have is used as it is.
              </p>
              {admin && <InvoiceItemPicker orgId={orgId} />}
              {admin && (
                <div>
                  <Button
                    variant="secondary"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-stone-600">
                Connect your QuickBooks Online company to send a won quote as an invoice: your
                customer, each part at the quoted quantity and price, and the PO on the invoice.
              </p>
              {admin ? (
                <div>
                  <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
                    Connect QuickBooks
                  </Button>
                </div>
              ) : (
                <p className="text-stone-600">An owner or admin can connect it.</p>
              )}
            </>
          )}
          <ErrorText error={connect.error ?? disconnect.error} />
        </div>
      )}
    </Card>
  );
}

/**
 * Admins choose the QuickBooks item won quotes are billed with, and so the income account the
 * sales post to. The list is read live from the connected company only when opened.
 */
function InvoiceItemPicker({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const items = useQuery({
    queryKey: ["quickbooks", orgId, "items"],
    queryFn: () => api<QuickBooksItemsDto>(orgApi(orgId, "/quickbooks/items")),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (itemId: string | null) =>
      api<QuickBooksItemsDto>(orgApi(orgId, "/quickbooks/item"), {
        method: "PUT",
        body: { itemId },
      }),
    onSuccess: (d) => {
      queryClient.setQueryData(["quickbooks", orgId, "items"], d);
      void queryClient.invalidateQueries({ queryKey: statusKey(orgId), exact: true });
    },
  });
  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Choose the invoice item
        </Button>
      </div>
    );
  }
  const d = items.data;
  return (
    <div className="flex flex-col gap-2 rounded border border-stone-200 p-3">
      {items.error ? <ErrorText error={items.error} /> : null}
      {items.isPending && <p className="text-stone-600">Reading your items from QuickBooks…</p>}
      {d && (
        <Field
          label="Bill won quotes with"
          hint="A Service or Non-inventory item; its income account is where the sales land."
        >
          <Select
            value={d.current?.id ?? ""}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">
              {d.defaultItemName} (default, posts to {d.defaultAccountName})
            </option>
            {d.current && !d.items.some((i) => i.id === d.current?.id) && (
              <option value={d.current.id}>{d.current.name} (no longer active)</option>
            )}
            {d.items
              .filter((i) => i.name !== d.defaultItemName)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.incomeAccountName ? `, posts to ${i.incomeAccountName}` : ""}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {save.isSuccess && <p className="text-green-800">Saved. The next invoice uses it.</p>}
      <ErrorText error={save.error} />
    </div>
  );
}

/** On a won quote: the invoice it would make, the quantity per line, and the send. */
export function QuoteQuickBooksCard({
  orgId,
  quote,
  canSend,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  canSend: boolean;
}) {
  const info = useQuery({
    queryKey: quoteKey(orgId, quote.id),
    queryFn: () => api<QuoteQuickBooksDto>(orgApi(orgId, `/quotes/${quote.id}/quickbooks`)),
  });
  const [picked, setPicked] = useState<Record<string, string>>({});
  const send = useMutation({
    mutationFn: (choices: { lineId: string; quantity: number }[]) =>
      api<QuoteQuickBooksDto>(orgApi(orgId, `/quotes/${quote.id}/quickbooks`), {
        method: "POST",
        body: { choices },
      }),
    onSuccess: (d) => queryClient.setQueryData(quoteKey(orgId, quote.id), d),
  });
  const d = info.data;
  if (!d?.available) return null;
  if (d.invoice) {
    return (
      <Card title="QuickBooks">
        <p className="text-sm">
          <Badge tone="green">In QuickBooks</Badge> invoice {d.invoice.docNumber},{" "}
          {money(d.invoice.totalCents)}, sent {d.invoice.sentAt.slice(0, 10)}
          {d.invoice.sentByName ? ` by ${d.invoice.sentByName}` : ""}.
        </p>
        <ul className="mt-2 text-sm text-stone-700">
          {d.invoice.lines.map((l) => (
            <li key={l.lineId}>
              {l.description}: {l.quantity} × {money(l.unitPriceCents)} = {money(l.totalCents)}
            </li>
          ))}
        </ul>
      </Card>
    );
  }
  if (!d.connected) {
    return (
      <Card title="QuickBooks">
        <p className="text-sm text-stone-600">
          Connect QuickBooks Online on the rate card page to send this quote as an invoice.
        </p>
      </Card>
    );
  }

  const acceptedQty = (lineId: string) => d.accepted?.find((c) => c.lineId === lineId)?.quantity;
  /** The default per line: accepted online (0 = not ordered), else the only break, else none. */
  const defaultQty = (l: QuoteDetailDto["lines"][number]): string => {
    if (d.accepted) return String(acceptedQty(l.id) ?? 0);
    return l.breaks?.length === 1 ? String(l.breaks[0]?.quantity) : "";
  };
  const value = (l: QuoteDetailDto["lines"][number]) => picked[l.id] ?? defaultQty(l);
  const rows = quote.lines.map((l) => {
    const v = value(l);
    const b = l.breaks?.find((x) => String(x.quantity) === v);
    return { line: l, v, b };
  });
  const missing = rows.filter((r) => r.v === "");
  const billed = rows.filter((r) => r.b);
  const total = billed.reduce((s, r) => s + (r.b?.totalCents ?? 0), 0);
  return (
    <Card title="QuickBooks">
      <p className="mb-2 text-sm text-stone-600">
        Sends this quote to QuickBooks as invoice {d.docNumber}: each part at the quantity it was
        quoted at and that quantity&apos;s price, with &ldquo;{d.memo}&rdquo; printed on it.
        {d.accepted ? " The quantities your customer accepted online are filled in." : ""}
      </p>
      <div className="flex flex-col gap-2">
        {rows.map(({ line, v }) => (
          <Field
            key={line.id}
            label={`${line.partNumber}${line.revision ? ` Rev ${line.revision}` : ""}`}
            hint={
              acceptedQty(line.id) !== undefined
                ? `accepted online: ${acceptedQty(line.id)}`
                : undefined
            }
          >
            <Select
              value={v}
              disabled={!canSend}
              onChange={(e) => setPicked({ ...picked, [line.id]: e.target.value })}
            >
              <option value="">Pick the quantity ordered</option>
              <option value="0">Not ordered (leave off)</option>
              {(line.breaks ?? []).map((b) => (
                <option key={b.quantity} value={String(b.quantity)}>
                  {b.quantity} × {money(b.unitPriceCents)} = {money(b.totalCents)}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {canSend ? (
          <Button
            disabled={send.isPending || missing.length > 0 || billed.length === 0}
            onClick={() =>
              send.mutate(rows.map((r) => ({ lineId: r.line.id, quantity: Number(r.v) })))
            }
          >
            Send to QuickBooks
          </Button>
        ) : (
          <span className="text-stone-600">An estimator can send it.</span>
        )}
        {missing.length > 0 ? (
          <span className="text-stone-600">
            Pick the quantity ordered for {missing.map((r) => r.line.partNumber).join(", ")}
          </span>
        ) : (
          billed.length > 0 && <span>Invoice total {money(total)}</span>
        )}
      </div>
      <ErrorText error={send.error} />
    </Card>
  );
}
