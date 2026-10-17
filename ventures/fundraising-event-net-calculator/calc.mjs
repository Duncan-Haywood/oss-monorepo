// Fundraising event net. Pure arithmetic over what a nonprofit, school or club types in: tickets, comps, per-guest giving, sponsors, auction and raffle
// totals, and the costs of staging the night. It turns that into the net the cause keeps, the cost per dollar raised (the number boards and grant
// reviewers ask for), the break-even headcount, and the headcount or ticket price that reaches a goal, because the headline "we raised $94,600" hides
// what the room cost.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const FIELDS = [
  "guests", "comps", "ticket", "fmv", "givePerGuest", "sponsors", "auctionGross", "auctionCost", "raffle",
  "cateringPerHead", "venue", "av", "printing", "staff", "insurance", "otherFixed", "feePct", "goal",
];
const DEFAULTS = { feePct: 3 };

export function readInput(input) {
  const v = {};
  for (const k of FIELDS) v[k] = input[k] === undefined || input[k] === "" ? (DEFAULTS[k] ?? 0) : num(input[k]);
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!Number.isInteger(v.guests) || v.guests > 5000) return { error: "Paying guests must be a whole number up to 5000." };
  if (!Number.isInteger(v.comps) || v.comps > 2000) return { error: "Comped seats must be a whole number up to 2000." };
  if (v.guests + v.comps === 0) return { error: "Enter at least one guest or comped seat." };
  if (v.feePct > 20) return { error: "Card and platform fees above 20 percent look like a typo." };
  if (v.fmv > v.ticket && v.ticket > 0) return { error: "The value of what a guest receives (dinner, drinks) cannot exceed the ticket price used for the deductible portion." };
  return { v };
}

// Everything that does not depend on how many people pay.
function lines(v, guests = v.guests) {
  const ticketRev = guests * v.ticket;
  const giving = guests * v.givePerGuest;
  const cardRev = ticketRev + giving + v.auctionGross + v.raffle;
  const gross = cardRev + v.sponsors;
  const fees = (v.feePct / 100) * cardRev;
  const catering = (guests + v.comps) * v.cateringPerHead;
  const fixed = v.venue + v.av + v.printing + v.staff + v.insurance + v.otherFixed;
  const cost = fees + catering + fixed + v.auctionCost;
  const net = gross - cost;
  return {
    ticketRev: round2(ticketRev), giving: round2(giving), gross: round2(gross), fees: round2(fees), catering: round2(catering), fixed: round2(fixed),
    auctionCost: round2(v.auctionCost), cost: round2(cost), net: round2(net),
    costPerDollar: gross > 0 ? round2(cost / gross) : null, netPerGuest: round2(net / (guests + v.comps)),
  };
}

