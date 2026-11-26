// "What changed from Q-1001": a revision's quote page compares it with the revision it replaces
// (GET /quotes/:id/changes, shared/quote-diff.ts). Side by side per line: unit price at every
// quantity break, then operations, material, finishing and extras that differ. Read-only; prices
// are the ones each revision stored. A picker compares with any earlier revision (`?from=`), and
// against the one it replaces the card previews the customer-safe lines the PDF can print.
import type { QuoteChangesDto, QuoteDetailDto, QuoteRevisionsDto } from "@shared/api";
import { customerChangeSummary } from "@shared/quote-change-summary";
import type { ExtraChange, FieldChange, LineChange, OperationChange } from "@shared/quote-diff";
import { quoteLabel } from "@shared/quote-label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, money, orgApi } from "../lib/api";
import { Badge, Card, ErrorText, Select } from "./ui";

export const revisionChangesKey = (orgId: string, quoteId: string) => [
  "quote-changes",
  orgId,
  quoteId,
];

const KIND_TONE = { added: "green", removed: "red", changed: "amber", unchanged: "stone" } as const;

function delta(from: number | null, to: number | null) {
  if (from == null || to == null || from === to) return null;
  const d = to - from;
  const pct = from > 0 ? ` (${d > 0 ? "+" : ""}${((d / from) * 100).toFixed(1)}%)` : "";
  return (
    <span className={d < 0 ? "text-green-800" : "text-red-800"}>
      {d > 0 ? "+" : "−"}
      {money(Math.abs(d))}
      {pct}
    </span>
  );
}

const minutes = (m: { setupMinutes: number; cycleMinutesPerPart: number } | null) =>
  m ? `setup ${m.setupMinutes} min, cycle ${m.cycleMinutesPerPart} min/part` : "—";

const extraMoney = (e: ExtraChange["from"]) =>
  e
    ? [
        e.perPartCents ? `${money(e.perPartCents)}/part` : null,
        e.lotCents ? `${money(e.lotCents)}/lot` : null,
      ]
        .filter(Boolean)
        .join(" + ") || money(0)
    : "—";

function Fields({ items }: { items: FieldChange[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((f) => (
        <li key={f.field}>
          <span className="text-stone-500">{f.label}:</span>{" "}
          <span className="text-stone-500 line-through">{f.from ?? "not set"}</span> →{" "}
          <span className="font-medium">{f.to ?? "not set"}</span>
        </li>
      ))}
    </ul>
  );
}

function Operation({ o }: { o: OperationChange }) {
  return (
    <li>
      <Badge tone={KIND_TONE[o.kind]}>{o.kind}</Badge> {o.machine}
      {o.label ? ` · ${o.label}` : ""}:{" "}
      {o.kind === "changed" ? (
        <>
          <span className="text-stone-500">{minutes(o.from)}</span> → {minutes(o.to)}
        </>
      ) : (
        minutes(o.to ?? o.from)
      )}
    </li>
  );
}

