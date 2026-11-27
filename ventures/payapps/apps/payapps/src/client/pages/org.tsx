// Projects of one company + new project form.
import type { ProjectDto } from "@shared/api/types";
import { parseOuterLimitDays, parsePayTermsDays } from "@shared/cash-report";
import type { PayTermsBasis } from "@shared/enums";
import { formatBps, formatCents, parseDollarsToCents, parsePercentToBps } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { GettingStartedPanel } from "../components/getting-started";
import { LowerTierToChaseAlert } from "../components/lower-tier-waivers";
import { OuterLimitInput, PayTermsBasisSelect } from "../components/pay-terms";
import { OverdueRfisAlert } from "../components/rfis";
import { SubmittalsToChaseAlert } from "../components/submittals-to-chase";
import { api, orgPath } from "../lib/api";
import { DocumentsAlert } from "./documents";
import { InsuranceAlert } from "./insurance";

const empty = {
  name: "",
  number: "",
  gcName: "",
  gcBillingName: "",
  gcBillingEmail: "",
  gcPmName: "",
  gcPmEmail: "",
  ownerName: "",
  architectName: "",
  contractDate: "",
  contractSum: "",
  retainage: "10",
  payTerms: "",
  payTermsBasis: "application_date" as PayTermsBasis,
  payTermsOuter: "",
};

