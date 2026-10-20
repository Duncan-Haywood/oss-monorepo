// Coffee cart event deal math. Pure functions, no I/O. All money in USD, all inputs entered by the user.
// Compares the three deals an event host usually offers a mobile coffee cart: a flat booking fee, a share of
// sales, or a host-guaranteed number of prepaid drinks, on the cart's own prices, costs and expected cups.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const COMMON = {
  hours: 4,               // service hours at the event
  cupsPerHour: 35,        // drinks actually served per hour at the event (the cart's pace is the cap)
  avgPrice: 5.5,          // average ticket per drink, before card fees
  cogsPerCup: 1.15,       // milk, beans, syrup, cup, lid, sleeve per drink
  cardFeePct: 2.9,        // card processing fee on sales
  staffCount: 2,
  wage: 20,               // loaded hourly wage per person
  setupHours: 2.5,        // load, drive, setup and teardown hours per person, unpaid by the host
  travelCost: 45,         // fuel and generator for the trip
  permitFee: 0,           // event or health permit fee paid by the cart
};

// The three deals. flatFee: host pays the cart a booking fee and the cart keeps sales. share: cart pays the host a
// percentage of sales. prepaid: host buys a minimum number of drinks at a negotiated price each; extra sales are the cart's.
const DEALS = [
  { key: "flat", label: "Cart keeps sales, host pays a booking fee", fee: 0 },
  { key: "share", label: "Cart pays the host a share of sales", sharePct: 15 },
  { key: "prepaid", label: "Host prepays a minimum number of drinks", guaranteeCups: 100, guaranteePrice: 4.5 },
];

const num = (o, k, d) => (o[k] === undefined || o[k] === null || o[k] === "" ? d : Number(o[k]));

export function baseCosts(c) {
  const labour = c.staffCount * c.wage * (c.hours + c.setupHours);
  return { labour: r2(labour), fixed: r2(labour + c.travelCost + c.permitFee) };
}

/** Net of one deal at a given walk-up demand. demand is cups the crowd would buy; the cart caps at hours*cupsPerHour. */
export function netForDeal(c, deal, demandCups) {
  const cap = c.hours * c.cupsPerHour;
  const walkUp = Math.min(demandCups, cap);
  const { fixed } = baseCosts(c);
  const feeRate = c.cardFeePct / 100;
  let revenue = 0, cups = walkUp, hostCost = 0, hostIncome = 0;
  if (deal.key === "flat") {
    revenue = walkUp * c.avgPrice;
    hostIncome = deal.fee;
  } else if (deal.key === "share") {
    revenue = walkUp * c.avgPrice;
    hostCost = revenue * (deal.sharePct / 100);
  } else {
    // prepaid: host pays for guaranteed cups whether or not guests drink them. Guaranteed cups count against the cap.
    const guaranteed = Math.min(deal.guaranteeCups, cap);
    const extra = Math.min(Math.max(0, demandCups - guaranteed), cap - guaranteed);
    cups = guaranteed + extra;
    hostIncome = guaranteed * deal.guaranteePrice;
    revenue = extra * c.avgPrice;
  }
  const cardFees = revenue * feeRate;
  const cogs = cups * c.cogsPerCup;
  const net = revenue + hostIncome - hostCost - cardFees - cogs - fixed;
  return { cups: r2(cups), revenue: r2(revenue), hostIncome: r2(hostIncome), hostCost: r2(hostCost), cardFees: r2(cardFees), cogs: r2(cogs), fixed, net: r2(net) };
}

export function analyzeDeal(c, deal, demandCups) {
  const o = netForDeal(c, deal, demandCups);
  const cap = c.hours * c.cupsPerHour;
  // Demand (walk-up cups) at which net is zero, found by scanning whole cups; null when never reached within the cart's cap.
  let breakEvenCups = null;
  for (let d = 0; d <= cap; d++) if (netForDeal(c, deal, d).net >= 0) { breakEvenCups = d; break; }
  return { key: deal.key, label: deal.label, ...o, perHour: r2(o.net / (c.hours + c.setupHours)), breakEvenCups, cap };
}

