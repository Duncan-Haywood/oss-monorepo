// Another marketplace's sales file (Grailed, StockX, Vinted, Reverb or any other): the seller picks the file, sees
// its own header row, and says which column is which. Nothing is uploaded until they press Import; the
// columns they confirm are saved per platform on the server and offered again for the next file.
import {
  type ColumnMapping,
  MAPPED_FEE_KINDS,
  MAPPED_FIELDS,
  MAX_MAPPED_FEES,
  type MappedFeeKind,
  type MappedField,
  mappingProblems,
  PRICE_INCLUDES,
  type PriceInclude,
  suggestMapping,
} from "@shared/column-mapping";
import { parseCsv } from "@shared/csv";
import { FEE_KIND_LABELS, PLATFORM_LABELS, type Platform } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { ErrorText } from "../routes/public";

const MAX_BYTES = 5 * 1024 * 1024;

interface Summary {
  salesCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  itemsLinked: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
}

type Fields = Partial<Record<MappedField, string>>;
type Fee = { column: string; kind: MappedFeeKind };

/** The header row: the first of the first 30 rows with two or more cells filled (a title line is skipped). */
function readHeader(text: string) {
  const rows = parseCsv(text);
  const at = rows.slice(0, 30).findIndex((r) => r.filter((c) => c.trim() !== "").length > 1);
  if (at < 0) return null;
  const headers = (rows[at] ?? []).map((h) => h.trim()).filter(Boolean);
  const sample = rows
    .slice(at + 1)
    .filter((r) => r.filter((c) => c.trim() !== "").length > 1)
    .slice(0, 3);
  return { line: at + 1, headers, raw: rows[at] ?? [], sample };
}

