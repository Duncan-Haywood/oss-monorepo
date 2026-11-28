// First article, part 2: the inspection screen for one drawing. The drafted Form 3 rows come from the
// drawing's text (shared/fai-characteristics.ts); the inspector enters the zone, designator, result,
// tooling and nonconformance number per row, marks false reads as not a characteristic, adds rows
// the draft missed, and sees each row's accept / reject as they type (shared/fai-results.ts judges
// it, the same code the server and the CSV use). Saved per drawing file.

import {
  addedNumbers,
  buildRows,
  type FaiAddedRow,
  type FaiEntry,
  type FaiRowDto,
  type FaiSheetDto,
  MAX_FIELD_LENGTH,
  MAX_REQUIREMENT_LENGTH,
  MAX_RESULT_LENGTH,
  summarise,
} from "@shared/fai-results";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select } from "../components/ui";
import { api, orgApi, queryClient } from "../lib/api";
import { canEstimate, useOrg, useOrgId } from "./layout";

const TONE = { accept: "green", reject: "red", open: "amber", "n/a": "stone" } as const;

const fmtLimit = (n: number | null) => (n === null ? "" : String(n));

export function FirstArticlePage() {
  const orgId = useOrgId();
  const { rfqId, fileId } = useParams({ strict: false }) as { rfqId: string; fileId: string };
  const org = useOrg(orgId);
  const editable = canEstimate(org.data?.role);
  const key = ["first-article", orgId, rfqId, fileId];
  const path = orgApi(orgId, `/rfqs/${rfqId}/files/${fileId}/first-article`);
  const sheet = useQuery({ queryKey: key, queryFn: () => api<FaiSheetDto>(path) });
  const [entries, setEntries] = useState<Record<string, FaiEntry>>({});
  const [added, setAdded] = useState<FaiAddedRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);

  useEffect(() => {
    if (!sheet.data) return;
    setEntries(Object.fromEntries(sheet.data.rows.map((r) => [r.no, r.entry])));
    setAdded(sheet.data.added);
    setDirty(false);
  }, [sheet.data]);

  const draft = useMemo(
    () => (sheet.data?.rows ?? []).filter((r) => r.kind !== "added"),
    [sheet.data],
  );
  const rows = useMemo(() => buildRows(draft, added, entries), [draft, added, entries]);
  const summary = summarise(rows);

  const save = useMutation({
    mutationFn: () =>
      api<FaiSheetDto>(path, {
        method: "PUT",
        body: { entries, added } as Record<string, unknown>,
      }),
    onSuccess: (d) => queryClient.setQueryData(key, d),
  });

  const setEntry = (no: string, patch: Partial<FaiEntry>) => {
    setEntries((e) => ({ ...e, [no]: { ...e[no], ...patch } }));
    setDirty(true);
  };
  const removeAdded = (index: number) => {
    // Added rows are numbered in order, so the entries of the rows after it move up one number.
    const nos = addedNumbers(draft, added.length);
    setEntries((e) => {
      const next = { ...e };
      for (let i = index; i < nos.length; i++) {
        const to = nos[i] as string;
        const from = nos[i + 1];
        if (from && e[from]) next[to] = e[from] as FaiEntry;
        else delete next[to];
      }
      return next;
    });
    setAdded((a) => a.filter((_, i) => i !== index));
    setDirty(true);
  };

  if (sheet.isLoading) return <p className="text-sm text-stone-600">Loading…</p>;
  if (sheet.error) return <ErrorText error={sheet.error} />;
  const s = sheet.data as FaiSheetDto;
  // Zones read from the drawing's border, for rows whose Zone is still empty.
  const zoneFills = Object.entries(s.zones ?? {}).filter(
    ([no]) => !entries[no]?.location?.trim() && !entries[no]?.notApplicable,
  );
  const fillZones = () => {
    setEntries((e) => {
      const next = { ...e };
      for (const [no, zone] of zoneFills) next[no] = { ...next[no], location: zone };
      return next;
    });
    setDirty(true);
  };
  const shown = openOnly
    ? rows.filter((r) => r.verdict === "open" || r.verdict === "reject")
    : rows;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link
          to="/app/$orgId/rfqs/$rfqId"
          params={{ orgId, rfqId }}
          className="text-sky-800 underline"
        >
          ← Back to the RFQ
        </Link>
      </p>
      <Card
        title={`First article: ${s.fileName}`}
        actions={
          <a
            className="text-sm text-sky-800 underline"
            href={orgApi(orgId, `/rfqs/${rfqId}/files/${fileId}/form3.csv`)}
          >
            Form 3 (CSV){dirty ? ", as last saved" : ""}
          </a>
        }
      >
        <p className="mb-2 text-sm text-stone-600">
          Part {s.partNumber ?? "(not matched)"}
          {s.revision ? `, revision ${s.revision}` : ""}. The rows were listed from the
          drawing&apos;s text: check each against the drawing, mark false reads as not a
          characteristic and add what the text missed (dimensions drawn as geometry, basic
          dimensions, frames drawn as lines). A measured result is judged against the row&apos;s
          limits; a checked row (thread gauge, note, certificate) needs accept or reject in words.
          The verdicts are arithmetic, not a sign-off: the inspector signs the report.
        </p>
        {s.general.map((g) => (
          <p key={g} className="text-sm text-stone-700">
            General tolerance (shown, not applied to any row): {g}
          </p>
        ))}
        {s.truncated && (
          <p className="text-sm text-amber-800">
            The drawing had more characteristics than the list holds; only the first ones are
            listed.
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="fai-summary">
          <Badge tone="green">{summary.accepted} accepted</Badge>
          <Badge tone="red">{summary.rejected} rejected</Badge>
          <Badge tone="amber">{summary.open} open</Badge>
          {summary.notApplicable > 0 && <Badge>{summary.notApplicable} not a characteristic</Badge>}
          {summary.rejectsWithoutNcr > 0 && (
            <span className="text-red-800">
              {summary.rejectsWithoutNcr} reject(s) need a nonconformance number
            </span>
          )}
          {summary.complete && <span className="text-green-800">Every row judged.</span>}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {editable && (
            <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
              {save.isPending ? "Saving…" : dirty ? "Save results" : "Saved"}
            </Button>
          )}
          {editable && zoneFills.length > 0 && (
            <Button variant="secondary" onClick={fillZones} data-testid="fai-fill-zones">
              Fill {zoneFills.length} zone{zoneFills.length === 1 ? "" : "s"} from the
              drawing&apos;s border
            </Button>
          )}
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            Only open and rejected rows
          </label>
          <ErrorText error={save.error} />
        </div>
      </Card>

      <Card title="Characteristics">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="p-1">No.</th>
                <th className="p-1">Requirement</th>
                <th className="p-1">Limits</th>
                <th className="p-1">Zone</th>
                <th className="p-1">Result</th>
                <th className="p-1">Tooling</th>
                <th className="p-1">NCR</th>
                <th className="p-1">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Row
                  key={r.no}
                  r={r}
                  zone={s.zones?.[r.no]}
                  editable={editable}
                  onChange={(patch) => setEntry(r.no, patch)}
                  onRemove={
                    r.kind === "added"
                      ? () => removeAdded(rows.filter((x) => x.kind === "added").indexOf(r))
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <AddRow
          onAdd={(a) => {
            setAdded((x) => [...x, a]);
            setDirty(true);
          }}
        />
      )}
    </div>
  );
}

