// QuickBooks Online for one company: connect (admins), see the connection, disconnect. Each sent
// pay application then becomes a QuickBooks invoice from its own page (components/quickbooks.tsx).
import type {
  QuickBooksItemsDto,
  QuickBooksJobItemDto,
  QuickBooksJobTrackingDto,
  QuickBooksLineItemDto,
  QuickBooksLineItemsDto,
  QuickBooksStatusDto,
  QuickBooksTrackingCategoryDto,
  QuickBooksTrackingDto,
} from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";

const REASONS: Record<string, string> = {
  access_denied: "The connection was cancelled on Intuit's page.",
  expired: "The connection took longer than 10 minutes. Start again.",
  exchange_failed: "Intuit did not complete the connection. Start again.",
  unknown_state: "That connection link was already used or was started by someone else.",
  not_admin: "Only an admin of this company can connect QuickBooks.",
};

const day = (iso: string) => new Date(iso).toLocaleDateString();

export function QuickBooksPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/quickbooks" });
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const myRole = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const isAdmin = ROLE_RANK[myRole] >= ROLE_RANK.admin;
  const key = ["quickbooks", orgId];
  const status = useQuery({
    queryKey: key,
    queryFn: () => api<QuickBooksStatusDto>(orgPath(orgId, "/quickbooks")),
  });
  const connect = useMutation({
    mutationFn: () =>
      api<{ url: string }>(orgPath(orgId, "/quickbooks/connect"), { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const disconnect = useMutation({
    mutationFn: () => api<QuickBooksStatusDto>(orgPath(orgId, "/quickbooks"), { method: "DELETE" }),
    onSuccess: (s) => qc.setQueryData(key, s),
  });
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const justConnected = params.get("connected") === "1";
  const error = params.get("error");
  const s = status.data;

  return (
    <div className="grid max-w-2xl gap-4">
      <p className="text-sm">
        <Link to="/orgs/$orgId" params={{ orgId }} className="underline">
          ← Projects
        </Link>
      </p>
      <section className="card">
        <h1 className="mb-2 text-xl font-semibold">QuickBooks Online</h1>
        <p className="mb-3 text-sm text-slate-600">
          Send each pay application to QuickBooks as an invoice to the general contractor. The
          invoice asks for the application's line 8: the work billed this period, less the retainage
          held, which goes to a Retainage Receivable account so QuickBooks shows what is still held
          on every job. Check each invoice in QuickBooks before you rely on it.
        </p>
        {justConnected && s?.connection && (
          <p role="status" className="mb-2 text-sm text-green-700">
            QuickBooks is connected.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {REASONS[error] ?? `QuickBooks did not connect (${error}).`}
          </p>
        )}
        {status.isLoading && <p>Loading…</p>}
        <ErrorText error={status.error ?? connect.error ?? disconnect.error} />
        {s && !s.available && (
          <p className="text-sm">QuickBooks Online is not available on this server yet.</p>
        )}
        {s?.available && !s.planIncludes && (
          <p className="text-sm">
            QuickBooks Online is included in the Crew plan and up.{" "}
            <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
              See plans
            </Link>
          </p>
        )}
        {s?.available && s.planIncludes && !s.connection && (
          <div className="grid gap-2">
            <p className="text-sm">Not connected.</p>
            {isAdmin ? (
              <button
                type="button"
                className="btn w-fit"
                disabled={connect.isPending}
                onClick={() => connect.mutate()}
              >
                Connect QuickBooks
              </button>
            ) : (
              <p className="text-sm text-slate-600">An admin of this company can connect it.</p>
            )}
          </div>
        )}
        {s?.connection && isAdmin && <InvoiceItemPicker orgId={orgId} statusKey={key} />}
        {s?.connection && isAdmin && <JobItemPicker orgId={orgId} />}
        {s?.connection && isAdmin && <JobTrackingPicker orgId={orgId} />}
        {s?.connection && (
          <AutoPaymentsSwitch
            orgId={orgId}
            statusKey={key}
            enabled={s.connection.autoSendPayments}
            isAdmin={isAdmin}
          />
        )}
        {s?.connection && !isAdmin && (
          <p className="mt-2 text-sm text-slate-600">
            Work lines are billed with the QuickBooks item "
            {s.connection.invoiceItem?.name ?? "Contract Billing"}".
          </p>
        )}
        {s?.connection && (
          <div className="mt-2 grid gap-2 text-sm">
            <p>
              Connected to QuickBooks company {s.connection.realmId}
              {s.connection.environment !== "production" ? ` (${s.connection.environment})` : ""} on{" "}
              {day(s.connection.connectedAt)}. Reconnect before {day(s.connection.refreshExpiresAt)}{" "}
              if no invoice is sent until then.
            </p>
            {isAdmin && (
              <button
                type="button"
                className="btn-secondary w-fit"
                disabled={disconnect.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Disconnect QuickBooks? Invoices already sent stay in QuickBooks.",
                    )
                  ) {
                    disconnect.mutate();
                  }
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </section>
      <section className="card text-sm text-slate-600">
        <h2 className="mb-1 font-semibold text-slate-900">What PayApps creates in QuickBooks</h2>
        <ul className="list-disc pl-5">
          <li>A customer named after the job's general contractor (an existing one is reused).</li>
          <li>
            For the work lines, the item you choose above; if you choose none, an income account
            "Contract Income" with a service item "Contract Billing", unless they already exist.
          </li>
          <li>
            An Other Current Asset account "Retainage Receivable" with a service item "Retainage"
            for the retainage lines.
          </li>
          <li>
            One invoice per sent pay application, numbered PA + job number + application number,
            dated the application date and due by the job's pay terms.
          </li>
          <li>
            For each payment received, a payment from the general contractor applied to that
            invoice: sent from the pay application's page, or as soon as it is recorded if you turn
            that on above.
          </li>
        </ul>
      </section>
    </div>
  );
}

/**
 * Admins choose which of the company's own QuickBooks items the work lines are billed with, so the
 * income lands in the account their bookkeeper already uses. The list is read live from QuickBooks.
 */
export function InvoiceItemPicker({ orgId, statusKey }: { orgId: string; statusKey: string[] }) {
  const qc = useQueryClient();
  const key = ["quickbooks-items", orgId];
  const items = useQuery({
    queryKey: key,
    queryFn: () => api<QuickBooksItemsDto>(orgPath(orgId, "/quickbooks/items")),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (itemId: string | null) =>
      api<QuickBooksItemsDto>(orgPath(orgId, "/quickbooks/invoice-item"), {
        method: "PUT",
        body: { itemId },
      }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      setPicked(null);
      void qc.invalidateQueries({ queryKey: statusKey });
    },
  });
  const d = items.data;
  const current = d?.current?.id ?? "";
  const value = picked ?? current;
  const missing = d?.current && !d.items.some((i) => i.id === d.current?.id);
  return (
    <div className="mt-3 grid gap-2 rounded border border-slate-200 p-3 text-sm">
      <label htmlFor="qbo-invoice-item" className="font-semibold">
        Bill the work with this QuickBooks item
      </label>
      <p className="text-slate-600">
        Choose the item your bookkeeper already uses for contract work, so the income posts to your
        own income account. The retainage line always uses the "Retainage" item.
      </p>
      {items.isLoading && <p>Loading items from QuickBooks…</p>}
      <ErrorText error={items.error ?? save.error} />
      {d && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="qbo-invoice-item"
            className="input w-fit"
            value={value}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">
              {d.defaultItemName} (created by PayApps, income account {d.defaultAccountName})
            </option>
            {missing && d.current && (
              <option value={d.current.id}>
                {d.current.name} (no longer active in QuickBooks)
              </option>
            )}
            {d.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.incomeAccountName ? ` (income account ${i.incomeAccountName})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn w-fit"
            disabled={save.isPending || value === current}
            onClick={() => save.mutate(value === "" ? null : value)}
          >
            Save
          </button>
        </div>
      )}
      {missing && (
        <p role="alert" className="text-amber-700">
          "{d?.current?.name}" is no longer active in QuickBooks: invoices will not send until you
          choose another item.
        </p>
      )}
    </div>
  );
}

/**
 * Admins bill one job with a different item from the company's (service work and new
 * construction to different income accounts, say). Shares the item list with InvoiceItemPicker.
 */
export function JobItemPicker({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const key = ["quickbooks-items", orgId];
  const items = useQuery({
    queryKey: key,
    queryFn: () => api<QuickBooksItemsDto>(orgPath(orgId, "/quickbooks/items")),
  });
  const save = useMutation({
    mutationFn: (v: { projectId: string; itemId: string | null }) =>
      api<QuickBooksItemsDto>(orgPath(orgId, `/quickbooks/job-items/${v.projectId}`), {
        method: "PUT",
        body: { itemId: v.itemId },
      }),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const d = items.data;
  if (!d || d.jobs.length === 0) return null;
  const companyItem = d.current?.name ?? d.defaultItemName;
  return (
    <div className="mt-3 grid gap-2 rounded border border-slate-200 p-3 text-sm">
      <h3 className="font-semibold">A different item for one job</h3>
      <p className="text-slate-600">
        Leave a job on the company's item ("{companyItem}") unless its income belongs in another
        account, such as service work billed apart from new construction. Under "Lines", one line of
        a job can have its own item too (equipment, labor and a design fee to different income
        accounts). Invoices already sent are not changed.
      </p>
      <ErrorText error={save.error} />
      <table className="w-full">
        <tbody>
          {d.jobs.map((j) => (
            <JobItemRow
              key={j.projectId}
              orgId={orgId}
              job={j}
              list={d}
              companyItem={companyItem}
              disabled={save.isPending}
              onSave={(itemId) => save.mutate({ projectId: j.projectId, itemId })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JobItemRow(props: {
  orgId: string;
  job: QuickBooksJobItemDto;
  list: QuickBooksItemsDto;
  companyItem: string;
  disabled: boolean;
  onSave: (itemId: string | null) => void;
}) {
  const { orgId, job, list, companyItem, disabled, onSave } = props;
  const current = job.item?.id ?? "";
  const [picked, setPicked] = useState<string | null>(null);
  const [linesOpen, setLinesOpen] = useState(false);
  const value = picked ?? current;
  const missing = job.item && !list.items.some((i) => i.id === job.item?.id);
  const id = `qbo-job-item-${job.projectId}`;
  const label = `${job.number ? `${job.number} ` : ""}${job.name}${job.status === "closed" ? " (closed)" : ""}`;
  const linesId = `qbo-job-lines-${job.projectId}`;
  return (
    <>
      <tr>
        <td className="td">
          <label htmlFor={id}>{label}</label>
          {missing && (
            <p role="alert" className="text-amber-700">
              "{job.item?.name}" is no longer active in QuickBooks: this job's invoices will not
              send until you choose another item.
            </p>
          )}
        </td>
        <td className="td">
          <div className="flex flex-wrap items-center gap-2">
            <select
              id={id}
              className="input w-fit"
              value={value}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">The company's item ({companyItem})</option>
              {missing && job.item && (
                <option value={job.item.id}>
                  {job.item.name} (no longer active in QuickBooks)
                </option>
              )}
              {list.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary w-fit"
              aria-label={`Save the item for ${label}`}
              disabled={disabled || value === current}
              onClick={() => onSave(value === "" ? null : value)}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-secondary w-fit"
              aria-expanded={linesOpen}
              aria-controls={linesId}
              aria-label={`Lines of ${label}`}
              onClick={() => setLinesOpen((o) => !o)}
            >
              Lines
              {job.linesWithOwnItem > 0 ? ` (${job.linesWithOwnItem} with their own item)` : ""}
            </button>
          </div>
        </td>
      </tr>
      {linesOpen && (
        <tr id={linesId}>
          <td className="td" colSpan={2}>
            <LineItemPicker orgId={orgId} projectId={job.projectId} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * One job's schedule-of-values lines, each billed with the job's item unless an admin gives it its
 * own (docs/QUICKBOOKS.md, "An item per line"). Loaded when the job's "Lines" is opened.
 */
export function LineItemPicker({ orgId, projectId }: { orgId: string; projectId: string }) {
  const qc = useQueryClient();
  const key = ["quickbooks-line-items", orgId, projectId];
  const path = orgPath(orgId, `/quickbooks/job-items/${projectId}/lines`);
  const lines = useQuery({ queryKey: key, queryFn: () => api<QuickBooksLineItemsDto>(path) });
  const save = useMutation({
    mutationFn: (v: { sovLineId: string; itemId: string | null }) =>
      api<QuickBooksLineItemsDto>(`${path}/${v.sovLineId}`, {
        method: "PUT",
        body: { itemId: v.itemId },
      }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      void qc.invalidateQueries({ queryKey: ["quickbooks-items", orgId] });
    },
  });
  const d = lines.data;
  if (lines.error) return <ErrorText error={lines.error} />;
  if (!d) return <p className="text-slate-600">Loading the job's lines…</p>;
  if (d.lines.length === 0)
    return <p className="text-slate-600">This job has no schedule-of-values lines yet.</p>;
  return (
    <div className="grid gap-2">
      <p className="text-slate-600">
        Each line is billed with "{d.fallbackItemName}" unless you choose another for it.
      </p>
      <ErrorText error={save.error} />
      <table className="w-full">
        <tbody>
          {d.lines.map((l) => (
            <LineItemRow
              key={l.sovLineId}
              line={l}
              list={d}
              disabled={save.isPending}
              onSave={(itemId) => save.mutate({ sovLineId: l.sovLineId, itemId })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineItemRow(props: {
  line: QuickBooksLineItemDto;
  list: QuickBooksLineItemsDto;
  disabled: boolean;
  onSave: (itemId: string | null) => void;
}) {
  const { line, list, disabled, onSave } = props;
  const current = line.item?.id ?? "";
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? current;
  const missing = line.item && !list.items.some((i) => i.id === line.item?.id);
  const id = `qbo-line-item-${line.sovLineId}`;
  const label = [line.itemNumber, line.description].filter(Boolean).join(" ");
  return (
    <tr>
      <td className="td">
        <label htmlFor={id}>{label}</label>
        {missing && (
          <p role="alert" className="text-amber-700">
            "{line.item?.name}" is no longer active in QuickBooks: invoices that bill this line will
            not send until you choose another item.
          </p>
        )}
      </td>
      <td className="td">
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={id}
            className="input w-fit"
            value={value}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">The job's item ({list.fallbackItemName})</option>
            {missing && line.item && (
              <option value={line.item.id}>
                {line.item.name} (no longer active in QuickBooks)
              </option>
            )}
            {list.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary w-fit"
            aria-label={`Save the item for line ${label}`}
            disabled={disabled || value === current}
            onClick={() => onSave(value === "" ? null : value)}
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Admins choose whether each payment goes to QuickBooks as soon as it is recorded. Others see the
 * setting. Off by default: the manual "Send to QuickBooks" on each payment stays either way.
 */
function AutoPaymentsSwitch(props: {
  orgId: string;
  statusKey: string[];
  enabled: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      api<QuickBooksStatusDto>(orgPath(props.orgId, "/quickbooks/auto-payments"), {
        method: "PUT",
        body: { enabled },
      }),
    onSuccess: (s) => qc.setQueryData(props.statusKey, s),
  });
  return (
    <div className="mt-3 grid gap-1 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.enabled}
          disabled={!props.isAdmin || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Send each payment to QuickBooks as soon as it is recorded
      </label>
      <p className="text-slate-600">
        Only for applications whose invoice is already in QuickBooks. Each payment is checked the
        same way as a manual send: if QuickBooks shows a different open balance (someone entered the
        check there already, or changed the invoice), nothing is sent and the pay application says
        why. Recording the payment in PayApps never waits on QuickBooks.
        {!props.isAdmin && " An admin can change this."}
      </p>
      <ErrorText error={save.error} />
    </div>
  );
}

/**
 * Admins give each job the QuickBooks class and location its invoices carry, for companies on
 * QuickBooks Plus or Advanced that track them (docs/QUICKBOOKS.md, "Class and location per job").
 * Shows nothing while the company tracks neither.
 */
export function JobTrackingPicker({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const key = ["quickbooks-tracking", orgId];
  const tracking = useQuery({
    queryKey: key,
    queryFn: () => api<QuickBooksTrackingDto>(orgPath(orgId, "/quickbooks/tracking")),
  });
  const save = useMutation({
    mutationFn: (v: { projectId: string; classId?: string | null; locationId?: string | null }) => {
      const { projectId, ...body } = v;
      return api<QuickBooksTrackingDto>(orgPath(orgId, `/quickbooks/tracking/${projectId}`), {
        method: "PUT",
        body,
      });
    },
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const d = tracking.data;
  if (tracking.error) return <ErrorText error={tracking.error} />;
  if (!d || d.jobs.length === 0) return null;
  const classes = d.classTracking !== "off";
  if (!classes && !d.locationTracking) return null;
  const where =
    d.classTracking === "per-line" ? "on every line of its invoices" : "on each of its invoices";
  return (
    <div className="mt-3 grid gap-2 rounded border border-slate-200 p-3 text-sm">
      <h3 className="font-semibold">
        {classes && d.locationTracking
          ? `Class and ${d.locationLabel.toLowerCase()} per job`
          : classes
            ? "Class per job"
            : `${d.locationLabel} per job`}
      </h3>
      <p className="text-slate-600">
        {classes ? `A job's class goes ${where}, as your QuickBooks company tracks classes. ` : ""}
        {d.locationTracking ? `Its ${d.locationLabel.toLowerCase()} goes on each invoice. ` : ""}
        Credit memos for a balance closed short carry them too. Invoices already sent are not
        changed.
      </p>
      <ErrorText error={save.error} />
      <table className="w-full">
        <tbody>
          {d.jobs.map((j) => (
            <JobTrackingRow
              key={j.projectId}
              job={j}
              list={d}
              disabled={save.isPending}
              onSave={(v) => save.mutate({ projectId: j.projectId, ...v })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrackingSelect(props: {
  id: string;
  label: string;
  value: string;
  current: { id: string; name: string } | null;
  options: QuickBooksTrackingCategoryDto[];
  onChange: (v: string) => void;
}) {
  const { id, label, value, current, options, onChange } = props;
  const missing = current && !options.some((o) => o.id === current.id);
  return (
    <select
      id={id}
      aria-label={label}
      className="input w-fit"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None</option>
      {missing && current && (
        <option value={current.id}>{current.name} (no longer active in QuickBooks)</option>
      )}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.fullName}
        </option>
      ))}
    </select>
  );
}

function JobTrackingRow(props: {
  job: QuickBooksJobTrackingDto;
  list: QuickBooksTrackingDto;
  disabled: boolean;
  onSave: (v: { classId?: string | null; locationId?: string | null }) => void;
}) {
  const { job, list, disabled, onSave } = props;
  const curClass = job.class?.id ?? "";
  const curLoc = job.location?.id ?? "";
  const [pickedClass, setPickedClass] = useState<string | null>(null);
  const [pickedLoc, setPickedLoc] = useState<string | null>(null);
  const cls = pickedClass ?? curClass;
  const loc = pickedLoc ?? curLoc;
  const label = `${job.number ? `${job.number} ` : ""}${job.name}${job.status === "closed" ? " (closed)" : ""}`;
  const classes = list.classTracking !== "off";
  const gone = [
    classes && job.class && !list.classes.some((c) => c.id === job.class?.id)
      ? `class "${job.class.name}"`
      : null,
    list.locationTracking && job.location && !list.locations.some((l) => l.id === job.location?.id)
      ? `${list.locationLabel.toLowerCase()} "${job.location.name}"`
      : null,
  ].filter(Boolean);
  const changed = (classes && cls !== curClass) || (list.locationTracking && loc !== curLoc);
  return (
    <tr>
      <td className="td">
        {label}
        {gone.length > 0 && (
          <p role="alert" className="text-amber-700">
            The {gone.join(" and the ")} {gone.length > 1 ? "are" : "is"} no longer active in
            QuickBooks: this job's invoices will not send until you choose another or None.
          </p>
        )}
      </td>
      <td className="td">
        <div className="flex flex-wrap items-center gap-2">
          {classes && (
            <TrackingSelect
              id={`qbo-job-class-${job.projectId}`}
              label={`Class for ${label}`}
              value={cls}
              current={job.class}
              options={list.classes}
              onChange={setPickedClass}
            />
          )}
          {list.locationTracking && (
            <TrackingSelect
              id={`qbo-job-location-${job.projectId}`}
              label={`${list.locationLabel} for ${label}`}
              value={loc}
              current={job.location}
              options={list.locations}
              onChange={setPickedLoc}
            />
          )}
          <button
            type="button"
            className="btn-secondary w-fit"
            aria-label={`Save the class and ${list.locationLabel.toLowerCase()} for ${label}`}
            disabled={disabled || !changed}
            onClick={() => {
              onSave({
                ...(classes && cls !== curClass ? { classId: cls === "" ? null : cls } : {}),
                ...(list.locationTracking && loc !== curLoc
                  ? { locationId: loc === "" ? null : loc }
                  : {}),
              });
              setPickedClass(null);
              setPickedLoc(null);
            }}
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}
