// Import a roster or a training provider's completion export: choose the file, preview which people
// would be added or updated, say which training each course counts for, and apply. A workbook is read
// here in the browser and only the chosen sheet is sent as CSV; the server reads that text
// (src/shared/personnel-import.ts).

import { gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import type { Training } from "@shared/personnel";
import { type DateOrder, personRowsIn, TRAINING_CHOICES } from "@shared/personnel-import";
import { readXlsx } from "@shared/xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

type Field =
  | "email"
  | "jobTitle"
  | "cuiAccess"
  | "securityDuties"
  | "dutiesDescription"
  | "screenedOn"
  | "screeningMethod"
  | "accessGrantedOn"
  | "awarenessOn"
  | "roleBasedOn"
  | "insiderThreatOn"
  | "leftOn"
  | "departureKind"
  | "accessRemovedOn"
  | "notes";

export interface PeopleImportPreview {
  mode: "roster" | "completions";
  columns: Record<string, string | null>;
  dates: { order: DateOrder; source: "chosen" | "detected" | "default"; numeric: number };
  courses: { key: string; name: string; rows: number; counts: Training[] }[];
  changes: { line: number; name: string; kind: "new" | "update"; fields: Field[] }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  max: number;
  applied: boolean;
}

const FIELD_LABEL: Record<Field, string> = {
  email: "email",
  jobTitle: "job title",
  cuiAccess: "CUI access",
  securityDuties: "security duties",
  dutiesDescription: "duties",
  screenedOn: "screened on",
  screeningMethod: "screening",
  accessGrantedOn: "access granted",
  awarenessOn: "security awareness",
  roleBasedOn: "role-based training",
  insiderThreatOn: "insider threat training",
  leftOn: "left or transferred",
  departureKind: "departure",
  accessRemovedOn: "access removed",
  notes: "notes",
};

const COLUMN_LABEL: [string, string][] = [
  ["name", "Name"],
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["jobTitle", "Job title"],
  ["cuiAccess", "CUI access"],
  ["securityDuties", "Security duties"],
  ["dutiesDescription", "Duties"],
  ["screenedOn", "Screened on"],
  ["screeningMethod", "Screening"],
  ["accessGrantedOn", "Access granted on"],
  ["awarenessOn", "Security awareness (3.2.1)"],
  ["roleBasedOn", "Role-based (3.2.2)"],
  ["insiderThreatOn", "Insider threat (3.2.3)"],
  ["course", "Course"],
  ["status", "Status"],
  ["completedOn", "Completion date"],
  ["leftOn", "Left or transferred on"],
  ["departureKind", "Departure"],
  ["accessRemovedOn", "Access removed on (3.9.2)"],
  ["notes", "Notes"],
];

interface SheetOption {
  name: string;
  csv: string;
  rows: number;
}

export function PeopleImport({
  orgId,
  today,
  onClose,
}: {
  orgId: string;
  today: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetOption[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [dateOrder, setDateOrder] = useState<DateOrder | undefined>(undefined);
  const [courseMap, setCourseMap] = useState<Record<string, Training[]>>({});
  const sheetNote = sheets ? ` (${sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: (opts: {
      csv: string | null;
      apply: boolean;
      dateOrder?: DateOrder;
      courseMap: Record<string, Training[]>;
    }) =>
      api<PeopleImportPreview>(`/api/orgs/${orgId}/people/import`, {
        method: "POST",
        json: opts,
      }),
    onSuccess: (p) => {
      if (p.applied) qc.invalidateQueries({ queryKey: ["people", orgId] });
    },
  });
  const preview = run.data;
  const go = (
    apply: boolean,
    o?: { dateOrder?: DateOrder; courseMap?: Record<string, Training[]> },
  ) =>
    run.mutate({
      csv,
      apply,
      dateOrder: o && "dateOrder" in o ? o.dateOrder : dateOrder,
      courseMap: o?.courseMap ?? courseMap,
    });
  const reset = () => {
    run.reset();
    setDateOrder(undefined);
    setCourseMap({});
  };
  const rowWord = sheets ? "Row" : "Line";
  const added = preview?.changes.filter((c) => c.kind === "new").length ?? 0;
  const updated = (preview?.changes.length ?? 0) - added;
  const summary = `${added} new ${added === 1 ? "person" : "people"}, ${updated} updated`;
  const overCap = preview ? preview.existing + added > preview.max : false;
  const toggleCourse = (key: string, t: Training, on: boolean) => {
    const cur = courseMap[key] ?? [];
    const next = { ...courseMap, [key]: on ? [...cur, t] : cur.filter((x) => x !== t) };
    setCourseMap(next);
    go(false, { courseMap: next });
  };
  return (
    <Card
      title="Import people or training completions"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose a roster (.xlsx or CSV, such as this page's own export) or the completion report
          your training provider exports. A workbook is read in this browser and only the sheet you
          pick is sent. Columns are found by their headers: "Name" (or "First name" and "Last
          name"), "Email", and a column per date, such as "Security awareness training" or "Screened
          on". People are matched by email, or by name when there is no email. Blank cells leave
          what is recorded, and a training date is only taken when it is later than the one
          recorded.
        </p>
        <p>
          A completion report (a "Completion date" column, one row per course) only updates people
          already on this page, and you choose which requirement each course counts for: the import
          never guesses that from the course title.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Roster or training completion file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            reset();
            setCsv(null);
            setSheets(null);
            setFileError(null);
            if (!file) return;
            setFileName(file.name);
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!looksLikeWorkbook(bytes)) {
              setCsv(new TextDecoder().decode(bytes));
              return;
            }
            try {
              const options = (await readXlsx(bytes)).map((s) => {
                const text = gridToCsv(s.grid);
                return { name: s.name, csv: text, rows: personRowsIn(text, today) };
              });
              let best = 0;
              options.forEach((o, i) => {
                if (o.rows > (options[best]?.rows ?? 0)) best = i;
              });
              setSheets(options);
              setSheetIdx(best);
              setCsv(options[best]?.csv ?? null);
            } catch (err) {
              setFileError(err instanceof Error ? err.message : "This workbook could not be read.");
            }
          }}
        />
        {fileError && (
          <p role="alert" className="text-red-700">
            {fileError}
          </p>
        )}
        {sheets && sheets.length > 1 && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Sheet</span>
            <select
              className="rounded border border-stone-300 px-2 py-1"
              value={sheetIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                reset();
                setSheetIdx(idx);
                setCsv(sheets[idx]?.csv ?? null);
              }}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows} {s.rows === 1 ? "person" : "people"})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={!csv || run.isPending}
            onClick={() => go(false)}
          >
            Preview
          </button>
          {preview && !preview.applied && preview.changes.length > 0 && !overCap && (
            <button
              type="button"
              className={btnCls}
              disabled={run.isPending}
              onClick={() => go(true)}
            >
              Import ({summary})
            </button>
          )}
        </div>
        <ErrorText error={run.error} />
        {preview && (
          <div className="space-y-3">
            {preview.applied ? (
              <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-900">
                Imported from {fileName}
                {sheetNote}: {summary}.
              </p>
            ) : (
              <p>
                {fileName}
                {sheetNote}: read as a{" "}
                {preview.mode === "roster" ? "roster" : "training completion report"}; {summary}
                {preview.unchanged ? `, ${preview.unchanged} already match` : ""}.
              </p>
            )}
            {preview.dates.numeric > 0 && !preview.applied && (
              <label className="flex flex-wrap items-center gap-2 text-xs">
                <span>Dates such as 03/04/2026 are</span>
                <select
                  className="rounded border border-stone-300 px-2 py-1"
                  value={preview.dates.order}
                  onChange={(e) => {
                    const o = e.target.value as DateOrder;
                    setDateOrder(o);
                    go(false, { dateOrder: o });
                  }}
                >
                  <option value="mdy">month/day/year (March 4)</option>
                  <option value="dmy">day/month/year (3 April)</option>
                </select>
              </label>
            )}
            {preview.mode === "completions" && preview.courses.length > 0 && !preview.applied && (
              <div>
                <p className="font-medium">Which training does each course count for?</p>
                <table className="mt-1 w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1 pr-2">Course</th>
                      <th className="py-1 pr-2">Completions</th>
                      {TRAINING_CHOICES.map((t) => (
                        <th key={t.key} className="py-1 pr-2">
                          {t.label} ({t.controlId.slice(-5)})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.courses.map((c) => (
                      <tr key={c.key}>
                        <td className="py-1 pr-2">{c.name}</td>
                        <td className="py-1 pr-2">{c.rows}</td>
                        {TRAINING_CHOICES.map((t) => (
                          <td key={t.key} className="py-1 pr-2">
                            <input
                              type="checkbox"
                              aria-label={`${c.name} counts for ${t.label}`}
                              checked={(courseMap[c.key] ?? []).includes(t.key)}
                              disabled={run.isPending}
                              onChange={(e) => toggleCourse(c.key, t.key, e.target.checked)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-stone-600">
                  Leave a course unticked (a phishing test, say) and its completions are not
                  recorded. Role-based training counts only for people marked with security duties.
                </p>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {COLUMN_LABEL.filter(([k]) => preview.columns[k]).map(([k, label]) => (
                <div key={k} className="contents">
                  <dt className="text-stone-500">{label}</dt>
                  <dd>{preview.columns[k]}</dd>
                </div>
              ))}
            </dl>
            {preview.changes.length > 0 && (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1 pr-2">{rowWord}</th>
                      <th className="py-1 pr-2">Person</th>
                      <th className="py-1">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2">{c.name}</td>
                        <td className="py-1">
                          {c.kind === "new" ? "new" : "update"}
                          {c.fields.length > 0 &&
                            `: ${c.fields.map((f) => FIELD_LABEL[f]).join(", ")}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.issues.length > 0 && (
              <div>
                <p className="font-medium text-amber-800">
                  Left out or noted ({preview.issues.length}):
                </p>
                <ul className="max-h-48 list-disc overflow-auto pl-5 text-xs text-amber-900">
                  {preview.issues.map((i) => (
                    <li key={`${i.line}:${i.message}`}>
                      {i.line ? `${rowWord} ${i.line}: ` : ""}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