function Line({ l, fromName, toName }: { l: LineChange; fromName: string; toName: string }) {
  return (
    <div className="rounded border border-stone-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-stone-900">{l.partNumber}</span>
        {l.revision && <span className="text-sm text-stone-500">Rev {l.revision}</span>}
        <Badge tone={KIND_TONE[l.kind]}>
          {l.kind === "added"
            ? `new in ${toName}`
            : l.kind === "removed"
              ? `not in ${toName}`
              : l.kind}
        </Badge>
      </div>
      {l.prices.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1 pr-3 font-normal">Qty</th>
                <th className="py-1 pr-3 font-normal">{fromName} unit</th>
                <th className="py-1 pr-3 font-normal">{toName} unit</th>
                <th className="py-1 pr-3 font-normal">Change</th>
                <th className="py-1 font-normal">{toName} total</th>
              </tr>
            </thead>
            <tbody>
              {l.prices.map((p) => (
                <tr
                  key={p.quantity}
                  className={p.kind === "unchanged" ? "text-stone-500" : "text-stone-900"}
                >
                  <td className="py-1 pr-3 tabular-nums">{p.quantity}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {p.kind === "added"
                      ? "not quoted"
                      : p.fromUnitCents == null
                        ? "not priced"
                        : money(p.fromUnitCents)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {p.kind === "removed"
                      ? "dropped"
                      : p.toUnitCents == null
                        ? "not priced"
                        : money(p.toUnitCents)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {delta(p.fromUnitCents, p.toUnitCents)}
                  </td>
                  <td className="py-1 tabular-nums">{money(p.toTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-col gap-1 text-sm">
        {l.fields.length > 0 && <Fields items={l.fields} />}
        {l.operations.length > 0 && (
          <ul className="flex flex-col gap-1">
            {l.operations.map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list rebuilt whole on every fetch; the same op or extra can repeat
              <Operation key={`${o.kind}-${o.machine}-${o.label}-${i}`} o={o} />
            ))}
          </ul>
        )}
        {l.finishing.added.length > 0 && (
          <div>
            <Badge tone="green">added</Badge> Finishing: {l.finishing.added.join(", ")}
          </div>
        )}
        {l.finishing.removed.length > 0 && (
          <div>
            <Badge tone="red">removed</Badge> Finishing: {l.finishing.removed.join(", ")}
          </div>
        )}
        {l.extras.map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list rebuilt whole on every fetch; the same op or extra can repeat
          <div key={`ex-${e.label}-${i}`}>
            <Badge tone={KIND_TONE[e.kind]}>{e.kind}</Badge> {e.label}:{" "}
            {e.kind === "changed" ? (
              <>
                <span className="text-stone-500">{extraMoney(e.from)}</span> → {extraMoney(e.to)}
              </>
            ) : (
              extraMoney(e.to ?? e.from)
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Customer-safe "Changes from ..." lines and the toggle that prints them on the PDF. */
function PdfSummary({
  orgId,
  quote,
  d,
  fromName,
  editable,
  onSaved,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  d: QuoteChangesDto;
  fromName: string;
  editable: boolean;
  onSaved: (q: QuoteDetailDto) => void;
}) {
  const items = customerChangeSummary(d);
  const toggle = useMutation({
    mutationFn: (on: boolean) =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quote.id}`), {
        method: "PATCH",
        body: { showChangesOnPdf: on },
      }),
    onSuccess: onSaved,
  });
  const draft = quote.status === "draft";
  return (
    <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
      <label className="flex items-center gap-2 font-medium text-stone-900">
        <input
          type="checkbox"
          checked={quote.showChangesOnPdf}
          disabled={!editable || !draft || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
        Print &ldquo;Changes from {fromName}&rdquo; on the customer PDF
      </label>
      <p className="mt-1 text-stone-600">
        The customer sees only what the PDF already shows: part revisions, added or dropped parts
        and quantities, unit price changes and lead time. Operations, material, finishing and extras
        stay internal.
      </p>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-stone-800">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-stone-600">
          Nothing the customer can see has changed yet, so the PDF prints no section.
        </p>
      )}
      <ErrorText error={toggle.error} />
    </div>
  );
}

export function RevisionChanges({
  orgId,
  quote,
  editable,
  onSaved,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  editable: boolean;
  onSaved: (q: QuoteDetailDto) => void;
}) {
  const quoteId = quote.id;
  const [open, setOpen] = useState(true);
  // null: the revision this one replaces (what the PDF compares with).
  const [fromId, setFromId] = useState<string | null>(null);
  const revisions = useQuery({
    queryKey: [...revisionChangesKey(orgId, quoteId), "revisions"],
    queryFn: () => api<QuoteRevisionsDto>(orgApi(orgId, `/quotes/${quoteId}/revisions`)),
  });
  const q = useQuery({
    queryKey: [...revisionChangesKey(orgId, quoteId), fromId ?? "previous"],
    queryFn: () =>
      api<QuoteChangesDto>(
        orgApi(
          orgId,
          `/quotes/${quoteId}/changes${fromId ? `?from=${encodeURIComponent(fromId)}` : ""}`,
        ),
      ),
  });
  const earlier = (revisions.data ?? []).filter((r) => r.revNumber < quote.revNumber);
  const d = q.data;
  if (!d) return q.error ? <ErrorText error={q.error} /> : null;
  const fromName = quoteLabel(d.from.quoteNumber, d.from.revNumber);
  const toName = quoteLabel(d.to.quoteNumber, d.to.revNumber);
  const changed = d.lines.filter((l) => l.kind !== "unchanged").length;
  const againstPrevious = d.from.id === quote.supersedesQuoteId;
  return (
    <Card
      title={`What changed from ${fromName}`}
      actions={
        <div className="flex items-center gap-3">
          {earlier.length > 1 && (
            <span className="flex items-center gap-1 text-sm text-stone-600">
              <label htmlFor={`compare-${quoteId}`}>Compare with</label>
              <Select
                id={`compare-${quoteId}`}
                className="w-auto py-1"
                value={fromId ?? quote.supersedesQuoteId ?? ""}
                onChange={(e) =>
                  setFromId(e.target.value === quote.supersedesQuoteId ? null : e.target.value)
                }
              >
                {earlier.map((r) => (
                  <option key={r.id} value={r.id}>
                    {quoteLabel(r.quoteNumber, r.revNumber)} ({r.status})
                  </option>
                ))}
              </Select>
            </span>
          )}
          <button
            type="button"
            className="text-sm text-sky-800 underline"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-stone-700">
        {d.identical
          ? `Same lines and prices as ${fromName} so far (only the valid-until date is new).`
          : `${changed} of ${d.lines.length} line${d.lines.length === 1 ? "" : "s"} changed.`}{" "}
        First-break total: {money(d.headline.fromCents)} → {money(d.headline.toCents)}{" "}
        {delta(d.headline.fromCents, d.headline.toCents)}
      </p>
      {open && !d.identical && (
        <div className="mt-3 flex flex-col gap-3">
          {d.header.length > 0 && (
            <div className="text-sm">
              <Fields items={d.header} />
            </div>
          )}
          {d.lines.map((l) => (
            <Line key={l.toLineId ?? l.fromLineId} l={l} fromName={fromName} toName={toName} />
          ))}
        </div>
      )}
      {againstPrevious ? (
        <PdfSummary
          orgId={orgId}
          quote={quote}
          d={d}
          fromName={fromName}
          editable={editable}
          onSaved={onSaved}
        />
      ) : (
        quote.showChangesOnPdf && (
          <p className="mt-3 text-sm text-stone-600">
            The PDF compares with the revision this one replaces, not {fromName}.
          </p>
        )
      )}
    </Card>
  );
}
