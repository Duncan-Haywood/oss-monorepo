// Wholesale vs retail vs consignment: what a maker really keeps per unit and per order.
// Pure functions, no I/O. All money in the same currency the user types.

export const DEFAULTS = Object.freeze({
  unitCost: 12,            // materials + your labour per unit
  retailPrice: 40,         // what a customer pays you directly
  wholesalePct: 50,        // wholesale price as % of retail (50 = "keystone")
  directFeePct: 5.5,       // card / marketplace fees on direct sales
  directShip: 4,           // packaging + postage per direct unit you absorb
  directMinutes: 6,        // extra handling minutes per direct unit (listing, packing, support)
  wholesaleShip: 0.6,      // packaging + freight per unit on a bulk order you absorb
  wholesaleMinutes: 1,
  minutesRate: 25,         // what an hour of your time is worth
  orderQty: 48,            // units in a typical wholesale order
  netDays: 30,             // payment terms on wholesale (0 = pay up front)
  capitalPct: 12,          // yearly cost of the money tied up
  consignPct: 40,          // share of retail the shop keeps on consignment
  sellThroughPct: 60,      // share of consigned units that actually sell
  targetMarginPct: 30,     // margin you want after costs
});

const n = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);

export function clean(input = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = n(input[k], DEFAULTS[k]);
  const bad = [];
  if (o.retailPrice <= 0) bad.push("Retail price must be above zero.");
  if (o.unitCost < 0) bad.push("Unit cost cannot be negative.");
  if (o.wholesalePct <= 0 || o.wholesalePct > 100) bad.push("Wholesale % of retail must be between 1 and 100.");
  if (o.consignPct < 0 || o.consignPct >= 100) bad.push("Shop share on consignment must be between 0 and 99.");
  if (o.sellThroughPct <= 0 || o.sellThroughPct > 100) bad.push("Sell-through must be between 1 and 100.");
  if (o.orderQty < 1) bad.push("Order quantity must be at least 1.");
  if (o.directFeePct < 0 || o.directFeePct >= 100) bad.push("Fee % must be between 0 and 99.");
  return { o, error: bad.length ? bad.join(" ") : null };
}

const r2 = (x) => Math.round(x * 100) / 100;

// Cost of the money tied up between paying for goods and being paid.
export function terms(unitCost, netDays, capitalPct) {
  return unitCost * (capitalPct / 100) * (netDays / 365);
}

