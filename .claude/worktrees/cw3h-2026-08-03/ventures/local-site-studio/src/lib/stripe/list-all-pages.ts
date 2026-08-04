/**
 * Stripe list endpoints cap a single page at 100 items. Any idempotent
 * lookup keyed off a stable metadata value must walk has_more/starting_after
 * until either a match turns up (stop early via `until`) or the list is
 * exhausted — an un-paginated single-page lookup silently misses an existing
 * match past page 1 (trivial once an account holds >100 active Products,
 * e.g. after a few Commerce leads each sync a multi-SKU catalog) and either
 * creates a duplicate Product/Price on re-sync or leaves a genuine orphan
 * unarchived while reporting success. Shared by src/lib/commerce/stripe-sync.ts
 * and src/lib/pricing/bootstrap-stripe-prices.ts — do not duplicate this loop
 * in a third Stripe list() caller; import it instead.
 */
export async function listAllPages<T extends { id: string }>(
  fetchPage: (startingAfter?: string) => Promise<{ data: T[]; has_more: boolean }>,
  until?: (item: T) => boolean,
): Promise<T[]> {
  const all: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await fetchPage(startingAfter);
    all.push(...page.data);
    if (until && page.data.some(until)) break;
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
  return all;
}
