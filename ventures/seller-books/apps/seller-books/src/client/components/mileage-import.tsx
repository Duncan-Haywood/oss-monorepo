// Mileage page: read a tracker app's trip export, review each trip, save the ones ticked.
// The server reads the file (POST /mileage/import/preview); nothing is saved until "Save".
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { ErrorText } from "../routes/public";

interface Row {
  line: number;
  date: string;
  milesTenths: number;
  purpose: string | null;
  startPlace: string | null;
  endPlace: string | null;
  classification: string | null;
  alreadyInBooks: boolean;
}

interface Preview {
  rows: Row[];
  rowCount: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
  unit: "mi" | "km";
}

interface Saved {
  created: number;
  duplicatesSkipped: number;
  miles: number;
}

interface Choice {
  include: boolean;
  purpose: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function MileageImport({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  const [allPurpose, setAllPurpose] = useState("");

  const read = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a CSV file");
      if (file.size > MAX_BYTES)
        throw new Error("File is larger than 5 MB: export a shorter period.");
      const csv = await file.text();
      return api<Preview>(orgPath(orgId, "/mileage/import/preview"), {
        method: "POST",
        body: { fileName: file.name, csv },
      });
    },
    onSuccess: (p) => {
      setSaved(null);
      const next: Record<number, Choice> = {};
      for (const r of p.rows)
        next[r.line] = { include: !r.alreadyInBooks, purpose: r.purpose ?? "" };
      setChoices(next);
    },
  });

  const p = read.data;
  const ticked = p ? p.rows.filter((r) => choices[r.line]?.include) : [];
  const missing = ticked.filter((r) => !choices[r.line]?.purpose.trim());
  const tickedMiles = ticked.reduce((s, r) => s + r.milesTenths, 0) / 10;

  const save = useMutation({
    mutationFn: () =>
      api<Saved>(orgPath(orgId, "/mileage/import"), {
        method: "POST",
        body: {
          fileName: file?.name ?? null,
          trips: ticked.map((r) => ({
            date: r.date,
            purpose: choices[r.line]?.purpose.trim() ?? "",
            startPlace: r.startPlace,
            endPlace: r.endPlace,
            milesTenths: r.milesTenths,
          })),
        },
      }),
    onSuccess: (s) => {
      setSaved(s);
      read.reset();
      setChoices({});
      return qc.invalidateQueries();
    },
  });

  const set = (line: number, c: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [line]: { ...(all[line] as Choice), ...c } }));

  const fillMissing = () =>
    setChoices((all) => {
      const next = { ...all };
      for (const r of ticked) {
        const c = next[r.line];
        if (c && !c.purpose.trim()) next[r.line] = { ...c, purpose: allPurpose.trim() };
      }
      return next;
    });

  return (
    <section className="card space-y-2" aria-labelledby="mileage-import">
      <h2 id="mileage-import" className="font-medium">
        Import trips from a mileage tracker
      </h2>
      <p className="text-sm text-stone-600">
        If an app such as MileIQ, Stride, Everlance, TripLog or Driversnote records your drives,
        export them as CSV and choose the file (a spreadsheet with a date and miles column works
        too). Business trips are listed. Personal, commuting, charity and medical drives, and drives
        not yet classified, are left out with the reason. Each trip needs a business purpose: the
        one from the file is filled in, and a trip without one waits for you to type it. Nothing is
        saved until you press Save, the file itself is not kept, and trips already in your log are
        left unticked.
      </p>
      <input
        className="input"
        type="file"
        accept=".csv,text/csv"
        aria-label="Mileage CSV"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          read.reset();
          setSaved(null);
        }}
      />
      <div>
        <button
          className="btn"
          type="button"
          disabled={!file || read.isPending}
          onClick={() => read.mutate()}
        >
          Read trips
        </button>
      </div>
      <ErrorText error={read.error} />
      {saved && (
        <p className="text-sm" role="status">
          Saved {saved.created} {saved.created === 1 ? "trip" : "trips"}, {saved.miles.toFixed(1)}{" "}
          miles
          {saved.duplicatesSkipped > 0 && `; ${saved.duplicatesSkipped} were already in your log`}.
        </p>
      )}
      {p && (
        <div className="space-y-2 text-sm">
          <p>
            {p.rows.length} business trips read from {p.rowCount} rows; {ticked.length} ticked,{" "}
            {tickedMiles.toFixed(1)} miles.
          </p>
          <p className="text-xs text-stone-500">
            Columns read:{" "}
            {Object.entries(p.matched)
              .map(([k, v]) => `${k} ← "${v}"`)
              .join(", ")}
          </p>
          {p.warnings.map((w) => (
            <p key={w} className="text-accent-700">
              {w}
            </p>
          ))}
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input"
                placeholder="Purpose for the trips without one"
                aria-label="Purpose for the trips without one"
                value={allPurpose}
                onChange={(e) => setAllPurpose(e.target.value)}
              />
              <button
                className="btn"
                type="button"
                disabled={!allPurpose.trim()}
                onClick={fillMissing}
              >
                Fill {missing.length} empty
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Save</th>
                  <th>Date</th>
                  <th>Purpose</th>
                  <th>Route</th>
                  <th className="num">Miles</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => {
                  const c = choices[r.line];
                  return (
                    <tr key={r.line}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Save the trip on ${r.date}, line ${r.line}`}
                          checked={c?.include ?? false}
                          onChange={(e) => set(r.line, { include: e.target.checked })}
                        />
                      </td>
                      <td>{r.date}</td>
                      <td>
                        <input
                          className="input"
                          aria-label={`Purpose for line ${r.line}`}
                          placeholder="Business purpose"
                          value={c?.purpose ?? ""}
                          onChange={(e) => set(r.line, { purpose: e.target.value })}
                        />
                        {r.alreadyInBooks && (
                          <span className="block text-xs text-stone-500">Already in your log.</span>
                        )}
                      </td>
                      <td>{[r.startPlace, r.endPlace].filter(Boolean).join(" → ")}</td>
                      <td className="num">{(r.milesTenths / 10).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="btn"
            type="button"
            disabled={ticked.length === 0 || missing.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {missing.length > 0
              ? `${missing.length} ticked ${missing.length === 1 ? "trip needs" : "trips need"} a purpose`
              : `Save ${ticked.length} ${ticked.length === 1 ? "trip" : "trips"}`}
          </button>
          <ErrorText error={save.error} />
          {p.skipped.length > 0 && (
            <details className="text-xs text-stone-600">
              <summary>{p.skipped.length} rows left out</summary>
              <ul className="list-disc pl-5">
                {p.skipped.map((k) => (
                  <li key={k.line}>
                    Line {k.line}: {k.reason}
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
