// Import the rate card from the shop's own sheet: pick a file (.xlsx, CSV) or paste rows copied from
// Excel or Google Sheets, see every row as "new" or "updates" with what changes, then save all of
// them at once. Cut speeds by material import the same way from the shop's cut chart, matched by
// machine and material name (src/shared/cut-speed-import.ts), and so do removal rates and drill feeds
// by material (src/shared/material-rate-import.ts). The file is read in the browser and never uploaded; only the confirmed rows are sent,
// and the Worker matches and validates them again (services/ratecard importRateCard). Shop settings
// (markups, the line minimum, quote days, default quantities) read from label/value rows of the same
// sheet (src/shared/settings-import.ts) and save through the settings editor's own PATCH.
// Materials (price lists, part 2b): the preview shows each row's price move ("$4.25/lb, up 6.3% from
// $4.00/lb") and the open quotes priced at another price for it, and the admin can name the
// supplier's sheet and its date, which each imported price's history row keeps.
import type {
  MaterialPriceImpactDto,
  PriceListSource,
  RateCardDto,
  RateCardImportResultDto,
} from "@shared/api";
import { formatMoney } from "@shared/currency";
import {
  cutSpeedTemplateCsv,
  exportCutSpeedCsv,
  planCutSpeedImport,
  readCutSpeedSheet,
} from "@shared/cut-speed-import";
import { priceChangeText } from "@shared/material-price";
import {
  type ImportPriceMove,
  importPriceMoves,
  type MaterialImpact,
} from "@shared/material-price-impact";
import {
  exportMaterialRateCsv,
  type MaterialRateKind,
  materialRateCount,
  materialRateTemplateCsv,
  planMaterialRateImport,
  readMaterialRateSheet,
} from "@shared/material-rate-import";
import { quoteLabel } from "@shared/quote-label";
import {
  exportRateCsv,
  planRateImport,
  type RateImportKind,
  type RateSheet,
  readRateSheet,
  templateCsv,
} from "@shared/rate-card-import";
import {
  type RateCardSheetKind,
  rateCardWorkbook,
  sheetKindFor,
  WORKBOOK_TABS,
} from "@shared/rate-card-workbook";
import {
  exportSettingsCsv,
  planSettingsImport,
  readSettingsSheet,
  type SettingsPatch,
  settingsTemplateCsv,
} from "@shared/settings-import";
import { parseCsv, readSheetFile, type Sheet } from "@shared/sheet";
import { XLSX_MIME } from "@shared/sheet/xlsx-write";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select, Textarea } from "../components/ui";
import { ApiError, api, orgApi, queryClient } from "../lib/api";

/** What the sheet holds: one rate kind, or a table by machine and material (cut chart, rates, feeds). */
type SheetKind = RateCardSheetKind;
const isMaterialRate = (k: SheetKind): k is MaterialRateKind =>
  k === "removal-rates" || k === "drill-feeds";
/** Tables keyed by machine and material name rather than by one rate's name. */
const isPairSheet = (k: SheetKind) => k === "cut-speeds" || isMaterialRate(k);

const KINDS: { kind: SheetKind; label: string }[] = [
  {
    kind: "settings",
    label: "Shop settings (markups, line minimum, quantities, fallout, lead time, terms)",
  },
  { kind: "machines", label: "Machines and work centers" },
  { kind: "materials", label: "Materials" },
  { kind: "cut-speeds", label: "Cut speeds by material (cut chart)" },
  { kind: "removal-rates", label: "Removal rates by material (roughing)" },
  { kind: "drill-feeds", label: "Drill feeds by material" },
  { kind: "finishing-ops", label: "Finishing and outside services" },
];

function existingFor(card: RateCardDto, kind: RateImportKind) {
  return kind === "machines"
    ? card.machines
    : kind === "materials"
      ? card.materials
      : card.finishingOps;
}

