// RFQ review: the extracted, editable part form. Every extracted value shows the RFQ text it came
import { drilledHoleSizes } from "@shared/costing";
import {
  CAD_UNITS,
  type CadUnit,
  type GeometryConfidence,
  type GeometryFeatures,
  holeLocationMeasures,
  unitsUnconfirmed,
} from "@shared/geometry";
// from; dropped values are listed as warnings. Only confirmed parts go onto a quote.

import type {
  PartHistoryItemDto,
  QuoteDetailDto,
  RateCardDto,
  RfqDetailDto,
  RfqPartDto,
  RfqPartHistoryDto,
} from "@shared/api";
import { quoteLabel } from "@shared/quote-label";
import { revisionMatchesForPrefill } from "@shared/repeat-parts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
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
import { api, money, orgApi, parseQuantities, queryClient } from "../lib/api";
import { canEstimate, useOrg, useOrgId, useShopDay } from "./layout";

export function RfqDetailPage() {
  const orgId = useOrgId();
  const { rfqId } = useParams({ strict: false }) as { rfqId: string };
  const navigate = useNavigate();
  const org = useOrg(orgId);
  const editable = canEstimate(org.data?.role);
  const key = ["rfq", orgId, rfqId];
  const rfq = useQuery({
    queryKey: key,
    queryFn: () => api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}`)),
  });
  const card = useQuery({
    queryKey: ["rate-card", orgId],
    queryFn: () => api<RateCardDto>(orgApi(orgId, "/rate-card")),
  });
  const setData = (d: RfqDetailDto) => queryClient.setQueryData(key, d);
  const extract = useMutation({
    mutationFn: () =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/extract`), { method: "POST" }),
    onSuccess: setData,
  });
  const addPart = useMutation({
    mutationFn: () =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/parts`), {
        method: "POST",
        body: { quantities: [] },
      }),
    onSuccess: setData,
  });
  // A CAD file over 1 MB is measured on request, one file per request (services/rfq measureFile).
  const measure = useMutation({
    mutationFn: (fileId: string) =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/files/${fileId}/measure`), {
        method: "POST",
      }),
    onSuccess: setData,
  });
  // A CAD file that states no unit (an STL, some DXFs): the estimator says which, and it is measured again.
  const setUnits = useMutation({
    mutationFn: (v: { fileId: string; units: CadUnit }) =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/files/${v.fileId}/units`), {
        method: "POST",
        body: { units: v.units },
      }),
    onSuccess: setData,
  });
  const createQuote = useMutation({
    mutationFn: () =>
      api<QuoteDetailDto>(orgApi(orgId, "/quotes"), { method: "POST", body: { rfqId } }),
    onSuccess: (q) =>
      navigate({ to: "/app/$orgId/quotes/$quoteId", params: { orgId, quoteId: q.id } }),
  });
  const r = rfq.data;
  // Repeat parts, part 2: each part's earlier quotes, refetched when a part number or revision changes.
  const partsKey = (r?.parts ?? []).map((p) => `${p.id}:${p.partNumber}:${p.revision}`).join("|");
  const history = useQuery({
    queryKey: ["rfq-part-history", orgId, rfqId, partsKey],
    queryFn: () => api<RfqPartHistoryDto>(orgApi(orgId, `/rfqs/${rfqId}/part-history`)),
    enabled: !!r && r.parts.length > 0,
  });
  if (!r || !card.data) return <ErrorText error={rfq.error ?? card.error} />;
  const confirmed = r.parts.filter((p) => p.confirmed).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-stone-900">{r.subject || "RFQ"}</h1>
        <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
        <div className="ml-auto flex gap-2">
          {r.quoteIds.map((id, i) => (
            <Link
              key={id}
              to="/app/$orgId/quotes/$quoteId"
              params={{ orgId, quoteId: id }}
              className="text-sm text-sky-800 underline"
            >
              Quote {i + 1}
            </Link>
          ))}
          {editable && (
            <>
              <Button
                variant="secondary"
                onClick={() => extract.mutate()}
                disabled={extract.isPending}
              >
                {extract.isPending
                  ? "Extracting…"
                  : r.extractedAt
                    ? "Re-extract"
                    : "Extract with AI"}
              </Button>
              <Button
                onClick={() => createQuote.mutate()}
                disabled={confirmed === 0 || createQuote.isPending}
                title={confirmed === 0 ? "Confirm at least one part" : undefined}
              >
                Quote {confirmed} confirmed part{confirmed === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      </div>
      <ErrorText error={extract.error ?? createQuote.error} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <Customer orgId={orgId} rfq={r} editable={editable} onSaved={setData} />
          {(r.extractionWarnings.length > 0 || r.missingInfo.length > 0) && (
            <Card title="Check before quoting">
              {r.extractionWarnings.map((w) => (
                <p key={w} className="mb-1 text-sm text-amber-800">
                  ⚠ {w}
                </p>
              ))}
              {r.missingInfo.length > 0 && (
                <>
                  <p className="mt-2 text-sm font-medium">Not in the RFQ (ask the customer):</p>
                  <ul className="list-disc pl-5 text-sm">
                    {r.missingInfo.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
          <Card title="Source">
            {r.source === "email" && (
              <p className="mb-2 text-sm text-stone-600">
                Received by email{r.fromAddress ? ` from ${r.fromAddress}` : ""}.
              </p>
            )}
            {r.intakeNotes.map((n) => (
              <p key={n} className="mb-1 text-sm text-amber-800">
                ⚠ {n}
              </p>
            ))}
            {r.files.map((f) => (
              <div key={f.id} className="mb-1 text-sm">
                <a
                  className="text-sky-800 underline"
                  href={orgApi(orgId, `/rfqs/${rfqId}/files/${f.id}/download`)}
                >
                  {f.fileName}
                </a>{" "}
                {f.pageCount !== null && (
                  <span className="text-stone-500">
                    ({f.pageCount} page{f.pageCount === 1 ? "" : "s"}){" "}
                  </span>
                )}
                {f.conversionError && <span className="text-red-700">({f.conversionError})</span>}
                {/* A PDF that read without error but gave no text is usually a scan: the extractor
                    saw nothing in it, so say so rather than let an empty part look complete. */}
                {f.mimeType === "application/pdf" && !f.hasText && !f.conversionError && (
                  <span className="text-amber-800">
                    (no text read from it, likely a scan: check the drawing and enter what it says
                    by hand)
                  </span>
                )}
                {f.geometry && (
                  <GeometrySummary
                    g={f.geometry}
                    onUnits={
                      editable ? (units) => setUnits.mutate({ fileId: f.id, units }) : undefined
                    }
                    busy={setUnits.isPending && setUnits.variables?.fileId === f.id}
                  />
                )}
                {f.geometryPending && (
                  <span className="text-stone-600">
                    Not measured yet (over 1 MB, so the upload skips it).{" "}
                    {editable && (
                      <Button
                        variant="secondary"
                        onClick={() => measure.mutate(f.id)}
                        disabled={measure.isPending}
                      >
                        {measure.isPending && measure.variables === f.id ? "Measuring…" : "Measure"}
                      </Button>
                    )}
                  </span>
                )}
              </div>
            ))}
            {setUnits.error && <ErrorText error={setUnits.error} />}
            {measure.error && (
              <>
                <ErrorText error={measure.error} />
                <p className="text-sm text-stone-600">
                  Try again, or enter the blank size and operations by hand.
                </p>
              </>
            )}
            <AllowanceNote a={r.allowance} />
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs">
              {r.bodyText || "(no email text)"}
            </pre>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {r.parts.map((p) => (
            <PartForm
              key={`${p.id}-${p.confirmed}`}
              orgId={orgId}
              rfqId={rfqId}
              part={p}
              card={card.data}
              editable={editable}
              onSaved={setData}
              history={history.data?.parts.find((h) => h.rfqPartId === p.id)?.items ?? []}
              prefillOn={card.data.settings.prefillRepeatParts}
              geometry={r.files.find((f) => f.id === p.geometryFileId)?.geometry ?? null}
            />
          ))}
          {r.parts.length === 0 && (
            <p className="text-sm text-stone-600">
              No parts yet. Extract with AI or add one by hand.
            </p>
          )}
          {editable && (
            <Button variant="secondary" onClick={() => addPart.mutate()}>
              Add part by hand
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Customer({
  orgId,
  rfq,
  editable,
  onSaved,
}: {
  orgId: string;
  rfq: RfqDetailDto;
  editable: boolean;
  onSaved: (d: RfqDetailDto) => void;
}) {
  const [f, setF] = useState({
    company: rfq.customerCompany ?? "",
    contact: rfq.customerContact ?? "",
    email: rfq.customerEmail ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfq.id}`), {
        method: "PATCH",
        body: {
          customerCompany: f.company || null,
          customerContact: f.contact || null,
          customerEmail: f.email || null,
        },
      }),
    onSuccess: onSaved,
  });
  return (
    <Card
      title="Customer"
      actions={
        editable && (
          <Button variant="secondary" onClick={() => save.mutate()}>
            Save
          </Button>
        )
      }
    >
      <fieldset disabled={!editable} className="flex flex-col gap-2">
        <Field label="Company">
          <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        </Field>
        <Field label="Contact">
          <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
      </fieldset>
      <ErrorText error={save.error} />
    </Card>
  );
}

