// Shared zod schemas for tenant routes.
import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real date");

/** Whole cents, up to $10M. */
export const centsSchema = z.number().int().min(-1_000_000_000).max(1_000_000_000);
export const positiveCents = z.number().int().min(0).max(1_000_000_000);

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.coerce.number().int().min(0).default(0),
});

/** `{ items, nextCursor? }` from an offset page fetched with limit + 1. */
export function page<T>(rows: T[], limit: number, offset: number) {
  return rows.length > limit
    ? { items: rows.slice(0, limit), nextCursor: String(offset + limit) }
    : { items: rows };
}
