// Gauge and instrument calibration (ISO 9001 7.1.5): the gauge list with each gauge's due date and
// state, the recall list, recording a calibration (with its certificate file), and the impact record
// of a gauge found out of tolerance. Checks run on the server (@shared/calibration); this view shows
// them and edits the rows. Readable on every plan; recording needs Level 2 + Quality.
import type {
  AsFound,
  AsLeft,
  CalibrationCheck,
  CalPerformer,
  CalState,
  GaugeDue,
  GaugeIssue,
  GaugeKind,
  GaugeOwner,
  GaugeStatus,
} from "@shared/calibration";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Evidence, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";
import { EvidenceUpload } from "./EvidenceUpload";

export interface GaugeItem {
  id: string;
  tag: string;
  description: string;
  kind: GaugeKind;
  manufacturer: string;
  serial: string;
  range: string;
  location: string;
  owner: GaugeOwner;
  assignedTo: string;
  status: GaugeStatus;
  intervalMonths: number | null;
  method: string;
  notes: string;
  lastCalibratedOn: string | null;
  dueOn: string | null;
  state: CalState;
  issues: GaugeIssue[];
  calibrations: number;
}

interface Option<K> {
  key: K;
  label: string;
}

export interface GaugesResponse {
  today: string;
  items: GaugeItem[];
  check: CalibrationCheck;
  due: GaugeDue[];
  kinds: Option<GaugeKind>[];
  statuses: Option<GaugeStatus>[];
  owners: Option<GaugeOwner>[];
  performers: Option<CalPerformer>[];
  asFound: Option<AsFound>[];
  asLeft: Option<AsLeft>[];
  intervals: number[];
  dueSoonDays: number;
}

interface CalibrationRecord {
  id: string;
  calibratedOn: string;
  performer: CalPerformer;
  performedBy: string;
  asFound: AsFound;
  asLeft: AsLeft;
  readings: string;
  certificateNo: string;
  traceability: string;
  dueOn: string | null;
  evidenceId: string | null;
  fileName: string | null;
  impact: string;
  impactOn: string | null;
  correctiveActionRef: string;
}

const EMPTY = {
  tag: "",
  description: "",
  kind: "caliper" as GaugeKind,
  manufacturer: "",
  serial: "",
  range: "",
  location: "",
  owner: "company" as GaugeOwner,
  assignedTo: "",
  status: "active" as GaugeStatus,
  intervalMonths: 12 as number | null,
  method: "",
  notes: "",
};

const STATE_TONE: Record<CalState, string> = {
  current: "bg-green-50 text-green-800",
  due_soon: "bg-amber-50 text-amber-900",
  overdue: "bg-red-50 text-red-800",
  never: "bg-red-50 text-red-800",
  not_in_use: "bg-stone-100 text-stone-700",
};

function stateText(g: Pick<GaugeItem, "state" | "dueOn">, statusLabel: string) {
  if (g.state === "not_in_use") return statusLabel;
  if (g.state === "never") return "Never calibrated";
  if (g.state === "overdue") return `Overdue (due ${g.dueOn})`;
  if (g.state === "due_soon") return `Due ${g.dueOn}`;
  return `Current to ${g.dueOn}`;
}