export function OrgPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ items: ProjectDto[] }>(orgPath(orgId, "/projects")),
  });
  const [f, setF] = useState(empty);
  const create = useMutation({
    mutationFn: () => {
      const cents = parseDollarsToCents(f.contractSum);
      const bps = parsePercentToBps(f.retainage);
      if (cents === null || cents < 0) throw new Error("Enter the contract sum in dollars");
      if (bps === null) throw new Error("Enter retainage as a percentage between 0 and 100");
      const payTermsDays = parsePayTermsDays(f.payTerms);
      if (payTermsDays === undefined) {
        throw new Error("Enter pay terms as a number of days from 0 to 365, or leave it blank");
      }
      const payTermsOuterDays =
        f.payTermsBasis === "owner_paid" ? parseOuterLimitDays(f.payTermsOuter) : null;
      if (payTermsOuterDays === undefined) {
        throw new Error(
          "Enter the outer limit as a number of days from 1 to 365, or leave it blank",
        );
      }
      return api<ProjectDto>(orgPath(orgId, "/projects"), {
        method: "POST",
        body: {
          name: f.name,
          number: f.number || null,
          gcName: f.gcName,
          gcBillingName: f.gcBillingName.trim() || null,
          gcBillingEmail: f.gcBillingEmail.trim() || null,
          gcPmName: f.gcPmName.trim() || null,
          gcPmEmail: f.gcPmEmail.trim() || null,
          ownerName: f.ownerName || null,
          architectName: f.architectName || null,
          contractDate: f.contractDate || null,
          originalContractSumCents: cents,
          retainagePctBps: bps,
          storedRetainagePctBps: bps,
          payTermsDays,
          payTermsBasis: f.payTermsBasis,
          payTermsOuterDays,
        },
      });
    },
    onSuccess: async (p) => {
      setF(empty);
      await qc.invalidateQueries({ queryKey: ["projects", orgId] });
      await qc.invalidateQueries({ queryKey: ["getting-started", orgId] });
      await navigate({
        to: "/orgs/$orgId/projects/$projectId",
        params: { orgId, projectId: p.id },
      });
    },
  });
  const addSample = useMutation({
    mutationFn: () => api<ProjectDto>(orgPath(orgId, "/projects/sample"), { method: "POST" }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ["projects", orgId] });
      await navigate({
        to: "/orgs/$orgId/projects/$projectId",
        params: { orgId, projectId: p.id },
      });
    },
  });
  const field = (key: keyof typeof empty, label: string, props: Record<string, unknown> = {}) => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="input"
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        {...props}
      />
    </label>
  );
  return (
    <>
      <GettingStartedPanel orgId={orgId} />
      <InsuranceAlert orgId={orgId} />
      <DocumentsAlert orgId={orgId} />
      <OverdueRfisAlert orgId={orgId} />
      <SubmittalsToChaseAlert orgId={orgId} />
      <LowerTierToChaseAlert orgId={orgId} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h1 className="text-xl font-semibold">Projects</h1>
            <span className="flex gap-4 text-sm">
              <Link to="/orgs/$orgId/estimates" params={{ orgId }} className="underline">
                Estimates
              </Link>
              <Link to="/orgs/$orgId/cash" params={{ orgId }} className="underline">
                Cash and retainage
              </Link>
              <Link to="/orgs/$orgId/wip" params={{ orgId }} className="underline">
                WIP
              </Link>
              <Link to="/orgs/$orgId/crews" params={{ orgId }} className="underline">
                Crew lookahead
              </Link>
              <Link to="/orgs/$orgId/timesheets" params={{ orgId }} className="underline">
                Timesheets
              </Link>
              <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="underline">
                Insurance
              </Link>
              <Link to="/orgs/$orgId/documents" params={{ orgId }} className="underline">
                Licenses
              </Link>
              <Link to="/orgs/$orgId/team" params={{ orgId }} className="underline">
                People
              </Link>
              <Link to="/orgs/$orgId/quickbooks" params={{ orgId }} className="underline">
                QuickBooks
              </Link>
              <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
                Plan and billing
              </Link>
            </span>
          </div>
          {projects.isLoading && <p>Loading…</p>}
          <ErrorText error={projects.error} />
          {projects.data?.items.length === 0 && (
            <div className="space-y-2 rounded border border-dashed border-slate-300 p-4 text-sm">
              <p className="text-slate-600">
                No projects yet. Add your first subcontract with the form, or look around a sample
                job first: an electrical subcontract three months in, with a schedule of values,
                change orders, paid, paid-short and unpaid applications, and this month's draft to
                fill in.
              </p>
              <button
                type="button"
                className="btn"
                disabled={addSample.isPending}
                onClick={() => addSample.mutate()}
              >
                {addSample.isPending ? "Adding the sample job…" : "Try a sample job"}
              </button>
              <p className="text-xs text-slate-500">
                Invented names and numbers. It does not count toward your plan's jobs, its PDFs are
                marked SAMPLE DATA, and you can remove it from its page.
              </p>
              <ErrorText error={addSample.error} />
            </div>
          )}
          <table className="w-full">
            <tbody>
              {projects.data?.items.map((p) => (
                <tr key={p.id}>
                  <td className="td">
                    <Link
                      to="/orgs/$orgId/projects/$projectId"
                      params={{ orgId, projectId: p.id }}
                      className="font-medium underline"
                    >
                      {p.name}
                    </Link>
                    {p.number && <span className="ml-2 text-xs text-slate-500">{p.number}</span>}
                    {p.isSample && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">
                        sample
                      </span>
                    )}
                  </td>
                  <td className="td text-slate-600">{p.gcName}</td>
                  <td className="td text-right">{formatCents(p.originalContractSumCents)}</td>
                  <td className="td text-right text-slate-600">
                    {formatBps(p.retainagePctBps)} ret.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <form
          id="new-project"
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="font-semibold">New project</h2>
          {field("name", "Project name", { required: true })}
          {field("number", "Project / job number")}
          {field("gcName", "General contractor", { required: true })}
          {field("gcBillingName", "GC billing contact (optional)", {
            placeholder: "e.g. Accounts Payable",
            maxLength: 200,
          })}
          {field("gcBillingEmail", "GC billing email (optional)", {
            type: "email",
            placeholder: "ap@builder.example",
            maxLength: 254,
          })}
          {field("gcPmName", "GC project manager (optional, for change orders)", {
            placeholder: "e.g. Dana Ruiz",
            maxLength: 200,
          })}
          {field("gcPmEmail", "GC project manager email (optional)", {
            type: "email",
            placeholder: "pm@builder.example",
            maxLength: 254,
          })}
          {field("ownerName", "Owner")}
          {field("architectName", "Architect / engineer")}
          {field("contractDate", "Subcontract date", { type: "date" })}
          {field("contractSum", "Original contract sum ($)", {
            required: true,
            inputMode: "decimal",
          })}
          {field("retainage", "Retainage %", { required: true, inputMode: "decimal" })}
          {field("payTerms", "Pay terms: days the GC has to pay (optional)", {
            inputMode: "numeric",
            placeholder: "e.g. 30",
          })}
          <div className="block text-sm">
            <label htmlFor="new-project-pay-terms-basis" className="text-slate-600">
              Pay terms count from
            </label>
            <span className="mt-1 block">
              <PayTermsBasisSelect
                id="new-project-pay-terms-basis"
                value={f.payTermsBasis}
                onChange={(payTermsBasis) => setF({ ...f, payTermsBasis })}
              />
            </span>
            {f.payTermsBasis === "owner_paid" && (
              <span className="mt-2 block">
                <OuterLimitInput
                  id="new-project-pay-terms-outer"
                  value={f.payTermsOuter}
                  onChange={(payTermsOuter) => setF({ ...f, payTermsOuter })}
                />
              </span>
            )}
          </div>
          <ErrorText error={create.error} />
          <button className="btn" type="submit" disabled={create.isPending}>
            Create project
          </button>
        </form>
      </div>
    </>
  );
}
