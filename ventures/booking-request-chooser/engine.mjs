// Booking request chooser: which pending booking requests should a host
// accept? Confirmed bookings are fixed; requests are optional. The plan that
// maximises
//
//   sum(price of accepted) - turnover cost per accepted stay
//     + (empty-night value) x (nights in every gap long enough to sell)
//
// is found exactly by dynamic programming over the gaps between confirmed
// bookings (weighted interval scheduling with a gap-dependent transition
// value). A gap shorter than the minimum stay is "dead": nobody can book it,
// so its nights are worth nothing. That is why the highest-priced request is
// not always the right one.
//
// Pure functions, no network, no dependencies. Dates are ISO YYYY-MM-DD; the
// end date is check-out (the night of the end date is not occupied).

export const MODEL_NOTE =
  "Plan value = accepted prices - turnover costs + the empty-night value of every leftover gap long enough to sell. " +
  "Numbers are the ones you supply; the empty-night value is your estimate of what a sellable leftover night is worth.";

export const INPUT_NOTES = [
  { what: "booked,2026-07-01,2026-07-05,640", detail: "A confirmed booking (kind booked, confirmed or blocked): fixed, cannot be declined. Columns: kind,check-in,check-out,total price[,label]." },
  { what: "request,2026-07-05,2026-07-07,250,Dana", detail: "A pending request or inquiry (kind request, inquiry or pending): the tool decides whether to accept it. Rows are read in the order they arrived." },
  { what: "Dates", detail: "ISO YYYY-MM-DD. The end date is the check-out day; a stay ending the day another starts is back-to-back, not a clash." },
  { what: "Price", detail: "Total for the stay, after platform fees if you want a net number. A $ sign is ignored; write 1200, not 1,200 (a comma starts the next column)." },
  { what: "Header row and # comments", detail: "A first row starting with kind, blank lines and lines starting with # are skipped." },
];

const BOOKED = new Set(["booked", "confirmed", "blocked", "block", "booking"]);
const REQUEST = new Set(["request", "inquiry", "pending", "enquiry"]);
const DAY = 86400000;

export function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return t / DAY;
}

export function isoDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export function parseCalendar(text) {
  const booked = [];
  const requests = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^kind$/i.test(cells[0])) return;
    const kind = cells[0].toLowerCase();
    const where = `line ${i + 1}`;
    if (!BOOKED.has(kind) && !REQUEST.has(kind)) {
      errors.push(`${where}: kind "${cells[0]}" is not booked or request`);
      return;
    }
    const start = dayNumber(cells[1]);
    const end = dayNumber(cells[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      errors.push(`${where}: dates must be YYYY-MM-DD (got "${cells[1]}", "${cells[2]}")`);
      return;
    }
    if (end <= start) {
      errors.push(`${where}: check-out must be after check-in`);
      return;
    }
    const price = Number(String(cells[3] ?? "").replace(/[$\s]/g, ""));
    if (cells[3] === undefined || cells[3] === "" || !Number.isFinite(price) || price < 0) {
      errors.push(`${where}: price must be a number of dollars, zero or more`);
      return;
    }
    const label = cells.slice(4).join(", ") || "";
    const base = { start, end, nights: end - start, price, label, line: i + 1 };
    if (BOOKED.has(kind)) booked.push(base);
    else requests.push({ ...base, id: requests.length });
  });
  booked.sort((a, b) => a.start - b.start || a.end - b.end);
  return { booked, requests, errors };
}

function cleanOpts(o = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null && v !== undefined ? Number(v) : d);
  return {
    turnover: Math.max(0, num(o.turnover, 0)),
    nightValue: Math.max(0, num(o.nightValue, 0)),
    minStay: Math.max(1, Math.round(num(o.minStay, 2))),
  };
}

