// QuickBooks Online (docs/QUICKBOOKS.md): the connection card on the rate card page (admins connect
// and disconnect) and, on a won quote, "Send to QuickBooks" as an invoice at the quoted breaks, or
// the same invoice as a QuickBooks import file when the shop has no connection.

import type {
  QuickBooksItemsDto,
  QuickBooksStatusDto,
  QuoteDetailDto,
  QuoteQuickBooksDto,
} from "@shared/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Select } from "../components/ui";
import { ApiError, api, money, orgApi, queryClient } from "../lib/api";

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

const DUE_DAY_CHOICES = [0, 7, 10, 15, 30, 45, 60, 90];

/** POSTs for the import file and saves it; a refusal comes back as the API's own message. */
async function downloadInvoiceCsv(
  orgId: string,
  quoteId: string,
  body: { choices: { lineId: string; quantity: number }[]; dueDays: number },
) {
  const res = await fetch(orgApi(orgId, `/quotes/${quoteId}/quickbooks.csv`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/csv, application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => undefined)) as
      | { error?: { code?: string; message?: string } }
      | undefined;
    throw new ApiError(
      res.status,
      data?.error?.code ?? "http_error",
      data?.error?.message ?? res.statusText,
    );
  }
  const name =
    /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
    "invoice-quickbooks.csv";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * On a won quote: the invoice it would make, the quantity per line, and the send to a connected
 * QuickBooks company, or the same invoice as a file for QuickBooks' own invoice import.
 */
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
  const [dueDays, setDueDays] = useState<number | null>(null);
  const send = useMutation({
    mutationFn: (choices: { lineId: string; quantity: number }[]) =>
      api<QuoteQuickBooksDto>(orgApi(orgId, `/quotes/${quote.id}/quickbooks`), {
        method: "POST",
        body: { choices },
      }),
    onSuccess: (d) => queryClient.setQueryData(quoteKey(orgId, quote.id), d),
  });
  const download = useMutation({
    mutationFn: (body: { choices: { lineId: string; quantity: number }[]; dueDays: number }) =>
      downloadInvoiceCsv(orgId, quote.id, body),
  });
  const d = info.data;
  if (!d) return null;
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
  const canPush = d.available && d.connected;

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
  const choices = rows.map((r) => ({ lineId: r.line.id, quantity: Number(r.v) }));
  const due = dueDays ?? d.defaultDueDays;
  const ready = missing.length === 0 && billed.length > 0;
  return (
    <Card title="QuickBooks">
      <p className="mb-2 text-sm text-stone-600">
        {canPush
          ? `Sends this quote to QuickBooks as invoice ${d.docNumber}`
          : `Makes this quote into invoice ${d.docNumber} for QuickBooks Online's invoice import`}
        : each part at the quantity it was quoted at and that quantity&apos;s price, with &ldquo;
        {d.memo}&rdquo; printed on it.
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
            <Select value={v} onChange={(e) => setPicked({ ...picked, [line.id]: e.target.value })}>
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
        {canPush &&
          (canSend ? (
            <Button disabled={send.isPending || !ready} onClick={() => send.mutate(choices)}>
              Send to QuickBooks
            </Button>
          ) : (
            <span className="text-stone-600">An estimator can send it.</span>
          ))}
        {missing.length > 0 ? (
          <span className="text-stone-600">
            Pick the quantity ordered for {missing.map((r) => r.line.partNumber).join(", ")}
          </span>
        ) : (
          billed.length > 0 && <span>Invoice total {money(total)}</span>
        )}
      </div>
      <ErrorText error={send.error} />
      <details className="mt-3 text-sm" open={!canPush}>
        <summary className="cursor-pointer">
          {canPush ? "Or download it for QuickBooks import" : "Download for QuickBooks import"}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <Field
            label="Due"
            hint="QuickBooks' import needs a due date. The default reads “Net N” from your quote terms."
          >
            <Select value={String(due)} onChange={(e) => setDueDays(Number(e.target.value))}>
              {[...new Set([...DUE_DAY_CHOICES, d.defaultDueDays])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={String(n)}>
                    {n === 0 ? "On the invoice date" : `${n} days after the invoice date`}
                  </option>
                ))}
            </Select>
          </Field>
          <div>
            <Button
              variant="secondary"
              disabled={download.isPending || !ready}
              onClick={() => download.mutate({ choices, dueDays: due })}
            >
              Download invoice CSV
            </Button>
          </div>
          <p className="text-stone-600">
            In QuickBooks Online: Settings, Import data, Invoices; upload the file, choose the
            MM/DD/YYYY date format, and match each column to the field of the same name. Turn on
            custom transaction numbers first to keep {d.docNumber}, and tick &ldquo;add new
            customers&rdquo; if this customer is new to your books. QuickBooks bills a part as
            &ldquo;Machined parts&rdquo; if that product exists, else its generic Sales item.
            QuickBooks does not take this import in a company that has set up sales tax. Nothing is
            recorded here: download it again any time.
          </p>
          <ErrorText error={download.error} />
        </div>
      </details>
    </Card>
  );
}
