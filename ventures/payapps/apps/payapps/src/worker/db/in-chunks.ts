// D1 binds at most 100 parameters a statement, so a query with `inArray(column, ids)` over a list
// that grows with the company (its jobs, its crew, a week's labour lines) fails with "too many SQL
// variables" once the list passes ~100. These split the list and run one statement per slice.

/** Ids per `inArray` slice: under D1's 100 bound parameters, with room for the org id and a few more. */
export const D1_IN_CHUNK = 90;

/** `xs` in slices of at most `size` (the last one shorter); none for an empty list. */
export function chunks<T>(xs: readonly T[], size = D1_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Runs `query` once per slice of `ids`, one after another (D1 is one database: parallel
 * statements only queue), and concatenates the rows in slice order. A caller grouping or ordering
 * per id gets the same rows as one statement would give, since every id sits in exactly one slice;
 * an order *across* ids is only per slice, so sort afterwards if the whole list must be ordered.
 */
export async function allInChunks<T, R>(
  ids: readonly T[],
  query: (slice: T[]) => Promise<R[]>,
  size = D1_IN_CHUNK,
): Promise<R[]> {
  const out: R[] = [];
  for (const slice of chunks(ids, size)) out.push(...(await query(slice)));
  return out;
}