export function gapValue(nights, opts) {
  if (nights <= 0 || nights < opts.minStay) return 0;
  return nights * opts.nightValue;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Value of a complete calendar (fixed + chosen), given options. Returns null on a clash. */
export function evaluate(booked, chosen, optsIn) {
  const opts = cleanOpts(optsIn);
  const all = [...booked, ...chosen].sort((a, b) => a.start - b.start || a.end - b.end);
  let value = 0;
  let dead = 0;
  for (let i = 0; i < all.length; i += 1) {
    if (i && all[i].start < all[i - 1].end) return null;
    value += all[i].price - opts.turnover;
    if (i) {
      const g = all[i].start - all[i - 1].end;
      value += gapValue(g, opts);
      if (g > 0 && g < opts.minStay) dead += g;
    }
  }
  return { value, dead, stays: all.length };
}

/** Exact optimum over a set of candidate requests. Returns {value, chosen}. */
export function optimise(booked, candidates, optsIn) {
  const opts = cleanOpts(optsIn);
  const fixed = [...booked].sort((a, b) => a.start - b.start || a.end - b.end);
  const feasible = candidates.filter((c) => !fixed.some((f) => overlaps(c, f)));
  const chosen = [];
  // Windows: before the first fixed stay, between fixed stays, after the last.
  const bounds = [{ left: null, right: fixed[0] || null }];
  for (let i = 0; i < fixed.length; i += 1) bounds.push({ left: fixed[i], right: fixed[i + 1] || null });
  const lo = Math.min(...[...fixed, ...feasible].map((x) => x.start), Infinity);
  const hi = Math.max(...[...fixed, ...feasible].map((x) => x.end), -Infinity);
  for (const w of bounds) {
    const L = w.left ? w.left.end : lo;
    const R = w.right ? w.right.start : hi;
    const inside = feasible.filter((c) => c.start >= L && c.end <= R).sort((a, b) => a.end - b.end || a.start - b.start);
    // Edge gaps (before the first or after the last stay in the file) are not counted:
    // the file says nothing about demand outside its dates.
    const gv = (g, edge) => (g <= 0 || edge ? 0 : gapValue(g, opts));
    const leftEdge = !w.left;
    const rightEdge = !w.right;
    const f = [];
    const from = [];
    inside.forEach((c, i) => {
      let best = gv(c.start - L, leftEdge);
      let bj = -1;
      for (let j = 0; j < i; j += 1) {
        if (inside[j].end <= c.start) {
          const v = f[j] + gv(c.start - inside[j].end, false);
          if (v > best) { best = v; bj = j; }
        }
      }
      f[i] = best + c.price - opts.turnover;
      from[i] = bj;
    });
    let bestEnd = gv(R - L, leftEdge || rightEdge);
    let bi = -1;
    inside.forEach((c, i) => {
      const v = f[i] + gv(R - c.end, rightEdge);
      if (v > bestEnd + 1e-9) { bestEnd = v; bi = i; }
    });
    for (let i = bi; i >= 0; i = from[i]) chosen.push(inside[i]);
  }
  chosen.sort((a, b) => a.start - b.start);
  const ev = evaluate(fixed, chosen, opts);
  return { chosen, value: ev ? ev.value : 0, dead: ev ? ev.dead : 0 };
}

function firstComeFirstServed(booked, requests) {
  const chosen = [];
  for (const r of requests) {
    if (![...booked, ...chosen].some((x) => overlaps(r, x))) chosen.push(r);
  }
  return chosen;
}

function highestPriceFirst(booked, requests) {
  const chosen = [];
  for (const r of [...requests].sort((a, b) => b.price - a.price || a.id - b.id)) {
    if (![...booked, ...chosen].some((x) => overlaps(r, x))) chosen.push(r);
  }
  return chosen;
}

/** Dead gaps (shorter than the minimum stay) between confirmed bookings. */
export function deadGaps(booked, optsIn) {
  const opts = cleanOpts(optsIn);
  const out = [];
  for (let i = 1; i < booked.length; i += 1) {
    const g = booked[i].start - booked[i - 1].end;
    if (g > 0 && g < opts.minStay) out.push({ from: booked[i - 1].end, to: booked[i].start, nights: g });
  }
  return out;
}

const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
export { money };

function counterOffers(booked, requests, base, chosen, opts) {
  const chosenIds = new Set(chosen.map((c) => c.id));
  const offers = [];
  for (const r of requests) {
    if (chosenIds.has(r.id)) continue;
    const perNight = r.price / r.nights;
    let best = null;
    for (let before = 0; before <= 2; before += 1) {
      for (let after = 0; after <= 2; after += 1) {
        if ((!before && !after) || before + after > 2) continue;
        const v = { ...r, start: r.start - before, end: r.end + after };
        v.nights = v.end - v.start;
        v.price = Math.round(perNight * v.nights * 100) / 100;
        if (booked.some((f) => overlaps(v, f))) continue;
        const others = requests.filter((x) => x.id !== r.id);
        const plan = optimise(booked, [...others, v], opts);
        const gain = plan.value - base.value;
        if (plan.chosen.some((c) => c.id === r.id && c.start === v.start && c.end === v.end) && gain > 0.005 && (!best || gain > best.gain)) {
          best = { id: r.id, label: r.label, line: r.line, before, after, start: v.start, end: v.end, price: v.price, gain };
        }
      }
    }
    if (best) offers.push(best);
  }
  return offers.sort((a, b) => b.gain - a.gain);
}

export function plan(parsed, optsIn = {}) {
  const opts = cleanOpts(optsIn);
  const { booked, requests } = parsed;
  const best = optimise(booked, requests, opts);
  const chosenIds = new Set(best.chosen.map((c) => c.id));
  const fcfsSet = firstComeFirstServed(booked, requests);
  const priceSet = highestPriceFirst(booked, requests);
  const fcfs = evaluate(booked, fcfsSet, opts);
  const byPrice = evaluate(booked, priceSet, opts);
  const none = evaluate(booked, [], opts);

  const declined = requests
    .filter((r) => !chosenIds.has(r.id))
    .map((r) => {
      const hitFixed = booked.find((f) => overlaps(r, f));
      let reason;
      if (hitFixed) {
        reason = `overlaps your confirmed booking ${isoDay(hitFixed.start)} to ${isoDay(hitFixed.end)}`;
      } else {
        const hitChosen = best.chosen.find((c) => overlaps(r, c));
        const forced = hitChosen ? null : evaluate(booked, [...best.chosen, r], opts);
        if (hitChosen) {
          reason = `overlaps the request the plan accepts for ${isoDay(hitChosen.start)} to ${isoDay(hitChosen.end)}, which is worth more in the plan`;
        } else if (forced) {
          const delta = forced.value - best.value;
          reason = `accepting it changes the plan by ${money(delta)} (${forced.dead > best.dead ? `${forced.dead - best.dead} more dead gap night(s), ` : ""}turnover ${money(opts.turnover)})`;
        } else {
          reason = "does not fit the plan";
        }
      }
      return { id: r.id, label: r.label, line: r.line, start: r.start, end: r.end, price: r.price, reason };
    });

  const offers = counterOffers(booked, requests, best, best.chosen, opts);

  // Sensitivity: does the plan survive a different empty-night value?
  const sens = [0, 0.5, 2].map((k) => {
    const p = optimise(booked, requests, { ...opts, nightValue: opts.nightValue * k });
    return { factor: k, nightValue: opts.nightValue * k, same: p.chosen.length === best.chosen.length && p.chosen.every((c) => chosenIds.has(c.id)) };
  });

  const findings = [];
  const dg = deadGaps(booked, opts);
  for (const g of dg) {
    findings.push({
      rule: "dead-gap-in-calendar",
      severity: "info",
      message: `${g.nights} night(s) ${isoDay(g.from)} to ${isoDay(g.to)} sit between confirmed bookings and are shorter than your ${opts.minStay}-night minimum, so nobody can book them. Lowering the minimum for those dates, or a discounted gap-night rate, is the way to sell them.`,
    });
  }
  const uplift = best.value - (fcfs ? fcfs.value : 0);
  return {
    options: opts,
    booked, requests,
    chosen: best.chosen,
    declined,
    counterOffers: offers,
    sensitivity: sens,
    deadGaps: dg,
    findings,
    totals: {
      plan: best.value,
      firstComeFirstServed: fcfs ? fcfs.value : 0,
      highestPriceFirst: byPrice ? byPrice.value : 0,
      noRequests: none ? none.value : 0,
      upliftVsFirstComeFirstServed: uplift,
      upliftVsHighestPrice: byPrice ? best.value - byPrice.value : 0,
      acceptedRevenue: best.chosen.reduce((s, c) => s + c.price, 0),
      deadNights: best.dead,
    },
    sets: { firstComeFirstServed: fcfsSet.map((c) => c.id), highestPriceFirst: priceSet.map((c) => c.id) },
  };
}

export function summarize(p) {
  if (!p.requests.length) return { status: "none", text: "No pending requests found. Add rows starting with request." };
  const t = p.totals;
  const acc = p.chosen.length;
  const text = `Accept ${acc} of ${p.requests.length} request(s) for ${money(t.acceptedRevenue)}; plan value ${money(t.plan)}` +
    (t.upliftVsFirstComeFirstServed > 0.005 ? `, ${money(t.upliftVsFirstComeFirstServed)} more than accepting in arrival order.` : ", the same as accepting in arrival order.");
  return { status: t.upliftVsFirstComeFirstServed > 0.005 ? "gain" : "ok", text };
}
