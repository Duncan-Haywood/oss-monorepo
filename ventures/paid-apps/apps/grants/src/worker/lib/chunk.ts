// D1 allows at most 100 bound parameters per statement (Drizzle binds every literal, including
// each `eq(col, value)`), and about 1,000 statements per batch. Split anything sized by data.

/** Max ids in one `inArray(...)` list, leaving room for the other bound parameters. */
export const D1_IN_CHUNK = 90;

/** Max statements in one `db.batch([...])`, with headroom under D1's ~1,000 limit. */
export const D1_BATCH_CHUNK = 500;

/** Split `arr` into consecutive slices of at most `size` items (the last may be shorter). */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunk size must be >= 1: ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
