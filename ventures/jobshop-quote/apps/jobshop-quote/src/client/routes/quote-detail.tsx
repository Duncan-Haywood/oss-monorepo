// Quote editor. Each line's cost inputs (material + blank, operations with setup and cycle minutes,
// finishing, extras, quantity breaks) are priced by the deterministic engine from the rate card. The
// estimator sees the cost basis and breakdown; the customer PDF shows only prices.

import type {
  PartHistoryDto,
  QuoteDetailDto,
  QuoteEmailDto,
  QuoteEmailsDto,
  QuoteLineDto,
  RateCardDto,
} from "@shared/api";
import type { Blank, CostInputs, CostOutcome } from "@shared/costing";
import { cycleText, falloutBpsFromText } from "@shared/costing";
import type { CreatedCustomerLinkDto, CustomerLinksDto } from "@shared/customer-link";
import { lineMaterialNotes } from "@shared/material-bar-setup";
import { isEmailable, MAX_QUOTE_EMAIL_RECIPIENTS, parseRecipients } from "@shared/quote-email";
import { isRevisable, quoteLabel } from "@shared/quote-label";
import { isLookupablePartNumber, wonAtOtherRevision } from "@shared/repeat-parts";
import {
  type RoutingSuggestion,
  type RoutingSuggestionsDto,
  suggestionReason,
} from "@shared/routing-suggest";
import {
  type ApplyMode,
  applyRouting,
  lineMatchesRouting,
  type RoutingDto,
  recordedRoutings,
  recordRouting,
  sameRoutingRecord,
  sortRoutings,
  withoutRouting,
} from "@shared/routings";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QuoteFollowUpCard } from "../components/follow-up";
import { RevisionChanges, revisionChangesKey } from "../components/revision-changes";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Select,
  STATUS_TONE,
  Textarea,
} from "../components/ui";
import {
  api,
  cur,
  fromCents,
  money,
  moneyCurrency,
  orgApi,
  parseQuantities,
  queryClient,
  toCents,
} from "../lib/api";
import { canEstimate, useOrg, useOrgId, useShopDay } from "./layout";
import { QuoteQuickBooksCard } from "./quickbooks";

export function QuoteDetailPage() {
  const orgId = useOrgId();
  const { quoteId } = useParams({ strict: false }) as { quoteId: string };
  const org = useOrg(orgId);
  const key = ["quote", orgId, quoteId];
  const quote = useQuery({
    queryKey: key,
    queryFn: () => api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}`)),
  });
  const card = useQuery({
    queryKey: ["rate-card", orgId],
    queryFn: () => api<RateCardDto>(orgApi(orgId, "/rate-card")),
  });
  const setData = (d: QuoteDetailDto) => {
    queryClient.setQueryData(key, d);
    void queryClient.invalidateQueries({ queryKey: ["quotes", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["quote-stats", orgId] });
    void queryClient.invalidateQueries({ queryKey: revisionChangesKey(orgId, quoteId) });
  };
  const action = useMutation({
    mutationFn: (path: string) =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}${path}`), { method: "POST" }),
    onSuccess: setData,
  });
  const navigate = useNavigate();
  const revise = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}/revise`), { method: "POST" }),
    onSuccess: async (rev) => {
      queryClient.setQueryData(["quote", orgId, rev.id], rev);
      void queryClient.invalidateQueries({ queryKey: ["quotes", orgId] });
      await navigate({ to: "/app/$orgId/quotes/$quoteId", params: { orgId, quoteId: rev.id } });
    },
  });
  const addLine = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}/lines`), {
        method: "POST",
        body: {
          partNumber: "New part",
          inputs: { quantities: org.data?.settings.defaultQuantities ?? [1], material: null },
        },
      }),
    onSuccess: setData,
  });
  const q = quote.data;
  if (!q || !card.data) return <ErrorText error={quote.error ?? card.error} />;
  const draft = q.status === "draft";
  const editable = draft && canEstimate(org.data?.role);
  const unpriced = q.lines.some((l) => !l.breaks);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-stone-900">
          Quote {quoteLabel(q.quoteNumber, q.revNumber)}
        </h1>
        <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
        {q.supersedesQuoteId && (
          <Link
            to="/app/$orgId/quotes/$quoteId"
            params={{ orgId, quoteId: q.supersedesQuoteId }}
            className="text-sm text-sky-800 underline"
          >
            Replaces {quoteLabel(q.quoteNumber, q.revNumber - 1)}
          </Link>
        )}
        {q.rfqId && (
          <Link
            to="/app/$orgId/rfqs/$rfqId"
            params={{ orgId, rfqId: q.rfqId }}
            className="text-sm text-sky-800 underline"
          >
            RFQ
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm"
            href={orgApi(orgId, `/quotes/${quoteId}/pdf`)}
            target="_blank"
            rel="noreferrer"
          >
            {draft ? "Preview PDF" : "Sent PDF"}
          </a>
          {isRevisable(q.status) && canEstimate(org.data?.role) && (
            <Button
              variant="secondary"
              onClick={() => revise.mutate()}
              disabled={revise.isPending}
              title="Start a new revision of this quote with the same number; this one stays as sent until the revision goes out"
            >
              Revise
            </Button>
          )}
          {editable && (
            <>
              <Button
                variant="secondary"
                onClick={() => action.mutate("/recalculate")}
                title="Re-price every line from the current rate card"
              >
                Re-price
              </Button>
              <Button
                onClick={() => action.mutate("/send")}
                disabled={unpriced || q.lines.length === 0}
              >
                Mark sent
              </Button>
            </>
          )}
        </div>
      </div>
      <ErrorText error={action.error ?? addLine.error ?? revise.error} />
      {q.supersededByQuoteId && (
        <p className="rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          This quote was replaced by{" "}
          <Link
            to="/app/$orgId/quotes/$quoteId"
            params={{ orgId, quoteId: q.supersededByQuoteId }}
            className="text-sky-800 underline"
          >
            {quoteLabel(q.quoteNumber, q.revNumber + 1)}
          </Link>
          . Record won or lost on that revision.
        </p>
      )}
      {draft && q.supersedesQuoteId && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Revision {q.revNumber}: lines and prices are copied from{" "}
          {quoteLabel(q.quoteNumber, q.revNumber - 1)} as sent. Re-price uses today&apos;s rate
          card. Marking this revision sent replaces the earlier one.
        </p>
      )}
      {q.supersedesQuoteId && (
        <RevisionChanges orgId={orgId} quote={q} editable={editable} onSaved={setData} />
      )}
      {!draft && <EmailQuote orgId={orgId} quote={q} canSend={canEstimate(org.data?.role)} />}
      {!draft && (
        <CustomerLinks
          orgId={orgId}
          quote={q}
          canEdit={canEstimate(org.data?.role)}
          onAnswered={() => void queryClient.invalidateQueries({ queryKey: key })}
        />
      )}
      {!draft && q.status !== "superseded" && (
        <Outcome orgId={orgId} quote={q} onSaved={setData} canEdit={canEstimate(org.data?.role)} />
      )}
      {!draft && (
        // Keyed by status: recording won or lost re-reads it, and the form goes away.
        <QuoteFollowUpCard
          key={q.status}
          orgId={orgId}
          quoteId={q.id}
          canEdit={canEstimate(org.data?.role)}
        />
      )}
      {q.status === "won" && <Traveler orgId={orgId} quote={q} />}
      {q.status === "won" && (
        <QuoteQuickBooksCard orgId={orgId} quote={q} canSend={canEstimate(org.data?.role)} />
      )}
      <Header orgId={orgId} quote={q} editable={editable} onSaved={setData} />
      {q.lines.map((l) => (
        <LineEditor
          key={l.id}
          orgId={orgId}
          quoteId={quoteId}
          line={l}
          rfqId={q.rfqId}
          card={card.data}
          editable={editable}
          onSaved={setData}
        />
      ))}
      {editable && (
        <Button variant="secondary" onClick={() => addLine.mutate()}>
          Add line
        </Button>
      )}
      <CoverNote orgId={orgId} quote={q} editable={editable} onSaved={setData} />
    </div>
  );
}