function Row({
  r,
  zone,
  editable,
  onChange,
  onRemove,
}: {
  r: FaiRowDto;
  zone?: string;
  editable: boolean;
  onChange: (patch: Partial<FaiEntry>) => void;
  onRemove?: () => void;
}) {
  const e = r.entry;
  const na = e.notApplicable === true;
  const limits =
    r.record === "value"
      ? `${fmtLimit(r.lower)}${r.lower !== null || r.upper !== null ? " to " : ""}${fmtLimit(r.upper)}${r.unit ? ` ${r.unit}` : ""}`
      : "accept / reject";
  const text = (k: "location" | "result" | "tooling" | "ncr", max: number, width: string) => (
    <Input
      aria-label={`${k} for ${r.no}`}
      className={width}
      value={e[k] ?? ""}
      placeholder={k === "location" ? zone : undefined}
      title={k === "location" && zone ? `Read from the drawing's border: ${zone}` : undefined}
      maxLength={max}
      disabled={!editable || na}
      onChange={(ev) => onChange({ [k]: ev.target.value })}
    />
  );
  return (
    <tr className={`border-t border-stone-100 align-top ${na ? "text-stone-400" : ""}`}>
      <td className="p-1 font-mono">{r.no}</td>
      <td className="p-1">
        {r.requirement}
        <div className="text-xs text-stone-500">
          {r.kind === "added" ? "added by the inspector" : `drawing text line ${r.line}`}
          {editable && r.kind !== "added" && (
            <label className="ml-2 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={na}
                onChange={(ev) => onChange({ notApplicable: ev.target.checked })}
              />
              not a characteristic
            </label>
          )}
          {onRemove && (
            <button type="button" className="ml-2 text-red-700 underline" onClick={onRemove}>
              remove
            </button>
          )}
        </div>
      </td>
      <td className="p-1 whitespace-nowrap">{limits}</td>
      <td className="p-1">{text("location", MAX_FIELD_LENGTH, "w-16")}</td>
      <td className="p-1">{text("result", MAX_RESULT_LENGTH, "w-32")}</td>
      <td className="p-1">{text("tooling", MAX_FIELD_LENGTH, "w-24")}</td>
      <td className="p-1">{text("ncr", MAX_FIELD_LENGTH, "w-20")}</td>
      <td className="p-1">
        <Badge tone={TONE[r.verdict]}>{r.verdict}</Badge>
        {r.reason && r.verdict !== "n/a" && (
          <div className="text-xs text-stone-600">{r.reason}</div>
        )}
      </td>
    </tr>
  );
}

