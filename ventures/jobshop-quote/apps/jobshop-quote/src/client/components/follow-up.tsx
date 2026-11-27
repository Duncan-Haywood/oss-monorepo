// Quote follow-up (services/quotes/follow-ups.ts): the quote log's "Follow up" card and the quote
// page's follow-up card, sharing one "log a follow-up" form.
import type {
  FollowUpItemDto,
  FollowUpQueueDto,
  QuoteFollowUpEmailsDto,
  QuoteFollowUpsDto,
} from "@shared/api";
import {
  daysBetween,
  dueLabel,
  MAX_FOLLOW_UP_DAYS,
  MAX_FOLLOW_UP_NOTE,
  MAX_NEXT_FOLLOW_UP_DAYS,
  NEXT_FOLLOW_UP_PRESETS,
  nextFollowUpError,
} from "@shared/follow-up";
import { quoteLabel } from "@shared/quote-label";
import { addDays } from "@shared/time-zone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, money, orgApi, queryClient } from "../lib/api";
import { useShopDay } from "../routes/layout";
import { Badge, Button, Card, ErrorText, Field, Input, Select, Textarea } from "./ui";

export const followUpQueueKey = (orgId: string) => ["follow-ups", orgId];
export const quoteFollowUpsKey = (orgId: string, quoteId: string) => [
  "quote-follow-ups",
  orgId,
  quoteId,
];

/** Refreshes both views after a follow-up is logged or a quote changes. */
function invalidateFollowUps(orgId: string, quoteId: string) {
  void queryClient.invalidateQueries({ queryKey: followUpQueueKey(orgId) });
  void queryClient.invalidateQueries({ queryKey: quoteFollowUpsKey(orgId, quoteId) });
  void queryClient.invalidateQueries({ queryKey: ["quote", orgId, quoteId] });
}

const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });

/** What happened, and when to follow up next (or no more). */
export function LogFollowUpForm({
  orgId,
  quoteId,
  today,
  currentOn,
  onDone,
}: {
  orgId: string;
  quoteId: string;
  today: string;
  currentOn: string | null;
  onDone?: () => void;
}) {
  const [note, setNote] = useState("");
  // "3" (days from today), "date" (pick one), or "none".
  const [choice, setChoice] = useState("3");
  const [date, setDate] = useState(addDays(today, 7));
  const nextOn =
    choice === "none" ? null : choice === "date" ? date : addDays(today, Number(choice));
  const localError = nextFollowUpError(nextOn, today);
  const unchanged = !note.trim() && nextOn === currentOn;
  const save = useMutation({
    mutationFn: () =>
      api<QuoteFollowUpsDto>(orgApi(orgId, `/quotes/${quoteId}/follow-ups`), {
        method: "POST",
        body: { note, nextOn },
      }),
    onSuccess: (dto) => {
      queryClient.setQueryData(quoteFollowUpsKey(orgId, quoteId), dto);
      invalidateFollowUps(orgId, quoteId);
      setNote("");
      onDone?.();
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Field label="What happened" hint="For the shop only; the customer never sees it.">
        <Textarea
          rows={2}
          maxLength={MAX_FOLLOW_UP_NOTE}
          value={note}
          placeholder="Left a voicemail; buyer says award is next week…"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Next follow-up">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {NEXT_FOLLOW_UP_PRESETS.map((d) => (
              <option key={d} value={String(d)}>
                In {d} day{d === 1 ? "" : "s"} ({weekday(addDays(today, d))} {addDays(today, d)})
              </option>
            ))}
            <option value="date">On a date…</option>
            <option value="none">No more follow-ups</option>
          </Select>
        </Field>
        {choice === "date" && (
          <Field label="Date">
            <Input
              type="date"
              value={date}
              min={addDays(today, 1)}
              max={addDays(today, MAX_NEXT_FOLLOW_UP_DAYS)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        )}
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || Boolean(localError) || unchanged}
        >
          Log follow-up
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {localError && choice === "date" && <p className="text-sm text-amber-800">{localError}</p>}
      <ErrorText error={save.error} />
    </div>
  );
}

