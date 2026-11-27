// Other business expenses (supplies, software, packaging...), each in a Schedule C category.
import { EXPENSE_CATEGORIES, type ExpenseCategory, SALE_CHANNELS } from "@shared/enums";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../context";
import { rowsPerInsert } from "../../db/client";
import { expense, leftOutMerchant } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { ImportFormatError } from "../../services/importers/parse";
import { MAX_STATEMENT_ROWS, parseStatement } from "../../services/importers/statement";
import {
  applyLearned,
  applyLeftOut,
  type LeftOutMemory,
  learnFromBooks,
  leftOutFromLines,
  merchantKey,
  recall,
  recallLeftOut,
} from "../../services/importers/statement-memory";
import type { AppEnv } from "../../types";
import { MAX_IMPORT_BYTES } from "./imports";
import { isoDate, page, pageQuery, positiveCents } from "./schemas";

const routes = new Hono<AppEnv>();

routes.get(
  "/",
  validate("query", pageQuery.extend({ from: isoDate.optional(), to: isoDate.optional() })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const q = c.req.valid("query");
    const where: SQL[] = [eq(expense.orgId, orgId)];
    if (q.from) where.push(gte(expense.date, q.from));
    if (q.to) where.push(lte(expense.date, q.to));
    const rows = await c.var.ctx.db
      .select()
      .from(expense)
      .where(and(...where))
      .orderBy(desc(expense.date), expense.id)
      .limit(q.limit + 1)
      .offset(q.cursor);
    return c.json(page(rows, q.limit, q.cursor));
  },
);

routes.post(
  "/",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      date: isoDate,
      category: z.enum(EXPENSE_CATEGORIES),
      amountCents: positiveCents,
      vendor: z.string().trim().max(200).nullish(),
      memo: z.string().trim().max(1000).nullish(),
      platform: z.enum(SALE_CHANNELS).nullish(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const b = c.req.valid("json");
    const id = newId("exp");
    await c.var.ctx.db.insert(expense).values({
      id,
      orgId,
      date: b.date,
      category: b.category,
      amountCents: b.amountCents,
      vendor: b.vendor ?? null,
      memo: b.memo ?? null,
      platform: b.platform ?? null,
    });
    return c.json({ id }, 201);
  },
);

// ---------------------------------------------------------------------------------------------------
// A bank or card statement (services/importers/statement.ts). Two steps, so the seller decides line by
// line: `/statement` reads the CSV and answers the candidate rows with suggested categories (nothing is
// written), then `/batch` saves the rows the seller ticked. The statement itself is never stored.

/** Same date, amount and vendor (case-insensitive) = the same expense, for re-import safety. */
const expenseKey = (e: { date: string; amountCents: number; vendor: string | null }) =>
  JSON.stringify([e.date, e.amountCents, (e.vendor ?? "").trim().toLowerCase()]);

const CHUNK = 50;

/** How many of the shop's latest expenses with a vendor teach the import (statement-memory.ts). */
export const MEMORY_ROWS = 5000;

/** The shop's own earlier choice per merchant, from the expenses already in its books. */
async function merchantMemory(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ vendor: expense.vendor, category: expense.category, date: expense.date })
    .from(expense)
    .where(and(eq(expense.orgId, orgId), isNotNull(expense.vendor)))
    .orderBy(desc(expense.date), desc(expense.createdAt))
    .limit(MEMORY_ROWS);
  // Oldest first, so the latest choice is the one that sticks.
  return learnFromBooks(
    rows.reverse().map((r) => ({ ...r, category: r.category as ExpenseCategory })),
  );
}

/** The merchants the seller asked to leave out (statement-memory.ts, "Merchants the seller leaves out"). */
async function leftOutMemory(ctx: AppContext, orgId: string): Promise<LeftOutMemory> {
  const rows = await ctx.db
    .select({
      merchant: leftOutMerchant.merchant,
      count: leftOutMerchant.count,
      lastDate: leftOutMerchant.lastDate,
    })
    .from(leftOutMerchant)
    .where(eq(leftOutMerchant.orgId, orgId));
  return new Map(rows.map((r) => [r.merchant, r]));
}