function Header({
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
  const [f, setF] = useState({
    customerCompany: quote.customerCompany,
    customerContact: quote.customerContact ?? "",
    customerEmail: quote.customerEmail ?? "",
    leadTimeText: quote.leadTimeText ?? "",
    validUntil: quote.validUntil ?? "",
    notes: quote.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quote.id}`), {
        method: "PATCH",
        body: {
          customerCompany: f.customerCompany,
          customerContact: f.customerContact || null,
          customerEmail: f.customerEmail || null,
          leadTimeText: f.leadTimeText || null,
          validUntil: f.validUntil || null,
          notes: f.notes || null,
        },
      }),
    onSuccess: onSaved,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Card
      title="Customer and terms"
      actions={
        editable && (
          <Button variant="secondary" onClick={() => save.mutate()}>
            Save
          </Button>
        )
      }
    >
      <fieldset disabled={!editable} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Company">
          <Input value={f.customerCompany} onChange={set("customerCompany")} />
        </Field>
        <Field label="Contact">
          <Input value={f.customerContact} onChange={set("customerContact")} />
        </Field>
        <Field label="Email">
          <Input value={f.customerEmail} onChange={set("customerEmail")} />
        </Field>
        <Field label="Lead time">
          <Input value={f.leadTimeText} onChange={set("leadTimeText")} />
        </Field>
        <Field label="Valid until">
          <Input type="date" value={f.validUntil} onChange={set("validUntil")} />
        </Field>
        <Field label="Notes (on the PDF)">
          <Textarea rows={1} value={f.notes} onChange={set("notes")} />
        </Field>
      </fieldset>
      <ErrorText error={save.error} />
    </Card>
  );
}

type BlankShape = Blank["shape"];

function LineEditor({
  orgId,
  quoteId,
  line,
  rfqId,
  card,
  editable,
  onSaved,
}: {
  orgId: string;
  quoteId: string;
  line: QuoteLineDto;
  /** The RFQ this quote was made from, for comparing drawings (repeat parts, part 4). */
  rfqId: string | null;
  card: RateCardDto;
  editable: boolean;
  onSaved: (q: QuoteDetailDto) => void;
}) {
  const [meta, setMeta] = useState({
    partNumber: line.partNumber,
    revision: line.revision ?? "",
    description: line.description ?? "",
  });
  const [inputs, setInputs] = useState<CostInputs>(line.inputs);
  // The saved routings this line is built from (win/loss by routing): set when a routing is applied
  // to the line, saved from it or updated from it, and stored with the next Save.
  const [routingIds, setRoutingIds] = useState<string[] | null>(line.routingIds);
  const routingsDirty = !sameRoutingRecord(routingIds, line.routingIds);
  const [qtyText, setQtyText] = useState(line.inputs.quantities.join(", "));
  const [preview, setPreview] = useState<CostOutcome | null>(null);
  // Stable React keys for operation rows (operations have no id; rows can be removed mid-list).
  const [opKeys, setOpKeys] = useState(() => line.inputs.operations.map(() => crypto.randomUUID()));
  const inputsDirty = JSON.stringify(inputs) !== JSON.stringify(line.inputs);
  const dirty = inputsDirty || routingsDirty;
  // Material price lists: a draft line says when its material's price is past the shop's limit or
  // the card's price moved since this line was priced (shared/material-price.ts), or a per-foot
  // material's bar setup changed since (shared/material-bar-setup.ts). Never re-prices.
  const [now] = useState(() => new Date());
  const priceNotes = editable
    ? lineMaterialNotes(
        { inputs: line.inputs, snapshot: line.snapshot },
        card.materials,
        card.settings.materialPriceMaxAgeDays,
        now,
        moneyCurrency(),
      )
    : [];

  useEffect(() => {
    if (!inputsDirty) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api<CostOutcome>(orgApi(orgId, "/costing/preview"), { method: "POST", body: { inputs } })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [inputsDirty, inputs, orgId]);

  const save = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}/lines/${line.id}`), {
        method: "PATCH",
        body: {
          partNumber: meta.partNumber,
          revision: meta.revision || null,
          description: meta.description || null,
          inputs,
          ...(routingsDirty && routingIds !== null ? { routingIds } : {}),
        },
      }),
    // Repeat parts, part 3: typing a part number the shop has won before (pre-fill on) brings that
    // won line's inputs; show them instead of the blank ones the editor still holds.
    onSuccess: (q: QuoteDetailDto) => {
      const saved = q.lines.find((x) => x.id === line.id);
      if (saved?.prefilledFrom && !line.prefilledFrom) adoptCopied(q);
      else onSaved(q);
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}/lines/${line.id}`), {
        method: "DELETE",
      }),
    onSuccess: onSaved,
  });
  // After "Use these inputs": show the copied, re-priced line (local edits are replaced).
  const adoptCopied = (q: QuoteDetailDto) => {
    const l = q.lines.find((x) => x.id === line.id);
    if (l) {
      setInputs(l.inputs);
      setRoutingIds(l.routingIds);
      setQtyText(l.inputs.quantities.join(", "));
      setOpKeys(l.inputs.operations.map(() => crypto.randomUUID()));
    }
    onSaved(q);
  };

  const shown: { breaks: QuoteLineDto["breaks"]; basis: string[]; issues: QuoteLineDto["issues"] } =
    preview && inputsDirty
      ? preview.ok
        ? { breaks: preview.result.breaks, basis: preview.result.basis, issues: [] }
        : { breaks: null, basis: [], issues: preview.issues }
      : { breaks: line.breaks, basis: line.basis, issues: line.issues };
  const machines = card.machines.filter(
    (m) => m.active || inputs.operations.some((o) => o.machineId === m.id),
  );
  const materials = card.materials.filter((m) => m.active || m.id === inputs.material?.materialId);
  const material = card.materials.find((m) => m.id === inputs.material?.materialId);
  const blank = inputs.material?.blank ?? null;
  const setBlank = (b: Blank | null) =>
    inputs.material && setInputs({ ...inputs, material: { ...inputs.material, blank: b } });
  const num = (s: string) => (s === "" ? 0 : Number(s));

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {line.partNumber}
          {line.revision && (
            <span className="text-sm font-normal text-stone-500">Rev {line.revision}</span>
          )}
          {shown.breaks ? (
            <Badge tone="green">priced</Badge>
          ) : (
            <Badge tone="amber">needs inputs</Badge>
          )}
          {dirty && <Badge tone="sky">unsaved</Badge>}
        </span>
      }
      actions={
        editable && (
          <>
            <Button variant="ghost" onClick={() => remove.mutate()}>
              Remove
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save line
            </Button>
          </>
        )
      }
    >
      <fieldset
        disabled={!editable}
        className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Part number">
              <Input
                value={meta.partNumber}
                onChange={(e) => setMeta({ ...meta, partNumber: e.target.value })}
              />
            </Field>
            <Field label="Rev">
              <Input
                value={meta.revision}
                onChange={(e) => setMeta({ ...meta, revision: e.target.value })}
              />
            </Field>
            <Field label="Quantities">
              <Input
                value={qtyText}
                onChange={(e) => {
                  setQtyText(e.target.value);
                  const qs = parseQuantities(e.target.value);
                  if (qs.length > 0) setInputs({ ...inputs, quantities: qs.slice(0, 8) });
                }}
              />
            </Field>
          </div>
          <Field label="Fallout % (parts expected to scrap; run time, finishing and material priced on the starts)">
            <Input
              inputMode="decimal"
              className="max-w-24"
              placeholder="0"
              defaultValue={inputs.falloutBps ? inputs.falloutBps / 100 : ""}
              onChange={(e) => {
                const falloutBps = falloutBpsFromText(e.target.value);
                if (falloutBps !== "invalid") setInputs({ ...inputs, falloutBps });
              }}
            />
          </Field>
          <Field label="Description">
            <Input
              value={meta.description}
              onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            />
          </Field>

          <div className="rounded border border-stone-200 p-2">
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <Field label="Material">
                <Select
                  value={
                    inputs.material?.materialId ??
                    (inputs.customerSuppliedMaterial ? "__customer" : "")
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__customer")
                      setInputs({ ...inputs, material: null, customerSuppliedMaterial: true });
                    else if (v === "")
                      setInputs({ ...inputs, material: null, customerSuppliedMaterial: false });
                    else
                      setInputs({
                        ...inputs,
                        customerSuppliedMaterial: false,
                        material: {
                          materialId: v,
                          blank: inputs.material?.blank ?? null,
                          partsPerStock: inputs.material?.partsPerStock ?? null,
                        },
                      });
                  }}
                >
                  <option value="">— choose —</option>
                  <option value="__customer">Customer-supplied</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {material?.pricingBasis === "per_stock" && inputs.material && (
                <Field label="Parts per stock piece">
                  <Input
                    inputMode="numeric"
                    value={inputs.material.partsPerStock ?? ""}
                    onChange={(e) =>
                      inputs.material &&
                      setInputs({
                        ...inputs,
                        material: {
                          ...inputs.material,
                          partsPerStock: Number(e.target.value) || null,
                        },
                      })
                    }
                  />
                </Field>
              )}
              {(material?.pricingBasis === "per_lb" || material?.pricingBasis === "per_ft") && (
                <Field
                  label="Blank"
                  hint={
                    material.pricingBasis === "per_ft"
                      ? "Priced by the foot: the blank's length, plus the rate card's cut allowance"
                      : undefined
                  }
                >
                  <Select
                    value={blank?.shape ?? ""}
                    onChange={(e) => {
                      const s = e.target.value as BlankShape | "";
                      setBlank(
                        s === "rect"
                          ? { shape: "rect", lengthIn: 1, widthIn: 1, thicknessIn: 1 }
                          : s === "round"
                            ? { shape: "round", diameterIn: 1, lengthIn: 1 }
                            : s === "weight"
                              ? { shape: "weight", weightLb: 1 }
                              : null,
                      );
                    }}
                  >
                    <option value="">— size —</option>
                    <option value="rect">Plate / block (L×W×T in)</option>
                    <option value="round">Round bar (Ø×L in)</option>
                    {material.pricingBasis === "per_lb" && (
                      <option value="weight">Weight (lb)</option>
                    )}
                  </Select>
                </Field>
              )}
            </div>
            {(material?.pricingBasis === "per_lb" || material?.pricingBasis === "per_ft") &&
              blank && (
                <div className="grid grid-cols-3 gap-2">
                  {blank.shape === "rect" && (
                    <>
                      <Field label="Length in">
                        <Input
                          inputMode="decimal"
                          defaultValue={blank.lengthIn}
                          onChange={(e) => setBlank({ ...blank, lengthIn: num(e.target.value) })}
                        />
                      </Field>
                      <Field label="Width in">
                        <Input
                          inputMode="decimal"
                          defaultValue={blank.widthIn}
                          onChange={(e) => setBlank({ ...blank, widthIn: num(e.target.value) })}
                        />
                      </Field>
                      <Field label="Thickness in">
                        <Input
                          inputMode="decimal"
                          defaultValue={blank.thicknessIn}
                          onChange={(e) => setBlank({ ...blank, thicknessIn: num(e.target.value) })}
                        />
                      </Field>
                    </>
                  )}
                  {blank.shape === "round" && (
                    <>
                      <Field label="Diameter in">
                        <Input
                          inputMode="decimal"
                          defaultValue={blank.diameterIn}
                          onChange={(e) => setBlank({ ...blank, diameterIn: num(e.target.value) })}
                        />
                      </Field>
                      <Field label="Length in">
                        <Input
                          inputMode="decimal"
                          defaultValue={blank.lengthIn}
                          onChange={(e) => setBlank({ ...blank, lengthIn: num(e.target.value) })}
                        />
                      </Field>
                    </>
                  )}
                  {blank.shape === "weight" && (
                    <Field label="Weight lb">
                      <Input
                        inputMode="decimal"
                        defaultValue={blank.weightLb}
                        onChange={(e) => setBlank({ ...blank, weightLb: num(e.target.value) })}
                      />
                    </Field>
                  )}
                </div>
              )}
          </div>

          <div className="rounded border border-stone-200 p-2">
            <div className="mb-1 text-sm font-medium">Operations</div>
            {inputs.operations.map((op, i) => {
              const update = (patch: Partial<typeof op>) =>
                setInputs({
                  ...inputs,
                  operations: inputs.operations.map((o, j) => (j === i ? { ...o, ...patch } : o)),
                });
              return (
                <div
                  key={opKeys[i] ?? i}
                  className="mb-2 grid grid-cols-2 items-end gap-1 border-b border-stone-100 pb-2 sm:mb-1 sm:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_auto] sm:border-0 sm:pb-0"
                >
                  <Field label="Machine">
                    <Select
                      value={op.machineId}
                      onChange={(e) => update({ machineId: e.target.value })}
                    >
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Op">
                    <Input
                      value={op.label}
                      placeholder="e.g. Op 10 mill"
                      onChange={(e) => update({ label: e.target.value })}
                    />
                  </Field>
                  <Field label="Setup min">
                    <Input
                      inputMode="decimal"
                      defaultValue={op.setupMinutes}
                      onChange={(e) => update({ setupMinutes: num(e.target.value) })}
                    />
                  </Field>
                  <Field label="Cycle min/pc">
                    <Input
                      inputMode="decimal"
                      defaultValue={op.cycleMinutesPerPart ?? ""}
                      placeholder="required"
                      onChange={(e) =>
                        update({
                          cycleMinutesPerPart:
                            e.target.value.trim() === "" ? null : num(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Button
                    aria-label="Remove operation"
                    className="justify-self-start sm:justify-self-auto"
                    variant="ghost"
                    onClick={() => {
                      setInputs({
                        ...inputs,
                        operations: inputs.operations.filter((_, j) => j !== i),
                      });
                      setOpKeys(opKeys.filter((_, j) => j !== i));
                    }}
                  >
                    <span className="sm:hidden">Remove</span>
                    <span className="hidden sm:inline" aria-hidden="true">
                      ✕
                    </span>
                  </Button>
                </div>
              );
            })}
            {machines.length === 0 ? (
              <p className="text-xs text-stone-500">Add machines on the rate card first.</p>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  const m = machines[0];
                  if (!m) return;
                  setOpKeys([...opKeys, crypto.randomUUID()]);
                  setInputs({
                    ...inputs,
                    operations: [
                      ...inputs.operations,
                      {
                        machineId: m.id,
                        label: "",
                        setupMinutes: m.defaultSetupMinutes,
                        // Blank until typed: an unentered time blocks pricing instead of costing 0.
                        cycleMinutesPerPart: null,
                      },
                    ],
                  });
                }}
              >
                + Operation
              </Button>
            )}
            <Routings
              orgId={orgId}
              lineId={line.id}
              inputs={inputs}
              materialName={material?.name ?? null}
              description={meta.description}
              editable={editable}
              routingIds={routingIds}
              onRecord={setRoutingIds}
              onApply={(next) => {
                setInputs(next);
                setOpKeys(next.operations.map(() => crypto.randomUUID()));
              }}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded border border-stone-200 p-2 text-sm">
              <div className="mb-1 font-medium">Finishing</div>
              {card.finishingOps
                .filter((o) => o.active || inputs.finishing.some((f) => f.opId === o.id))
                .map((o) => (
                  <label key={o.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inputs.finishing.some((f) => f.opId === o.id)}
                      onChange={(e) =>
                        setInputs({
                          ...inputs,
                          finishing: e.target.checked
                            ? [...inputs.finishing, { opId: o.id }]
                            : inputs.finishing.filter((f) => f.opId !== o.id),
                        })
                      }
                    />
                    {o.name}
                  </label>
                ))}
            </div>
            <Extras inputs={inputs} setInputs={setInputs} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {priceNotes.length > 0 && (
            <div
              className="rounded bg-amber-50 p-2 text-sm text-amber-900"
              data-testid="price-notes"
            >
              {priceNotes.map((n) => (
                <div key={n}>• {n}</div>
              ))}
            </div>
          )}
          {shown.issues.length > 0 && (
            <div className="rounded bg-amber-50 p-2 text-sm text-amber-900">
              {shown.issues.map((i) => (
                <div key={i.code + i.message}>• {i.message}</div>
              ))}
            </div>
          )}
          {shown.breaks && (
            // Nine columns are wider than a phone: the table scrolls on its own, the page does not.
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full whitespace-nowrap text-sm [&_td]:pl-1.5 [&_th]:pl-1.5">
                <thead className="text-right text-stone-500">
                  <tr>
                    <th className="sticky left-0 bg-white pr-1 text-left">Qty</th>
                    <th>Material</th>
                    <th>Setup</th>
                    <th>Run</th>
                    <th>Finish</th>
                    <th>Extras</th>
                    <th>Markup</th>
                    <th>Unit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody className="text-right">
                  {shown.breaks.map((b) => (
                    <tr key={b.quantity} className="border-t border-stone-100">
                      <td className="sticky left-0 bg-white pr-1 text-left font-medium">
                        {b.quantity}
                        {b.starts !== undefined && b.starts !== b.quantity && (
                          <span
                            className="block text-xs font-normal text-stone-500"
                            title="Parts started to ship this many good ones at the line's fallout"
                          >
                            start {b.starts}
                          </span>
                        )}
                      </td>
                      <td>{money(b.materialCents)}</td>
                      <td>{money(b.setupCents)}</td>
                      <td>{money(b.runCents)}</td>
                      <td>{money(b.finishingCents)}</td>
                      <td>{money(b.extrasCents)}</td>
                      <td
                        title={
                          b.minimumAdjustmentCents
                            ? `+${money(b.minimumAdjustmentCents)} to reach the line minimum`
                            : undefined
                        }
                      >
                        {money(b.markupCents + b.minimumAdjustmentCents)}
                        {b.minimumAdjustmentCents > 0 && "*"}
                      </td>
                      <td className="font-medium">{money(b.unitPriceCents)}</td>
                      <td className="font-medium">{money(b.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-stone-500 sm:hidden">
                Swipe the table for unit price and total.
              </p>
            </div>
          )}
          {shown.basis.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-stone-600">
              {shown.basis.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-500">
            Internal: costs, rates and markup never appear on the customer PDF.
          </p>
        </div>
      </fieldset>
      {line.prefilledFrom && (
        <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
          Pre-filled from{" "}
          <Link
            to="/app/$orgId/quotes/$quoteId"
            params={{ orgId, quoteId: line.prefilledFrom.quoteId }}
            className="font-medium underline"
          >
            {quoteLabel(line.prefilledFrom.quoteNumber, line.prefilledFrom.revNumber)}
          </Link>{" "}
          for {line.prefilledFrom.customerCompany}
          {line.prefilledFrom.wonOn ? `, won ${line.prefilledFrom.wonOn}` : ", won"}: its inputs,
          this line's quantities, today's rates. Check them before sending.
        </p>
      )}
      <PartHistory
        orgId={orgId}
        quoteId={quoteId}
        line={line}
        rfqId={rfqId}
        editable={editable}
        dirty={dirty}
        onCopied={adoptCopied}
      />
      <ErrorText error={save.error ?? remove.error} />
    </Card>
  );
}

/**
 * Which saved routings win/loss counts this line under (`quote_lines.routing_ids`), named from the
 * shop's routings today, with "since deleted" for one removed. The estimator can take a routing off
 * the line or clear the record: a line applied from a routing and then tuned into something else
 * then counts under "No saved routing" instead (an empty record, never matched by its operations
 * again). The change is stored with the line's next Save, like applying a routing. A line with no
 * record says how it is matched instead.
 */
function RoutingRecord({
  routingIds,
  routings,
  editable,
  onRecord,
}: {
  routingIds: string[] | null;
  routings: RoutingDto[] | null;
  editable: boolean;
  onRecord: (ids: string[]) => void;
}) {
  if (routingIds === null) {
    if (!editable || !routings?.length) return null;
    return (
      <p className="mb-1 text-xs text-stone-500" data-testid="routing-record">
        Win/loss: no routing recorded for this line; it is matched by its operations against your
        saved routings.
      </p>
    );
  }
  if (routingIds.length === 0) {
    return (
      <p className="mb-1 text-xs text-stone-500" data-testid="routing-record">
        Win/loss: counted under "No saved routing" (recorded as built from none).
      </p>
    );
  }
  // Names wait for the routings list; ids alone would read as noise.
  if (routings === null) return null;
  const entries = recordedRoutings(routingIds, routings);
  return (
    <div
      className="mb-1 flex flex-wrap items-baseline gap-1 text-xs text-stone-600"
      data-testid="routing-record"
    >
      <span>Win/loss counts this line under:</span>
      {entries.map((e) => (
        <span
          key={e.id}
          className="inline-flex items-baseline gap-1 rounded bg-stone-100 px-1.5 py-0.5"
        >
          {e.name === null ? (
            <span className="italic">Routing since deleted</span>
          ) : (
            <span>{e.partFamily ? `${e.partFamily}: ${e.name}` : e.name}</span>
          )}
          {editable && (
            <button
              type="button"
              className="text-stone-500 hover:text-red-700"
              aria-label={`Stop counting this line under ${e.name ?? "the deleted routing"}`}
              title="Stop counting this line under this routing (saved with the line)"
              onClick={() => onRecord(withoutRouting(routingIds, e.id) ?? [])}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {editable && entries.length > 1 && (
        <button type="button" className="text-sky-800 underline" onClick={() => onRecord([])}>
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * Routing templates (src/shared/routings.ts): apply a saved routing's operations and finishing to
 * this line (replacing its own or added after them), or save the line's as a new routing. Applying
 * only changes the editor's inputs: the preview prices them from today's rate card and Save stores
 * them, as with any edit. Material, blank, extras and quantities are never touched. Applying a
 * routing, saving the line as one or updating one from it also records the routing on the line
 * (`onRecord`, stored with Save), so win/loss counts the routing the line was built from.
 */
function Routings({
  orgId,
  lineId,
  inputs,
  materialName,
  description,
  editable,
  routingIds,
  onRecord,
  onApply,
}: {
  orgId: string;
  lineId: string;
  inputs: CostInputs;
  materialName: string | null;
  description: string;
  editable: boolean;
  routingIds: string[] | null;
  onRecord: (ids: string[]) => void;
  onApply: (next: CostInputs) => void;
}) {
  const key = ["routings", orgId];
  const routings = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: RoutingDto[] }>(orgApi(orgId, "/routings")),
    // A sent quote still names the routings its lines are recorded as built from.
    enabled: editable || (routingIds?.length ?? 0) > 0,
  });
  // Routings, part 3: the shop's routings ranked for this line from its material and description
  // (shared/routing-suggest.ts). Only routings with evidence in the shop's own lines are offered.
  const materialId = inputs.material?.materialId ?? "";
  const suggestions = useQuery({
    queryKey: [...key, "suggest", lineId, materialId, description.trim()],
    queryFn: () =>
      api<RoutingSuggestionsDto>(
        orgApi(
          orgId,
          `/routings/suggestions?${new URLSearchParams({
            lineId,
            materialId,
            description: description.trim().slice(0, 2000),
          })}`,
        ),
      ),
    enabled: editable && (routings.data?.items.length ?? 0) > 0,
  });
  const [picked, setPicked] = useState("");
  const [family, setFamily] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api<RoutingDto>(orgApi(orgId, "/routings"), {
        method: "POST",
        body: {
          name,
          partFamily: family.trim() || null,
          operations: inputs.operations,
          finishing: inputs.finishing,
        },
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: key });
      setPicked(r.id);
      setSaving(false);
      setName("");
      // The line is now exactly this routing.
      onRecord(recordRouting(routingIds, r.id, "replace"));
    },
  });
  // Overwrite the chosen routing with this line's operations and finishing (edit in place, keeping
  // its name and id); ifUpdatedAt refuses it when someone changed the routing since it loaded.
  const update = useMutation({
    mutationFn: (r: RoutingDto) =>
      api<RoutingDto>(orgApi(orgId, `/routings/${r.id}`), {
        method: "PATCH",
        body: {
          operations: inputs.operations,
          finishing: inputs.finishing,
          ifUpdatedAt: r.updatedAt,
        },
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: key });
      onRecord(recordRouting(routingIds, r.id, "replace"));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgApi(orgId, `/routings/${id}`), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      setPicked("");
    },
  });
  const record = (
    <RoutingRecord
      routingIds={routingIds}
      routings={routings.data?.items ?? null}
      editable={editable}
      onRecord={onRecord}
    />
  );
  if (!editable) return routingIds?.length ? <div className="mt-2 text-sm">{record}</div> : null;
  const items = sortRoutings(routings.data?.items ?? [], family);
  const chosen = items.find((r) => r.id === picked);
  const apply = (mode: ApplyMode) => {
    if (!chosen) return;
    if (
      mode === "replace" &&
      inputs.operations.length > 0 &&
      !window.confirm(
        `Replace this line's ${inputs.operations.length} operation(s) with "${chosen.name}"?`,
      )
    )
      return;
    const r = applyRouting(inputs, chosen, mode);
    if (!r.ok) {
      setApplyError(r.message);
      return;
    }
    setApplyError(null);
    onApply(r.inputs);
    onRecord(recordRouting(routingIds, chosen.id, mode));
  };
  return (
    <div className="mt-2 border-t border-stone-200 pt-2 text-sm">
      <div className="mb-1 font-medium">Routing templates</div>
      {record}
      {(() => {
        const shown = (suggestions.data?.items ?? [])
          .map((sg) => ({ sg, r: items.find((x) => x.id === sg.routingId) }))
          .filter(
            (x): x is { sg: RoutingSuggestion; r: RoutingDto } =>
              !!x.r && !lineMatchesRouting(inputs, x.r),
          );
        if (shown.length === 0) return null;
        return (
          <div
            className="mb-2 rounded border border-sky-200 bg-sky-50 p-2"
            data-testid="routing-suggestions"
          >
            <div className="mb-1 text-xs text-stone-600">
              Suggested from your shop's earlier lines (pick one, then use it):
            </div>
            <ul className="space-y-1">
              {shown.map(({ sg, r }) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                  <button
                    type="button"
                    className="text-sky-800 underline"
                    onClick={() => setPicked(r.id)}
                  >
                    {r.name}
                  </button>
                  <span className="text-xs text-stone-600">
                    {suggestionReason(sg, materialName)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
      {items.length > 0 && (
        <div className="flex flex-wrap items-end gap-1">
          <Field label="Routing">
            <Select value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Choose a routing…</option>
              {items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.partFamily ? `${r.partFamily}: ${r.name}` : r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" disabled={!chosen} onClick={() => apply("replace")}>
            Use routing
          </Button>
          <Button variant="ghost" disabled={!chosen} onClick={() => apply("append")}>
            Add after
          </Button>
          {chosen && inputs.operations.length > 0 && !lineMatchesRouting(inputs, chosen) && (
            <Button
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                window.confirm(
                  `Update the routing "${chosen.name}" to this line's ${inputs.operations.length} operation(s) and finishing? Quotes that already used it keep their operations.`,
                ) && update.mutate(chosen)
              }
            >
              Update routing from this line
            </Button>
          )}
          {chosen && (
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() =>
                window.confirm(
                  `Delete the routing "${chosen.name}"? Quotes that used it keep their operations.`,
                ) && remove.mutate(chosen.id)
              }
            >
              Delete
            </Button>
          )}
        </div>
      )}
      {chosen && (
        <p className="mt-1 text-xs text-stone-500">
          {chosen.operations
            .map(
              (o) =>
                `${o.label || o.machine}${o.retired ? " (retired machine)" : ""}: setup ${o.setupMinutes} min, ${cycleText(o.cycleMinutesPerPart)}`,
            )
            .join("; ")}
          {chosen.finishing.length > 0 &&
            ` · then ${chosen.finishing.map((f) => f.name + (f.retired ? " (retired)" : "")).join(", ")}`}
          . Priced from today's rate card.{" "}
          <Link to="/app/$orgId/routings" params={{ orgId }} className="text-sky-800 underline">
            Edit routings
          </Link>
        </p>
      )}
      {saving ? (
        <div className="mt-1 flex flex-wrap items-end gap-1">
          <Field label="Routing name">
            <Input
              value={name}
              placeholder="e.g. 6061 bracket, 2 ops"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Part family (optional)">
            <Input
              value={family}
              placeholder="e.g. Brackets"
              onChange={(e) => setFamily(e.target.value)}
            />
          </Field>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Save routing
          </Button>
          <Button variant="ghost" onClick={() => setSaving(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        inputs.operations.length > 0 && (
          <Button variant="ghost" onClick={() => setSaving(true)}>
            Save these operations as a routing
          </Button>
        )
      )}
      {items.length === 0 && inputs.operations.length === 0 && (
        <p className="text-xs text-stone-500">
          Add operations, then save them as a routing to reuse on the next part of the same family.
        </p>
      )}
      {applyError && <p className="text-xs text-red-700">{applyError}</p>}
      <ErrorText error={routings.error ?? save.error ?? update.error ?? remove.error} />
    </div>
  );
}

/**
 * Repeat parts: the shop's earlier quotes of this part number (services/quotes/history.ts), with the
 * unit prices and operations as quoted and a button that copies that line's cost inputs here. The
 * copy keeps this line's quantities and is priced from today's rate card.
 */
function PartHistory({
  orgId,
  quoteId,
  line,
  rfqId,
  editable,
  dirty,
  onCopied,
}: {
  orgId: string;
  quoteId: string;
  line: QuoteLineDto;
  rfqId: string | null;
  editable: boolean;
  dirty: boolean;
  onCopied: (q: QuoteDetailDto) => void;
}) {
  const shopDayOf = useShopDay(orgId);
  const lookup = isLookupablePartNumber(line.partNumber);
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["part-history", orgId, quoteId, line.id, line.partNumber, line.revision],
    queryFn: () =>
      api<PartHistoryDto>(orgApi(orgId, `/quotes/${quoteId}/lines/${line.id}/history`)),
    enabled: lookup,
  });
  const copy = useMutation({
    mutationFn: (sourceLineId: string) =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quoteId}/lines/${line.id}/copy-from`), {
        method: "POST",
        body: { sourceLineId },
      }),
    onSuccess: onCopied,
  });
  const items = history.data?.items ?? [];
  if (!lookup || items.length === 0) return null;
  // Repeat parts, part 4: won before, but only at another revision. Pre-filling skips it (the
  // drawing may have changed), so say so and put both drawings a click away.
  const otherRev = wonAtOtherRevision(
    { revision: line.revision, prefilled: line.prefilledFrom !== null },
    items,
  );
  return (
    <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-2 text-sm">
      {otherRev && (
        <div
          role="note"
          className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900"
        >
          <p>
            Won before at {otherRev.revision ? `Rev ${otherRev.revision}` : "no revision"}, not{" "}
            {line.revision ? `Rev ${line.revision}` : "this line's (none)"}:{" "}
            <Link
              to="/app/$orgId/quotes/$quoteId"
              params={{ orgId, quoteId: otherRev.quoteId }}
              className="font-medium underline"
            >
              {quoteLabel(otherRev.quoteNumber, otherRev.revNumber)}
            </Link>{" "}
            for {otherRev.customerCompany}
            {otherRev.poNumber ? `, PO ${otherRev.poNumber}` : ""}. Compare the drawings before
            reusing its inputs.
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {otherRev.rfqFiles.map((f) => (
              <a
                key={f.id}
                className="underline"
                target="_blank"
                rel="noreferrer"
                href={orgApi(orgId, `/rfqs/${otherRev.rfqId}/files/${f.id}/download`)}
              >
                Then: {f.fileName}
              </a>
            ))}
            {otherRev.rfqFiles.length === 0 && (
              <span>The earlier quote has no RFQ files to compare.</span>
            )}
            {rfqId && (
              <Link to="/app/$orgId/rfqs/$rfqId" params={{ orgId, rfqId }} className="underline">
                Now: this quote's RFQ
              </Link>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        className="font-medium text-sky-900 underline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Quoted before: {items.length} earlier quote{items.length === 1 ? "" : "s"} of{" "}
        {line.partNumber}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((h) => (
            <li key={h.lineId} className="rounded border border-stone-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/app/$orgId/quotes/$quoteId"
                  params={{ orgId, quoteId: h.quoteId }}
                  className="font-medium text-sky-800 underline"
                >
                  {quoteLabel(h.quoteNumber, h.revNumber)}
                </Link>
                <Badge tone={STATUS_TONE[h.status]}>{h.status}</Badge>
                <span className="text-stone-600">
                  {h.customerCompany}, {shopDayOf(h.quotedAt)}
                </span>
                {h.revision && <span className="text-stone-600">Rev {h.revision}</span>}
                {h.sameRevision === false && (
                  <Badge tone="amber">different revision: check the drawing changes</Badge>
                )}
                {h.poNumber && <span className="text-stone-600">PO {h.poNumber}</span>}
                {h.lostReason && <span className="text-stone-600">Lost: {h.lostReason}</span>}
                {editable && (
                  <Button
                    variant="secondary"
                    className="ml-auto"
                    disabled={copy.isPending}
                    title="Copy material, blank, operations, finishing and extras; keep this line's quantities; price from today's rate card"
                    onClick={() => {
                      if (
                        dirty &&
                        !window.confirm(
                          `Replace this line's unsaved inputs with ${quoteLabel(h.quoteNumber, h.revNumber)}'s?`,
                        )
                      )
                        return;
                      copy.mutate(h.lineId);
                    }}
                  >
                    Use these inputs
                  </Button>
                )}
              </div>
              <div className="mt-1 text-stone-700">
                {h.breaks.length > 0
                  ? h.breaks.map((b) => `${b.quantity} @ ${money(b.unitPriceCents)}`).join(" · ")
                  : "Not priced"}
                {h.material && ` · ${h.material}`}
              </div>
              {h.operations.length > 0 && (
                <div className="text-xs text-stone-500">
                  {h.operations
                    .map(
                      (o) =>
                        `${o.machine}${o.retired ? " (retired)" : ""}: setup ${o.setupMinutes} min, ${cycleText(o.cycleMinutesPerPart)}`,
                    )
                    .join("; ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={history.error ?? copy.error} />
    </div>
  );
}

function Extras({ inputs, setInputs }: { inputs: CostInputs; setInputs: (i: CostInputs) => void }) {
  const [f, setF] = useState({ label: "", perPart: "", lot: "" });
  return (
    <div className="rounded border border-stone-200 p-2 text-sm">
      <div className="mb-1 font-medium">Extras (hardware, certs, packaging)</div>
      {inputs.extras.map((e, i) => (
        <div key={e.label} className="flex items-center justify-between">
          <span>
            {e.label}: {money(e.perPartCents)}/pc + {money(e.lotCents)}/lot
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              setInputs({ ...inputs, extras: inputs.extras.filter((_, j) => j !== i) })
            }
          >
            ✕
          </Button>
        </div>
      ))}
      <div className="mt-1 grid grid-cols-[1fr_1fr_auto] gap-1 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
        <Input
          placeholder="Label"
          className="col-span-3 sm:col-span-1"
          value={f.label}
          onChange={(e) => setF({ ...f, label: e.target.value })}
        />
        <Input
          placeholder={`${cur()}/pc`}
          value={f.perPart}
          onChange={(e) => setF({ ...f, perPart: e.target.value })}
        />
        <Input
          placeholder={`${cur()}/lot`}
          value={f.lot}
          onChange={(e) => setF({ ...f, lot: e.target.value })}
        />
        <Button
          variant="ghost"
          disabled={!f.label.trim()}
          onClick={() => {
            setInputs({
              ...inputs,
              extras: [
                ...inputs.extras,
                {
                  label: f.label.trim(),
                  perPartCents: toCents(f.perPart) ?? 0,
                  lotCents: toCents(f.lot) ?? 0,
                },
              ],
            });
            setF({ label: "", perPart: "", lot: "" });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function CoverNote({
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
  const [text, setText] = useState(quote.coverNote ?? "");
  useEffect(() => setText(quote.coverNote ?? ""), [quote.coverNote]);
  const draft = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quote.id}/cover-note`), { method: "POST" }),
    onSuccess: onSaved,
  });
  const save = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quote.id}`), {
        method: "PATCH",
        body: { coverNote: text },
      }),
    onSuccess: onSaved,
  });
  return (
    <Card
      title="Cover note (email body)"
      actions={
        editable && (
          <>
            <Button
              variant="secondary"
              onClick={() => draft.mutate()}
              disabled={draft.isPending || quote.lines.some((l) => !l.breaks)}
            >
              {draft.isPending ? "Writing…" : "Draft with AI"}
            </Button>
            <Button variant="secondary" onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        )
      }
    >
      <Textarea
        className="w-full"
        rows={8}
        value={text}
        disabled={!editable}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-1 text-xs text-stone-500">
        {quote.coverNoteSource === "llm" &&
          "Drafted by AI from the priced quote; every number was checked against it."}
        {quote.coverNoteSource === "template" &&
          "The AI draft mentioned something not in the quote, so a standard note was used."}
        {quote.coverNoteSource === "user" && "Edited by you."}
      </p>
      <ErrorText error={draft.error ?? save.error} />
    </Card>
  );
}

function Outcome({
  orgId,
  quote,
  onSaved,
  canEdit,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  onSaved: (q: QuoteDetailDto) => void;
  canEdit: boolean;
}) {
  const shopDayOf = useShopDay(orgId);
  const [po, setPo] = useState(quote.poNumber ?? "");
  const [amount, setAmount] = useState(fromCents(quote.wonAmountCents ?? quote.headlineTotalCents));
  const [reason, setReason] = useState(quote.lostReason ?? "");
  const record = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<QuoteDetailDto>(orgApi(orgId, `/quotes/${quote.id}/outcome`), { method: "POST", body }),
    onSuccess: onSaved,
  });
  return (
    <Card title="Outcome">
      <p className="mb-2 text-sm text-stone-600">
        Sent {shopDayOf(quote.sentAt)} · PDF SHA-256{" "}
        <code className="text-xs">{quote.sentPdfSha256?.slice(0, 16)}…</code>
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="PO number">
            <Input value={po} onChange={(e) => setPo(e.target.value)} />
          </Field>
          <Field label={`Won amount ${cur()}`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Button
            onClick={() =>
              record.mutate({
                outcome: "won",
                poNumber: po || null,
                wonAmountCents: toCents(amount),
              })
            }
          >
            Won
          </Button>
          <Field label="Lost reason">
            <Input
              value={reason}
              placeholder="price, lead time, no award…"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            variant="danger"
            onClick={() => record.mutate({ outcome: "lost", reason: reason || null })}
          >
            Lost
          </Button>
          <Button variant="secondary" onClick={() => record.mutate({ outcome: "expired" })}>
            Expired
          </Button>
        </div>
      )}
      <ErrorText error={record.error} />
    </Card>
  );
}

/**
 * Job traveler for the floor once the quote is won (GET /quotes/:id/traveler.pdf): the due date and,
 * for a line quoted at more than one quantity, the quantity on the PO. No prices are printed.
 */
function Traveler({ orgId, quote }: { orgId: string; quote: QuoteDetailDto }) {
  const [due, setDue] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  // The customer's online acceptance (same query as the customer-links card) sets the quantities.
  const links = useQuery({
    queryKey: customerLinksKey(orgId, quote.id),
    queryFn: () => api<CustomerLinksDto>(orgApi(orgId, `/quotes/${quote.id}/customer-links`)),
  });
  const response = links.data?.response;
  const accepted = response?.decision === "accepted" ? response.choices : null;
  const chosen = (lineId: string) => accepted?.find((c) => c.lineId === lineId)?.quantity;
  const leftOff = accepted
    ? quote.lines.filter((l) => chosen(l.id) === undefined && !(qty[l.id] ?? "").trim())
    : [];
  const multi = quote.lines.filter((l) => l.inputs.quantities.length > 1);
  const missing = multi.filter((l) => !accepted && !/^[1-9]\d*$/.test((qty[l.id] ?? "").trim()));
  const params = new URLSearchParams();
  if (due) params.set("due", due);
  for (const l of quote.lines) {
    const v = (qty[l.id] ?? "").trim();
    if (v) params.set(`qty.${l.id}`, v);
  }
  const query = params.toString();
  const href = orgApi(orgId, `/quotes/${quote.id}/traveler.pdf${query ? `?${query}` : ""}`);
  const asked = accepted ? quote.lines : multi;
  return (
    <Card title="Job traveler">
      <p className="mb-2 text-sm text-stone-600">
        One sheet per part for the floor: quantity to start (with the line&apos;s fallout), material
        and stock pieces, and the operations in order with the estimate&apos;s setup and cycle times
        and a sign-off line each. No prices.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        {asked.map((l) => (
          <Field
            key={l.id}
            label={`${l.partNumber} quantity ordered`}
            hint={
              chosen(l.id) !== undefined
                ? `accepted online: ${chosen(l.id)}`
                : `quoted at ${l.inputs.quantities.join(", ")}`
            }
          >
            <Input
              inputMode="numeric"
              value={qty[l.id] ?? ""}
              placeholder={chosen(l.id) !== undefined ? String(chosen(l.id)) : ""}
              onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
            />
          </Field>
        ))}
        {missing.length === 0 ? (
          <a
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Print traveler
          </a>
        ) : (
          <span className="text-sm text-stone-600">
            Enter the quantity ordered for {missing.map((l) => l.partNumber).join(", ")}
          </span>
        )}
      </div>
      {leftOff.length > 0 && (
        <p className="mt-2 text-sm text-stone-600">
          Not ordered online, so left off: {leftOff.map((l) => l.partNumber).join(", ")}. Enter a
          quantity to add one.
        </p>
      )}
    </Card>
  );
}

const EMAIL_STATUS: Record<QuoteEmailDto["status"], string> = {
  sending: "sending",
  sent: "sent",
  failed: "failed",
};

/**
 * Email the sent quote: the exact PDF frozen at "Mark sent", the estimator's message (the cover
 * note to start), replies to the estimator. Below it, every email sent from the app for this quote.
 */
function EmailQuote({
  orgId,
  quote,
  canSend,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  canSend: boolean;
}) {
  const key = ["quote-emails", orgId, quote.id];
  const emails = useQuery({
    queryKey: key,
    queryFn: () => api<QuoteEmailsDto>(orgApi(orgId, `/quotes/${quote.id}/emails`)),
  });
  const [to, setTo] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyMe, setCopyMe] = useState(true);
  const [customerLink, setCustomerLink] = useState(true);
  const send = useMutation({
    mutationFn: (body: { to: string; message: string; copyMe: boolean; customerLink: boolean }) =>
      api<QuoteEmailDto>(orgApi(orgId, `/quotes/${quote.id}/email`), { method: "POST", body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: customerLinksKey(orgId, quote.id) });
    },
  });
  const data = emails.data;
  if (!data) return <ErrorText error={emails.error} />;
  const toValue = to ?? data.defaultTo;
  const messageValue = message ?? data.defaultMessage;
  const parsed = parseRecipients(toValue);
  const open = isEmailable(quote.status);
  const threadFrom = data.rfqThread?.from.toLowerCase();
  const threaded = parsed.ok && parsed.to.some((a) => a.toLowerCase() === threadFrom);
  return (
    <Card title="Email to customer">
      {open && canSend && (
        <div className="flex flex-col gap-2">
          <Field label={`To (up to ${MAX_QUOTE_EMAIL_RECIPIENTS}, separated by commas)`}>
            <Input
              className="w-full"
              type="text"
              inputMode="email"
              value={toValue}
              placeholder="buyer@customer.example"
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Message">
            <Textarea
              className="w-full"
              rows={7}
              value={messageValue}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          {data.changes && (
            <div className="text-xs text-stone-500">
              Added under the message, as printed on the PDF:
              <div className="mt-1 text-stone-700">
                <p className="font-medium">Changes from {data.changes.fromLabel}:</p>
                <ul className="list-disc pl-5">
                  {data.changes.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {data.signature ? (
            <div className="text-xs text-stone-500">
              Signature (from the rate card), added under the message:
              <pre className="mt-1 whitespace-pre-wrap font-sans text-stone-700">
                {data.signature}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              No shop signature yet: an admin can add one on the rate card page.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
            Send me a copy ({data.replyTo})
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={customerLink}
              onChange={(e) => setCustomerLink(e.target.checked)}
            />
            Add a link where the customer can accept (with a PO number) or decline online
          </label>
          <p className="text-xs text-stone-500">
            Attached: the PDF as sent (SHA-256 {quote.sentPdfSha256?.slice(0, 12)}…). Replies go to{" "}
            {data.replyTo}. The message is sent as written; check it before you send.
          </p>
          {data.rfqThread && (
            <p className="text-xs text-stone-500">
              {threaded
                ? `Goes as a reply to the RFQ email from ${data.rfqThread.from}, in the same thread, with the subject "${data.rfqThread.subject}".`
                : `Sent to ${data.rfqThread.from}, it would go as a reply in the thread of their RFQ email ("${data.rfqThread.subject}").`}
            </p>
          )}
          {!data.canDeliver && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Email is not set up on this server: the message is recorded here but does not leave
              it. Download the PDF and send it from your own mail instead.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                send.mutate({ to: toValue, message: messageValue, copyMe, customerLink })
              }
              disabled={send.isPending || !parsed.ok}
            >
              {send.isPending ? "Sending…" : "Send email"}
            </Button>
            {!parsed.ok && toValue.trim() !== "" && (
              <span className="text-sm text-red-700">{parsed.error}</span>
            )}
            {send.isSuccess && !send.isPending && (
              <span className="text-sm text-green-800">
                {send.data.delivered ? "Sent." : "Recorded (not delivered: no mail provider)."}
              </span>
            )}
          </div>
          <ErrorText error={send.error} />
        </div>
      )}
      {!open && data.items.length === 0 && (
        <p className="text-sm text-stone-600">Not emailed from the app.</p>
      )}
      {data.items.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-stone-500">
            <tr>
              <th className="py-1 pr-2 font-medium">When</th>
              <th className="py-1 pr-2 font-medium">To</th>
              <th className="py-1 pr-2 font-medium">By</th>
              <th className="py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id} className="border-t border-stone-100 align-top">
                <td className="py-1 pr-2 whitespace-nowrap">
                  {e.createdAt.slice(0, 16).replace("T", " ")}
                </td>
                <td className="py-1 pr-2 break-all">{e.to.join(", ")}</td>
                <td className="py-1 pr-2">{e.sentByName ?? "a former member"}</td>
                <td className="py-1">
                  <Badge tone={e.status === "sent" ? (e.delivered ? "green" : "amber") : "red"}>
                    {e.status === "sent" && !e.delivered ? "not delivered" : EMAIL_STATUS[e.status]}
                  </Badge>
                  {e.error && <div className="text-xs text-red-700">{e.error}</div>}
                  {e.senderCopy && (
                    <div
                      className={
                        e.senderCopy === "sent" ? "text-xs text-stone-500" : "text-xs text-red-700"
                      }
                    >
                      {e.senderCopy === "sent" ? "copy to sender" : "copy to sender failed"}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const customerLinksKey = (orgId: string, quoteId: string) => ["customer-links", orgId, quoteId];

/**
 * Customer links (shared/customer-link.ts): the customer's answer when there is one, the links
 * made for this quote, and "Copy a customer link" for sending the link from your own mail.
 */
function CustomerLinks({
  orgId,
  quote,
  canEdit,
  onAnswered,
}: {
  orgId: string;
  quote: QuoteDetailDto;
  canEdit: boolean;
  onAnswered: () => void;
}) {
  const key = customerLinksKey(orgId, quote.id);
  const path = orgApi(orgId, `/quotes/${quote.id}/customer-links`);
  const links = useQuery({ queryKey: key, queryFn: () => api<CustomerLinksDto>(path) });
  const [made, setMade] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api<CreatedCustomerLinkDto>(path, { method: "POST" }),
    onSuccess: (d) => {
      setMade(d.url);
      queryClient.setQueryData(key, d.links);
    },
  });
  const revoke = useMutation({
    mutationFn: () => api<CustomerLinksDto>(path, { method: "DELETE" }),
    onSuccess: (d) => {
      setMade(null);
      queryClient.setQueryData(key, d);
    },
  });
  const d = links.data;
  const answered = d?.response?.createdAt;
  // The quote's own status moves when the customer answers; refresh it once the answer shows up.
  useEffect(() => {
    if (answered && quote.status === "sent") onAnswered();
  }, [answered, quote.status, onAnswered]);
  if (!d) return <ErrorText error={links.error} />;
  const live = d.links.filter((l) => !l.revokedAt);
  if (!d.response && d.links.length === 0 && !(d.canCreate && canEdit)) return null;
  const r = d.response;
  return (
    <Card title="Customer's answer online">
      {r ? (
        <div className="text-sm text-stone-700">
          <p>
            <Badge tone={r.decision === "accepted" ? "green" : "red"}>{r.decision}</Badge> by{" "}
            {r.name}
            {r.email ? ` (${r.email})` : ""} on {r.createdAt.slice(0, 16).replace("T", " ")}
            {r.poNumber ? `, PO ${r.poNumber}` : ""}
          </p>
          {r.choices.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {r.choices.map((c) => (
                <li key={c.lineId}>
                  {c.partNumber}: {c.quantity} at {money(c.unitPriceCents)} = {money(c.totalCents)}
                </li>
              ))}
            </ul>
          )}
          {r.amountCents != null && <p className="font-medium">Total {money(r.amountCents)}</p>}
          {r.note && <p className="mt-1 whitespace-pre-wrap text-stone-600">{r.note}</p>}
          <p className="mt-1 text-xs text-stone-500">
            Typed by whoever opened the link: check the PO before starting work. You can still
            correct the outcome above.
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-600">
          {live.length === 0
            ? "No customer link yet. Emailing the quote with the box ticked adds one, or copy one here to send from your own mail."
            : "Not answered yet."}
        </p>
      )}
      {d.links.length > 0 && (
        <ul className="mt-2 text-xs text-stone-600">
          {d.links.map((l) => (
            <li key={l.id}>
              {l.emailed ? "Emailed" : "Copied"} {l.createdAt.slice(0, 16).replace("T", " ")}
              {l.createdByName ? ` by ${l.createdByName}` : ""}
              {" · "}
              {l.revokedAt
                ? "turned off"
                : l.lastViewedAt
                  ? `opened ${l.lastViewedAt.slice(0, 16).replace("T", " ")}`
                  : "not opened yet"}
            </li>
          ))}
        </ul>
      )}
      {made && (
        <div className="mt-2 flex flex-col gap-1">
          <Field label="The link (shown once: copy it now)">
            <Input readOnly value={made} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <p className="text-xs text-stone-500">
            Anyone with this link can see the quote and accept or decline it. Send it only to the
            customer.
          </p>
        </div>
      )}
      {canEdit && (d.canCreate || live.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {d.canCreate && (
            <Button variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
              Copy a customer link
            </Button>
          )}
          {live.length > 0 && (
            <Button variant="ghost" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
              Turn off this quote's links
            </Button>
          )}
        </div>
      )}
      <ErrorText error={create.error ?? revoke.error} />
    </Card>
  );
}
