// Short-term-rental cleaning fee: separate fee vs rolled into the nightly rate.
// Pure arithmetic on the host's own inputs; no network, no model.
//
// For a stay of n nights:
//   separate fee : guest pays n*R + F (plus the guest service fee)
//   rolled in    : nightly rate R' = R + F/avgStay, no cleaning fee
//                  guest pays n*R' (plus the guest service fee)
// Host payout is the pre-guest-fee subtotal x (1 - host fee). Host profit
// per stay is payout - cleaning cost - n * variable cost per night.
// Rolling in keeps revenue identical at the average stay by construction, so
// it wins on stays longer than average for the guest and loses on shorter ones.

export function money(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
export function money2(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function pct(x, d = 1) { return (x * 100).toFixed(d) + "%"; }

export const STAY_LENGTHS = [1, 2, 3, 5, 7, 14];

export function normalise(raw) {
  const i = {
    nightly: Number(raw.nightly) || 0,
    cleaningFee: Number(raw.cleaningFee) || 0,
    cleaningCost: Number(raw.cleaningCost) || 0,
    avgStay: Number(raw.avgStay) || 0,
    hostFee: Number(raw.hostFee) || 0,
    guestFee: Number(raw.guestFee) || 0,
    nightCost: Number(raw.nightCost) || 0,
    nightsPerMonth: Number(raw.nightsPerMonth) || 0,
  };
  for (const k of Object.keys(i)) if (!Number.isFinite(i[k]) || i[k] < 0) return { invalid: `${k} must be zero or more.` };
  if (i.nightly <= 0) return { invalid: "Enter your nightly rate." };
  if (i.avgStay < 1) return { invalid: "Average stay must be at least 1 night." };
  if (i.hostFee >= 1) return { invalid: "Host fee must be under 100%." };
  if (i.guestFee >= 1) return { invalid: "Guest fee must be under 100%." };
  return i;
}

export function rolledInNightly(i) { return i.nightly + i.cleaningFee / i.avgStay; }

// Cleaning fee that leaves the host exactly whole on the cleaner's bill.
export function breakEvenCleaningFee(i) { return i.cleaningCost / (1 - i.hostFee); }

export function stay(i, structure, n) {
  const subtotal = structure === "separate" ? n * i.nightly + i.cleaningFee : n * rolledInNightly(i);
  const guestTotal = subtotal * (1 + i.guestFee);
  const payout = subtotal * (1 - i.hostFee);
  const profit = payout - i.cleaningCost - n * i.nightCost;
  return { subtotal, guestTotal, payout, profit, guestPerNight: guestTotal / n, profitPerNight: profit / n };
}

// Shortest stay (in nights) at which a stay is profitable under the structure.
// Profit is linear in n, so it is solved exactly; null when it never is.
export function minProfitableStay(i, structure) {
  const at = (n) => stay(i, structure, n).profit;
  const a = at(0), slope = at(1) - a;
  if (a >= 0) return 0;
  if (slope <= 0) return null;
  return -a / slope;
}

export function outcome(raw) {
  const i = normalise(raw);
  if (i.invalid) return i;
  const rolled = rolledInNightly(i);
  const be = breakEvenCleaningFee(i);
  const avgSep = stay(i, "separate", i.avgStay);
  const avgRol = stay(i, "rolled", i.avgStay);
  const stays = i.nightsPerMonth > 0 ? i.nightsPerMonth / i.avgStay : 0;
  const cleaningNet = i.cleaningFee * (1 - i.hostFee) - i.cleaningCost;
  const table = STAY_LENGTHS.map((n) => ({ nights: n, separate: stay(i, "separate", n), rolled: stay(i, "rolled", n) }));
  const minSep = minProfitableStay(i, "separate");
  const findings = [];
  if (cleaningNet < 0) findings.push({ severity: "high", title: "Your cleaning fee does not cover the cleaner", detail: `After the host fee you keep ${money2(i.cleaningFee * (1 - i.hostFee))} of a ${money2(i.cleaningFee)} fee against a ${money2(i.cleaningCost)} cleaning bill, so every stay starts ${money2(-cleaningNet)} in the hole. A fee of ${money2(be)} makes you whole.` });
  else if (i.cleaningFee > 0 && cleaningNet > 0.25 * i.cleaningCost) findings.push({ severity: "info", title: "Your cleaning fee earns a margin", detail: `You keep ${money2(cleaningNet)} above the cleaner's bill on each stay. Guests compare total price, so a fee above cost can be traded for a lower nightly rate.` });
  if (i.cleaningFee > 0 && i.cleaningFee > 0.5 * i.nightly * i.avgStay) findings.push({ severity: "medium", title: "Cleaning fee is over half a typical stay's room revenue", detail: `On a ${i.avgStay}-night stay the fee is ${pct(i.cleaningFee / (i.avgStay * i.nightly), 0)} of the nightly revenue. Guests see the all-in price up front, so a fee that large can cost you bookings.` });
  const r1 = table[0];
  if (r1.rolled.profit < 0 && i.avgStay > 1) findings.push({ severity: "medium", title: "Rolling the fee in loses money on 1-night stays", detail: `A 1-night stay at ${money2(rolled)} a night leaves you ${money2(r1.rolled.profit)}, against ${money2(r1.separate.profit)} with a separate fee. Consider a 2-night minimum if you roll the fee in.` });
  if (minSep === null) findings.push({ severity: "high", title: "No stay length is profitable", detail: "Your nightly rate after fees does not cover the variable cost per night, so longer stays only lose more." });
  else if (minSep > 1) findings.push({ severity: "medium", title: "1-night stays lose money", detail: `With your costs a stay must be about ${minSep.toFixed(1)} nights to be profitable under a separate fee. A ${Math.ceil(minSep)}-night minimum removes the loss-making stays.` });
  return { input: i, rolledNightly: rolled, breakEvenFee: be, cleaningNet, avgSeparate: avgSep, avgRolled: avgRol,
    staysPerMonth: stays, monthlyCleaningNet: stays * cleaningNet, table, minProfitableStaySeparate: minSep, findings };
}