/** How many rows of this kind the card has now (for "download the N rates"). */
const countOf = (card: RateCardDto, kind: Exclude<SheetKind, "settings">) =>
  kind === "cut-speeds"
    ? card.cutSpeeds.length
    : isMaterialRate(kind)
      ? materialRateCount(kind, card)
      : existingFor(card, kind).length;

/** The paste box's example, amounts in the shop's currency (the import refuses any other). */
const PLACEHOLDER = (kind: SheetKind, currency: string | null) =>
  kind === "settings"
    ? `Labor markup\t15%\nMaterial markup\t20%\nMinimum line charge\t${formatMoney(15_000, currency, { dropZeroCents: true })}\nDefault quantities\t1, 5, 10, 25`
    : kind === "cut-speeds"
      ? "Machine\tMaterial\tCut speed (in/min)\tPierce (s)\nFiber laser\tA36 plate 0.25 in\t110\t1.2"
      : kind === "removal-rates"
        ? "Machine\tMaterial\tRemoval rate (in3/min)\nHaas VF-2\t6061-T6 plate\t4.5"
        : kind === "drill-feeds"
          ? "Machine\tMaterial\tDrill feed (in/min)\nHaas VF-2\t304 stainless\t3"
          : `Machine\tKind\tHourly rate\nHaas VF-2\t3-axis mill\t${formatMoney(9_500, currency, { dropZeroCents: true })}`;

/** "speed", "rate" or "feed", for "download the N rates". */
const unitWord = (kind: SheetKind) =>
  kind === "cut-speeds" ? "speed" : kind === "drill-feeds" ? "feed" : "rate";

