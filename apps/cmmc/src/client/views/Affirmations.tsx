// SPRS affirmation record (32 CFR 170.22): what the affirming official entered in SPRS, and when the
// next affirmation and self-assessment fall due. The app records; it never submits to SPRS.
import {
  AFFIRMATION_KIND_LABEL,
  AFFIRMATION_KINDS,
  AFFIRMATION_STATEMENT_RULE,
  type AffirmationDto,
  type AffirmationKind,
  type AffirmationSchedule,
  type AffirmationsResponse,
  CMMC_STATUS_LABEL,
  type CmmcStatus,
  type Deadline,
} from "@shared/affirmation";
import { type CalendarFeedStatus, webcalUrl } from "@shared/affirmation-ics";
import type { AffirmationReminderSettings } from "@shared/affirmation-reminders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo, ScoreResponse } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

const TONE: Record<Deadline["state"], string> = {
  overdue: "border-red-200 bg-red-50 text-red-900",
  due_soon: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-stone-200 bg-white text-stone-800",
};

export function dueText(d: Deadline) {
  if (d.daysLeft < 0) return `${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"} overdue`;
  if (d.daysLeft === 0) return "due today";
  return `in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`;
}

export function DeadlineList({ schedule }: { schedule: AffirmationSchedule }) {
  return (
    <ul className="space-y-2">
      {schedule.deadlines.map((d) => (
        <li key={d.key} className={`rounded border p-2 text-sm ${TONE[d.state]}`}>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">{d.label}</span>
            <span>
              {d.due} · {dueText(d)}
            </span>
          </div>
          <p className="mt-1 text-xs opacity-80">{d.basis}</p>
        </li>
      ))}
    </ul>
  );
}

/** Splits the profile's "Affirming official (name, title)" into the two fields, when it has a comma. */
const splitOfficial = (s: string) => {
  const i = s.indexOf(",");
  return i < 0
    ? { name: s.trim(), title: "" }
    : { name: s.slice(0, i).trim(), title: s.slice(i + 1).trim() };
};

