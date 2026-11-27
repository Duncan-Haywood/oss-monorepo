// Fill the Flashtract template from Trimble Pay's Bulk upload with this job's schedule of values
// (src/shared/gc-export/trimble-pay-sov.ts has the rules and where they come from). The template is read
// and the file is made in the browser; nothing is uploaded.
import type { ProjectDetailDto } from "@shared/api/types";
import {
  checkTrimblePaySov,
  readTrimblePayCsv,
  readTrimblePayGrid,
  rolesComplete,
  TRIMBLE_PAY_HELP_URL,
  TRIMBLE_PAY_ROLES,
  type TrimblePayRole,
  type TrimblePaySovLine,
  type TrimblePayTemplate,
  type TrimblePayTemplateResult,
  trimblePaySovCsv,
  trimblePaySovFileName,
  trimblePaySovWorkbook,
} from "@shared/gc-export/trimble-pay-sov";
import { formatCents } from "@shared/money";
import { readXlsx } from "@shared/sov-import/xlsx";
import { useMemo, useState } from "react";

type Scope = "base" | "current";

/** The job's lines: the base contract at its original values, or every line at its current value. */
export function trimblePayLines(p: ProjectDetailDto, scope: Scope): TrimblePaySovLine[] {
  return (
    p.sovLines
      // A change order line carries nothing until its change order is approved: left out until then.
      .filter((l) => l.changeOrderId === null || (scope === "current" && l.currentCents !== 0))
      .map((l) => ({
        itemNumber: l.itemNumber,
        description: l.description,
        cents: scope === "current" ? l.currentCents : l.originalCents,
      }))
  );
}

/** The contract value to match: the original sum, plus the approved change orders for "current". */
export function trimblePayContractCents(p: ProjectDetailDto, scope: Scope): number {
  if (scope === "base") return p.originalContractSumCents;
  return p.changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.totalCents, p.originalContractSumCents);
}

const ROLE_LABEL: Record<TrimblePayRole, string> = {
  item: "Item number",
  description: "Description",
  value: "Value",
};

async function readFile(file: File): Promise<TrimblePayTemplateResult & { csv?: boolean }> {
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const sheets = await readXlsx(await file.arrayBuffer());
      const first = sheets[0];
      if (!first) return { ok: false, error: "The workbook has no sheets." };
      return readTrimblePayGrid(first.grid, first.name);
    }
    if (/\.xls$/i.test(file.name))
      return {
        ok: false,
        error:
          "This is an old .xls file. Open it in Excel and save it as .xlsx, then choose it here.",
      };
    return { ...readTrimblePayCsv(await file.text()), csv: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The file could not be read." };
  }
}

