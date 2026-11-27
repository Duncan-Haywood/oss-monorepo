// One project: schedule of values, change orders and pay applications.
import type { PayAppDetailDto, ProjectDetailDto, RfiDto, SovLineDto } from "@shared/api/types";
import { lastEmailedText } from "@shared/change-order-email";
import { formatBps, formatCents, parseDollarsToCents } from "@shared/money";
import { changeOrderDraftFromRfi, rfiLabel } from "@shared/rfi";
import {
  COMMON_UNITS,
  extendCents,
  formatQuantity,
  formatUnitPrice,
  MAX_UNIT_LENGTH,
  parseQuantity,
  parseUnitPrice,
  quantityDecimal,
  unitPriceDecimal,
} from "@shared/unit-price";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { BillingCutoff } from "../components/billing-cutoff";
import { ChangeOrderEmailDraft } from "../components/change-order-email";
import { Closeout } from "../components/closeout";
import { ErrorText } from "../components/error";
import { GcBillingContact, GcContact } from "../components/gc-billing-contact";
import { GcpaySov } from "../components/gcpay-sov";
import { HistoryPanel } from "../components/history";
import { JobInsuranceRequirements } from "../components/insurance-requirements";
import { JobSchedule } from "../components/job-schedule";
import { meQuery } from "../components/layout";
import { LienDeadlinePanel } from "../components/lien-deadline";
import { LienNoticesPanel } from "../components/lien-notices";
import { NotaryBlockSwitch } from "../components/notary-block";
import { OpeningBalance } from "../components/opening-balance";
import { OwnerPaymentsBulk } from "../components/owner-payment";
import { PayTerms } from "../components/pay-terms";
import { ProcoreSsov } from "../components/procore-ssov";
import { PunchList } from "../components/punch-list";
import { RfiLog } from "../components/rfis";
import { DelayBackup } from "../components/schedule-delays";
import { SovImport } from "../components/sov-import";
import { TrimblePaySov } from "../components/trimble-pay-sov";
import { api, projectPath } from "../lib/api";