export function channels(input) {
  const { o, error } = clean(input);
  if (error) return { error };
  const time = (min) => (min / 60) * o.minutesRate;

  const direct = (() => {
    const revenue = o.retailPrice;
    const fees = revenue * o.directFeePct / 100;
    const cost = o.unitCost + fees + o.directShip + time(o.directMinutes);
    return mk("Direct (you sell at retail)", revenue, cost, 1);
  })();

  const wsPrice = o.retailPrice * o.wholesalePct / 100;
  const wholesale = (() => {
    const finance = terms(o.unitCost, o.netDays, o.capitalPct);
    const cost = o.unitCost + o.wholesaleShip + time(o.wholesaleMinutes) + finance;
    const c = mk("Wholesale (shop buys the order)", wsPrice, cost, 1);
    c.finance = r2(finance);
    return c;
  })();

  const consignment = (() => {
    const sold = o.sellThroughPct / 100;
    const revenue = o.retailPrice * (1 - o.consignPct / 100) * sold; // per unit placed
    const cost = o.unitCost + o.wholesaleShip + time(o.wholesaleMinutes); // you make and ship every unit placed
    const c = mk("Consignment (paid when it sells)", revenue, cost, sold);
    c.perSold = sold > 0 ? r2((revenue - cost) / sold) : null;
    return c;
  })();

  function mk(name, revenue, cost, sold) {
    const profit = revenue - cost;
    return { name, revenue: r2(revenue), cost: r2(cost), profit: r2(profit), margin: revenue > 0 ? profit / revenue : null, sold };
  }

  const orderProfit = r2(wholesale.profit * o.orderQty);
  const orderRevenue = r2(wsPrice * o.orderQty);
  const cashOut = r2((o.unitCost + o.wholesaleShip) * o.orderQty);
  // Direct units you must sell to match the profit of one wholesale order.
  const directEquivalent = direct.profit > 0 ? Math.ceil(orderProfit / direct.profit) : null;

  // Wholesale price that hits the target margin on the wholesale cost stack.
  const t = o.targetMarginPct / 100;
  const priceForTarget = t < 1 ? r2(wholesale.cost / (1 - t)) : null;
  const retailForTarget = priceForTarget === null ? null : r2(priceForTarget / (o.wholesalePct / 100));
  // Lowest retail price that makes the wholesale channel hit the target at the chosen discount.
  // Highest discount (lowest wholesale % of retail) that still reaches the target at this retail price.
  const minWholesalePct = priceForTarget === null ? null : Math.round((priceForTarget / o.retailPrice) * 1000) / 10;

  const best = [direct, wholesale, consignment].reduce((a, b) => (b.profit > a.profit ? b : a));
  const findings = [];
  if (wholesale.profit <= 0) findings.push({ severity: "high", title: "Wholesale loses money at these numbers", detail: `Each unit costs ${r2(wholesale.cost)} to deliver and sells for ${r2(wsPrice)}. Raise retail, cut cost, or sell only at a higher wholesale share.` });
  else if (wholesale.margin < t) findings.push({ severity: "medium", title: `Wholesale margin ${(wholesale.margin * 100).toFixed(0)}% is below your ${o.targetMarginPct}% target`, detail: `To reach it at ${o.wholesalePct}% of retail you would need a retail price of about ${retailForTarget}, or a wholesale price of about ${priceForTarget} per unit.` });
  if (direct.profit > 0 && wholesale.profit > 0 && direct.profit > wholesale.profit * 2) findings.push({ severity: "info", title: "A direct sale earns more than twice a wholesale unit", detail: `${direct.profit} direct versus ${wholesale.profit} wholesale per unit. Wholesale only wins when it brings volume you could not sell yourself: one order of ${o.orderQty} equals ${directEquivalent} direct sales.` });
  if (consignment.profit <= 0) findings.push({ severity: "high", title: "Consignment loses money at this sell-through", detail: `You make and ship every unit placed but are paid only on the ${o.sellThroughPct}% that sell. Break-even sell-through is ${(breakEvenSellThrough(o) * 100).toFixed(0)}%.` });
  if (o.netDays >= 60) findings.push({ severity: "info", title: `Net ${o.netDays} ties up ${cashOut} of cash`, detail: `You pay ${cashOut} for materials and shipping before the shop pays ${orderRevenue}. Asking for half up front or net 30 cuts the carrying cost.` });
  if (o.wholesalePct < 50) findings.push({ severity: "info", title: "You are below the usual half-of-retail wholesale price", detail: "Shops typically double wholesale to set retail. Below that, they may be marking you up more than 2x, so the retail price they set could be above yours." });

  return { o, direct, wholesale, consignment, wsPrice: r2(wsPrice), orderQty: o.orderQty, orderRevenue, orderProfit, cashOut,
    directEquivalent, priceForTarget, retailForTarget, minWholesalePct, best: best.name, findings };
}

export function breakEvenSellThrough(o) {
  const cost = o.unitCost + o.wholesaleShip + (o.wholesaleMinutes / 60) * o.minutesRate;
  const perSold = o.retailPrice * (1 - o.consignPct / 100);
  return perSold > 0 ? Math.min(1, cost / perSold) : 1;
}

// Profit per order as the wholesale share of retail varies, for a sensitivity table.
export function discountLadder(input, shares = [40, 45, 50, 55, 60]) {
  const { error } = clean(input);
  if (error) return { error };
  return shares.map((p) => {
    const c = channels({ ...input, wholesalePct: p });
    return { pct: p, price: c.wsPrice, profit: c.wholesale.profit, margin: c.wholesale.margin, orderProfit: c.orderProfit };
  });
}

export const money = (x) => (Number.isFinite(x) ? x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (x) => (x === null || !Number.isFinite(x) ? "–" : (x * 100).toFixed(1) + "%");