function Source({ part, field }: { part: RfqPartDto; field: string }) {
  const s = part.sources[field];
  if (!s || s.status === "absent") return null;
  if (s.status === "dropped")
    return (
      <span className="text-xs text-amber-700">
        AI value dropped: not supported by the RFQ text
      </span>
    );
  return <span className="text-xs text-stone-500">From the RFQ: “{s.quote}”</span>;
}

function PartForm({
  orgId,
  rfqId,
  part,
  card,
  editable,
  onSaved,
  history,
  prefillOn,
  geometry,
}: {
  orgId: string;
  rfqId: string;
  part: RfqPartDto;
  card: RateCardDto;
  editable: boolean;
  onSaved: (d: RfqDetailDto) => void;
  history: PartHistoryItemDto[];
  prefillOn: boolean;
  geometry: GeometryFeatures | null;
}) {
  const [f, setF] = useState({
    partNumber: part.partNumber ?? "",
    revision: part.revision ?? "",
    description: part.description ?? "",
    materialText: part.materialText ?? "",
    materialId: part.materialId ?? "",
    quantities: part.quantities.join(", "),
    tolerances: part.tolerances ?? "",
    finishText: part.finishText ?? "",
    finishingOpIds: part.finishingOpIds,
    tappedHoleDiametersIn: part.tappedHoleDiametersIn,
    dueDate: part.dueDate ?? "",
    notes: part.notes ?? "",
  });
  const body = (confirmed: boolean) => ({
    partNumber: f.partNumber.trim() || null,
    revision: f.revision.trim() || null,
    description: f.description.trim() || null,
    materialText: f.materialText.trim() || null,
    materialId: f.materialId || null,
    quantities: parseQuantities(f.quantities),
    tolerances: f.tolerances.trim() || null,
    finishText: f.finishText.trim() || null,
    finishingOpIds: f.finishingOpIds,
    tappedHoleDiametersIn: f.tappedHoleDiametersIn,
    dueDate: f.dueDate || null,
    notes: f.notes.trim() || null,
    confirmed,
  });
  const save = useMutation({
    mutationFn: (confirmed: boolean) =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/parts/${part.id}`), {
        method: "PATCH",
        body: body(confirmed),
      }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () =>
      api<RfqDetailDto>(orgApi(orgId, `/rfqs/${rfqId}/parts/${part.id}`), { method: "DELETE" }),
    onSuccess: onSaved,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const activeMaterials = card.materials.filter((m) => m.active || m.id === f.materialId);
  const activeFinishing = card.finishingOps.filter(
    (o) => o.active || f.finishingOpIds.includes(o.id),
  );
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {f.partNumber || "New part"}
          {part.confirmed ? (
            <Badge tone="green">confirmed</Badge>
          ) : (
            <Badge tone="amber">needs review</Badge>
          )}
          {part.origin === "llm" && <Badge tone="sky">AI-extracted</Badge>}
        </span>
      }
      actions={
        editable && (
          <>
            <Button variant="ghost" onClick={() => remove.mutate()}>
              Remove
            </Button>
            <Button variant="secondary" onClick={() => save.mutate(false)}>
              Save
            </Button>
            <Button onClick={() => save.mutate(true)}>{part.confirmed ? "Save" : "Confirm"}</Button>
          </>
        )
      }
    >
      <fieldset disabled={!editable} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Part number" hint={<Source part={part} field="partNumber" />}>
          <Input value={f.partNumber} onChange={set("partNumber")} />
        </Field>
        <Field label="Revision" hint={<Source part={part} field="revision" />}>
          <Input value={f.revision} onChange={set("revision")} />
        </Field>
        <Field label="Description" hint={<Source part={part} field="description" />}>
          <Input value={f.description} onChange={set("description")} />
        </Field>
        <Field label="Quantities" hint={<Source part={part} field="quantities" />}>
          <Input value={f.quantities} onChange={set("quantities")} placeholder="10, 50, 100" />
        </Field>
        <Field label="Material (as written)" hint={<Source part={part} field="material" />}>
          <Input value={f.materialText} onChange={set("materialText")} />
        </Field>
        <Field
          label="Rate-card material"
          hint={
            part.materialId && f.materialId === part.materialId && !part.confirmed
              ? "Suggested from the grade; check it"
              : undefined
          }
        >
          <Select value={f.materialId} onChange={set("materialId")}>
            <option value="">— choose —</option>
            {activeMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tolerances" hint={<Source part={part} field="tolerances" />}>
          <Input value={f.tolerances} onChange={set("tolerances")} />
        </Field>
        <Field label="Due date" hint={<Source part={part} field="dueDate" />}>
          <Input type="date" value={f.dueDate} onChange={set("dueDate")} />
        </Field>
        <Field label="Finish (as written)" hint={<Source part={part} field="finish" />}>
          <Input value={f.finishText} onChange={set("finishText")} />
        </Field>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">Rate-card finishing</span>
          {activeFinishing.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.finishingOpIds.includes(o.id)}
                onChange={(e) =>
                  setF({
                    ...f,
                    finishingOpIds: e.target.checked
                      ? [...f.finishingOpIds, o.id]
                      : f.finishingOpIds.filter((x) => x !== o.id),
                  })
                }
              />
              {o.name}
            </label>
          ))}
        </div>
        <ThreadedHoles
          geometry={geometry}
          card={card}
          value={f.tappedHoleDiametersIn}
          onChange={(tappedHoleDiametersIn) => setF({ ...f, tappedHoleDiametersIn })}
        />
        <div className="md:col-span-2">
          <Field label="Notes">
            <Textarea rows={2} value={f.notes} onChange={set("notes")} />
          </Field>
        </div>
      </fieldset>
      <RfqPartHistory orgId={orgId} part={part} items={history} prefillOn={prefillOn} />
      <ErrorText error={save.error ?? remove.error} />
    </Card>
  );
}

/**
 * Repeat parts, part 2: the shop's earlier quotes of this part number on the review screen, before a
 * quote exists (services/quotes/history.ts, rfqPartHistory). Prices are shown for reference only;
 * when the shop pre-fills repeat parts, a won quote of the same revision says the new line will
 * start from its inputs, priced from today's rate card.
 */
function RfqPartHistory({
  orgId,
  part,
  items,
  prefillOn,
}: {
  orgId: string;
  part: RfqPartDto;
  items: PartHistoryItemDto[];
  prefillOn: boolean;
}) {
  const shopDayOf = useShopDay(orgId);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const won = items.filter((h) => h.status === "won");
  const wonSameRev = won.filter((h) => revisionMatchesForPrefill(h.revision, part.revision));
  return (
    <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-2 text-sm">
      <button
        type="button"
        className="font-medium text-sky-900 underline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Quoted before: {items.length} earlier quote{items.length === 1 ? "" : "s"}
        {won.length > 0 && `, ${won.length} won`}
      </button>
      {wonSameRev.length > 0 && (
        <p className="mt-1 text-xs text-stone-700">
          {prefillOn
            ? "The new quote starts this line from the last won quote of this revision (its material, operations and finishing), priced from today's rate card. Check it before sending."
            : 'Won before at this revision. Turn on "Pre-fill repeat parts" in the rate card to start new quotes from the last won one.'}
        </p>
      )}
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
              </div>
              <div className="mt-1 text-stone-700">
                {h.breaks.length > 0
                  ? h.breaks.map((b) => `${b.quantity} @ ${money(b.unitPriceCents)}`).join(" · ")
                  : "Not priced"}
                {h.material && ` · ${h.material}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Geometry, tapping: a STEP model rarely carries threads, so the estimator marks which drilled hole
 * sizes are tapped and the quote adds a "Tap from CAD" operation at the rate card's seconds per
 * tapped hole (suggestTappingOperation). Shown only for a STEP solid whose holes were measured with
 * better than low confidence.
 */
function ThreadedHoles({
  geometry,
  card,
  value,
  onChange,
}: {
  geometry: GeometryFeatures | null;
  card: RateCardDto;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const holes = geometry ? holeLocationMeasures(geometry) : null;
  const sizes = holes ? drilledHoleSizes(holes) : [];
  if (sizes.length === 0) return null;
  const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  const tappers = card.machines.filter((m) => m.active && (m.secondsPerTappedHole ?? 0) > 0);
  return (
    <div className="flex flex-col gap-1 text-sm md:col-span-2">
      <span className="font-medium text-stone-700">Threaded holes (from the CAD file)</span>
      <span className="text-xs text-stone-500">
        STEP files rarely say which holes are tapped. Tick the sizes that are, and the quote adds a
        tapping operation.
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sizes.map((s) => (
          <label key={s.diameterIn} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.some((d) => same(d, s.diameterIn))}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, s.diameterIn]
                    : value.filter((d) => !same(d, s.diameterIn)),
                )
              }
            />
            {s.count}× Ø{s.diameterIn} in
          </label>
        ))}
      </div>
      {value.length > 0 && tappers.length !== 1 && (
        <span className="text-xs text-amber-700">
          {tappers.length === 0
            ? "No machine on the rate card has a seconds per tapped hole yet, so the quote cannot time the tapping. Add one under Machines."
            : "More than one machine has a seconds per tapped hole, so the quote leaves tapping for you to add to the right one."}
        </span>
      )}
    </div>
  );
}