function downloadCsv(fileName: string, text: string) {
  downloadBlob(fileName, new Blob([text], { type: "text/csv;charset=utf-8" }));
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const downloadTemplate = (kind: SheetKind) =>
  downloadCsv(
    `rate-card-${kind}.csv`,
    kind === "settings"
      ? settingsTemplateCsv()
      : kind === "cut-speeds"
        ? cutSpeedTemplateCsv()
        : isMaterialRate(kind)
          ? materialRateTemplateCsv(kind)
          : templateCsv(kind),
  );

/** The card's current rates of one kind, in the layout the import reads back (the round trip). */
function downloadCurrent(card: RateCardDto, kind: SheetKind) {
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(
    `rate-card-${kind}-${day}.csv`,
    kind === "settings"
      ? exportSettingsCsv(card.settings)
      : kind === "cut-speeds"
        ? exportCutSpeedCsv(card)
        : isMaterialRate(kind)
          ? exportMaterialRateCsv(kind, card)
          : exportRateCsv(kind, existingFor(card, kind)),
  );
}

/** Every tab of the card in one .xlsx, each in the layout its import reads back. */
async function downloadWorkbook(card: RateCardDto) {
  const day = new Date().toISOString().slice(0, 10);
  const bytes = await rateCardWorkbook(card);
  downloadBlob(`rate-card-${day}.xlsx`, new Blob([bytes as BlobPart], { type: XLSX_MIME }));
}

/** The preview's view of a sheet and its plan, the same for rates and cut speeds. */
interface Preview {
  sheet: Omit<RateSheet, "kind" | "rows"> & { rows: { row: number; values: unknown }[] };
  plan: {
    rows: {
      row: number;
      name: string;
      action: "create" | "update";
      changes: string[];
      reactivates?: boolean;
      warnings: string[];
      /** Rate kinds: the card row it updates and the row as it would be saved. */
      id?: string;
      values?: unknown;
    }[];
    errors: { row: number; message: string }[];
  } | null;
  /** Settings only: the PATCH body (the settings that change). */
  patch?: SettingsPatch;
}

function preview(kind: SheetKind, grid: string[][], card: RateCardDto): Preview {
  if (kind === "settings") {
    const s = readSettingsSheet(grid, card.settings.currency);
    const plan = s.fatal ? null : planSettingsImport(s.rows, card.settings);
    return {
      sheet: {
        headerRow: null,
        columns: [],
        ignored: s.ignored.map((i) => ({ header: `Row ${i.row}, "${i.label}"`, reason: i.reason })),
        errors: s.errors,
        skipped: [],
        fatal: s.fatal,
        rows: s.rows.map((r) => ({ row: r.row, values: r.value })),
      },
      plan: plan && {
        rows: plan.rows.map((r) => ({ ...r, action: "update" as const })),
        errors: plan.errors,
      },
      ...(plan ? { patch: plan.patch } : {}),
    };
  }
  if (kind === "cut-speeds" || isMaterialRate(kind)) {
    let sheet: ReturnType<typeof readCutSpeedSheet> | ReturnType<typeof readMaterialRateSheet>;
    let plan: Preview["plan"];
    if (isMaterialRate(kind)) {
      const s = readMaterialRateSheet(kind, grid);
      sheet = s;
      plan = s.fatal ? null : planMaterialRateImport(kind, s.rows, card);
    } else {
      const s = readCutSpeedSheet(grid);
      sheet = s;
      plan = s.fatal ? null : planCutSpeedImport(s.rows, card);
    }
    if (!plan) return { sheet, plan };
    // A row's own conversion notes ("1000 mm/min read as 39.3701 in/min") belong in the preview.
    const notes = new Map(sheet.rows.map((r) => [r.row, r.warnings]));
    return {
      sheet,
      plan: {
        ...plan,
        rows: plan.rows.map((r) => ({
          ...r,
          warnings: [...(notes.get(r.row) ?? []), ...r.warnings],
        })),
      },
    };
  }
  const sheet = readRateSheet(kind, grid, card.settings.currency);
  return {
    sheet,
    plan: sheet.fatal ? null : planRateImport(kind, sheet.rows, existingFor(card, kind)),
  };
}

export function RateCardImport({ orgId, card }: { orgId: string; card: RateCardDto }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SheetKind>("machines");
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [paste, setPaste] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [done, setDone] = useState<RateCardImportResultDto | null>(null);
  /** Open quotes the saved import touched (the preview is cleared once it saves). */
  const [doneTouched, setDoneTouched] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [listDate, setListDate] = useState("");

  const view: Preview | null = useMemo(() => {
    const grid = sheets ? (sheets[sheetIdx]?.grid ?? []) : paste.trim() ? parseCsv(paste) : null;
    return grid ? preview(kind, grid, card) : null;
  }, [sheets, sheetIdx, paste, kind, card]);
  const sheet = view?.sheet ?? null;
  const plan = view?.plan ?? null;
  const problems = [...(sheet?.errors ?? []), ...(plan?.errors ?? [])].sort(
    (a, b) => a.row - b.row,
  );

  // Materials: the price each row would change, and the open quotes priced at another price for
  // that material (asked of the Worker before saving; read only).
  const moves = useMemo(
    () => (kind === "materials" && plan ? importPriceMoves(plan.rows, card.materials) : []),
    [kind, plan, card.materials],
  );
  const proposed = moves.map((m) => ({
    materialId: m.materialId,
    pricingBasis: m.after.pricingBasis,
    pricePerLbCents: m.after.pricePerLbCents,
    stockPriceCents: m.after.stockPriceCents,
    pricePerFootCents: m.after.pricePerFootCents ?? null,
    pricePerCwtCents: m.after.pricePerCwtCents ?? null,
    pricePerMetreCents: m.after.pricePerMetreCents ?? null,
  }));
  const impact = useQuery({
    queryKey: ["rate-card", orgId, "price-impact-preview", JSON.stringify(proposed)],
    enabled: proposed.length > 0 && problems.length === 0,
    queryFn: () =>
      api<MaterialPriceImpactDto>(orgApi(orgId, "/rate-card/materials/price-impact/preview"), {
        method: "POST",
        body: { prices: proposed },
      }),
  });
  const moveByRow = new Map(moves.map((m) => [m.row, m]));
  const impactById = new Map((impact.data?.materials ?? []).map((m) => [m.materialId, m]));
  const touchedQuotes = new Set(
    (impact.data?.materials ?? []).flatMap((m) => m.quotes.map((q) => q.id)),
  );
  const priceList: PriceListSource = {
    ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
    ...(listDate ? { date: listDate } : {}),
  };
  const currency = card.settings.currency;

  const save = useMutation({
    mutationFn: async (): Promise<RateCardImportResultDto> => {
      if (kind === "settings") {
        const patch = view?.patch ?? {};
        if (Object.keys(patch).length > 0)
          await api(orgApi(orgId, "/settings"), { method: "PATCH", body: patch });
        return { created: 0, updated: Object.keys(patch).length };
      }
      return api<RateCardImportResultDto>(
        orgApi(orgId, isPairSheet(kind) ? `/rate-card/${kind}/import` : "/rate-card/import"),
        {
          method: "POST",
          body: {
            ...(isPairSheet(kind) ? {} : { kind }),
            ...(kind === "materials" && Object.keys(priceList).length > 0 ? { priceList } : {}),
            rows: (sheet?.rows ?? []).map((r) => ({ row: r.row, values: r.values })),
          },
        },
      );
    },
    onSuccess: (res) => {
      setDone(res);
      setDoneTouched(kind === "materials" ? touchedQuotes.size : 0);
      setSheets(null);
      setPaste("");
      void queryClient.invalidateQueries({ queryKey: ["rate-card", orgId] });
    },
  });

  async function pick(file: File | undefined) {
    setDone(null);
    setFileError(null);
    setSheets(null);
    if (!file) return;
    const res = await readSheetFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!res.ok) setFileError(res.error);
    else {
      // A workbook with named tabs (the whole-card download, or a shop's own): open the tab for the
      // kind already chosen, or else let the first tab's name choose the kind.
      const match = res.sheets.findIndex((s) => sheetKindFor(s.name) === kind);
      const idx = Math.max(match, 0);
      setSheets(res.sheets);
      setSheetIdx(idx);
      const named = res.sheets.length > 1 ? sheetKindFor(res.sheets[idx]?.name ?? "") : null;
      if (named) setKind(named);
    }
  }

  function chooseSheet(i: number) {
    setSheetIdx(i);
    setDone(null);
    const named = sheets ? sheetKindFor(sheets[i]?.name ?? "") : null;
    if (named) setKind(named);
  }

  const workbook = useMutation({ mutationFn: () => downloadWorkbook(card) });

  if (!open) {
    return (
      <Card
        title="Import from a spreadsheet"
        actions={
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Import…
          </Button>
        }
      >
        <p className="text-sm text-stone-600">
          Already keep your shop rates, material prices or finishing vendors in Excel or Google
          Sheets? Import them instead of typing each one.{" "}
          <WorkbookLink onClick={() => workbook.mutate()} pending={workbook.isPending} />
        </p>
      </Card>
    );
  }

  const canSave = !!plan && plan.rows.length > 0 && problems.length === 0 && !sheet?.fatal;

  return (
    <Card
      title="Import from a spreadsheet"
      actions={
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="What the sheet holds">
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as SheetKind);
                setDone(null);
              }}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="File (.xlsx or CSV, read on this computer, not uploaded)">
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </Field>
          {sheets && sheets.length > 1 && (
            <Field label="Worksheet">
              <Select value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {kind === "materials" && (
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Supplier (optional, kept in each new price's history)">
              <Input
                value={supplier}
                maxLength={120}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. the metal service center whose sheet this is"
              />
            </Field>
            <Field label="Price list date (optional)">
              <Input type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} />
            </Field>
          </div>
        )}
        {!sheets && (
          <Field label="…or paste the rows, header included, from Excel or Google Sheets">
            <Textarea
              rows={5}
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setDone(null);
              }}
              placeholder={PLACEHOLDER(kind, card.settings.currency)}
            />
          </Field>
        )}
        <p className="text-stone-600">
          {kind === "settings"
            ? 'Each setting is a row: its label ("Labor markup", "Material markup", "Outside service markup", "Minimum line charge", "Quote valid (days)", "Default quantities", "Default lead time", "Quote terms"), then its value; "(none)" empties the lead time or the terms. They can sit above a rate table on the same sheet; other rows are not read. '
            : kind === "cut-speeds"
              ? "Each row names a cutting machine and a material already on the card: a pair with a speed updates it, a new pair adds one. "
              : kind === "removal-rates"
                ? "Each row names a mill or lathe and a material already on the card, with its removal rate in in³/min (cm³/min and mm³/min columns are converted exactly): a pair with a rate updates it, a new pair adds one. "
                : kind === "drill-feeds"
                  ? "Each row names a drilling machine and a material already on the card, with its feed in in/min (a mm/min column is converted exactly; a feed per revolution is refused, since it needs the spindle speed): a pair with a feed updates it, a new pair adds one. "
                  : "Rows match the card by name: a name already on the card updates that rate, a new name adds one. "}
          Columns the sheet does not have, and blank cells, leave that value as it is. Quotes keep
          their saved prices until you press Re-price.{" "}
          <button
            type="button"
            className="text-sky-800 underline"
            onClick={() => downloadTemplate(kind)}
          >
            Download a blank sheet
          </button>
          {kind === "settings" ? (
            <>
              {" or "}
              <button
                type="button"
                className="text-sky-800 underline"
                onClick={() => downloadCurrent(card, kind)}
              >
                download the current settings
              </button>{" "}
              to edit and import back
            </>
          ) : (
            countOf(card, kind) > 0 && (
              <>
                {" or "}
                <button
                  type="button"
                  className="text-sky-800 underline"
                  onClick={() => downloadCurrent(card, kind)}
                >
                  download the{" "}
                  {countOf(card, kind) === 1
                    ? unitWord(kind)
                    : `${countOf(card, kind)} ${unitWord(kind)}s`}{" "}
                  on the card now
                </button>{" "}
                to edit and import back
              </>
            )
          )}
          . <WorkbookLink onClick={() => workbook.mutate()} pending={workbook.isPending} />
        </p>
        {workbook.isError && (
          <p className="text-red-700">
            The workbook could not be made in this browser: {String(workbook.error)}
          </p>
        )}
        {fileError && <p className="text-red-700">{fileError}</p>}
        {done && (
          <p className="rounded-md bg-green-50 p-2 text-green-900">
            {kind === "settings"
              ? `Saved: ${done.updated} setting${done.updated === 1 ? "" : "s"} changed. Quotes keep their saved prices until you press Re-price.`
              : `Saved: ${done.created} added, ${done.updated} updated.${
                  doneTouched > 0
                    ? " Drafts priced at the old prices need Re-price; sent quotes keep the price the customer saw."
                    : ""
                }`}
          </p>
        )}
        {sheet?.fatal && <p className="text-red-700">{sheet.fatal}</p>}
        {sheet && !sheet.fatal && (
          <>
            {sheet.headerRow !== null && (
              <p className="text-stone-600">
                Header on row {sheet.headerRow}. Reading{" "}
                {sheet.columns.map((c) => `"${c.header}" as ${c.label}`).join(", ")}.
              </p>
            )}
            {sheet.ignored.length > 0 && (
              <ul className="list-disc pl-5 text-amber-800">
                {sheet.ignored.map((i) => (
                  <li key={i.header}>
                    {kind === "settings" ? i.header : `Column "${i.header}"`} left out: {i.reason}.
                  </li>
                ))}
              </ul>
            )}
            {problems.length > 0 && (
              <div className="rounded-md bg-red-50 p-2 text-red-900">
                <p className="font-medium">
                  Fix {problems.length === 1 ? "this row" : `these ${problems.length} rows`} in the
                  sheet and choose it again. Nothing is saved until every row reads.
                </p>
                <ul className="list-disc pl-5">
                  {problems.map((p) => (
                    <li key={`${p.row}-${p.message}`}>
                      Row {p.row}: {p.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan && plan.rows.length > 0 && (
              <table className="w-full">
                <thead className="text-left text-stone-500">
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Action</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.row} className="border-t border-stone-100 align-top">
                      <td className="py-1">{r.row}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.action === "create" ? (
                          <Badge tone="sky">new</Badge>
                        ) : r.changes.length ? (
                          <Badge tone="amber">updates {r.changes.join(", ")}</Badge>
                        ) : (
                          <Badge>no change</Badge>
                        )}{" "}
                        {r.reactivates && <Badge tone="green">un-retires</Badge>}
                      </td>
                      <td className="text-stone-600">
                        {r.warnings.join("; ")}
                        <PriceMove
                          orgId={orgId}
                          move={moveByRow.get(r.row)}
                          impact={impactById}
                          currency={currency}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {moves.length > 0 && problems.length === 0 && (
              <p className="text-stone-700" data-testid="import-price-impact">
                This import changes{" "}
                {moves.length === 1 ? "1 material price" : `${moves.length} material prices`}.{" "}
                {impact.isPending
                  ? "Checking open quotes…"
                  : impact.error
                    ? "Open quotes could not be checked; the import can still be saved."
                    : touchedQuotes.size === 0
                      ? "No open quote was priced at the old prices."
                      : `${touchedQuotes.size === 1 ? "1 open quote was" : `${touchedQuotes.size} open quotes were`} priced at the old prices (listed by row): drafts need Re-price after saving, sent quotes keep the price the customer saw.`}
                {impact.data?.truncated &&
                  ` Only the newest ${impact.data.quotesRead} open quotes were checked.`}
              </p>
            )}
            {sheet.skipped.length > 0 && (
              <p className="text-stone-500">
                Skipped: {sheet.skipped.map((s) => `row ${s.row} (${s.message})`).join(", ")}.
              </p>
            )}
          </>
        )}
        <ErrorText error={save.error} />
        {save.error instanceof ApiError && Array.isArray(save.error.details) && (
          <ul className="list-disc pl-5 text-red-800">
            {(save.error.details as { row?: number; message?: string }[]).map((d) => (
              <li key={`${d.row}-${d.message}`}>
                Row {d.row}: {d.message}
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {plan && plan.rows.length > 0
              ? `Save ${plan.rows.length} row${plan.rows.length === 1 ? "" : "s"}`
              : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** "Download the whole rate card as one Excel file", shown open and closed. */
function WorkbookLink({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <>
      <button
        type="button"
        className="text-sky-800 underline disabled:opacity-50"
        disabled={pending}
        onClick={onClick}
      >
        Download the whole rate card as one Excel file
      </button>{" "}
      ({WORKBOOK_TABS.length} tabs: {WORKBOOK_TABS.map((t) => t.tab.toLowerCase()).join(", ")}),
      edit any tab and import it back here.
    </>
  );
}

/** A material row's price move in the import preview, and the open quotes priced at another price. */
function PriceMove({
  orgId,
  move,
  impact: impactById,
  currency,
}: {
  orgId: string;
  move: ImportPriceMove | undefined;
  impact: Map<string, MaterialImpact>;
  currency: string | null;
}) {
  if (!move) return null;
  const impact = impactById.get(move.materialId);
  return (
    <div>
      <span className="text-stone-800">
        Price: {priceChangeText(move.after, move.before, currency)}.
      </span>
      {impact && impact.quotes.length > 0 && (
        <>
          {" "}
          Open quotes priced at the old price:{" "}
          {impact.quotes.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ", "}
              <Link
                to="/app/$orgId/quotes/$quoteId"
                params={{ orgId, quoteId: q.id }}
                className="text-sky-800 underline"
              >
                {quoteLabel(q.quoteNumber, q.revNumber)}
              </Link>{" "}
              ({q.customerCompany}, {q.status})
            </span>
          ))}
          .
        </>
      )}
    </div>
  );
}
