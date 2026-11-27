// The history of each pay application (src/shared/pay-app-history.ts): append-only rows written by
// the routes after a change succeeds, read newest first with who did it. Writing is best effort: the
// change itself has already been committed, so a failed history write is logged and never turns a
// successful change into an error the user would retry.

import type { PayAppEventDto } from "@shared/api/types";
import {
  describePayAppEvent,
  type PayAppEventAction,
  type PayAppEventData,
} from "@shared/pay-app-history";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { payAppEvents, payApps, user } from "../../db/schema";
import { newId } from "../../lib/ids";
import { csvCell } from "../export/csv";

export interface PayAppEventInput {
  orgId: string;
  projectId: string;
  payAppId: string;
  /** Known to the caller after most changes; looked up otherwise (needed before a delete). */
  payAppNumber?: number;
  action: PayAppEventAction;
  actorUserId: string;
  data?: PayAppEventData;
}

export async function recordPayAppEvent(ctx: AppContext, e: PayAppEventInput): Promise<void> {
  try {
    let number = e.payAppNumber;
    if (number === undefined) {
      const row = await ctx.db
        .select({ number: payApps.number })
        .from(payApps)
        .where(
          and(
            eq(payApps.orgId, e.orgId),
            eq(payApps.projectId, e.projectId),
            eq(payApps.id, e.payAppId),
          ),
        )
        .get();
      if (!row) return;
      number = row.number;
    }
    await ctx.db.insert(payAppEvents).values({
      id: newId("pae"),
      orgId: e.orgId,
      projectId: e.projectId,
      payAppId: e.payAppId,
      payAppNumber: number,
      action: e.action,
      data: e.data ?? {},
      actorUserId: e.actorUserId,
      createdAt: ctx.now(),
    });
  } catch (err) {
    ctx.logger.error("history.write_failed", { action: e.action, error: String(err) });
  }
}

const MAX_EVENTS = 1000;

/** Newest first. With `payAppId`, one application's history; without, the whole job's. */
export async function listPayAppEvents(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId?: string,
): Promise<PayAppEventDto[]> {
  const rows = await ctx.db
    .select({
      id: payAppEvents.id,
      payAppId: payAppEvents.payAppId,
      payAppNumber: payAppEvents.payAppNumber,
      action: payAppEvents.action,
      data: payAppEvents.data,
      createdAt: payAppEvents.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(payAppEvents)
    .leftJoin(user, eq(user.id, payAppEvents.actorUserId))
    .where(
      and(
        eq(payAppEvents.orgId, orgId),
        eq(payAppEvents.projectId, projectId),
        ...(payAppId ? [eq(payAppEvents.payAppId, payAppId)] : []),
      ),
    )
    // Same-millisecond events keep their insertion order.
    .orderBy(desc(payAppEvents.createdAt), desc(sql`${payAppEvents}.rowid`))
    .limit(MAX_EVENTS);
  return rows.map((r) => {
    const data = r.data ?? {};
    return {
      id: r.id,
      payAppId: r.payAppId,
      payAppNumber: r.payAppNumber,
      action: r.action,
      data,
      text: describePayAppEvent(r.action, r.payAppNumber, data),
      actor: r.actorEmail ? { name: r.actorName ?? "", email: r.actorEmail } : null,
      at: r.createdAt.toISOString(),
    };
  });
}

/** The history as CSV, oldest first (the order a reader of a dispute file expects). */
export function historyCsv(events: PayAppEventDto[]): string {
  const lines = [["When (UTC)", "Application", "What happened", "By", "Email"]];
  for (const e of [...events].reverse()) {
    lines.push([
      e.at.replace("T", " ").slice(0, 19),
      `#${e.payAppNumber}`,
      e.text,
      e.actor?.name ?? "(deleted user)",
      e.actor?.email ?? "",
    ]);
  }
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
