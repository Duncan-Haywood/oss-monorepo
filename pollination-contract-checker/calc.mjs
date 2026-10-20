// Pollination-contract math. Pure functions, no I/O. All money in USD, all inputs entered by the user.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const DEFAULTS = {
  hives: 200,
  feePerHive: 190,
  failPct: 5,          // % of hives rejected at inspection (under the minimum frames of bees), unpaid
  brokerPct: 0,        // % of fees kept by a broker
  miles: 300,          // one way, yard to orchard
  truckCostPerMile: 3.5,
  hivesPerLoad: 400,
  laborHoursPerHive: 0.12, // load + unload + check, one way
  laborRate: 25,
  feedPerHive: 14,     // sugar / pollen patty fed during the contract
  lossPct: 6,          // % of hives lost or too weak to keep because of the contract
  replaceCostPerHive: 180,
  forgoneIncomePerHive: 40, // what the hive would have earned staying home those weeks
  extraFixed: 0,       // insurance, permits, bee-yard rent at the orchard
};

export function check(input = {}) {
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined && x !== null && x !== "")) };
  for (const k of Object.keys(DEFAULTS)) v[k] = Number(v[k]);
  if (!(v.hives >= 1) || !Number.isInteger(v.hives)) return { error: "Hives must be a whole number of at least 1." };
  if (!(v.feePerHive > 0)) return { error: "Enter the fee per hive." };
  if (v.failPct < 0 || v.failPct >= 100) return { error: "Inspection failure must be 0 to 99 percent." };
  if (v.brokerPct < 0 || v.brokerPct >= 100) return { error: "Broker share must be 0 to 99 percent." };
  if (v.lossPct < 0 || v.lossPct > 100) return { error: "Hive loss must be 0 to 100 percent." };
  if (!(v.hivesPerLoad >= 1)) return { error: "Hives per truckload must be at least 1." };
  for (const k of ["miles", "truckCostPerMile", "laborHoursPerHive", "laborRate", "feedPerHive", "replaceCostPerHive", "forgoneIncomePerHive", "extraFixed"])
    if (!(v[k] >= 0)) return { error: `${k} cannot be negative.` };

  const paidHives = v.hives * (1 - v.failPct / 100);
  const gross = paidHives * v.feePerHive;
  const broker = gross * (v.brokerPct / 100);
  const loads = Math.ceil(v.hives / v.hivesPerLoad);
  const trucking = loads * 2 * v.miles * v.truckCostPerMile; // out and back
  const labor = v.hives * v.laborHoursPerHive * 2 * v.laborRate; // load and unload both ends
  const feed = v.hives * v.feedPerHive;
  const lossCost = v.hives * (v.lossPct / 100) * v.replaceCostPerHive;
  const forgone = v.hives * v.forgoneIncomePerHive;
  const costs = { broker, trucking, labor, feed, losses: lossCost, forgoneIncome: forgone, other: v.extraFixed };
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const net = gross - totalCost;
  const netPerHive = net / v.hives;
  // Fee at which net is zero: paid revenue after broker must cover everything except the broker share.
  const nonBroker = totalCost - broker;
  const breakEvenFee = nonBroker / (paidHives * (1 - v.brokerPct / 100));
  const margin = gross > 0 ? net / gross : null;
  const biggest = Object.entries(costs).filter(([k]) => k !== "broker").sort((a, b) => b[1] - a[1])[0];

  const advice = [];
  if (net < 0) advice.push(`At ${money(v.feePerHive)} per hive this contract loses about ${money(-netPerHive)} a hive after every cost. The break-even fee is ${money(breakEvenFee)}.`);
  else if (margin < 0.15) advice.push(`Thin: ${money(netPerHive)} a hive left, ${Math.round(margin * 100)}% of the fee. A bad winter or a failed inspection erases it. Break-even fee is ${money(breakEvenFee)}.`);
  else advice.push(`${money(netPerHive)} a hive (${money(net)} total) left after costs, ${Math.round(margin * 100)}% of the fee. Break-even fee is ${money(breakEvenFee)}.`);
  advice.push(`Largest cost: ${biggest[0] === "forgoneIncome" ? "income the hives would have earned at home" : biggest[0]} at ${money(biggest[1])}.`);
  if (v.failPct === 0) advice.push("A 0% inspection failure assumes every hive meets the contract's minimum frames. Few yards do; the unpaid share is the cheapest thing to test.");
  const failSwing = r2(((v.hives * 0.1 * v.feePerHive) / v.hives));
  advice.push(`Each extra 10% of hives failing inspection costs about ${money(failSwing)} per hive in lost fees.`);

  return { inputs: v, paidHives: r2(paidHives), loads, gross: r2(gross), costs: Object.fromEntries(Object.entries(costs).map(([k, x]) => [k, r2(x)])), totalCost: r2(totalCost), net: r2(net), netPerHive: r2(netPerHive), margin: margin === null ? null : r2(margin), breakEvenFee: r2(breakEvenFee), loses: net < 0, thin: net >= 0 && margin < 0.15, advice };
}

/**
 * Grower side: what a stocking rate costs and the yield lift that pays for it.
 * grower({acres, hivesPerAcre, feePerHive, yieldPerAcre, pricePerUnit})
 */
export function grower({ acres, hivesPerAcre = 2, feePerHive, yieldPerAcre, pricePerUnit }) {
  const a = Number(acres), h = Number(hivesPerAcre), f = Number(feePerHive), y = Number(yieldPerAcre), p = Number(pricePerUnit);
  if (!(a > 0) || !(h > 0) || !(f > 0)) return { error: "Enter acres, hives per acre and the fee per hive." };
  const costPerAcre = h * f;
  const hives = Math.ceil(a * h);
  const out = { hives, costPerAcre: r2(costPerAcre), total: r2(hives * f) };
  if (y > 0 && p > 0) {
    out.revenuePerAcre = r2(y * p);
    out.costShareOfRevenue = r2(costPerAcre / (y * p));
    out.breakEvenYieldLiftUnits = r2(costPerAcre / p);
    out.breakEvenYieldLiftPct = r2((costPerAcre / p / y) * 100);
  }
  return out;
}

export function sampleInput() {
  return { ...DEFAULTS, hives: 400, feePerHive: 175, failPct: 8, brokerPct: 5, miles: 1400, truckCostPerMile: 3.6, forgoneIncomePerHive: 55 };
}

export function toCsv(r) {
  const rows = [["line", "usd"], ["gross fees (paid hives)", r.gross], ...Object.entries(r.costs).map(([k, x]) => [k, -x]), ["net", r.net], ["net per hive", r.netPerHive], ["break-even fee per hive", r.breakEvenFee]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