export function analyze(input = {}) {
  const c = {};
  for (const k of Object.keys(COMMON)) c[k] = num(input, k, COMMON[k]);
  const demand = num(input, "expectedCups", 120);
  if (!(c.hours > 0)) return { error: "Enter the service hours." };
  if (!(c.cupsPerHour > 0)) return { error: "Enter how many drinks per hour the cart can serve." };
  if (!(c.avgPrice > 0)) return { error: "Enter the average price per drink." };
  if (c.cogsPerCup < 0 || c.wage < 0 || c.travelCost < 0 || c.permitFee < 0 || c.setupHours < 0) return { error: "Costs cannot be negative." };
  if (!(c.staffCount >= 1)) return { error: "At least one person staffs the cart." };
  if (!(c.cardFeePct >= 0 && c.cardFeePct < 50)) return { error: "Card fee must be 0 to 49 percent." };
  if (!(demand >= 0)) return { error: "Expected cups cannot be negative." };
  const deals = DEALS.map((base) => {
    const d = { ...base };
    if (base.key === "flat") d.fee = num(input, "flatFee", 400);
    if (base.key === "share") d.sharePct = num(input, "sharePct", 15);
    if (base.key === "prepaid") { d.guaranteeCups = num(input, "guaranteeCups", 100); d.guaranteePrice = num(input, "guaranteePrice", 4.5); }
    return d;
  });
  for (const d of deals) {
    if (d.fee < 0 || d.guaranteeCups < 0 || d.guaranteePrice < 0) return { error: "Fees and guarantees cannot be negative." };
    if (d.key === "share" && !(d.sharePct >= 0 && d.sharePct <= 100)) return { error: "Host share must be 0 to 100 percent." };
  }
  const results = deals.map((d) => ({ ...analyzeDeal(c, d, demand), terms: d }));
  const ranked = [...results].sort((a, b) => b.net - a.net);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const { fixed } = baseCosts(c);
  const advice = [];
  advice.push(`At ${demand} drinks expected (cart cap ${c.hours * c.cupsPerHour}), the best deal is "${best.label}", netting ${money(best.net)} (${money(best.perHour)} per hour including setup), against ${money(worst.net)} for "${worst.label}".`);
  advice.push(`Your fixed cost for this event is ${money(fixed)} (labour ${money(baseCosts(c).labour)} for ${c.hours + c.setupHours} hours each, travel, permit) before a single cup is sold.`);
  for (const r of results) {
    if (r.breakEvenCups === null) advice.push(`${r.label}: never breaks even inside the cart's ${r.cap}-drink capacity on these numbers.`);
    else advice.push(`${r.label}: net ${money(r.net)}; breaks even at ${r.breakEvenCups} drinks.`);
  }
  if (best.net < 0) advice.push("No deal covers your costs at this crowd. Ask for a higher booking fee or a guaranteed drink count, or decline the event.");
  return { inputs: { ...c, expectedCups: demand }, deals: results, best: best.key, ranked: ranked.map((r) => r.key), advice, anyProfit: best.net >= 0 };
}

/** Net of the best-fit deal as crowd size and card/price assumptions move: rows crowd factors, columns deal keys. */
export function crowdSensitivity(input, factors = [0.5, 0.75, 1, 1.25, 1.5]) {
  const base = analyze(input);
  if (base.error) return [];
  return factors.map((f) => {
    const r = analyze({ ...input, expectedCups: Math.round(base.inputs.expectedCups * f) });
    return { factor: f, cups: Math.round(base.inputs.expectedCups * f), cells: r.deals.map((d) => ({ key: d.key, net: d.net })) };
  });
}

export function sampleInput() {
  return { hours: 5, cupsPerHour: 40, avgPrice: 5.75, cogsPerCup: 1.2, staffCount: 2, wage: 22, setupHours: 2, travelCost: 60, expectedCups: 140, flatFee: 350, sharePct: 15, guaranteeCups: 100, guaranteePrice: 4.5 };
}

export function toCsv(r) {
  const rows = [["deal", "drinks", "sales revenue", "host pays cart", "cart pays host", "card fees", "drink cost", "fixed cost", "net", "net per hour", "break-even drinks"]];
  for (const d of r.deals) rows.push([d.label, d.cups, d.revenue, d.hostIncome, d.hostCost, d.cardFees, d.cogs, d.fixed, d.net, d.perHour, d.breakEvenCups ?? "never"]);
  return rows.map((x) => x.map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(",")).join("\n") + "\n";
}