/** How many expenses already in the books share each key, for the dates given. */
async function existingKeys(ctx: AppContext, orgId: string, dates: string[]) {
  const counts = new Map<string, number>();
  const unique = [...new Set(dates)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await ctx.db
      .select({ date: expense.date, amountCents: expense.amountCents, vendor: expense.vendor })
      .from(expense)
      .where(and(eq(expense.orgId, orgId), inArray(expense.date, unique.slice(i, i + CHUNK))));
    for (const r of rows) counts.set(expenseKey(r), (counts.get(expenseKey(r)) ?? 0) + 1);
  }
  return counts;
}

/**
 * Marks which rows are already in the books. Counted per key, so two identical $5.10 USPS charges on one
 * day are two expenses, and a re-import with one of them already saved adds only the other.
 */
function markExisting<T extends { date: string; amountCents: number; vendor: string | null }>(
  rows: T[],
  existing: Map<string, number>,
): { row: T; duplicate: boolean }[] {
  const left = new Map(existing);
  return rows.map((row) => {
    const k = expenseKey(row);
    const n = left.get(k) ?? 0;
    if (n > 0) {
      left.set(k, n - 1);
      return { row, duplicate: true };
    }
    return { row, duplicate: false };
  });
}

routes.post(
  "/statement",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      fileName: z.string().trim().min(1).max(200),
      csv: z.string().min(1).max(MAX_IMPORT_BYTES),
      chargesAre: z.enum(["positive", "negative"]).optional(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const { csv, chargesAre } = c.req.valid("json");
    let parsed: ReturnType<typeof parseStatement>;
    try {
      parsed = parseStatement(csv, { chargesAre });
    } catch (e) {
      if (e instanceof ImportFormatError) throw badRequest(e.message, e.details);
      throw e;
    }
    const existing = await existingKeys(
      c.var.ctx,
      orgId,
      parsed.rows.map((r) => r.date),
    );
    const memory = await merchantMemory(c.var.ctx, orgId);
    const leftOut = await leftOutMemory(c.var.ctx, orgId);
    const marked = markExisting(
      parsed.rows.map((r) => ({
        ...r,
        suggestion: applyLeftOut(
          applyLearned(r.suggestion, recall(memory, r.description)),
          recallLeftOut(leftOut, r.description),
        ),
        vendor: r.description,
      })),
      existing,
    );
    return c.json({
      ...parsed,
      rows: marked.map(({ row: { vendor: _v, ...row }, duplicate }) => ({
        ...row,
        alreadyInBooks: duplicate,
      })),
    });
  },
);

