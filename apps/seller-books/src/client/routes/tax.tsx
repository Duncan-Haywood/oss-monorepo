// Schedule C worksheet, 1099-K threshold notes (with sources) and members.
import { PLATFORM_LABELS } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

interface ScLine {
  line: string;
  label: string;
  amountCents: number | null;
  note?: string;
}

interface Worksheet {
  year: number;
  disclaimer: string;
  lines: ScLine[];
  partIII: ScLine[];
  otherExpenses: ScLine[];
  warnings: string[];
  businessMiles: number;
}

function Lines({ lines }: { lines: ScLine[] }) {
  return (
    <table className="table">
      <tbody>
        {lines.map((l) => (
          <tr key={`${l.line}-${l.label}`}>
            <td className="w-14 font-mono text-xs text-stone-500">{l.line}</td>
            <td>
              {l.label}
              {l.note && <div className="text-xs text-stone-500">{l.note}</div>}
            </td>
            <td className="num">{usd(l.amountCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScheduleCPage() {
  const orgId = useOrgId();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rate, setRate] = useState("");
  const rateParam =
    rate.trim() && Number.isFinite(Number(rate)) ? `&mileageRate=${Number(rate)}` : "";
  const q = useQuery({
    queryKey: ["schedule-c", orgId, year, rateParam],
    queryFn: () => api<Worksheet>(orgPath(orgId, `/reports/schedule-c?year=${year}${rateParam}`)),
  });
  const ws = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Schedule C worksheet</h1>
        <label>
          <span className="label">Tax year</span>
          <input
            className="input w-24"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="label">Standard mileage rate (¢/mile)</span>
          <input
            className="input w-28"
            inputMode="decimal"
            placeholder="e.g. 70"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <a
          className="btn-secondary"
          href={orgPath(orgId, `/reports/schedule-c.csv?year=${year}${rateParam}`)}
        >
          Download CSV
        </a>
      </div>
      <p className="rounded-md border border-accent-100 bg-accent-100/50 p-3 text-sm text-accent-700">
        {ws?.disclaimer ?? "Worksheet only: not a tax return and not tax advice."} Look up the IRS
        standard mileage rate for {year} at{" "}
        <a
          className="underline"
          href="https://www.irs.gov/tax-professionals/standard-mileage-rates"
          target="_blank"
          rel="noreferrer"
        >
          irs.gov
        </a>{" "}
        and enter it above; Seller Books does not assume one.
      </p>
      <ErrorText error={q.error} />
      {ws && (
        <>
          {ws.warnings.map((w) => (
            <p key={w} className="text-sm text-accent-700">
              {w}
            </p>
          ))}
          <section className="card">
            <h2 className="mb-2 font-medium">Parts I and II: income and expenses</h2>
            <Lines lines={ws.lines} />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Part III: cost of goods sold (inventory at cost)</h2>
            <Lines lines={ws.partIII} />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Part IV: vehicle</h2>
            <p className="text-sm">Line 44a business miles: {ws.businessMiles.toFixed(1)}</p>
          </section>
          {ws.otherExpenses.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-medium">Part V: other expenses</h2>
              <Lines lines={ws.otherExpenses} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface Note {
  jurisdiction: string;
  code: string;
  rule: string;
  years: string;
  url: string;
  quote: string;
  status: string;
  checkedOn: string;
  caveat?: string;
}

const STATUS_LABEL: Record<string, string> = {
  "official-excerpt": "Stated on the official page",
  "general-1099-rule": "State's general 1099 rule (1099-K not named)",
  unverified: "Unverified",
};

export function Form1099kPage() {
  const q = useQuery({
    queryKey: ["1099k"],
    queryFn: () =>
      api<{ federal: Note; states: Note[]; omitted: { code: string; reason: string }[] }>(
        "/api/reference/1099k",
      ),
  });
  const fees = useQuery({
    queryKey: ["fee-sources"],
    queryFn: () =>
      api<{ items: { platform: string; officialPages: string[]; note: string }[] }>(
        "/api/reference/fee-sources",
      ),
  });
  const card = (n: Note) => (
    <div key={n.code} className="card">
      <h3 className="font-medium">{n.jurisdiction}</h3>
      <p className="text-sm">{n.rule}</p>
      <p className="text-xs text-stone-500">{n.years}</p>
      <blockquote className="my-2 border-l-2 border-stone-300 pl-2 text-xs italic">
        “{n.quote}”
      </blockquote>
      {n.caveat && <p className="text-xs text-accent-700">{n.caveat}</p>}
      <p className="mt-1 text-xs">
        <a className="text-brand-700 underline" href={n.url} target="_blank" rel="noreferrer">
          Source
        </a>{" "}
        · {STATUS_LABEL[n.status] ?? n.status} · checked {n.checkedOn}
      </p>
    </div>
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Form 1099-K notes</h1>
      <p className="text-sm text-stone-600">
        A 1099-K threshold only decides whether a platform sends a form. It does not change what you
        owe: your profit is reportable whether or not a form arrives, and these books are the record
        of it. Quotes were checked against excerpts of each official page on the date shown. Open
        the source before relying on it.
      </p>
      {q.data && (
        <>
          <section>
            <h2 className="mb-2 font-medium">Federal</h2>
            {card(q.data.federal)}
          </section>
          <section>
            <h2 className="mb-2 font-medium">States with their own reporting rule</h2>
            <div className="grid gap-3 md:grid-cols-2">{q.data.states.map(card)}</div>
            {q.data.omitted.map((o) => (
              <p key={o.code} className="mt-2 text-xs text-stone-500">
                Not listed: {o.code}. {o.reason}
              </p>
            ))}
          </section>
        </>
      )}
      <section className="card">
        <h2 className="mb-2 font-medium">Where fees come from</h2>
        <p className="mb-2 text-sm text-stone-600">
          Seller Books never estimates a fee from a rate: every fee is read from the platform's own
          report. The marketplaces publish their current fees here:
        </p>
        <ul className="space-y-1 text-sm">
          {fees.data?.items.map((f) => (
            <li key={f.platform}>
              <span className="font-medium">
                {PLATFORM_LABELS[f.platform as keyof typeof PLATFORM_LABELS]}
              </span>
              : {f.note}{" "}
              {f.officialPages.map((u) => (
                <a
                  key={u}
                  className="text-brand-700 underline"
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                >
                  fee page
                </a>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function MembersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: MemberRow[] }>(orgPath(orgId, "/members")),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const invite = useMutation({
    mutationFn: () =>
      api<{ url: string }>(orgPath(orgId, "/members/invitations"), {
        method: "POST",
        body: { email, role },
      }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/members/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgId] }),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <section className="card">
        <table className="table">
          <tbody>
            {members.data?.items.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>
                  {m.role !== "owner" && (
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => remove.mutate(m.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ErrorText error={remove.error} />
      </section>
      <form
        className="card flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <input
          className="input max-w-xs"
          type="email"
          placeholder="Email to invite"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="input max-w-36" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn" type="submit" disabled={invite.isPending}>
          Create invite link
        </button>
        <ErrorText error={invite.error} />
        {invite.data && (
          <p className="w-full text-sm">
            Send this link to {email} (valid 7 days, shown once):{" "}
            <code className="break-all">{invite.data.url}</code>
          </p>
        )}
      </form>
    </div>
  );
}
