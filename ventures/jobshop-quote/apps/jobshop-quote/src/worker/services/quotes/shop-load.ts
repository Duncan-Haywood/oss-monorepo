// Shop load and lead time (src/shared/shop-load.ts for the model). Open jobs are the shop's won
// quotes that are not marked shipped: those won in the last OPEN_WON_DAYS days, plus any older one
// the shop saved a due date for (so a win from last year nobody marked shipped does not book the
// machines forever). Quantities follow the traveler: the one saved for the job, else the break the
// customer accepted online, else the line's only break. Everything is scoped by orgId.
import type { ShopJobInput } from "@shared/api";
import { startsFor } from "@shared/costing";
import { quoteLabel } from "@shared/quote-label";
import {
  type LoadJob,
  type LoadMachine,
  leadTimes,
  leadTimeText,
  shopLoad,
} from "@shared/shop-load";
import { shopDay } from "@shared/time-zone";
import { isValidOrderQuantity, planQuantities } from "@shared/traveler";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  machineCapacity,
  machines,
  quoteJobs,
  quoteLines,
  quoteResponses,
  quotes,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { getSettings } from "../ratecard";
import { getQuote } from "./index";

/** A won quote with no saved job counts as open for this many days after the win. */
export const OPEN_WON_DAYS = 90;
const DAY_MS = 86_400_000;

async function loadMachines(ctx: AppContext, orgId: string): Promise<LoadMachine[]> {
  const rows = await ctx.db
    .select({
      id: machines.id,
      name: machines.name,
      active: machines.active,
      hoursPerDay: machineCapacity.hoursPerDay,
    })
    .from(machines)
    .leftJoin(
      machineCapacity,
      and(eq(machineCapacity.machineId, machines.id), eq(machineCapacity.orgId, orgId)),
    )
    .where(eq(machines.orgId, orgId))
    .orderBy(asc(machines.name))
    .all();
  return rows.map((r) => ({ ...r, hoursPerDay: r.hoursPerDay ?? null }));
}

/** The open jobs, ready for the scheduler. */
async function loadOpenJobs(ctx: AppContext, orgId: string, timeZone: string | null) {
  const won = await ctx.db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      revNumber: quotes.revNumber,
      customer: quotes.customerCompany,
      decidedAt: quotes.decidedAt,
      updatedAt: quotes.updatedAt,
      dueOn: quoteJobs.dueOn,
      quantities: quoteJobs.quantities,
      shippedOn: quoteJobs.shippedOn,
      hasJob: quoteJobs.quoteId,
    })
    .from(quotes)
    .leftJoin(quoteJobs, and(eq(quoteJobs.quoteId, quotes.id), eq(quoteJobs.orgId, orgId)))
    .where(and(eq(quotes.orgId, orgId), eq(quotes.status, "won")))
    .all();
  const cutoff = ctx.now().getTime() - OPEN_WON_DAYS * DAY_MS;
  const open = won.filter((q) => {
    if (q.shippedOn) return false;
    if (q.dueOn) return true;
    const at = (q.decidedAt ?? q.updatedAt).getTime();
    return at >= cutoff;
  });
  if (open.length === 0) return [];
  const openIds = new Set(open.map((q) => q.id));

  const lines = await ctx.db
    .select({
      id: quoteLines.id,
      quoteId: quoteLines.quoteId,
      partNumber: quoteLines.partNumber,
      inputs: quoteLines.inputs,
    })
    .from(quoteLines)
    .innerJoin(quotes, eq(quotes.id, quoteLines.quoteId))
    .where(and(eq(quoteLines.orgId, orgId), eq(quotes.orgId, orgId), eq(quotes.status, "won")))
    .orderBy(asc(quoteLines.position), asc(quoteLines.createdAt))
    .all();
  const responses = await ctx.db
    .select({
      quoteId: quoteResponses.quoteId,
      decision: quoteResponses.decision,
      choices: quoteResponses.choices,
    })
    .from(quoteResponses)
    .innerJoin(quotes, eq(quotes.id, quoteResponses.quoteId))
    .where(and(eq(quoteResponses.orgId, orgId), eq(quotes.orgId, orgId), eq(quotes.status, "won")))
    .all();

  const linesBy = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!openIds.has(l.quoteId)) continue;
    const list = linesBy.get(l.quoteId) ?? [];
    list.push(l);
    linesBy.set(l.quoteId, list);
  }
  const acceptedBy = new Map(
    responses.filter((r) => r.decision === "accepted").map((r) => [r.quoteId, r.choices]),
  );

  return open.map((q): LoadJob => {
    const qLines = linesBy.get(q.id) ?? [];
    const { plan, missing } = planQuantities(
      qLines,
      q.quantities ?? {},
      acceptedBy.get(q.id) ?? null,
    );
    const problems = missing.map((p) => `${p}: save the quantity ordered`);
    if (qLines.length === 0) problems.push("No parts on this quote");
    return {
      id: q.id,
      label: quoteLabel(q.quoteNumber, q.revNumber),
      customer: q.customer,
      dueOn: q.dueOn ?? null,
      wonOn: shopDay(q.decidedAt ?? q.updatedAt, timeZone),
      lines: plan.map((p) => ({
        partNumber: p.line.partNumber,
        starts: startsFor(p.quantity, p.line.inputs.falloutBps),
        operations: p.line.inputs.operations,
      })),
      problems,
    };
  });
}