function AddRow({ onAdd }: { onAdd: (a: FaiAddedRow) => void }) {
  const [requirement, setRequirement] = useState("");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [unit, setUnit] = useState("in");
  const [record, setRecord] = useState<"value" | "accept/reject">("value");
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const lo = num(lower);
  const hi = num(upper);
  const bad =
    !requirement.trim() ||
    (lo !== null && !Number.isFinite(lo)) ||
    (hi !== null && !Number.isFinite(hi)) ||
    (lo !== null && hi !== null && lo > hi) ||
    (record === "value" && lo === null && hi === null);
  return (
    <Card title="Add a characteristic the list missed">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Requirement, as on the drawing">
          <Input
            value={requirement}
            maxLength={MAX_REQUIREMENT_LENGTH}
            placeholder="[2.000] BASIC, POSITION ⌀.010 A B"
            onChange={(e) => setRequirement(e.target.value)}
          />
        </Field>
        <Field label="Checked as">
          <Select
            value={record}
            onChange={(e) => setRecord(e.target.value as "value" | "accept/reject")}
          >
            <option value="value">measured value</option>
            <option value="accept/reject">accept / reject</option>
          </Select>
        </Field>
        {record === "value" && (
          <>
            <Field label="Lower limit">
              <Input inputMode="decimal" value={lower} onChange={(e) => setLower(e.target.value)} />
            </Field>
            <Field label="Upper limit">
              <Input inputMode="decimal" value={upper} onChange={(e) => setUpper(e.target.value)} />
            </Field>
            <Field label="Unit">
              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="in">in</option>
                <option value="mm">mm</option>
                <option value="°">°</option>
                <option value="µin">µin</option>
                <option value="µm">µm</option>
              </Select>
            </Field>
          </>
        )}
        <Button
          variant="secondary"
          disabled={bad}
          onClick={() => {
            onAdd({
              requirement: requirement.trim(),
              lower: record === "value" ? lo : null,
              upper: record === "value" ? hi : null,
              unit: record === "value" ? unit : null,
              record,
            });
            setRequirement("");
            setLower("");
            setUpper("");
          }}
        >
          Add row
        </Button>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        A measured row needs at least one limit (a maximum alone is fine). Added rows are numbered
        after the drafted ones; save to keep them.
      </p>
    </Card>
  );
}