export function AffirmationsView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["affirmations", orgId],
    queryFn: () => api<AffirmationsResponse>(`/api/orgs/${orgId}/affirmations`),
  });
  const targetLevel: 1 | 2 = info.profile.targetLevel === 1 ? 1 : 2;
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/affirmations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["affirmations", orgId] }),
  });
  const schedules = (list.data?.schedules ?? []).filter((s) => s.last);
  return (
    <div className="space-y-4">
      <p className="rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
        Record each affirmation your affirming official enters in SPRS. 32 CFR 170.22 asks for one
        after every self-assessment, including a POA&M closeout, and annually after that. This page
        keeps the record and the reminders; it does not submit anything to SPRS, and the dates are a
        planning aid, not a determination of your CMMC status.
      </p>
      <ErrorText error={list.error} />
      {schedules.map((s) => (
        <Card key={s.level} title={`Level ${s.level}: what falls due next`}>
          <DeadlineList schedule={s} />
        </Card>
      ))}
      {schedules.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <a className={btnGhostCls} href={`/api/orgs/${orgId}/affirmations/calendar.ics`}>
            Add these dates to your calendar (.ics)
          </a>
          <span>
            Each date gets alarms 60 and 7 days ahead. Download it again after recording a new
            affirmation: most calendars move the dates, some add a copy.
          </span>
        </div>
      )}
      {isAdmin && <CalendarFeedSetting orgId={orgId} />}
      <ReminderEmailSetting orgId={orgId} />
      {list.data && schedules.length === 0 && (
        <Card title="What falls due next">
          <p className="text-sm text-stone-600">
            Nothing recorded yet. Once you record the affirmation made after your self-assessment,
            this page shows when the annual affirmation and the next self-assessment fall due.
          </p>
        </Card>
      )}
      {isAdmin ? (
        // Mounted once the list loads, so it can prefill from the last affirmation.
        list.data && (
          <AffirmationForm
            orgId={orgId}
            info={info}
            defaultLevel={targetLevel}
            last={list.data?.items[0] ?? null}
            onUpgrade={onUpgrade}
          />
        )
      ) : (
        <p className="text-sm text-stone-600">
          Only an admin of this organization records affirmations.
        </p>
      )}
      <Card title={`Recorded affirmations (${list.data?.items.length ?? 0})`}>
        {list.data?.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-3">Affirmed</th>
                  <th className="py-1 pr-3">Level</th>
                  <th className="py-1 pr-3">Kind</th>
                  <th className="py-1 pr-3">Status (date)</th>
                  <th className="py-1 pr-3">Score in SPRS</th>
                  <th className="py-1 pr-3">Affirming official</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.data.items.map((a) => (
                  <AffirmationRow
                    key={a.id}
                    a={a}
                    canDelete={isAdmin}
                    onDelete={() => {
                      if (
                        window.confirm(
                          "Delete this affirmation record? The audit log keeps that it existed.",
                        )
                      )
                        remove.mutate(a.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-600">None yet.</p>
        )}
        <ErrorText error={remove.error} />
      </Card>
    </div>
  );
}

function AffirmationRow({
  a,
  canDelete,
  onDelete,
}: {
  a: AffirmationDto;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const differs =
    a.level === 2 &&
    a.sprsScore !== null &&
    a.workspaceScore !== null &&
    a.sprsScore !== a.workspaceScore;
  return (
    <tr className="align-top">
      <td className="py-1.5 pr-3 whitespace-nowrap">{a.affirmedOn}</td>
      <td className="py-1.5 pr-3">{a.level}</td>
      <td className="py-1.5 pr-3">{AFFIRMATION_KIND_LABEL[a.kind]}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">
        {CMMC_STATUS_LABEL[a.cmmcStatus]} ({a.cmmcStatusDate})
      </td>
      <td className="py-1.5 pr-3">
        {a.level === 1 ? "n/a" : (a.sprsScore ?? "not recorded")}
        {differs && (
          <span className="block text-xs text-amber-800">
            The workspace computed {a.workspaceScore} that day
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {a.officialName}, {a.officialTitle}
        <span className="block text-xs text-stone-500">{a.officialContact}</span>
        {a.notes && <span className="block text-xs text-stone-600">{a.notes}</span>}
      </td>
      <td className="py-1.5 text-right">
        {canDelete && (
          <button type="button" className="text-xs text-red-700 underline" onClick={onDelete}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

function AffirmationForm({
  orgId,
  info,
  defaultLevel,
  last,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  defaultLevel: 1 | 2;
  last: AffirmationDto | null;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const official = splitOfficial(info.profile.affirmingOfficial);
  const [form, setForm] = useState({
    level: defaultLevel as 1 | 2,
    kind: (last ? "annual" : "assessment") as AffirmationKind,
    cmmcStatus: "final" as CmmcStatus,
    cmmcStatusDate: last?.cmmcStatusDate ?? "",
    affirmedOn: "",
    officialName: last?.officialName ?? official.name,
    officialTitle: last?.officialTitle ?? official.title,
    officialContact: last?.officialContact ?? "",
    sprsScore: "",
    notes: "",
  });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const score = useQuery({
    queryKey: ["score", orgId, 2],
    queryFn: () => api<ScoreResponse>(`/api/orgs/${orgId}/score?level=2`),
    enabled: form.level === 2,
  });
  const create = useMutation({
    mutationFn: () =>
      api<AffirmationDto>(`/api/orgs/${orgId}/affirmations`, {
        method: "POST",
        json: {
          ...form,
          sprsScore:
            form.level === 2 && form.sprsScore.trim() !== "" ? Number(form.sprsScore) : null,
        },
      }),
    onSuccess: () => {
      // The next one is usually the annual affirmation of the same status.
      set({ kind: "annual", affirmedOn: "", notes: "", sprsScore: "" });
      qc.invalidateQueries({ queryKey: ["affirmations", orgId] });
    },
  });
  const needsPlan = form.level === 2 && !info.plan.level2;
  const workspaceScore = score.data?.level2?.score;
  return (
    <Card title="Record an affirmation made in SPRS">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Level">
          <select
            className={inputCls}
            value={form.level}
            onChange={(e) => {
              const level = Number(e.target.value) as 1 | 2;
              set({
                level,
                ...(level === 1
                  ? {
                      cmmcStatus: "final",
                      kind: form.kind === "poam_closeout" ? "annual" : form.kind,
                    }
                  : {}),
              });
            }}
          >
            <option value={1}>Level 1 (Self)</option>
            <option value={2}>Level 2 (Self)</option>
          </select>
        </Field>
        <Field label="Why this affirmation">
          <select
            className={inputCls}
            value={form.kind}
            onChange={(e) => set({ kind: e.target.value as AffirmationKind })}
          >
            {AFFIRMATION_KINDS.filter((k) => form.level === 2 || k !== "poam_closeout").map((k) => (
              <option key={k} value={k}>
                {AFFIRMATION_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date affirmed in SPRS">
          <input
            className={inputCls}
            type="date"
            required
            value={form.affirmedOn}
            onChange={(e) => set({ affirmedOn: e.target.value })}
          />
        </Field>
        <Field
          label="CMMC Status Date"
          hint="The date SPRS shows for the status this affirmation covers."
        >
          <input
            className={inputCls}
            type="date"
            required
            value={form.cmmcStatusDate}
            onChange={(e) => set({ cmmcStatusDate: e.target.value })}
          />
        </Field>
        {form.level === 2 && (
          <>
            <Field label="CMMC Status">
              <select
                className={inputCls}
                value={form.cmmcStatus}
                onChange={(e) => set({ cmmcStatus: e.target.value as CmmcStatus })}
              >
                <option value="final">Final Level 2 (Self)</option>
                <option value="conditional">Conditional Level 2 (Self), with a POA&M</option>
              </select>
            </Field>
            <Field
              label="Score entered in SPRS"
              hint={
                workspaceScore != null
                  ? `This workspace computes ${workspaceScore} today.`
                  : "This workspace has no score yet (no SSP recorded)."
              }
            >
              <input
                className={inputCls}
                type="number"
                min={-203}
                max={110}
                step={1}
                value={form.sprsScore}
                onChange={(e) => set({ sprsScore: e.target.value })}
              />
            </Field>
          </>
        )}
        <Field label="Affirming official: name">
          <input
            className={inputCls}
            required
            value={form.officialName}
            onChange={(e) => set({ officialName: e.target.value })}
          />
        </Field>
        <Field label="Title">
          <input
            className={inputCls}
            required
            value={form.officialTitle}
            onChange={(e) => set({ officialTitle: e.target.value })}
          />
        </Field>
        <Field label="Contact information" hint="Email or phone, as entered in SPRS.">
          <input
            className={inputCls}
            required
            value={form.officialContact}
            onChange={(e) => set({ officialContact: e.target.value })}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            className={inputCls}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <p className="text-xs text-stone-600 sm:col-span-2">
          What the affirmation attests, in the rule's words (32 CFR 170.22(a)(2)(ii)): “
          {AFFIRMATION_STATEMENT_RULE}”
        </p>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {needsPlan ? (
            <>
              <span className="text-sm text-stone-700">
                Recording Level 2 affirmations needs the Level 2 plan (this organization is on{" "}
                {info.plan.name}).
              </span>
              <button type="button" className={btnGhostCls} onClick={onUpgrade}>
                See Level 2 plans
              </button>
            </>
          ) : (
            <button type="submit" className={btnCls} disabled={create.isPending}>
              Record affirmation
            </button>
          )}
          <ErrorText error={create.error} />
        </div>
      </form>
    </Card>
  );
}

/** The member's own switch for the reminder email 60 and 7 days before each date, and once after. */
function ReminderEmailSetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const key = ["affirmation-reminders", orgId];
  const settings = useQuery({
    queryKey: key,
    queryFn: () => api<AffirmationReminderSettings>(`/api/orgs/${orgId}/affirmations/reminders`),
  });
  const save = useMutation({
    mutationFn: (on: boolean) =>
      api<AffirmationReminderSettings>(`/api/orgs/${orgId}/affirmations/reminders`, {
        method: "PUT",
        json: { on },
      }),
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const s = settings.data;
  if (!s) return <ErrorText error={settings.error} />;
  if (!s.eligible) {
    return (
      <p className="text-sm text-stone-600">
        Admins and owners of this organization get a reminder email 60 and 7 days before each date,
        and one notice if a date passes with no newer affirmation recorded.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm text-stone-700">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={s.on}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Email me 60 and 7 days before each date falls due, and once if it passes
      </label>
      {!s.delivers && (
        <p className="text-xs text-stone-500">
          This deployment is not sending email yet, so nothing goes out until it is set up.
        </p>
      )}
      <ErrorText error={save.error} />
    </div>
  );
}

// A link a calendar app subscribes to, so new affirmations move the dates without a re-download
// (services/affirmations/calendar-feed.ts). Admins only; the link is shown once, when it is made.
function CalendarFeedSetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const key = ["affirmation-calendar-feed", orgId];
  const url = `/api/orgs/${orgId}/affirmations/calendar-feed`;
  const feed = useQuery({ queryKey: key, queryFn: () => api<CalendarFeedStatus>(url) });
  const [shown, setShown] = useState<string | null>(null);
  const make = useMutation({
    mutationFn: () => api<CalendarFeedStatus>(url, { method: "POST" }),
    onSuccess: (data) => {
      setShown(data.url);
      qc.setQueryData(key, data);
    },
  });
  const stop = useMutation({
    mutationFn: () => api<CalendarFeedStatus>(url, { method: "DELETE" }),
    onSuccess: (data) => {
      setShown(null);
      qc.setQueryData(key, data);
    },
  });
  const f = feed.data;
  if (!f) return <ErrorText error={feed.error} />;
  const busy = make.isPending || stop.isPending;
  return (
    <div className="space-y-2 text-sm text-stone-700">
      <p className="font-medium text-stone-800">Subscribe from your calendar</p>
      <p className="text-stone-600">
        A private link your calendar app checks on its own, so a new affirmation moves the dates
        without downloading the file again. Anyone with the link can see these due dates (no names
        or scores), so share it only with people who should. Calendar apps refresh it on their own
        schedule, often every few hours to a day.
      </p>
      {shown && (
        <div className="space-y-1 rounded border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs text-stone-600">
            Copy it now: the workspace keeps only a fingerprint of it, so it cannot show it again.
            In Google Calendar use "Other calendars, From URL"; in Outlook, "Add calendar, Subscribe
            from web".
          </p>
          <input
            className={inputCls}
            readOnly
            value={shown}
            aria-label="Calendar subscription link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <a className="text-xs underline" href={webcalUrl(shown)}>
            Open in Apple Calendar or Outlook (webcal://)
          </a>
        </div>
      )}
      {f.on && !shown && (
        <p className="text-xs text-stone-600">
          A link is on{f.createdByName ? `, made by ${f.createdByName}` : ""}
          {f.createdAt ? ` on ${f.createdAt.slice(0, 10)}` : ""}.{" "}
          {f.lastFetchedAt
            ? `A calendar last fetched it on ${f.lastFetchedAt.slice(0, 10)}.`
            : "No calendar has fetched it yet."}{" "}
          Lost it? Make a new one: the old link stops working.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhostCls}
          disabled={busy}
          onClick={() => {
            if (!f.on || window.confirm("Make a new link? The old one stops working at once.")) {
              make.mutate();
            }
          }}
        >
          {f.on ? "Make a new link" : "Make a subscription link"}
        </button>
        {f.on && (
          <button
            type="button"
            className={btnGhostCls}
            disabled={busy}
            onClick={() => stop.mutate()}
          >
            Turn the link off
          </button>
        )}
      </div>
      <ErrorText error={make.error ?? stop.error} />
    </div>
  );
}