export function model(v) {
  const base = lines(v);
  // net is linear in paying guests: slope per extra paying guest, and what is left when none pay.
  const slope = (v.ticket + v.givePerGuest) * (1 - v.feePct / 100) - v.cateringPerHead;
  const rest = base.net - v.guests * slope;
  const breakEvenGuests = slope > 0 ? Math.max(0, Math.ceil(-rest / slope - 1e-9)) : null;
  const goalGuests = v.goal > 0 && slope > 0 ? Math.max(0, Math.ceil((v.goal - rest) / slope - 1e-9)) : null;
  // ticket price that reaches the goal at the expected headcount, everything else held.
  const nonTicket = base.net - v.guests * v.ticket * (1 - v.feePct / 100);
  const goalTicket = v.goal > 0 && v.guests > 0 ? Math.max(0, (v.goal - nonTicket) / (v.guests * (1 - v.feePct / 100))) : null;
  const gift = v.ticket > 0 ? Math.max(0, v.ticket - v.fmv) : 0;
  return { ...base, slope: round2(slope), breakEvenGuests, goalGuests, goalTicket: goalTicket === null ? null : Math.ceil(goalTicket), giftPerTicket: round2(gift) };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const m = model(v);
  const advice = [];
  advice.push(`The night grosses ${usd(m.gross)} and costs ${usd(m.cost)}, so the cause keeps ${usd(m.net)}: ${usd(m.netPerGuest)} per seat. Cost per dollar raised is $${m.costPerDollar === null ? "n/a" : m.costPerDollar.toFixed(2)}.`);
  if (m.costPerDollar !== null) {
    advice.push(m.costPerDollar > 0.5
      ? `That is above $0.50 per dollar raised, a figure often quoted as a ceiling for special events. Check it against your own past events and your funders' expectations before the board sees only the gross.`
      : `That is at or under $0.50 per dollar raised, a figure often quoted as a ceiling for special events. Compare it with your own past events.`);
  }
  if (v.goal > 0) {
    const gap = v.goal - m.net;
    if (gap <= 0) advice.push(`You clear the ${usd(v.goal)} goal by ${usd(-gap)}.`);
    else {
      advice.push(`You are ${usd(gap)} short of the ${usd(v.goal)} goal.`);
      if (m.goalGuests !== null) advice.push(`Reaching it on tickets and giving alone takes ${m.goalGuests} paying guests (${m.goalGuests - v.guests} more); each extra guest adds ${usd(m.slope)} after fees and the meal.`);
      else advice.push(`Another guest does not help: ticket plus giving, after fees, does not cover the meal. Raise the ticket or the giving ask, or cut the per-head cost.`);
      if (m.goalTicket !== null) advice.push(`Or hold ${v.guests} guests and set the ticket at ${usd(m.goalTicket)} (now ${usd(v.ticket)}).`);
    }
  }
  if (m.breakEvenGuests !== null) advice.push(m.breakEvenGuests === 0 ? `The sponsors, auction and raffle cover the whole bill before a single ticket sells.` : `Break-even is ${m.breakEvenGuests} paying guests; you plan for ${v.guests}.`);
  else advice.push(`Break-even by headcount does not exist: each paying guest costs more than they bring in, so more guests deepen the loss.`);
  if (m.fixed + m.catering > 0 && v.sponsors > 0) {
    const cover = v.sponsors / (m.fixed + m.catering);
    advice.push(`Sponsors cover ${Math.round(cover * 100)}% of venue, staging and catering. The more of the bill sponsors carry, the more of every ticket and gift reaches the cause.`);
  }
  if (v.ticket > 0) advice.push(`Of a ${usd(v.ticket)} ticket, ${usd(m.giftPerTicket)} is above what the guest receives (${usd(v.fmv)} of dinner and drinks). That is the figure acknowledgment letters usually separate out; confirm the rules for your country with a tax adviser.`);
  const attendance = [60, 80, 100, 120].map((p) => {
    const g = Math.round((v.guests * p) / 100);
    const l = lines(v, g);
    return { pct: p, guests: g, gross: l.gross, cost: l.cost, net: l.net, costPerDollar: l.costPerDollar };
  });
  const tickets = [-20, -10, 0, 10, 20].map((p) => {
    const t = { ...v, ticket: round2(v.ticket * (1 + p / 100)) };
    const l = lines(t);
    return { pct: p, ticket: t.ticket, net: l.net, costPerDollar: l.costPerDollar };
  });
  return { error: null, input: v, model: m, advice, attendance, tickets };
}

export function sampleInput() {
  return {
    guests: "180", comps: "20", ticket: "150", fmv: "70", givePerGuest: "120", sponsors: "25000", auctionGross: "18000", auctionCost: "2500", raffle: "3000",
    cateringPerHead: "85", venue: "6000", av: "3500", printing: "1800", staff: "5000", insurance: "600", otherFixed: "2500", feePct: "3", goal: "60000",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...FIELDS];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "attendance_pct,paying_guests,gross,cost,net,cost_per_dollar_raised";
  return [head, ...result.attendance.map((r) => [r.pct, r.guests, r.gross, r.cost, r.net, r.costPerDollar ?? ""].join(","))].join("\n");
}
