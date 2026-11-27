// Mileage log: business trips (sourcing runs, post office, supply shopping). Miles are kept to 0.1.
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../context";
import { rowsPerInsert } from "../../db/client";
import { mileageTrip } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { totalMiles } from "../../services/books/service";
import { MAX_MILEAGE_ROWS, parseMileage } from "../../services/importers/mileage";
import { ImportFormatError } from "../../services/importers/parse";
import type { AppEnv } from "../../types";
import { MAX_IMPORT_BYTES } from "./imports";
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

// A mileage tracker's export (services/importers/mileage.ts). Two steps, like the statement import:
// `/import/preview` reads the CSV and answers the business trips (nothing is written), then
// `/import` saves the trips the seller ticked, each with a purpose. The file itself is never stored.

/** Same date, miles and route (case-insensitive) = the same trip, for re-import safety. */
const tripKey = (t: {
  date: string;
  milesTenths: number;
  startPlace: string | null;
  endPlace: string | null;
}) =>
  JSON.stringify([
    t.date,
    t.milesTenths,
    (t.startPlace ?? "").trim().toLowerCase(),
    (t.endPlace ?? "").trim().toLowerCase(),
  ]);

const CHUNK = 50;

async function existingTrips(ctx: AppContext, orgId: string, dates: string[]) {
  const counts = new Map<string, number>();
  const unique = [...new Set(dates)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await ctx.db
      .select({
        date: mileageTrip.date,
        milesTenths: mileageTrip.milesTenths,
        startPlace: mileageTrip.startPlace,
        endPlace: mileageTrip.endPlace,
      })
      .from(mileageTrip)
      .where(
        and(eq(mileageTrip.orgId, orgId), inArray(mileageTrip.date, unique.slice(i, i + CHUNK))),
      );
    for (const r of rows) counts.set(tripKey(r), (counts.get(tripKey(r)) ?? 0) + 1);
  }
  return counts;
}

/** Counted per key, so two identical 3.2-mile post office runs on one day are two trips. */
function markExisting<T extends Parameters<typeof tripKey>[0]>(
  rows: T[],
  existing: Map<string, number>,
): { row: T; duplicate: boolean }[] {
  const left = new Map(existing);
  return rows.map((row) => {
    const k = tripKey(row);
    const n = left.get(k) ?? 0;
    if (n > 0) {
      left.set(k, n - 1);
      return { row, duplicate: true };
    }
    return { row, duplicate: false };
  });
}

routes.post(
  "/import/preview",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      fileName: z.string().trim().min(1).max(200),
      csv: z.string().min(1).max(MAX_IMPORT_BYTES),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    let parsed: ReturnType<typeof parseMileage>;
    try {
      parsed = parseMileage(c.req.valid("json").csv);
    } catch (e) {
      if (e instanceof ImportFormatError) throw badRequest(e.message, e.details);
      throw e;
    }
    const existing = await existingTrips(
      c.var.ctx,
      orgId,
      parsed.rows.map((r) => r.date),
    );
    return c.json({
      ...parsed,
      rows: markExisting(parsed.rows, existing).map(({ row, duplicate }) => ({
        ...row,
        alreadyInBooks: duplicate,
      })),
    });
  },
);

routes.post(
  "/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      fileName: z.string().trim().min(1).max(200).nullish(),
      trips: z
        .array(
          z.object({
            date: isoDate,
            purpose: z.string().trim().min(1).max(300),
            startPlace: z.string().trim().max(200).nullish(),
            endPlace: z.string().trim().max(200).nullish(),
            milesTenths: z.number().int().min(1).max(50000),
          }),
        )
        .min(1)
        .max(MAX_MILEAGE_ROWS),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const trips = c.req.valid("json").trips.map((t) => ({
      ...t,
      startPlace: t.startPlace || null,
      endPlace: t.endPlace || null,
    }));
    const existing = await existingTrips(
      c.var.ctx,
      orgId,
      trips.map((t) => t.date),
    );
    const values = markExisting(trips, existing)
      .filter((m) => !m.duplicate)
      .map(({ row }) => ({
        id: newId("mil"),
        orgId,
        date: row.date,
        purpose: row.purpose,
        startPlace: row.startPlace,
        endPlace: row.endPlace,
        milesTenths: row.milesTenths,
        roundTrip: false,
      }));
    const per = rowsPerInsert(mileageTrip);
    const db = c.var.ctx.db;
    const inserts = [];
    for (let i = 0; i < values.length; i += per) {
      inserts.push(db.insert(mileageTrip).values(values.slice(i, i + per)));
    }
    const [first, ...rest] = inserts;
    // One D1 batch: all of the trips are saved or none are.
    if (first) await db.batch([first, ...rest]);
    return c.json(
      {
        created: values.length,
        duplicatesSkipped: trips.length - values.length,
        miles: values.reduce((s, v) => s + v.milesTenths, 0) / 10,
      },
      201,
    );
  },
);

export default routes;
