// Other business expenses (supplies, software, packaging...), each in a Schedule C category.
import { EXPENSE_CATEGORIES, PLATFORMS } from "@shared/enums";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { expense } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import type { AppEnv } from "../../types";
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
      platform: z.enum(PLATFORMS).nullish(),
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