const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ProjectPage() {
  const { orgId, projectId } = useParams({ from: "/orgs/$orgId/projects/$projectId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ["project", orgId, projectId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<ProjectDetailDto>(projectPath(orgId, projectId)),
  });
  const setData = (d: ProjectDetailDto) => qc.setQueryData(key, d);
  const path = (p: string) => projectPath(orgId, projectId, p);

  // Schedule of values.
  const emptyLine = { itemNumber: "", description: "", amount: "", qty: "", unit: "", price: "" };
  const [line, setLine] = useState(emptyLine);
  const [unitPriced, setUnitPriced] = useState(false);
  const linePricing = unitPriced ? readUnitPricing(line.qty, line.unit, line.price) : null;
  const addLine = useMutation({
    mutationFn: () => {
      if (linePricing && "error" in linePricing) throw new Error(linePricing.error);
      const cents = linePricing ? linePricing.cents : parseDollarsToCents(line.amount);
      // (readUnitPricing always gives cents when the quantity is required, as it is here.)
      if (cents === null || cents < 0) throw new Error("Enter the scheduled value in dollars");
      return api<ProjectDetailDto>(path("/sov-lines"), {
        method: "POST",
        body: {
          itemNumber: line.itemNumber,
          description: line.description,
          originalCents: cents,
          ...(linePricing
            ? {
                unit: linePricing.unit,
                unitPriceMicros: linePricing.unitPriceMicros,
                quantityMilli: linePricing.quantityMilli,
              }
            : {}),
        },
      });
    },
    onSuccess: (d) => {
      setData(d);
      setLine({ ...emptyLine, itemNumber: String(d.sovLines.length + 1), unit: line.unit });
    },
  });
  const removeLine = useMutation({
    mutationFn: (id: string) =>
      api<ProjectDetailDto>(path(`/sov-lines/${id}`), { method: "DELETE" }),
    onSuccess: setData,
  });

  // Change orders.
  const [filesFor, setFilesFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const me = useQuery(meQuery);
  const from = {
    name: me.data?.user.name ?? "",
    company: me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "",
  };
  const [co, setCo] = useState({
    number: "",
    description: "",
    target: "",
    newItem: "",
    amount: "",
    sent: "",
    days: "",
  });
  // Set by "Start a change order" on an answered RFI: the change order saved next is linked to it.
  const [coRfi, setCoRfi] = useState<{ id: string; number: number } | null>(null);
  const coForm = useRef<HTMLFormElement>(null);
  const startFromRfi = (r: RfiDto) => {
    setCo((prev) => ({ ...prev, ...changeOrderDraftFromRfi(r) }));
    setCoRfi({ id: r.id, number: r.number });
    coForm.current?.scrollIntoView({ block: "center" });
    coForm.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };
  const addCo = useMutation({
    mutationFn: () => {
      const cents = parseDollarsToCents(co.amount);
      if (cents === null)
        throw new Error("Enter the change order amount in dollars (negative for a deduction)");
      const days = co.days.trim();
      if (days !== "" && !/^\d{1,4}$/.test(days))
        throw new Error("Enter the contract time requested in whole calendar days (0 for none)");
      const item =
        co.target === "new"
          ? { newLine: { itemNumber: co.newItem, description: co.description }, amountCents: cents }
          : { sovLineId: co.target, amountCents: cents };
      return api<ProjectDetailDto>(path("/change-orders"), {
        method: "POST",
        body: {
          number: co.number,
          description: co.description,
          submittedOn: co.sent || null,
          scheduleDays: days === "" ? null : Number(days),
          items: [item],
          ...(coRfi ? { rfiId: coRfi.id } : {}),
        },
      });
    },
    onSuccess: async (d) => {
      setData(d);
      if (coRfi) {
        setCoRfi(null);
        // The RFI log shows the link, and the job history has a row for it.
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["rfis"] }),
          qc.invalidateQueries({ queryKey: ["pay-app-history"] }),
        ]);
      }
      setCo({
        number: "",
        description: "",
        target: "",
        newItem: "",
        amount: "",
        sent: "",
        days: "",
      });
    },
  });
  const coAction = useMutation({
    mutationFn: ({
      id,
      action,
      approvedOn,
      submittedOn,
      scheduleDays,
    }: {
      id: string;
      action: "approve" | "reject" | "delete" | "sent" | "schedule";
      approvedOn?: string;
      submittedOn?: string | null;
      scheduleDays?: number | null;
    }) =>
      api<ProjectDetailDto>(
        path(`/change-orders/${id}${action === "delete" ? "" : `/${action}`}`),
        {
          method:
            action === "delete"
              ? "DELETE"
              : action === "sent" || action === "schedule"
                ? "PUT"
                : "POST",
          ...(action === "approve" ? { body: { approvedOn } } : {}),
          ...(action === "sent" ? { body: { submittedOn } } : {}),
          ...(action === "schedule" ? { body: { scheduleDays } } : {}),
        },
      ),
    onSuccess: setData,
  });

  // An email draft was copied or opened: "last emailed" on the row (best effort; a viewer's 403 is ignored).
  const coEmailed = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "request" | "follow-up" }) =>
      api<ProjectDetailDto>(path(`/change-orders/${id}/emailed`), {
        method: "POST",
        body: { kind },
      }),
    onSuccess: setData,
  });

  // Pay apps.
  const newPayApp = useMutation({
    mutationFn: () => {
      const last = q.data?.payApps.at(-1);
      const opening = q.data?.opening;
      const periodFrom = last
        ? addDays(last.periodTo, 1)
        : opening
          ? addDays(opening.periodTo, 1)
          : today().slice(0, 8).concat("01");
      const periodTo = [periodFrom, today()].sort().at(-1) ?? periodFrom;
      return api<PayAppDetailDto>(path("/pay-apps"), {
        method: "POST",
        body: { periodFrom, periodTo, applicationDate: periodTo },
      });
    },
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: key });
      await navigate({
        to: "/orgs/$orgId/projects/$projectId/pay-apps/$payAppId",
        params: { orgId, projectId, payAppId: a.id },
      });
    },
  });

  const removeSample = useMutation({
    mutationFn: () => api(projectPath(orgId, projectId), { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects", orgId] });
      await qc.invalidateQueries({ queryKey: ["cash", orgId] });
      await navigate({ to: "/orgs/$orgId", params: { orgId } });
    },
  });

  if (q.isLoading) return <p>Loading…</p>;
  if (!q.data) return <ErrorText error={q.error} />;
  const p = q.data;
  const lineName = (id: string) => {
    const l = p.sovLines.find((x) => x.id === id);
    return l ? `${l.itemNumber} ${l.description}` : "?";
  };
  const mismatch = p.sovTotalCents !== p.originalContractSumCents;

  return (
    <div className="space-y-6">
      {p.isSample && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            <strong>Sample job.</strong> Invented names and numbers, to try PayApps on: open an
            application, fill in this month's draft, download a PDF or look at the cash report. It
            does not count toward your plan, and every PDF says SAMPLE DATA.
          </p>
          <button
            type="button"
            className="mt-2 underline"
            disabled={removeSample.isPending}
            onClick={() => {
              if (window.confirm("Remove the sample job and everything in it?"))
                removeSample.mutate();
            }}
          >
            Remove the sample job
          </button>
          <ErrorText error={removeSample.error} />
        </div>
      )}
      <div>
        <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm text-slate-600 underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">
          {p.name} {p.number && <span className="text-base text-slate-500">({p.number})</span>}
        </h1>
        <p className="text-sm text-slate-600">
          GC: {p.gcName} · Contract {formatCents(p.originalContractSumCents)} · Retainage{" "}
          {formatBps(p.retainagePctBps)}
          {p.billingStarted && " · Original SOV locked (billing started)"} ·{" "}
          <Link
            to="/orgs/$orgId/projects/$projectId/job-cost"
            params={{ orgId, projectId }}
            className="underline"
          >
            Job cost
          </Link>
          {" · "}
          <Link
            to="/orgs/$orgId/projects/$projectId/certified-payroll"
            params={{ orgId, projectId }}
            className="underline"
          >
            Certified payroll
          </Link>
          {" · "}
          <Link
            to="/orgs/$orgId/projects/$projectId/sworn-statement"
            params={{ orgId, projectId }}
            className="underline"
          >
            Sworn statement
          </Link>
          {" · "}
          <Link
            to="/orgs/$orgId/projects/$projectId/submittals"
            params={{ orgId, projectId }}
            className="underline"
          >
            Submittals
          </Link>
          {" · "}
          <Link
            to="/orgs/$orgId/projects/$projectId/daily-reports"
            params={{ orgId, projectId }}
            className="underline"
          >
            Daily reports
          </Link>
          {" · "}
          <Link
            to="/orgs/$orgId/projects/$projectId/tm-tickets"
            params={{ orgId, projectId }}
            className="underline"
          >
            T&amp;M tickets
          </Link>
        </p>
        <div className="text-sm text-slate-600">
          <PayTerms
            path={projectPath(orgId, projectId)}
            days={p.payTermsDays}
            basis={p.payTermsBasis}
            outerDays={p.payTermsOuterDays}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: key });
              await qc.invalidateQueries({ queryKey: ["cash", orgId] });
            }}
          />
        </div>
        <div className="text-sm text-slate-600">
          <BillingCutoff
            path={projectPath(orgId, projectId)}
            day={p.billingDay}
            payApps={p.payApps}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: key });
              await qc.invalidateQueries({ queryKey: ["cash", orgId] });
            }}
          />
        </div>
        <div className="text-sm text-slate-600">
          <GcBillingContact
            path={projectPath(orgId, projectId)}
            name={p.gcBillingName}
            email={p.gcBillingEmail}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: key });
              await qc.invalidateQueries({ queryKey: ["cash", orgId] });
            }}
          />
        </div>
        <div className="text-sm text-slate-600">
          <GcContact
            kind="pm"
            path={projectPath(orgId, projectId)}
            name={p.gcPmName}
            email={p.gcPmEmail}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: key });
            }}
          />
        </div>
        <div className="text-sm text-slate-600">
          <NotaryBlockSwitch
            path={projectPath(orgId, projectId)}
            on={p.notaryBlock}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: key });
            }}
          />
        </div>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Schedule of values</h2>
        {mismatch && (
          <p className="mb-2 text-sm text-red-700">
            Lines total {formatCents(p.sovTotalCents)}; the contract sum is{" "}
            {formatCents(p.originalContractSumCents)}. They must match before you submit.
          </p>
        )}
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th">Description</th>
              <th
                className="th"
                title="Unit-price lines are billed by the quantity installed each period"
              >
                Pricing
              </th>
              <th className="th text-right">Original</th>
              <th className="th text-right">Current (with approved COs)</th>
              <th
                className="th text-right"
                title="Leave blank to follow each pay application's rate; enter 0 for a line billed with no retainage, such as a bond"
              >
                Retainage
              </th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {p.sovLines.map((l) => (
              <tr key={l.id}>
                <td className="td">{l.itemNumber}</td>
                <td className="td">
                  {l.description}
                  {l.changeOrderId && (
                    <span className="ml-1 text-xs text-slate-500">(from CO)</span>
                  )}
                </td>
                <td className="td">
                  <LineUnitPrice
                    key={`${l.id}:${l.unit}:${l.unitPriceMicros}:${l.quantityMilli}:${l.originalCents}`}
                    line={l}
                    path={path(`/sov-lines/${l.id}`)}
                    billingStarted={p.billingStarted}
                    onSaved={setData}
                  />
                </td>
                <td className="td text-right">{formatCents(l.originalCents)}</td>
                <td className="td text-right">{formatCents(l.currentCents)}</td>
                <td className="td text-right">
                  <LineRetainage
                    key={`${l.id}:${l.retainagePctBps}`}
                    line={l}
                    path={path(`/sov-lines/${l.id}`)}
                    jobRate={formatBps(p.retainagePctBps)}
                    onSaved={setData}
                  />
                </td>
                <td className="td text-right">
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => removeLine.mutate(l.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="td font-semibold" colSpan={3}>
                Total
              </td>
              <td className="td text-right font-semibold">{formatCents(p.sovTotalCents)}</td>
              <td className="td text-right font-semibold">
                {formatCents(p.sovLines.reduce((s, l) => s + l.currentCents, 0))}
              </td>
              <td className="td" />
              <td className="td" />
            </tr>
          </tbody>
        </table>
        <ErrorText error={removeLine.error} />
        {!p.billingStarted && (
          <form
            className="mt-3 grid grid-cols-12 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLine.mutate();
            }}
          >
            <input
              className="input col-span-2"
              placeholder="Item"
              value={line.itemNumber}
              onChange={(e) => setLine({ ...line, itemNumber: e.target.value })}
              required
            />
            <input
              className="input col-span-6"
              placeholder="Description of work"
              value={line.description}
              onChange={(e) => setLine({ ...line, description: e.target.value })}
              required
            />
            {unitPriced ? (
              <span
                className="col-span-2 self-center text-right text-sm"
                title="Quantity × unit price"
              >
                {linePricing && "cents" in linePricing && linePricing.cents !== null
                  ? formatCents(linePricing.cents)
                  : "—"}
              </span>
            ) : (
              <input
                className="input col-span-2 text-right"
                placeholder="Value ($)"
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => setLine({ ...line, amount: e.target.value })}
                required
              />
            )}
            <button
              className="btn col-span-2 justify-center"
              type="submit"
              disabled={addLine.isPending}
            >
              Add line
            </button>
            <label className="col-span-12 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={unitPriced}
                onChange={(e) => setUnitPriced(e.target.checked)}
              />
              Unit price (billed by quantity installed: CY, LF, TON...)
            </label>
            {unitPriced && (
              <>
                <input
                  className="input col-span-4 text-right"
                  placeholder="Contract quantity"
                  aria-label="Contract quantity"
                  inputMode="decimal"
                  value={line.qty}
                  onChange={(e) => setLine({ ...line, qty: e.target.value })}
                  required
                />
                <input
                  className="input col-span-3"
                  placeholder="Unit (CY)"
                  aria-label="Unit"
                  list="sov-units"
                  maxLength={MAX_UNIT_LENGTH}
                  value={line.unit}
                  onChange={(e) => setLine({ ...line, unit: e.target.value })}
                  required
                />
                <datalist id="sov-units">
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                <input
                  className="input col-span-3 text-right"
                  placeholder="Unit price ($)"
                  aria-label="Unit price"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => setLine({ ...line, price: e.target.value })}
                  required
                />
              </>
            )}
          </form>
        )}
        <ErrorText error={addLine.error} />
        {!p.billingStarted && (
          <SovImport
            orgId={orgId}
            project={p}
            bulkPath={path("/sov-lines/bulk")}
            onImported={setData}
          />
        )}
        {p.sovLines.length > 0 && (
          <>
            <ProcoreSsov project={p} path={path("/procore-ssov")} onSaved={setData} />
            <GcpaySov project={p} />
            <TrimblePaySov project={p} />
          </>
        )}
      </section>

      <OpeningBalance project={p} path={path("/opening")} onSaved={setData} />

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Change orders</h2>
        <table className="w-full">
          <tbody>
            {p.changeOrders.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td className="td font-medium">{c.number}</td>
                  <td className="td">
                    {c.description}
                    <div className="text-xs text-slate-500">
                      {c.items
                        .map((i) => `${lineName(i.sovLineId)}: ${formatCents(i.amountCents)}`)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="td text-right">{formatCents(c.totalCents)}</td>
                  <td className="td">
                    {c.status}
                    {c.approvedOn && ` ${c.approvedOn}`}
                    {c.status === "pending" && (
                      <div className="text-xs text-slate-500">
                        {c.submittedOn ? `sent to GC ${c.submittedOn}` : "date sent not recorded"}
                      </div>
                    )}
                    {c.status === "pending" && c.lastEmailedOn && (
                      <div
                        className="text-xs text-slate-500"
                        title="The last day an email draft about it was copied or opened here (PayApps does not see whether it was sent)"
                      >
                        {lastEmailedText(c.lastEmailedOn, today())}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      {c.scheduleDays === null
                        ? "time not stated"
                        : c.scheduleDays === 0
                          ? "no time added"
                          : `+${c.scheduleDays} calendar day${c.scheduleDays === 1 ? "" : "s"}`}
                    </div>
                  </td>
                  <td className="td text-right">
                    <a
                      className="mr-2 text-xs underline"
                      href={path(`/change-orders/${encodeURIComponent(c.id)}/request.pdf`)}
                      title={
                        c.status === "approved"
                          ? "The approved change order as a PDF"
                          : "A change order request to send the GC: scope, price by line, contract sum before and after, signature blocks"
                      }
                    >
                      PDF
                    </a>
                    <a
                      className="mr-2 text-xs underline"
                      href={path(`/change-orders/${encodeURIComponent(c.id)}/packet.pdf`)}
                      title="The change order PDF, an index and its PDF and photo backup in one PDF (not the signed copy)"
                    >
                      PDF + backup
                    </a>
                    <button
                      type="button"
                      className="mr-2 text-xs underline"
                      aria-expanded={filesFor === c.id}
                      onClick={() => setFilesFor(filesFor === c.id ? null : c.id)}
                    >
                      Files
                    </button>
                    <button
                      type="button"
                      className="mr-2 text-xs underline"
                      aria-expanded={historyFor === c.id}
                      title="Who entered, sent, changed, approved or rejected this change order, and when"
                      onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}
                    >
                      History
                    </button>
                    {c.status === "pending" && (
                      <button
                        type="button"
                        className="mr-2 text-xs underline"
                        aria-expanded={emailFor === c.id}
                        title={
                          c.submittedOn
                            ? "A follow-up email draft to the GC's project manager, asking where this request stands"
                            : "An email draft to the GC's project manager, asking them to review and sign this request"
                        }
                        onClick={() => setEmailFor(emailFor === c.id ? null : c.id)}
                      >
                        Email
                      </button>
                    )}
                    {c.status === "pending" && (
                      <span className="space-x-2 text-xs">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            const approvedOn = window.prompt("Approval date (YYYY-MM-DD)", today());
                            if (approvedOn)
                              coAction.mutate({ id: c.id, action: "approve", approvedOn });
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            const sent = window.prompt(
                              "Date this change order went to the GC (YYYY-MM-DD; empty to clear)",
                              c.submittedOn ?? today(),
                            );
                            if (sent !== null)
                              coAction.mutate({
                                id: c.id,
                                action: "sent",
                                submittedOn: sent.trim() || null,
                              });
                          }}
                        >
                          Date sent
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            const days = window.prompt(
                              "Contract time requested, in calendar days (0 for none; empty if not stated)",
                              c.scheduleDays === null ? "" : String(c.scheduleDays),
                            );
                            if (days === null) return;
                            const t = days.trim();
                            if (t !== "" && !/^\d{1,4}$/.test(t)) {
                              window.alert("Enter whole calendar days, 0 for none.");
                              return;
                            }
                            coAction.mutate({
                              id: c.id,
                              action: "schedule",
                              scheduleDays: t === "" ? null : Number(t),
                            });
                          }}
                        >
                          Time
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => coAction.mutate({ id: c.id, action: "reject" })}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="text-red-700 underline"
                          onClick={() => coAction.mutate({ id: c.id, action: "delete" })}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
                {filesFor === c.id && (
                  <tr>
                    <td className="td bg-slate-50" colSpan={5}>
                      <AttachmentsPanel
                        base={path(`/change-orders/${encodeURIComponent(c.id)}`)}
                        holder="changeOrder"
                        embedded
                      />
                      <DelayBackup
                        projectBase={path("")}
                        base={path(`/change-orders/${encodeURIComponent(c.id)}`)}
                      />
                    </td>
                  </tr>
                )}
                {emailFor === c.id && c.status === "pending" && (
                  <tr>
                    <td className="td bg-slate-50" colSpan={5}>
                      <ChangeOrderEmailDraft
                        key={[c.id, p.gcPmName, p.gcPmEmail, c.submittedOn, c.totalCents].join("|")}
                        project={p}
                        changeOrder={c}
                        from={from}
                        today={today()}
                        onUsed={(kind) => coEmailed.mutate({ id: c.id, kind })}
                        onMarkSent={() =>
                          coAction.mutate({ id: c.id, action: "sent", submittedOn: today() })
                        }
                      />
                    </td>
                  </tr>
                )}
                {historyFor === c.id && (
                  <tr>
                    <td className="td bg-slate-50" colSpan={5}>
                      <HistoryPanel
                        base={path(`/change-orders/${encodeURIComponent(c.id)}`)}
                        title={`Change order ${c.number} history`}
                        version={q.dataUpdatedAt}
                        csv
                        initiallyOpen
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <ErrorText error={coAction.error} />
        {coRfi && (
          <p className="mt-3 text-sm text-slate-700" role="status">
            From {rfiLabel(coRfi.number)}: saving this change order links it to the RFI. Pick the
            line and enter the amount.{" "}
            <button className="link" type="button" onClick={() => setCoRfi(null)}>
              Don&apos;t link
            </button>
          </p>
        )}
        <form
          ref={coForm}
          className="mt-3 grid grid-cols-12 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCo.mutate();
          }}
        >
          <input
            className="input col-span-1"
            placeholder="CO #"
            value={co.number}
            onChange={(e) => setCo({ ...co, number: e.target.value })}
            required
          />
          <input
            className="input col-span-2"
            placeholder="Description"
            value={co.description}
            onChange={(e) => setCo({ ...co, description: e.target.value })}
            required
          />
          <input
            className="input col-span-2"
            type="date"
            aria-label="Date sent to the GC (optional)"
            title="Date sent to the GC (optional)"
            max={today()}
            value={co.sent}
            onChange={(e) => setCo({ ...co, sent: e.target.value })}
          />
          <select
            aria-label="Line adjusted"
            className="input col-span-2"
            value={co.target}
            onChange={(e) => setCo({ ...co, target: e.target.value })}
            required
          >
            <option value="">Line adjusted…</option>
            {p.sovLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.itemNumber} {l.description}
              </option>
            ))}
            <option value="new">New line</option>
          </select>
          {co.target === "new" && (
            <input
              className="input col-span-1"
              placeholder="Item"
              value={co.newItem}
              onChange={(e) => setCo({ ...co, newItem: e.target.value })}
              required
            />
          )}
          <input
            className="input col-span-1 text-right"
            placeholder="Days"
            aria-label="Contract time requested, calendar days (optional)"
            title="Contract time requested, calendar days (optional; 0 for none)"
            inputMode="numeric"
            value={co.days}
            onChange={(e) => setCo({ ...co, days: e.target.value })}
          />
          <input
            className={`input text-right ${co.target === "new" ? "col-span-1" : "col-span-2"}`}
            placeholder="Amount ($)"
            inputMode="decimal"
            value={co.amount}
            onChange={(e) => setCo({ ...co, amount: e.target.value })}
            required
          />
          <button
            className="btn col-span-2 justify-center"
            type="submit"
            disabled={addCo.isPending}
          >
            Add change order
          </button>
        </form>
        <ErrorText error={addCo.error} />
      </section>

      <RfiLog
        base={projectPath(orgId, projectId, "")}
        job={p}
        changeOrders={p.changeOrders}
        from={from}
        onStartChangeOrder={startFromRfi}
      />

      <JobSchedule base={projectPath(orgId, projectId, "")} job={p} />

      <PunchList base={projectPath(orgId, projectId, "")} job={p} from={from} />

      <Closeout base={projectPath(orgId, projectId, "")} job={p} from={from} />

      <section className="card overflow-x-auto">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Pay applications</h2>
          <button
            type="button"
            className="btn"
            disabled={newPayApp.isPending || p.payApps.at(-1)?.status === "draft"}
            onClick={() => newPayApp.mutate()}
          >
            New pay application
          </button>
        </div>
        <ErrorText error={newPayApp.error} />
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Period</th>
              <th className="th">Status</th>
              <th className="th text-right">Current payment due</th>
              <th className="th text-right">Certified</th>
            </tr>
          </thead>
          <tbody>
            {p.payApps.map((a) => (
              <tr key={a.id}>
                <td className="td">
                  <Link
                    to="/orgs/$orgId/projects/$projectId/pay-apps/$payAppId"
                    params={{ orgId, projectId, payAppId: a.id }}
                    className="font-medium underline"
                  >
                    #{a.number}
                  </Link>
                </td>
                <td className="td">
                  {a.periodFrom} – {a.periodTo}
                </td>
                <td className="td">{a.status}</td>
                <td className="td text-right">{formatCents(a.currentPaymentDueCents)}</td>
                <td className="td text-right">
                  {a.certifiedAmountCents === null ? "" : formatCents(a.certifiedAmountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {p.payTermsBasis === "owner_paid" && (
        <OwnerPaymentsBulk
          key={p.payApps.map((a) => `${a.id}:${a.status}:${a.ownerPaidOn ?? ""}`).join(",")}
          base={projectPath(orgId, projectId, "/pay-apps")}
          apps={p.payApps}
          gcName={p.gcName}
          onChanged={setData}
        />
      )}

      <JobInsuranceRequirements
        orgId={orgId}
        projectId={projectId}
        contractSumCents={p.originalContractSumCents}
      />
      <LienDeadlinePanel
        path={projectPath(orgId, projectId)}
        project={p}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: key });
          await qc.invalidateQueries({ queryKey: ["cash", orgId] });
        }}
      />
      <LienNoticesPanel orgId={orgId} base={projectPath(orgId, projectId)} />

      <HistoryPanel
        base={projectPath(orgId, projectId, "/pay-apps")}
        title="Pay application history (every application, deleted drafts included)"
        version={q.dataUpdatedAt}
      />

      <HistoryPanel
        base={projectPath(orgId, projectId, "")}
        title="Job history (terms, schedule of values, opening balance, change orders, RFIs)"
        version={q.dataUpdatedAt}
        csv
      />
    </div>
  );
}