export function MappedImport({
  orgId,
  platforms,
}: {
  orgId: string;
  platforms: { platform: string; platformLabel: string }[];
}) {
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["import-mappings", orgId],
    queryFn: () =>
      api<{ items: { platform: string; mapping: ColumnMapping }[] }>(
        orgPath(orgId, "/imports/mappings"),
      ),
  });
  const [platform, setPlatform] = useState(platforms[0]?.platform ?? "other");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [fees, setFees] = useState<Fee[]>([]);
  const [priceIncludes, setPriceIncludes] = useState<PriceInclude[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const header = file ? readHeader(file.text) : null;

  /** Saved columns for this platform where the file still has them; otherwise the name-based suggestion. */
  const prefill = (text: string, p: string) => {
    const h = readHeader(text);
    if (!h) return;
    const mine = saved.data?.items.find((m) => m.platform === p)?.mapping;
    if (mine && mappingProblems(mine, h.headers).length === 0) {
      const { fees: f = [], priceIncludes: inc = [], ...rest } = mine;
      setFields(rest);
      setFees(f);
      setPriceIncludes(inc);
      return;
    }
    const s = suggestMapping(h.headers);
    setFields(s.fields);
    setFees(s.fees);
    setPriceIncludes(s.priceIncludes);
  };

  const mapping: ColumnMapping = {
    ...fields,
    date: fields.date ?? "",
    itemPrice: fields.itemPrice ?? "",
    fees,
    priceIncludes,
  };
  const problems = header ? mappingProblems(mapping, header.headers) : [];

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a CSV file");
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Fields;
      return api<Summary>(orgPath(orgId, "/imports/mapped"), {
        method: "POST",
        body: {
          platform,
          fileName: file.name,
          csv: file.text,
          mapping: { ...clean, fees, priceIncludes },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const cell = (row: string[], column: string | undefined) => {
    if (!column || !header) return "";
    const i = header.raw.findIndex((h) => h.trim() === column);
    return i < 0 ? "" : (row[i] ?? "").trim();
  };
  const freeFeeColumns = header
    ? header.headers.filter(
        (h) => !Object.values(fields).includes(h) && !fees.some((f) => f.column === h),
      )
    : [];
  const s = upload.data;

  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Another platform: match the columns yourself</h2>
      <p className="text-sm text-stone-600">
        For Grailed, StockX, Vinted, Reverb or any marketplace without a report above: download its
        sales file as CSV, choose it here and say which column is which. Only the columns you choose
        are read, and fees come only from the columns you mark as fees. Your choices are saved for
        the next file from the same platform. Seller Books is not affiliated with Grailed, StockX,
        Vinted or Reverb.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="label">Platform</span>
          <select
            className="input"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              if (file) prefill(file.text, e.target.value);
            }}
          >
            {platforms.map((p) => (
              <option key={p.platform} value={p.platform}>
                {p.platformLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">CSV file</span>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              upload.reset();
              setReadError(null);
              if (!f) return setFile(null);
              if (f.size > MAX_BYTES) {
                setFile(null);
                return setReadError("File is larger than 5 MB: split it by date range.");
              }
              const text = await f.text();
              if (!readHeader(text)) {
                setFile(null);
                return setReadError("No header row found: is this a CSV file?");
              }
              setFile({ name: f.name, text });
              prefill(text, platform);
            }}
          />
        </label>
      </div>
      {readError && <p className="text-sm text-red-700">{readError}</p>}
      {platform === "other" && (
        <p className="text-sm text-accent-700">
          {PLATFORM_LABELS.other}: Seller Books cannot know whether this marketplace collected the
          sales tax, so a tax column you choose shows on your sales tax report. Most US marketplaces
          collect it themselves; if this one did, leave the tax column out.
        </p>
      )}
      {header && (
        <>
          <p className="text-sm text-stone-600">
            Header row: line {header.line}, {header.headers.length} columns. Suggestions are filled
            from the column names; check each one.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {MAPPED_FIELDS.map((f) => (
              <label key={f.key}>
                <span className="label">
                  {f.label}
                  {"required" in f && f.required ? " (required)" : ""}
                </span>
                <select
                  className="input"
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value || undefined })}
                >
                  <option value="">— not in this file —</option>
                  {header.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="label">
              Does the price column already include these? (an order total usually does)
            </legend>
            {PRICE_INCLUDES.map((inc) => (
              <label key={inc} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={priceIncludes.includes(inc)}
                  onChange={(e) =>
                    setPriceIncludes(
                      e.target.checked
                        ? [...priceIncludes, inc]
                        : priceIncludes.filter((x) => x !== inc),
                    )
                  }
                />
                {inc === "shipping"
                  ? "Shipping the buyer paid: take it out of the price"
                  : "Sales tax: take it out of the price"}
              </label>
            ))}
          </fieldset>
          <div className="space-y-2">
            <span className="label">Fee columns (the platform's charges to you)</span>
            {fees.map((fee, i) => (
              <div key={fee.column} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">{fee.column}</span>
                <select
                  className="input w-auto"
                  aria-label={`Fee kind for ${fee.column}`}
                  value={fee.kind}
                  onChange={(e) =>
                    setFees(
                      fees.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value as MappedFeeKind } : x,
                      ),
                    )
                  }
                >
                  {MAPPED_FEE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FEE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => setFees(fees.filter((_, j) => j !== i))}
                >
                  Not a fee
                </button>
              </div>
            ))}
            {fees.length < MAX_MAPPED_FEES && freeFeeColumns.length > 0 && (
              <select
                className="input w-auto"
                value=""
                aria-label="Add a fee column"
                onChange={(e) =>
                  e.target.value &&
                  setFees([...fees, { column: e.target.value, kind: "marketplace_fee" }])
                }
              >
                <option value="">+ Add a fee column</option>
                {freeFeeColumns.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            )}
          </div>
          {header.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <caption className="text-left text-stone-600">
                  The first rows as they will be read
                </caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th className="num">Price</th>
                    <th className="num">Fees</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {header.sample.map((row, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed preview of the file's rows
                    <tr key={i}>
                      <td>{cell(row, fields.date)}</td>
                      <td>{cell(row, fields.title)}</td>
                      <td className="num">{cell(row, fields.itemPrice)}</td>
                      <td className="num">{fees.map((f) => cell(row, f.column)).join(" / ")}</td>
                      <td className="num">{cell(row, fields.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {problems.length > 0 && (
            <ul className="text-sm text-red-700">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn"
            disabled={problems.length > 0 || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending
              ? "Importing…"
              : `Import as ${PLATFORM_LABELS[platform as Platform] ?? platform}`}
          </button>
        </>
      )}
      <ErrorText error={upload.error} />
      {s && (
        <div className="rounded-md bg-brand-50 p-3 text-sm">
          <p>
            {s.salesCreated} sales imported; {s.duplicatesSkipped} already imported; {s.rowsSkipped}{" "}
            rows skipped; {s.itemsLinked} sales matched to inventory by SKU.
          </p>
          {s.warnings.map((w) => (
            <p key={w} className="text-accent-700">
              {w}
            </p>
          ))}
          {s.skipped.length > 0 && (
            <details className="mt-2">
              <summary>Skipped rows</summary>
              <ul>
                {s.skipped.map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
