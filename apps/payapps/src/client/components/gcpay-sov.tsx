// Download the job's schedule of values as the Excel file GCPay's "Upload" button takes (src/shared/gc-export/
// gcpay-sov.ts has the rules and where they come from). Built in the browser; nothing is uploaded.
import type { ProjectDetailDto } from "@shared/api/types";
import {
  checkGcpaySov,
  GCPAY_GUIDE_URL,
  type GcpaySovLine,
  gcpaySovFileName,
  gcpaySovWorkbook,
  gcpayUnitPriceSovWorkbook,
} from "@shared/gc-export/gcpay-sov";
import { formatCents } from "@shared/money";
import { useMemo, useState } from "react";

/** The base contract's lines: GCPay has the GC add change orders after the base SOV is approved. */
export function gcpayLines(p: ProjectDetailDto): GcpaySovLine[] {
  return p.sovLines
    .filter((l) => l.changeOrderId === null)
    .map((l) => ({
      itemNumber: l.itemNumber,
      description: l.description,
      cents: l.originalCents,
      ...(l.unit && l.unitPriceMicros !== null
        ? {
            unitPrice: {
              quantityMilli: l.quantityMilli,
              unit: l.unit,
              unitPriceMicros: l.unitPriceMicros,
            },
          }
        : {}),
    }));
}

function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GcpaySov({ project }: { project: ProjectDetailDto }) {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => gcpayLines(project), [project]);
  const [layout, setLayout] = useState<"standard" | "unit">(
    lines.some((l) => l.unitPrice) ? "unit" : "standard",
  );
  const check = useMemo(
    () => checkGcpaySov(lines, project.originalContractSumCents),
    [lines, project.originalContractSumCents],
  );

  if (!open)
    return (
      <button
        type="button"
        className="btn-secondary mt-3 ml-2"
        title="Download this job's schedule of values as the Excel file GCPay's Upload button takes"
        onClick={() => setOpen(true)}
      >
        GCPay SOV (Excel)
      </button>
    );

  return (
    <div className="mt-4 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schedule of values for GCPay</h3>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        When a GC on GCPay has entered your contract amount and asks for the breakdown, download
        this workbook and, in GCPay, open the job's Schedule of Values, click Upload under Line
        Items, then Choose File and Upload. It has GCPay's three columns, Item Number, Description
        and Value, and nothing else. If GCPay does not take it, download the GC's own template there
        and paste these rows into it. The file is made in your browser.{" "}
        <a className="underline" href={GCPAY_GUIDE_URL} target="_blank" rel="noreferrer">
          GCPay's subcontractor guide
        </a>
      </p>
      <ul className="mt-2 text-sm">
        <li>
          {check.lines} line{check.lines === 1 ? "" : "s"}, total {formatCents(check.totalCents)}
          {check.diffCents === 0
            ? `: matches the original contract sum of ${formatCents(check.contractCents)}.`
            : `: ${check.diffCents > 0 ? "over" : "under"} the original contract sum of ${formatCents(check.contractCents)} by ${formatCents(Math.abs(check.diffCents))}.`}
        </li>
      </ul>
      {check.diffCents !== 0 && (
        <p role="alert" className="mt-1 text-sm text-amber-800">
          GCPay will not let you submit until your lines add up to the contract amount the GC
          entered. Fix the lines here (or the contract sum, if the GC's figure differs) first.
        </p>
      )}
      {check.unnumbered > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          {check.unnumbered} line{check.unnumbered === 1 ? " has" : "s have"} no item number;
          GCPay's Auto Number box can number them after the upload.
        </p>
      )}
      {check.duplicateNumbers.length > 0 && (
        <p className="mt-1 text-sm text-amber-800">
          Item number{check.duplicateNumbers.length === 1 ? "" : "s"} used twice:{" "}
          {check.duplicateNumbers.join(", ")}.
        </p>
      )}
      {(check.unitPriceLines > 0 || layout === "unit") && (
        <fieldset className="mt-2 text-sm">
          <legend className="text-slate-600">Layout</legend>
          <label className="mr-4">
            <input
              type="radio"
              name="gcpay-layout"
              checked={layout === "unit"}
              onChange={() => setLayout("unit")}
            />{" "}
            Unit price (Item Number, Description, Units, Unit Description, Unit Value)
          </label>
          <label>
            <input
              type="radio"
              name="gcpay-layout"
              checked={layout === "standard"}
              onChange={() => setLayout("standard")}
            />{" "}
            Standard (Item Number, Description, Value)
          </label>
          {layout === "unit" && (
            <p className="mt-1 text-xs text-slate-600">
              Units is the contract quantity, Unit Description its unit and Unit Value the price of
              one unit; a lump-sum line goes in as 1 LS at its value. GCPay's guide names these
              columns without defining them, so compare with the GC's unit-price template before you
              upload.
            </p>
          )}
          {layout === "unit" && check.unitPriceWithoutQuantity.length > 0 && (
            <p role="alert" className="mt-1 text-sm text-amber-800">
              No contract quantity on {check.unitPriceWithoutQuantity.join(", ")}: these go in as 1
              LS. Give them a quantity above to upload them by unit.
            </p>
          )}
        </fieldset>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Change orders are not included: in GCPay the GC adds them after your base schedule of values
        is approved. Each month, type the amounts from this app's continuation sheet into GCPay's $
        This Period column.
      </p>
      <button
        type="button"
        className="btn mt-3"
        disabled={lines.length === 0}
        onClick={() =>
          download(
            gcpaySovFileName(project),
            layout === "unit" ? gcpayUnitPriceSovWorkbook(lines) : gcpaySovWorkbook(lines),
          )
        }
      >
        Download GCPay workbook
      </button>
    </div>
  );
}
