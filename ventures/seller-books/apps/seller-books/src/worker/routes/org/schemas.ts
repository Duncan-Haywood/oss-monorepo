// Shared zod schemas for tenant routes.
import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  // Round-trip the parts: Date.parse rolls 2026-02-30 over to March 2 instead of rejecting it.
  .refine((s) => {
    const [y = 0, m = 0, d = 0] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, "Not a real date");

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