/** The quote page: next follow-up day, the log, and the form (sent quotes only take new entries). */
export function QuoteFollowUpCard({
  orgId,
  quoteId,
  canEdit,
}: {
  orgId: string;
  quoteId: string;
  canEdit: boolean;
}) {
  const q = useQuery({
    queryKey: quoteFollowUpsKey(orgId, quoteId),
    queryFn: () => api<QuoteFollowUpsDto>(orgApi(orgId, `/quotes/${quoteId}/follow-ups`)),
  });
  const d = q.data;
  if (!d) return null;
  const sent = d.status === "sent";
  if (!sent && d.entries.length === 0) return null;
  return (
    <Card title="Follow-up">
      {sent && (
        <p className="mb-2 text-sm text-stone-700">
          {d.followUpOn === null ? (
            "No follow-up planned."
          ) : d.followUpOn <= d.today ? (
            <>
              <Badge tone="amber">{dueLabel(d.followUpOn, d.today)}</Badge> Follow-up was due{" "}
              {d.followUpOn}.
            </>
          ) : (
            <>Next follow-up {d.followUpOn}.</>
          )}
        </p>
      )}
      {sent && canEdit && (
        <LogFollowUpForm orgId={orgId} quoteId={quoteId} today={d.today} currentOn={d.followUpOn} />
      )}
      {d.entries.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3 text-sm">
          {d.entries.map((e) => (
            <li key={e.id}>
              <div className="text-xs text-stone-500">
                {e.day} · {e.byName?.trim() || "Former member"} ·{" "}
                {e.nextOn ? `next ${e.nextOn}` : "no more follow-ups"}
              </div>
              {e.note ? (
                <p className="whitespace-pre-wrap text-stone-800">{e.note}</p>
              ) : (
                <p className="text-stone-500">Moved the follow-up day.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** The quote log's "Follow up" card: due quotes, the coming week, the shop and member settings. */
export function FollowUpQueueCard({
  orgId,
  canEdit,
  isAdmin,
}: {
  orgId: string;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const q = useQuery({
    queryKey: followUpQueueKey(orgId),
    queryFn: () => api<FollowUpQueueDto>(orgApi(orgId, "/quotes/follow-ups")),
  });
  const [showUpcoming, setShowUpcoming] = useState(false);
  const d = q.data;
  if (!d) return null;
  return (
    <Card title={`Follow up${d.due.length ? ` (${d.due.length})` : ""}`}>
      {d.due.length === 0 ? (
        <p className="text-sm text-stone-600">
          {d.followUpDays === 0 && d.upcoming.length === 0
            ? "Follow-up days are off for this shop."
            : "No sent quotes are due for a follow-up today."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-100">
          {d.due.map((i) => (
            <FollowUpRow key={i.quoteId} orgId={orgId} item={i} today={d.today} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {d.truncated && (
        <p className="mt-2 text-xs text-stone-500">Showing the oldest; more are due.</p>
      )}
      {d.upcoming.length > 0 && (
        <div className="mt-3 border-t border-stone-100 pt-2">
          <Button variant="ghost" onClick={() => setShowUpcoming((v) => !v)}>
            {showUpcoming ? "Hide" : "Show"} {d.upcoming.length} coming up in the next 7 days
          </Button>
          {showUpcoming && (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {d.upcoming.map((i) => (
                <li key={i.quoteId} className="flex flex-wrap gap-x-2">
                  <span className="text-stone-500">{i.followUpOn}</span>
                  <Link
                    to="/app/$orgId/quotes/$quoteId"
                    params={{ orgId, quoteId: i.quoteId }}
                    className="font-medium text-sky-800 underline"
                  >
                    {quoteLabel(i.quoteNumber, i.revNumber)}
                  </Link>
                  <span>{i.customerCompany}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <FollowUpSettings orgId={orgId} days={d.followUpDays} isAdmin={isAdmin} />
    </Card>
  );
}

function FollowUpRow({
  orgId,
  item: i,
  today,
  canEdit,
}: {
  orgId: string;
  item: FollowUpItemDto;
  today: string;
  canEdit: boolean;
}) {
  const shopDayOf = useShopDay(orgId);
  const [open, setOpen] = useState(false);
  const sentDay = i.sentAt ? shopDayOf(i.sentAt) : null;
  const contact = [i.customerContact, i.customerEmail].filter(Boolean).join(" · ");
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link
          to="/app/$orgId/quotes/$quoteId"
          params={{ orgId, quoteId: i.quoteId }}
          className="font-medium text-sky-800 underline"
        >
          {quoteLabel(i.quoteNumber, i.revNumber)}
        </Link>
        <span className="font-medium text-stone-900">{i.customerCompany}</span>
        <span>{money(i.headlineTotalCents)}</span>
        <Badge tone={i.followUpOn < today ? "red" : "amber"}>{dueLabel(i.followUpOn, today)}</Badge>
        {canEdit && !open && (
          <Button variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
            Log follow-up
          </Button>
        )}
      </div>
      <div className="text-xs text-stone-500">
        {contact && <>{contact} · </>}
        {sentDay && (
          <>
            sent {sentDay} ({daysBetween(sentDay, today)} days ago) ·{" "}
          </>
        )}
        {i.validUntil && <>valid until {i.validUntil} · </>}
        {i.estimatorName?.trim() || "Former member"}
        {i.count > 0 && <> · {i.count} logged</>}
      </div>
      {i.lastNote && (
        <p className="mt-1 whitespace-pre-wrap text-stone-700">
          <span className="text-xs text-stone-500">Last note: </span>
          {i.lastNote}
        </p>
      )}
      {open && (
        <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-3">
          <LogFollowUpForm
            orgId={orgId}
            quoteId={i.quoteId}
            today={today}
            currentOn={i.followUpOn}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

/** Admins: the shop's first follow-up day. Everyone: their own morning email. */
function FollowUpSettings({
  orgId,
  days,
  isAdmin,
}: {
  orgId: string;
  days: number;
  isAdmin: boolean;
}) {
  const [value, setValue] = useState(String(days));
  const saveDays = useMutation({
    mutationFn: () =>
      api<{ followUpDays: number }>(orgApi(orgId, "/quotes/follow-ups/settings"), {
        method: "PUT",
        body: { followUpDays: Number(value) },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: followUpQueueKey(orgId) }),
  });
  const emailKey = ["quote-follow-up-emails", orgId];
  const emails = useQuery({
    queryKey: emailKey,
    queryFn: () => api<QuoteFollowUpEmailsDto>(orgApi(orgId, "/notifications/quote-follow-up")),
  });
  const saveEmails = useMutation({
    mutationFn: (quoteFollowUp: boolean) =>
      api<QuoteFollowUpEmailsDto>(orgApi(orgId, "/notifications/quote-follow-up"), {
        method: "PUT",
        body: { quoteFollowUp },
      }),
    onSuccess: (dto) => queryClient.setQueryData(emailKey, dto),
  });
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_FOLLOW_UP_DAYS;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3 text-sm text-stone-700">
      {isAdmin ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="First follow-up, days after sending"
            hint="A Saturday or Sunday moves to the Monday. 0 turns it off. Applies to quotes sent from now on."
          >
            <Input
              inputMode="numeric"
              className="w-24"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!valid || n === days || saveDays.isPending}
            onClick={() => saveDays.mutate()}
          >
            Save
          </Button>
          <ErrorText error={saveDays.error} />
        </div>
      ) : (
        <p>
          {days === 0
            ? "This shop sets no automatic follow-up day."
            : `Sent quotes are due for a follow-up ${days} day${days === 1 ? "" : "s"} after sending.`}
        </p>
      )}
      {emails.data && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={emails.data.quoteFollowUp}
            disabled={saveEmails.isPending}
            onChange={(e) => saveEmails.mutate(e.target.checked)}
          />
          Email me on the morning a quote I sent is due for a follow-up
        </label>
      )}
    </div>
  );
}
