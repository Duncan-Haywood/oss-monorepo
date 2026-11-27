// Mileage log: business trips (sourcing runs, post office, supply shopping). Miles are kept to 0.1.
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { mileageTrip } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { totalMiles } from "../../services/books/service";
import type { AppEnv } from "../../types";
import { isoDate, page, pageQuery } from "./schemas";

const routes = new Hono<AppEnv>();

routes.get(
  "/",
  validate("query", pageQuery.extend({ from: isoDate.optional(), to: isoDate.optional() })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const q = c.req.valid("query");
    const where: SQL[] = [eq(mileageTrip.orgId, orgId)];
    if (q.from) where.push(gte(mileageTrip.date, q.from));
    if (q.to) where.push(lte(mileageTrip.date, q.to));
    const rows = await c.var.ctx.db
      .select()
      .from(mileageTrip)
      .where(and(...where))
      .orderBy(desc(mileageTrip.date), mileageTrip.id)
      .limit(q.limit + 1)
      .offset(q.cursor);
    const all = await c.var.ctx.db
      .select({ milesTenths: mileageTrip.milesTenths, roundTrip: mileageTrip.roundTrip })
      .from(mileageTrip)
      .where(and(...where));
    return c.json({
      ...page(rows, q.limit, q.cursor),
      totalMiles: totalMiles(all),
      trips: all.length,
    });
  },
);

routes.post(
  "/",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      date: isoDate,
      purpose: z.string().trim().min(1).max(300),
      startPlace: z.string().trim().max(200).nullish(),
      endPlace: z.string().trim().max(200).nullish(),
      miles: z.number().positive().max(5000),
      roundTrip: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const b = c.req.valid("json");
    const id = newId("mil");
    await c.var.ctx.db.insert(mileageTrip).values({
      id,
      orgId,
      date: b.date,
      purpose: b.purpose,
      startPlace: b.startPlace ?? null,
      endPlace: b.endPlace ?? null,
      milesTenths: Math.round(b.miles * 10),
      roundTrip: b.roundTrip,
    });
    return c.json({ id }, 201);
  },
);

routes.delete("/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const res = await c.var.ctx.db
    .delete(mileageTrip)
    .where(and(eq(mileageTrip.id, c.req.param("id")), eq(mileageTrip.orgId, orgId)))
    .returning({ id: mileageTrip.id });
  if (res.length === 0) throw notFound("Trip");
  return c.json({ ok: true });
});

export default routes;