routes.post(
  "/batch",
  requireRole("editor"),
  validate(
    "json",
    z
      .object({
        fileName: z.string().trim().min(1).max(200).nullish(),
        rows: z
          .array(
            z.object({
              date: isoDate,
              category: z.enum(EXPENSE_CATEGORIES),
              amountCents: positiveCents.min(1),
              vendor: z.string().trim().max(200).nullish(),
              memo: z.string().trim().max(1000).nullish(),
              platform: z.enum(SALE_CHANNELS).nullish(),
            }),
          )
          .max(MAX_STATEMENT_ROWS),
        /**
         * Lines that started ticked and that the seller unticked, sent only when they ticked "Remember the
         * merchants I left out". Only each line's merchant key and the latest date are stored.
         */
        leftOut: z
          .array(z.object({ date: isoDate, description: z.string().trim().min(1).max(200) }))
          .max(MAX_STATEMENT_ROWS)
          .optional(),
      })
      .refine((b) => b.rows.length > 0 || (b.leftOut?.length ?? 0) > 0, {
        message: "Nothing to save: tick a line, or remember a merchant you left out.",
      }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const b = c.req.valid("json");
    const rows = b.rows.map((r) => ({ ...r, vendor: r.vendor || null }));
    const existing = await existingKeys(
      c.var.ctx,
      orgId,
      rows.map((r) => r.date),
    );
    const fresh = markExisting(rows, existing)
      .filter((m) => !m.duplicate)
      .map((m) => m.row);
    const memo = b.fileName ? `From ${b.fileName}` : null;
    const values = fresh.map((r) => ({
      id: newId("exp"),
      orgId,
      date: r.date,
      category: r.category,
      amountCents: r.amountCents,
      vendor: r.vendor,
      memo: r.memo || memo,
      platform: r.platform ?? null,
    }));
    const per = rowsPerInsert(expense);
    const db = c.var.ctx.db;
    const inserts = [];
    for (let i = 0; i < values.length; i += per) {
      inserts.push(db.insert(expense).values(values.slice(i, i + per)));
    }
    // A merchant filed in this save is the seller's newer decision: it is forgotten as left out, and not
    // remembered again from another line of the same save.
    const filedKeys = [
      ...new Set(values.flatMap((v) => (v.vendor ? [merchantKey(v.vendor)] : []))),
    ].filter((k): k is string => k !== null);
    for (let i = 0; i < filedKeys.length; i += CHUNK) {
      inserts.push(
        db
          .delete(leftOutMerchant)
          .where(
            and(
              eq(leftOutMerchant.orgId, orgId),
              inArray(leftOutMerchant.merchant, filedKeys.slice(i, i + CHUNK)),
            ),
          ),
      );
    }
    const filed = new Set(filedKeys);
    const remembered = leftOutFromLines(b.leftOut ?? []).filter((m) => !filed.has(m.merchant));
    for (const m of remembered) {
      inserts.push(
        db
          .insert(leftOutMerchant)
          .values({ orgId, merchant: m.merchant, count: m.count, lastDate: m.lastDate })
          .onConflictDoUpdate({
            target: [leftOutMerchant.orgId, leftOutMerchant.merchant],
            set: {
              count: sql`${leftOutMerchant.count} + ${m.count}`,
              lastDate: sql`max(${leftOutMerchant.lastDate}, ${m.lastDate})`,
              updatedAt: new Date(),
            },
          }),
      );
    }
    const [first, ...rest] = inserts;
    // One D1 batch: all of the rows are saved or none are.
    if (first) await db.batch([first, ...rest]);
    return c.json(
      {
        created: values.length,
        merchantsRemembered: remembered.length,
        duplicatesSkipped: rows.length - values.length,
        totalCents: values.reduce((s, v) => s + v.amountCents, 0),
      },
      201,
    );
  },
);

// The merchants the statement import leaves out, for the page's list and its "Forget" buttons.
routes.get("/left-out", async (c) => {
  const { orgId } = c.var.tenant;
  const rows = await c.var.ctx.db
    .select({
      merchant: leftOutMerchant.merchant,
      count: leftOutMerchant.count,
      lastDate: leftOutMerchant.lastDate,
    })
    .from(leftOutMerchant)
    .where(eq(leftOutMerchant.orgId, orgId))
    .orderBy(asc(leftOutMerchant.merchant));
  return c.json({ merchants: rows });
});

routes.delete("/left-out/:merchant", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const res = await c.var.ctx.db
    .delete(leftOutMerchant)
    .where(
      and(eq(leftOutMerchant.orgId, orgId), eq(leftOutMerchant.merchant, c.req.param("merchant"))),
    )
    .returning({ merchant: leftOutMerchant.merchant });
  if (res.length === 0) throw notFound("Merchant");
  return c.json({ ok: true });
});

routes.delete("/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const res = await c.var.ctx.db
    .delete(expense)
    .where(and(eq(expense.id, c.req.param("id")), eq(expense.orgId, orgId)))
    .returning({ id: expense.id });
  if (res.length === 0) throw notFound("Expense");
  return c.json({ ok: true });
});

export default routes;