export function GaugesView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canRecord = info.plan.quality && info.role !== "viewer";
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["gauges", orgId],
    queryFn: () => api<GaugesResponse>(`/api/orgs/${orgId}/gauges`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["gauges", orgId] });
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
    setAdding(false);
  };
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/gauges/${editing}`, { method: "PATCH", json: form })
        : api(`/api/orgs/${orgId}/gauges`, { method: "POST", json: form }),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/gauges/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const data = list.data;
  const label = (key: GaugeStatus) => data?.statuses.find((s) => s.key === key)?.label ?? key;
  const kindLabel = (key: GaugeKind) => data?.kinds.find((s) => s.key === key)?.label ?? key;
  const startEdit = (g: GaugeItem) => {
    setEditing(g.id);
    setAdding(true);
    setForm({
      tag: g.tag,
      description: g.description,
      kind: g.kind,
      manufacturer: g.manufacturer,
      serial: g.serial,
      range: g.range,
      location: g.location,
      owner: g.owner,
      assignedTo: g.assignedTo,
      status: g.status,
      intervalMonths: g.intervalMonths,
      method: g.method,
      notes: g.notes,
    });
  };
  const shown = data?.items.filter((g) => showRetired || g.status !== "retired") ?? [];
  const gaps = data?.items.flatMap((g) => g.issues.filter((i) => i.kind === "gap")) ?? [];
  const inUse = form.status === "active";
  return (
    <div className="space-y-4">
      {!info.plan.quality && (
        <Card title="Read only on this plan">
          <p className="text-sm text-stone-700">
            Keeping the gauge list needs the Level 2 + Quality plan. Everything recorded stays
            readable.{" "}
            {isAdmin ? (
              <button type="button" className="underline" onClick={onUpgrade}>
                See plans
              </button>
            ) : (
              "Ask an admin of this organization to upgrade."
            )}
          </p>
        </Card>
      )}
      <Card
        title="Gauges and calibration (ISO 9001 7.1.5)"
        actions={
          <div className="flex gap-2">
            {canRecord && !adding && (
              <button type="button" className={btnCls} onClick={() => setAdding(true)}>
                Add a gauge
              </button>
            )}
            {data && data.items.length > 0 && (
              <a className={btnGhostCls} href={`/api/orgs/${orgId}/gauges/export.csv`}>
                Download CSV
              </a>
            )}
          </div>
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Every caliper, micrometer, height gauge, pin gauge and CMM used to accept parts: its id,
          how often it is calibrated, the last certificate, and when it is due. Employee-owned tools
          used on your work belong here too. A gauge found out of tolerance asks what was measured
          with it since its last good calibration.
        </p>
        {data && (
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <Stat label="In use" value={data.check.inUse} />
            <Stat label="Current" value={data.check.current} />
            <Stat label={`Due in ${data.dueSoonDays} days`} value={data.check.dueSoon} />
            <Stat label="Overdue or never" value={data.check.overdue + data.check.never} warn />
            <Stat
              label="Out of tolerance, impact open"
              value={data.check.openOutOfTolerance}
              warn
            />
          </dl>
        )}
        {gaps.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 rounded border border-red-200 bg-red-50 p-2 pl-6 text-sm text-red-900">
            {gaps.slice(0, 8).map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
            {gaps.length > 8 && <li>and {gaps.length - 8} more below</li>}
          </ul>
        )}
        {adding && data && (
          <form
            className="mb-4 grid gap-3 rounded border border-stone-200 p-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Gauge id" hint="The number on its sticker or engraving">
              <input
                className={inputCls}
                required
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <input
                className={inputCls}
                required
                placeholder="0-6 in digital caliper"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                className={inputCls}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as GaugeKind })}
              >
                {data.kinds.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as GaugeStatus;
                  setForm({
                    ...form,
                    status,
                    intervalMonths:
                      status === "active" && form.intervalMonths === null
                        ? 12
                        : form.intervalMonths,
                  });
                }}
              >
                {data.statuses.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Calibration interval (months)"
              hint={inUse ? undefined : "Not needed while it is not used to accept parts"}
            >
              <input
                className={inputCls}
                type="number"
                min={1}
                max={60}
                list="cal-intervals"
                required={inUse}
                value={form.intervalMonths ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    intervalMonths: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <datalist id="cal-intervals">
                {data.intervals.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="Owner">
              <select
                className={inputCls}
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value as GaugeOwner })}
              >
                {data.owners.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to" hint="Whose toolbox it lives in, if anyone's">
              <input
                className={inputCls}
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <input
                className={inputCls}
                placeholder="Inspection bench, cell 3"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Manufacturer and model">
              <input
                className={inputCls}
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              />
            </Field>
            <Field label="Serial number">
              <input
                className={inputCls}
                value={form.serial}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
              />
            </Field>
            <Field label="Range and resolution">
              <input
                className={inputCls}
                placeholder="0-1 in x 0.0001"
                value={form.range}
                onChange={(e) => setForm({ ...form, range: e.target.value })}
              />
            </Field>
            <Field label="Calibration method" hint="Your procedure number, or the lab's method">
              <input
                className={inputCls}
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save gauge" : "Add gauge"}
              </button>
              <button type="button" className={btnGhostCls} onClick={reset}>
                Cancel
              </button>
              <ErrorText error={save.error} />
            </div>
          </form>
        )}
        {data && data.items.length === 0 && !adding && (
          <p className="text-sm text-stone-600">
            No gauges yet. Start with the ones used at final inspection.
          </p>
        )}
        {shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Gauge</th>
                  <th className="py-1 pr-2">Kind</th>
                  <th className="py-1 pr-2">Where</th>
                  <th className="py-1 pr-2">Interval</th>
                  <th className="py-1 pr-2">Last calibrated</th>
                  <th className="py-1 pr-2">Calibration</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => (
                  <GaugeRows
                    key={g.id}
                    orgId={orgId}
                    g={g}
                    data={data as GaugesResponse}
                    statusLabel={label(g.status)}
                    kindLabel={kindLabel(g.kind)}
                    canRecord={canRecord}
                    open={open === g.id}
                    onToggle={() => setOpen(open === g.id ? null : g.id)}
                    onEdit={() => startEdit(g)}
                    onDelete={() => remove.mutate(g.id)}
                    onChanged={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorText error={remove.error} />
        {data?.items.some((g) => g.status === "retired") && (
          <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(e) => setShowRetired(e.target.checked)}
            />
            Show retired gauges
          </label>
        )}
        <p className="mt-3 text-xs text-stone-500">
          A record-keeping aid, not a certification: it does not make a quality system conform to
          ISO 9001 or AS9100, and no ISO text is reproduced. Intervals and tolerances are yours; a
          due date here does not say a gauge is fit for a given measurement.
        </p>
      </Card>
      {data && data.due.length > 0 && (
        <Card title="Recall list">
          <p className="mb-2 text-sm text-stone-700">
            What goes to the lab or the bench next: overdue first, then due within{" "}
            {data.dueSoonDays} days, then never calibrated.
          </p>
          <ul className="space-y-1 text-sm">
            {data.due.map((d) => (
              <li key={d.gaugeId}>
                <span className="font-medium">{d.tag}</span> {d.description}:{" "}
                {d.state === "overdue"
                  ? `overdue since ${d.dueOn}`
                  : d.state === "due_soon"
                    ? `due ${d.dueOn}`
                    : "never calibrated"}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded border p-2 ${warn && value > 0 ? "border-red-200 bg-red-50" : "border-stone-200"}`}
    >
      <dt className="text-xs text-stone-600">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function GaugeRows({
  orgId,
  g,
  data,
  statusLabel,
  kindLabel,
  canRecord,
  open,
  onToggle,
  onEdit,
  onDelete,
  onChanged,
}: {
  orgId: string;
  g: GaugeItem;
  data: GaugesResponse;
  statusLabel: string;
  kindLabel: string;
  canRecord: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  return (
    <>
      <tr className="border-t border-stone-100 align-top">
        <td className="py-2 pr-2">
          <div className="font-medium">{g.tag}</div>
          <div className="text-xs text-stone-600">{g.description}</div>
        </td>
        <td className="py-2 pr-2">{kindLabel}</td>
        <td className="py-2 pr-2 text-xs">
          {g.location}
          {g.assignedTo && <div>{g.assignedTo}</div>}
        </td>
        <td className="py-2 pr-2">{g.intervalMonths ? `${g.intervalMonths} mo` : "None"}</td>
        <td className="py-2 pr-2">{g.lastCalibratedOn ?? "None"}</td>
        <td className="py-2 pr-2">
          <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATE_TONE[g.state]}`}>
            {stateText(g, statusLabel)}
          </span>
          {g.issues
            .filter((i) => i.kind !== "soon")
            .map((i) => (
              <div key={i.text} className="mt-1 text-xs text-stone-700">
                {i.text}
              </div>
            ))}
        </td>
        <td className="whitespace-nowrap py-2 text-right">
          <button type="button" className="text-xs text-brand-700 underline" onClick={onToggle}>
            {open ? "Close" : canRecord ? "Calibrations" : "History"}
          </button>
          {canRecord && (
            <>
              {" "}
              <button type="button" className="text-xs text-brand-700 underline" onClick={onEdit}>
                Edit
              </button>
              {g.calibrations === 0 && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </>
              )}
            </>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="pb-3">
            <CalibrationPanel
              orgId={orgId}
              g={g}
              data={data}
              canRecord={canRecord && g.status !== "retired"}
              onChanged={onChanged}
            />
          </td>
        </tr>
      )}
    </>
  );
}

const EMPTY_CAL = {
  calibratedOn: "",
  performer: "external" as CalPerformer,
  performedBy: "",
  asFound: "in_tolerance" as AsFound,
  asLeft: "returned" as AsLeft,
  readings: "",
  certificateNo: "",
  traceability: "",
  evidenceId: null as string | null,
  impact: "",
  correctiveActionRef: "",
};

function CalibrationPanel({
  orgId,
  g,
  data,
  canRecord,
  onChanged,
}: {
  orgId: string;
  g: GaugeItem;
  data: GaugesResponse;
  canRecord: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const key = ["gauge-calibrations", orgId, g.id];
  const history = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ items: CalibrationRecord[] }>(`/api/orgs/${orgId}/gauges/${g.id}/calibrations`),
  });
  const files = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: () => api<{ items: Evidence[] }>(`/api/orgs/${orgId}/evidence`),
    enabled: canRecord,
  });
  const [form, setForm] = useState({ ...EMPTY_CAL, calibratedOn: data.today });
  const done = () => {
    qc.invalidateQueries({ queryKey: key });
    onChanged();
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/gauges/${g.id}/calibrations`, { method: "POST", json: form }),
    onSuccess: () => {
      setForm({ ...EMPTY_CAL, calibratedOn: data.today });
      done();
    },
  });
  const out = form.asFound === "out_of_tolerance";
  return (
    <div className="space-y-3 rounded border border-stone-200 bg-stone-50 p-3">
      <ErrorText error={history.error} />
      {history.data && history.data.items.length === 0 && (
        <p className="text-sm text-stone-600">No calibrations recorded.</p>
      )}
      {history.data && history.data.items.length > 0 && (
        <ul className="space-y-2 text-sm">
          {history.data.items.map((c) => (
            <CalibrationEntry
              key={c.id}
              orgId={orgId}
              gaugeId={g.id}
              c={c}
              data={data}
              canRecord={canRecord}
              onChanged={done}
            />
          ))}
        </ul>
      )}
      {canRecord && (
        <form
          className="grid gap-3 border-t border-stone-200 pt-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm font-medium sm:col-span-2">Record a calibration</p>
          <Field label="Calibrated on">
            <input
              type="date"
              className={inputCls}
              required
              max={data.today}
              value={form.calibratedOn}
              onChange={(e) => setForm({ ...form, calibratedOn: e.target.value })}
            />
          </Field>
          <Field label="Calibrated">
            <select
              className={inputCls}
              value={form.performer}
              onChange={(e) => setForm({ ...form, performer: e.target.value as CalPerformer })}
            >
              {data.performers.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="By" hint="The lab's name, or who did it in house">
            <input
              className={inputCls}
              required
              value={form.performedBy}
              onChange={(e) => setForm({ ...form, performedBy: e.target.value })}
            />
          </Field>
          <Field label="Certificate number">
            <input
              className={inputCls}
              value={form.certificateNo}
              onChange={(e) => setForm({ ...form, certificateNo: e.target.value })}
            />
          </Field>
          <Field
            label="Traceable to"
            hint="The master used (gauge blocks GB-1) or the lab's ISO/IEC 17025 accreditation"
          >
            <input
              className={inputCls}
              value={form.traceability}
              onChange={(e) => setForm({ ...form, traceability: e.target.value })}
            />
          </Field>
          <Field label="As found">
            <select
              className={inputCls}
              value={form.asFound}
              onChange={(e) => setForm({ ...form, asFound: e.target.value as AsFound })}
            >
              {data.asFound.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="As left">
            <select
              className={inputCls}
              value={form.asLeft}
              onChange={(e) => setForm({ ...form, asLeft: e.target.value as AsLeft })}
            >
              {data.asLeft.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Readings" hint="As found and as left, or 'see certificate'">
            <input
              className={inputCls}
              value={form.readings}
              onChange={(e) => setForm({ ...form, readings: e.target.value })}
            />
          </Field>
          <fieldset className="block text-sm sm:col-span-2">
            <legend className="mb-1 block font-medium text-stone-800">Certificate file</legend>
            <select
              className={inputCls}
              aria-label="Certificate file: evidence file"
              value={form.evidenceId ?? ""}
              onChange={(e) => setForm({ ...form, evidenceId: e.target.value || null })}
            >
              <option value="">No file linked</option>
              {form.evidenceId && !files.data?.items.some((f) => f.id === form.evidenceId) && (
                <option value={form.evidenceId}>(uploaded file)</option>
              )}
              {files.data?.items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                  {f.title !== f.fileName ? ` (${f.fileName})` : ""}
                </option>
              ))}
            </select>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-brand-600 underline">
                Upload the certificate here
              </summary>
              <EvidenceUpload
                orgId={orgId}
                label="Calibration certificate"
                defaultTitle={`${g.tag} calibration certificate ${form.calibratedOn}`}
                onUploaded={(ev) => setForm({ ...form, evidenceId: ev.id })}
              />
            </details>
          </fieldset>
          {out && (
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Impact on parts (can be added later)"
                  hint={`What was measured with ${g.tag} since ${g.lastCalibratedOn ?? "its last good calibration"}, what was re-checked, and whether anything shipped needs a customer told`}
                >
                  <textarea
                    className={inputCls}
                    rows={3}
                    value={form.impact}
                    onChange={(e) => setForm({ ...form, impact: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Corrective action" hint="Its number, if one was raised (CA-0007)">
                <input
                  className={inputCls}
                  value={form.correctiveActionRef}
                  onChange={(e) => setForm({ ...form, correctiveActionRef: e.target.value })}
                />
              </Field>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={btnCls} disabled={save.isPending}>
              Record calibration
            </button>
            <ErrorText error={save.error} />
          </div>
        </form>
      )}
    </div>
  );
}

function CalibrationEntry({
  orgId,
  gaugeId,
  c,
  data,
  canRecord,
  onChanged,
}: {
  orgId: string;
  gaugeId: string;
  c: CalibrationRecord;
  data: GaugesResponse;
  canRecord: boolean;
  onChanged: () => void;
}) {
  const [impact, setImpact] = useState("");
  const [caRef, setCaRef] = useState(c.correctiveActionRef);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/gauges/${gaugeId}/calibrations/${c.id}/impact`, {
        method: "PUT",
        json: { impact, correctiveActionRef: caRef },
      }),
    onSuccess: onChanged,
  });
  const found = data.asFound.find((k) => k.key === c.asFound)?.label ?? c.asFound;
  const left = data.asLeft.find((k) => k.key === c.asLeft)?.label ?? c.asLeft;
  const out = c.asFound === "out_of_tolerance";
  return (
    <li className="rounded border border-stone-200 bg-white p-2">
      <div>
        <span className="font-medium">{c.calibratedOn}</span> by {c.performedBy}
        {c.certificateNo && `, certificate ${c.certificateNo}`}.{" "}
        <span className={out ? "font-medium text-red-800" : ""}>{found}</span>; {left}.
        {c.dueOn && ` Due ${c.dueOn}.`}
      </div>
      {(c.traceability || c.readings) && (
        <div className="text-xs text-stone-600">
          {c.traceability && `Traceable to ${c.traceability}. `}
          {c.readings}
        </div>
      )}
      {c.fileName && (
        <div className="text-xs">
          {c.evidenceId ? (
            <a className="underline" href={`/api/orgs/${orgId}/evidence/${c.evidenceId}/download`}>
              {c.fileName}
            </a>
          ) : (
            `${c.fileName} (file deleted)`
          )}
        </div>
      )}
      {out && c.impact && (
        <div className="mt-1 text-xs text-stone-700">
          Impact ({c.impactOn}): {c.impact}
          {c.correctiveActionRef && ` Corrective action ${c.correctiveActionRef}.`}
        </div>
      )}
      {out && !c.impact && canRecord && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Impact on parts">
            <textarea
              className={inputCls}
              rows={2}
              required
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
            />
          </Field>
          <Field label="Corrective action (optional)">
            <input className={inputCls} value={caRef} onChange={(e) => setCaRef(e.target.value)} />
          </Field>
          <button type="submit" className={btnGhostCls} disabled={save.isPending}>
            Save impact
          </button>
          <ErrorText error={save.error} />
        </form>
      )}
    </li>
  );
}