function GeometrySummary({
  g,
  onUnits,
  busy,
}: {
  g: GeometryFeatures;
  onUnits?: (units: CadUnit) => void;
  busy?: boolean;
}) {
  const bb = g.boundingBoxIn;
  const low = (c: GeometryConfidence | undefined) =>
    c === "low" ? <span className="text-amber-700"> (low confidence)</span> : null;
  return (
    <div className="ml-4 text-xs text-stone-600">
      {g.flat ? (
        <div>
          Flat pattern {g.flat.blankIn.widthIn}×{g.flat.blankIn.heightIn} in
          {low(g.confidence?.boundingBox)} · cut {g.flat.cutLengthIn} in · {g.flat.pierceCount}{" "}
          pierces · {g.flat.bendLineCount} bend lines · net {g.flat.netAreaIn2} in²
        </div>
      ) : (
        <div>
          {bb.xIn}×{bb.yIn}×{bb.zIn} in{low(g.confidence?.boundingBox)} ·{" "}
          {g.volumeIn3 === null ? "volume not measured" : `${g.volumeIn3} in³`}
          {g.volumeIn3 !== null && low(g.confidence?.volume)}
        </div>
      )}
      {g.units && (
        <div className={unitsUnconfirmed(g) ? "text-amber-800" : undefined}>
          {unitsUnconfirmed(g)
            ? `The file does not say its units; read as ${UNIT_NAME[g.units.read]}, so nothing is suggested from it yet. Which units was it drawn in?`
            : `Units: ${UNIT_NAME[g.units.read]} (chosen by an estimator; the file does not say).`}{" "}
          {onUnits &&
            CAD_UNITS.map((u) => (
              <Button
                key={u}
                variant="secondary"
                disabled={busy || (!unitsUnconfirmed(g) && g.units?.read === u)}
                onClick={() => onUnits(u)}
              >
                {UNIT_NAME[u]}
              </Button>
            ))}
        </div>
      )}
      {g.holes.length > 0 && (
        <div>
          Holes:{" "}
          {g.holes
            .map((h) => `${h.count}× Ø${h.diameterIn}${h.depthIn ? ` × ${h.depthIn} deep` : ""}`)
            .join(", ")}
        </div>
      )}
      {g.flags?.map((fl) => (
        <div key={fl.code} className="text-amber-700">
          {fl.message}
        </div>
      ))}
    </div>
  );
}

const UNIT_NAME: Record<CadUnit, string> = { mm: "millimetres", in: "inches" };

/** How this RFQ counts against the plan: once per 10 drawing pages, at least once. */
function AllowanceNote({ a }: { a: RfqDetailDto["allowance"] }) {
  const rfqs = (n: number) => `${n} RFQ${n === 1 ? "" : "s"}`;
  const pages = `${a.pages} drawing page${a.pages === 1 ? "" : "s"}`;
  let text: string;
  if (a.counted === 0) {
    text = `${pages}: the AI's first read counts as ${rfqs(a.units)} of this month's allowance.`;
  } else if (a.units > a.counted) {
    text = `${pages}: counted as ${rfqs(a.counted)} so far; the next AI read counts ${rfqs(a.units - a.counted)} more.`;
  } else {
    text = `${pages}: counted as ${rfqs(a.counted)}. Reading it again is free.`;
  }
  return (
    <p className="mt-2 text-xs text-stone-500">{text} An RFQ counts once per 10 drawing pages.</p>
  );
}
