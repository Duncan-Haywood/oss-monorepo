/**
 * Job-shop quote from the shop's own rates. Every number here is an input the
 * user types; the module states no material price, machine rate or markup.
 *
 * Method (per lot of quantity q):
 *   material   = q x material cost per part x (1 + scrap allowance)
 *   setup      = setup hours x setup rate            (once per lot)
 *   programming= programming hours x rate / lots expected over the program's life
 *   machining  = q x cycle minutes / 60 x machine rate
 *   other ops  = sum over ops of (q x minutes / 60 x rate) + flat lot charge
 *   cost       = sum of the above
 *   price      = cost x (1 + markup)
 * Quantity breaks re-run the same formula at each quantity, so a break is the
 * setup and programming being spread over more parts, not a discount invented
 * by the tool.
 */

const num = (v, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export function validate(input) {
  const errors = [];
  const nonNeg = ["materialPerPart", "scrapPct", "setupHours", "setupRate", "programHours", "programRate", "cycleMinutes", "machineRate", "markupPct"];
  for (const k of nonNeg) if (num(input[k], 0) < 0) errors.push(`${k} cannot be negative`);
  if (num(input.lotsOverProgramLife, 1) < 1) errors.push("lotsOverProgramLife must be at least 1");
  for (const [i, op] of (input.ops || []).entries()) {
    if (num(op.minutesPerPart) < 0 || num(op.rate) < 0 || num(op.lotCharge) < 0) errors.push(`operation ${i + 1} has a negative value`);
  }
  return errors;
}

export function costLot(input, quantity) {
  const q = Math.max(1, Math.floor(num(quantity, 1)));
  const scrap = num(input.scrapPct) / 100;
  const material = q * num(input.materialPerPart) * (1 + scrap);
  const setup = num(input.setupHours) * num(input.setupRate);
  const programming = (num(input.programHours) * num(input.programRate)) / Math.max(1, num(input.lotsOverProgramLife, 1));
  const machining = (q * num(input.cycleMinutes) / 60) * num(input.machineRate);
  let ops = 0;
  for (const op of input.ops || []) {
    ops += (q * num(op.minutesPerPart) / 60) * num(op.rate) + num(op.lotCharge);
  }
  const cost = material + setup + programming + machining + ops;
  const price = cost * (1 + num(input.markupPct) / 100);
  return {
    quantity: q,
    lines: { material, setup, programming, machining, ops },
    cost,
    price,
    costEach: cost / q,
    priceEach: price / q,
    fixedShareEach: (setup + programming) / q,
  };
}

export const DEFAULT_BREAKS = [1, 5, 10, 25, 50, 100];

export function quoteBreaks(input, breaks = DEFAULT_BREAKS) {
  const qs = [...new Set(breaks.map((b) => Math.max(1, Math.floor(num(b, 1)))))].sort((a, b) => a - b);
  return qs.map((q) => costLot(input, q));
}