/** Quantity, unit and unit price typed in a form, checked; cents is quantity × unit price. */
function readUnitPricing(
  qty: string,
  unit: string,
  price: string,
  needQuantity = true,
):
  | { unit: string; unitPriceMicros: number; quantityMilli: number | null; cents: number | null }
  | { error: string } {
  const u = unit.trim();
  if (!u) return { error: "Enter the unit (CY, LF, TON...)" };
  const p = parseUnitPrice(price);
  if (p === null || p <= 0) return { error: "Enter the unit price in dollars (up to 6 decimals)" };
  if (!needQuantity && qty.trim() === "")
    return { unit: u, unitPriceMicros: p, quantityMilli: null, cents: null };
  const q = parseQuantity(qty);
  if (q === null || q <= 0) return { error: "Enter the contract quantity (up to 3 decimals)" };
  return { unit: u, unitPriceMicros: p, quantityMilli: q, cents: extendCents(q, p) };
}

/**
 * A line's pricing: lump sum, or quantity × unit price. A base line's scheduled value is set from
 * its quantity and price; a change-order line takes a unit and price only (its value is the CO's).
 * Locked once billing started, except that a line with no unit price may still get one.
 */
function LineUnitPrice(props: {
  line: SovLineDto;
  path: string;
  billingStarted: boolean;
  onSaved: (d: ProjectDetailDto) => void;
}) {
  const { line } = props;
  const isCo = line.changeOrderId !== null;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    qty: line.quantityMilli !== null ? quantityDecimal(line.quantityMilli) : "",
    unit: line.unit ?? "",
    price: line.unitPriceMicros !== null ? unitPriceDecimal(line.unitPriceMicros) : "",
  });
  const save = useMutation({
    mutationFn: (clear: boolean) => {
      if (clear) {
        return api<ProjectDetailDto>(props.path, {
          method: "PATCH",
          body: { unit: null, unitPriceMicros: null, quantityMilli: null },
        });
      }
      // A base line billed already keeps its scheduled value: the quantity is optional there.
      const r = readUnitPricing(v.qty, v.unit, v.price, !(isCo || props.billingStarted));
      if ("error" in r) throw new Error(r.error);
      const body: Record<string, unknown> = {
        unit: r.unit,
        unitPriceMicros: r.unitPriceMicros,
        quantityMilli: isCo || props.billingStarted ? null : r.quantityMilli,
      };
      if (!isCo && !props.billingStarted && r.cents !== null) body.originalCents = r.cents;
      return api<ProjectDetailDto>(props.path, { method: "PATCH", body });
    },
    onSuccess: (d) => {
      props.onSaved(d);
      setOpen(false);
    },
  });
  const label =
    line.unit && line.unitPriceMicros !== null
      ? `${line.quantityMilli !== null ? `${formatQuantity(line.quantityMilli)} ` : ""}${line.unit} @ ${formatUnitPrice(line.unitPriceMicros)}`
      : "Lump sum";
  const locked = props.billingStarted && line.unitPriceMicros !== null;
  if (!open) {
    return (
      <span className="text-sm">
        {label}
        {!locked && (
          <button
            type="button"
            className="ml-2 text-xs underline"
            aria-label={`Change pricing of item ${line.itemNumber}`}
            onClick={() => setOpen(true)}
          >
            {line.unit ? "Change" : "Unit price"}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-1">
        {!isCo && !props.billingStarted && (
          <input
            className="input w-24 text-right"
            inputMode="decimal"
            aria-label={`Contract quantity, item ${line.itemNumber}`}
            placeholder="Quantity"
            value={v.qty}
            onChange={(e) => setV({ ...v, qty: e.target.value })}
          />
        )}
        <input
          className="input w-16"
          aria-label={`Unit, item ${line.itemNumber}`}
          placeholder="Unit"
          list="sov-units"
          maxLength={MAX_UNIT_LENGTH}
          value={v.unit}
          onChange={(e) => setV({ ...v, unit: e.target.value })}
        />
        @
        <input
          className="input w-24 text-right"
          inputMode="decimal"
          aria-label={`Unit price, item ${line.itemNumber}`}
          placeholder="$ / unit"
          value={v.price}
          onChange={(e) => setV({ ...v, price: e.target.value })}
        />
        <button type="button" className="btn-secondary" onClick={() => save.mutate(false)}>
          Save
        </button>
        {line.unit && (
          <button type="button" className="text-xs underline" onClick={() => save.mutate(true)}>
            Lump sum
          </button>
        )}
        <button type="button" className="text-xs underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
      {!isCo && props.billingStarted && (
        <span className="text-xs text-slate-600">
          Billing has started: the scheduled value stays {formatCents(line.originalCents)}.
        </span>
      )}
      {save.error && <span className="text-xs text-red-700">{save.error.message}</span>}
    </span>
  );
}

/** A line's own retainage rate: blank follows each application; locked once retainage is held on it. */
function LineRetainage(props: {
  line: SovLineDto;
  path: string;
  jobRate: string;
  onSaved: (d: ProjectDetailDto) => void;
}) {
  const { line } = props;
  const shown = line.retainagePctBps === null ? "" : String(line.retainagePctBps / 100);
  const [value, setValue] = useState(shown);
  const save = useMutation({
    mutationFn: () => {
      const t = value.trim().replace(/%$/, "");
      let bps: number | null = null;
      if (t !== "") {
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0 || n > 100)
          throw new Error("Enter 0 to 100, or leave blank");
        bps = Math.round(n * 100);
      }
      if (bps === line.retainagePctBps) return Promise.resolve(null);
      return api<ProjectDetailDto>(props.path, { method: "PATCH", body: { retainagePctBps: bps } });
    },
    onSuccess: (d) => {
      if (d) props.onSaved(d);
    },
    onError: () => setValue(shown),
  });
  if (line.retainageLocked) {
    return (
      <span
        className="text-sm"
        title="Locked: a submitted pay application already holds retainage on this line"
      >
        {line.retainagePctBps === null ? `job (${props.jobRate})` : formatBps(line.retainagePctBps)}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1">
        <input
          className="input w-16 text-right"
          inputMode="decimal"
          aria-label={`Retainage % for item ${line.itemNumber}`}
          placeholder="job"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save.mutate()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        %
      </span>
      {save.error && <span className="text-xs text-red-700">{save.error.message}</span>}
    </span>
  );
}
