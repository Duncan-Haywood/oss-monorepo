/**
 * "1 order", "3 orders": a count with its noun in the right number. English only, which is all the
 * app speaks; pass `many` for a noun whose plural is not the singular plus "s".
 */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
