// The history of a job outside its pay applications (src/shared/job-history.ts): append-only rows
// written by the routes after a change succeeds, read newest first with who did it. Writing is best
// effort, as for the pay application history: the change is already committed, so a failed write
// is logged and never turns a successful change into an error the user would retry.

import type { JobEventDto } from "@shared/api/types";
import { describeJobEvent, type JobEventAction, type JobEventData } from "@shared/job-history";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { jobEvents, user } from "../../db/schema";
import { newId } from "../../lib/ids";
import { csvCell } from "../export/csv";

export interface JobEventInput {
  orgId: string;
  projectId: string;
  action: JobEventAction;
  subjectId?: string | null;
  actorUserId: string;
  data?: JobEventData;
}

export async function recordJobEvents(ctx: AppContext, events: JobEventInput[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const at = ctx.now();
    await ctx.db.insert(jobEvents).values(
      events.map((e) => ({
        id: newId("jev"),
        orgId: e.orgId,
        projectId: e.projectId,
        action: e.action,
        subjectId: e.subjectId ?? null,
        data: e.data ?? {},
        actorUserId: e.actorUserId,
        createdAt: at,
      })),
    );
  } catch (err) {
    ctx.logger.error("job_history.write_failed", {
      actions: events.map((e) => e.action).join(","),
      error: String(err),
    });
  }
}

const MAX_EVENTS = 1000;

/** Newest first; with `subjectId`, one change order's or line's history. */
export async function listJobEvents(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  subjectId?: string,
): Promise<JobEventDto[]> {
  const rows = await ctx.db
    .select({
      id: jobEvents.id,
      action: jobEvents.action,
      subjectId: jobEvents.subjectId,
      data: jobEvents.data,
      createdAt: jobEvents.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(jobEvents)
    .leftJoin(user, eq(user.id, jobEvents.actorUserId))
    .where(
      and(
        eq(jobEvents.orgId, orgId),
        eq(jobEvents.projectId, projectId),
        ...(subjectId ? [eq(jobEvents.subjectId, subjectId)] : []),
      ),
    )
    // Same-millisecond events keep their insertion order.
    .orderBy(desc(jobEvents.createdAt), desc(sql`${jobEvents}.rowid`))
    .limit(MAX_EVENTS);
  return rows.map((r) => {
    const data = r.data ?? {};
    return {
      id: r.id,
      action: r.action,
      subjectId: r.subjectId,
      data,
      text: describeJobEvent(r.action, data),
      actor: r.actorEmail ? { name: r.actorName ?? "", email: r.actorEmail } : null,
      at: r.createdAt.toISOString(),
    };
  });
}

/** The job history as CSV, oldest first (the order a reader of a dispute file expects). */
export function jobHistoryCsv(events: JobEventDto[]): string {
  const lines = [["When (UTC)", "About", "What happened", "By", "Email"]];
  for (const e of [...events].reverse()) {
    lines.push([
      e.at.replace("T", " ").slice(0, 19),
      about(e),
      e.text,
      e.actor?.name ?? "(deleted user)",
      e.actor?.email ?? "",
    ]);
  }
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function about(e: JobEventDto): string {
  if (e.action.startsWith("change_order_")) return e.data.changeOrderNumber ?? "Change order";
  if (e.action.startsWith("sov_")) return "Schedule of values";
  if (e.action.startsWith("opening_")) return "Opening balance";
  if (e.action.startsWith("ca_")) return "Preliminary notice";
  return "Job";
}