/** GET /shop-load: the open jobs on the machines and each machine's booked days. */
export async function getShopLoad(ctx: AppContext, orgId: string) {
  const settings = await getSettings(ctx, orgId);
  const [ms, jobs] = await Promise.all([
    loadMachines(ctx, orgId),
    loadOpenJobs(ctx, orgId, settings.timeZone),
  ]);
  const today = shopDay(ctx.now(), settings.timeZone);
  return { today, openWonDays: OPEN_WON_DAYS, ...shopLoad(jobs, ms, today) };
}

/** GET /quotes/:id/lead-time: per line and quantity break, when its machine work would finish. */
export async function getQuoteLeadTime(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await getQuote(ctx, orgId, quoteId);
  const settings = await getSettings(ctx, orgId);
  const [ms, jobs] = await Promise.all([
    loadMachines(ctx, orgId),
    loadOpenJobs(ctx, orgId, settings.timeZone),
  ]);
  const today = shopDay(ctx.now(), settings.timeZone);
  // A won quote is already in the backlog; plan it against the other jobs only.
  const others = jobs.filter((j) => j.id !== quoteId);
  const lines = q.lines.map((l) => {
    const times = leadTimes(l.inputs, l.partNumber, others, ms, today);
    return {
      lineId: l.id,
      partNumber: l.partNumber,
      breaks: times.map((t) => ({ ...t, text: leadTimeText(t) })),
    };
  });
  return { today, openJobs: others.length, lines };
}

/** GET /quotes/:id/job: the saved job for a won quote (empty when none yet). */
export async function getQuoteJob(ctx: AppContext, orgId: string, quoteId: string) {
  await getQuote(ctx, orgId, quoteId);
  const row = await ctx.db
    .select()
    .from(quoteJobs)
    .where(and(eq(quoteJobs.orgId, orgId), eq(quoteJobs.quoteId, quoteId)))
    .get();
  return {
    dueOn: row?.dueOn ?? null,
    quantities: row?.quantities ?? {},
    shippedOn: row?.shippedOn ?? null,
  };
}

/** PUT /quotes/:id/job: due date, quantities ordered and shipped day for a won quote. */
export async function saveQuoteJob(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
  input: ShopJobInput,
) {
  const q = await getQuote(ctx, orgId, quoteId);
  if (q.status !== "won") throw conflict("A job is saved for a won quote: record the win first");
  for (const [lineId, n] of Object.entries(input.quantities)) {
    if (!q.lines.some((l) => l.id === lineId))
      throw badRequest("A quantity names a line not on this quote");
    if (!isValidOrderQuantity(n))
      throw badRequest("Each quantity must be a whole number from 1 to 1,000,000");
  }
  const values = {
    dueOn: input.dueOn,
    quantities: input.quantities,
    shippedOn: input.shippedOn,
    updatedBy: userId,
  };
  await ctx.db
    .insert(quoteJobs)
    .values({ quoteId, orgId, ...values })
    .onConflictDoUpdate({ target: quoteJobs.quoteId, set: { ...values, updatedAt: new Date() } });
  return getQuoteJob(ctx, orgId, quoteId);
}

/** PUT /shop-load/machines/:machineId: the machine's hours a day (null clears it). */
export async function setMachineHours(
  ctx: AppContext,
  orgId: string,
  machineId: string,
  hoursPerDay: number | null,
) {
  const m = await ctx.db
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.orgId, orgId), eq(machines.id, machineId)))
    .get();
  if (!m) throw notFound("Machine");
  if (hoursPerDay === null) {
    await ctx.db
      .delete(machineCapacity)
      .where(and(eq(machineCapacity.orgId, orgId), eq(machineCapacity.machineId, machineId)));
  } else {
    await ctx.db
      .insert(machineCapacity)
      .values({ orgId, machineId, hoursPerDay })
      .onConflictDoUpdate({
        target: [machineCapacity.orgId, machineCapacity.machineId],
        set: { hoursPerDay, updatedAt: new Date() },
      });
  }
  return { machineId, hoursPerDay };
}
