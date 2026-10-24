// The sourcing question: "I'm standing in a thrift store holding this. What is
// the most I can pay and still be happy with the best place to sell it?"
//
// The comparison on the main page takes what you paid as an input and reports
// profit. A reseller at the shelf has it the other way round: they know the
// likely sale price and need the ceiling on cost. Rather than re-derive each
// channel's fee algebra (and drift from calc.mjs the first time a fee rule
// changes), this inverts the real engine: it searches for the highest
// `itemCost` at which a channel still reaches the target, calling
// calculateChannel for every probe. Profit never rises as cost rises, so
// bisection is safe.
import { calculateChannel } from "./calc.mjs";

const CAP = 1_000_000;

/**
 * Highest item cost at which `channel` still keeps at least `target`, in the
 * same terms the main table ranks on (expected keep after returns unless
 * `shared.includeReturns === false`). Returns null when even a free item falls
 * short, so the caller can say "not worth it here at any price".
 */
export function maxBuyPriceForChannel(channel, shared = {}, target = 0) {
  const goal = Number(target);
  if (!Number.isFinite(goal)) throw new Error("Target profit must be a number");
  const useExpected = shared.includeReturns !== false;
  const keep = (itemCost) => {
    const r = calculateChannel(channel, { ...shared, itemCost });
    return useExpected ? r.expectedProfit : r.profit;
  };
  if (keep(0) < goal) return null;
  let hi = Math.max(1, Number(shared.price) || 1);
  while (keep(hi) >= goal) {
    hi *= 2;
    if (hi > CAP) return CAP;
  }
  let lo = 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (keep(mid) >= goal) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

/**
 * Per-channel ceilings for every switched-on channel, best first. `best` is the
 * channel that lets you pay the most, which is the one to plan the resale on.
 */
export function maxBuyPrices(channels, shared = {}, target = 0) {
  const active = channels.filter((c) => c?.enabled !== false);
  if (active.length === 0) throw new Error("Switch on at least one channel");
  const rows = active.map((channel) => ({
    id: channel.id,
    label: channel.label ?? channel.id,
    maxBuy: maxBuyPriceForChannel(channel, shared, target),
  }));
  rows.sort((a, b) => (b.maxBuy ?? -1) - (a.maxBuy ?? -1));
  return { target: Number(target), rows, best: rows[0].maxBuy === null ? null : rows[0] };
}