function download(name: string, data: Uint8Array | string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TrimblePaySov({ project }: { project: ProjectDetailDto }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<TrimblePayTemplate | null>(null);
  const [csv, setCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<(TrimblePayRole | null)[]>([null, null, null]);
  const hasChangeOrders = project.sovLines.some((l) => l.changeOrderId !== null);
  const [scope, setScope] = useState<Scope>("current");
  const lines = useMemo(() => trimblePayLines(project, scope), [project, scope]);
  const contractCents = trimblePayContractCents(project, scope);
  const check = useMemo(() => checkTrimblePaySov(lines, contractCents), [lines, contractCents]);
  const ready = template !== null && rolesComplete(roles) && lines.length > 0;

  if (!open)
    return (
      <button
        type="button"
        className="btn-secondary mt-3 ml-2"
        title="Fill the Flashtract template from Trimble Pay's Bulk upload with this job's schedule of values"
        onClick={() => setOpen(true)}
      >
        Trimble Pay SOV
      </button>
    );

  return (
    <div className="mt-4 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schedule of values for Trimble Pay</h3>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        In Trimble Pay, open the contract, go to the SOV and click Bulk upload, then download the
        Flashtract template from that window. Choose it here: its two header rows are kept as they
        are and this job's lines go in columns A to C from row 3, with no blank rows, section rows
        or billing. Upload the file back in the same window and click Create line items. The
        template is read in your browser.{" "}
        <a className="underline" href={TRIMBLE_PAY_HELP_URL} target="_blank" rel="noreferrer">
          Trimble's help page
        </a>
      </p>
      <label className="mt-2 block text-sm">
        Flashtract template (.xlsx or .csv){" "}
        <input
          type="file"
          accept=".xlsx,.csv,.txt,.xls"
          aria-label="Flashtract template"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const r = await readFile(file);
            if (!r.ok) {
              setTemplate(null);
              setError(r.error);
              return;
            }
            setError(null);
            setTemplate(r.template);
            setCsv(r.csv === true);
            setRoles(r.template.roles);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      {template && (
        <fieldset className="mt-2 text-sm">
          <legend className="text-slate-600">
            What the template's columns hold (read from its header; change if wrong)
          </legend>
          {(["A", "B", "C"] as const).map((letter, i) => (
            <label key={letter} className="mr-4 inline-block">
              {letter} ({template.labels[i] || "no header"}):{" "}
              <select
                className="input"
                aria-label={`Column ${letter}`}
                value={roles[i] ?? ""}
                onChange={(e) => {
                  const next = [...roles];
                  next[i] = (e.target.value || null) as TrimblePayRole | null;
                  setRoles(next);
                }}
              >
                <option value="">Choose…</option>
                {TRIMBLE_PAY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!rolesComplete(roles) && (
            <p role="alert" className="mt-1 text-amber-800">
              Give A, B and C one each of item number, description and value.
            </p>
          )}
          {template.existingRows > 0 && (
            <p className="mt-1 text-slate-600">
              The template has {template.existingRows} row{template.existingRows === 1 ? "" : "s"}{" "}
              below the header; the download replaces them with this job's lines.
            </p>
          )}
        </fieldset>
      )}
      {hasChangeOrders && (
        <fieldset className="mt-2 text-sm">
          <legend className="text-slate-600">Lines</legend>
          <label className="mr-4">
            <input
              type="radio"
              name="trimble-scope"
              checked={scope === "current"}
              onChange={() => setScope("current")}
            />{" "}
            Current contract (with approved change orders)
          </label>
          <label>
            <input
              type="radio"
              name="trimble-scope"
              checked={scope === "base"}
              onChange={() => setScope("base")}
            />{" "}
            Original contract only
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Trimble Pay wants the lines to add up to the contract value it shows. If the GC enters
            change orders there as their own lines, choose the original contract.
          </p>
        </fieldset>
      )}
      <ul className="mt-2 text-sm">
        <li>
          {check.lines} line{check.lines === 1 ? "" : "s"}, total {formatCents(check.totalCents)}
          {check.diffCents === 0
            ? `: matches the ${scope === "current" ? "current" : "original"} contract value of ${formatCents(check.contractCents)}.`
            : `: ${check.diffCents > 0 ? "over" : "under"} the ${scope === "current" ? "current" : "original"} contract value of ${formatCents(check.contractCents)} by ${formatCents(Math.abs(check.diffCents))}.`}
        </li>
      </ul>
      {check.diffCents !== 0 && (
        <p role="alert" className="mt-1 text-sm text-amber-800">
          Trimble Pay marks the schedule of values incomplete until the lines add up to the contract
          value. Fix the lines here first, or check the contract value the GC entered.
        </p>
      )}
      {check.undescribed > 0 && (
        <p role="alert" className="mt-1 text-sm text-amber-800">
          {check.undescribed} line{check.undescribed === 1 ? " has" : "s have"} no description;
          Trimble Pay needs one on every line.
        </p>
      )}
      {check.unnumbered > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          {check.unnumbered} line{check.unnumbered === 1 ? " has" : "s have"} no item number;
          Trimble asks for columns A to C filled on every line.
        </p>
      )}
      {check.duplicateNumbers.length > 0 && (
        <p className="mt-1 text-sm text-amber-800">
          Item number{check.duplicateNumbers.length === 1 ? "" : "s"} used twice:{" "}
          {check.duplicateNumbers.join(", ")}.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        If the GC set accounting lines (cost code groups), the lines in each group must add up to
        that group's value; upload into each group with its own Bulk Upload icon. Each month, type
        this app's continuation sheet amounts into Trimble Pay's pay application.
      </p>
      <button
        type="button"
        className="btn mt-3"
        disabled={!ready}
        onClick={() => {
          if (!template) return;
          if (csv)
            download(
              trimblePaySovFileName(project, "csv"),
              trimblePaySovCsv(template, roles, lines),
              "text/csv",
            );
          else
            download(
              trimblePaySovFileName(project),
              trimblePaySovWorkbook(template, roles, lines),
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            );
        }}
      >
        Download filled template
      </button>
    </div>
  );
}
