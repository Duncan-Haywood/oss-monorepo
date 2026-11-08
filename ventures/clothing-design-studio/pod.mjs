/**
 * Stock run or print-on-demand? One design, uncertain demand.
 *
 * A first-time designer picks between (a) a factory run: low cost per piece,
 * a minimum order, money out before any sale, and leftovers if demand is
 * short; and (b) print-on-demand (a partner prints and ships each order): a
 * higher cost per piece, no minimum, no stock. This module puts both on the
 * same demand and answers: which earns more, how large should the run be,
 * and at what demand does the factory run overtake print-on-demand?
 *
 * Demand is Poisson with the designer's own mean (a guess: the answer moves
 * with it, which is why the break-even demand is reported). A third option
 * is a hybrid: a smaller run, with print-on-demand for orders beyond it.
 *
 * Every price is typed. Nothing here is a supplier's price. Poisson demand
 * ignores that real demand clusters around launches and promotions.
 */
const round2 = v => Math.round(v * 100) / 100;
const need = (v, name, lo, hi) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be a number from ${lo} to ${hi}.`);
  return v;
};

/** Poisson probabilities p[0..n], computed in log space so a large mean does not underflow. */
export function poissonPmf(mean, n) {
  const p = new Array(n + 1);
  if (mean === 0) { p.fill(0); p[0] = 1; return p; }
  let lg = -mean;
  p[0] = Math.exp(lg);
  for (let k = 1; k <= n; k++) { lg += Math.log(mean) - Math.log(k); p[k] = Math.exp(lg); }
  return p;
}

/** E[min(D, Q)] and E[(D - Q)+] for D ~ Poisson(mean). */
export function sales(mean, Q) {
  // Past mean + 12 sd the Poisson tail is nil, so a huge Q (a big minimum order) need not be walked.
  const top = Math.ceil(mean + 12 * Math.sqrt(mean) + 30);
  const p = poissonPmf(mean, top);
  let sold = 0, over = 0, cum = 0;
  for (let k = 0; k <= top; k++) {
    sold += Math.min(k, Q) * p[k];
    over += Math.max(k - Q, 0) * p[k];
    cum += p[k];
  }
  return { sold: sold / cum, over: over / cum };
}

function check(i) {
  need(i.demand, "Expected demand", 0, 100000);
  need(i.price, "Shelf price", 0, 1e6);
  need(i.landed, "Landed cost per piece", 0, 1e6);
  need(i.podCost, "Print-on-demand cost per piece", 0, 1e6);
  need(i.feePct, "Selling fees %", 0, 99);
  need(i.salvage, "Leftover value per piece", 0, 1e6);
  need(i.moq, "Minimum order", 0, 1e6);
  need(i.setup, "Run set-up cost", 0, 1e9);
  need(i.podPrice, "Print-on-demand shelf price", 0, 1e6);
}
const net = (price, feePct) => price * (1 - feePct / 100);

/** Expected profit of a factory run of Q with no fallback. */
function stockProfit(i, Q) {
  if (Q === 0) return 0;
  const s = sales(i.demand, Q);
  return net(i.price, i.feePct) * s.sold - i.landed * Q + i.salvage * (Q - s.sold) - i.setup;
}
/** Run of Q, orders beyond it filled by print-on-demand at its price. */
function hybridProfit(i, Q) {
  const s = sales(i.demand, Q);
  const podMargin = net(i.podPrice, i.feePct) - i.podCost;
  return (Q === 0 ? 0 : net(i.price, i.feePct) * s.sold - i.landed * Q + i.salvage * (Q - s.sold) - i.setup) + podMargin * s.over;
}
const podProfit = i => (net(i.podPrice, i.feePct) - i.podCost) * i.demand;

function bestQ(i, fn) {
  const hi = Math.ceil(i.demand + 6 * Math.sqrt(i.demand) + 20);
  let best = { Q: 0, profit: fn(i, 0) };
  const start = Math.max(1, Math.ceil(i.moq));
  for (let Q = start; Q <= Math.max(hi, start); Q++) {
    const v = fn(i, Q);
    if (v > best.profit + 1e-9) best = { Q, profit: v };
  }
  return best;
}

/**
 * i: { demand, price, landed, podCost, podPrice = price, feePct = 0, salvage = 0, moq = 0, setup = 0 }
 * Returns expected profit of each route, the best run size, and the demand at which the run overtakes print-on-demand.
 */
export function compare(input) {
  const given = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const i = { podPrice: input.price, feePct: 0, salvage: 0, moq: 0, setup: 0, ...given };
  check(i);
  const stock = bestQ(i, stockProfit);
  const hybrid = bestQ(i, hybridProfit);
  const pod = podProfit(i);
  const atMoq = i.moq > 0 ? stockProfit(i, Math.ceil(i.moq)) : null;
  // Demand at which the best plain run beats print-on-demand: scan upward.
  let crossover = null;
  const scan = (from, to, step) => {
    for (let d = from; d <= to; d += step) {
      const j = { ...i, demand: d };
      if (bestQ(j, stockProfit).profit > podProfit(j) + 1e-9) return d;
    }
    return null;
  };
  const marginStock = net(i.price, i.feePct) - i.landed, marginPod = net(i.podPrice, i.feePct) - i.podCost;
  if (marginStock > marginPod) {
    const coarse = scan(1, 20000, 25);
    if (coarse != null) crossover = scan(Math.max(1, coarse - 25), coarse, 1);
  }
  const options = [
    { route: "Print-on-demand only", runSize: 0, profit: round2(pod) },
    { route: "Factory run only", runSize: stock.Q, profit: round2(stock.profit) },
    { route: "Run plus print-on-demand for the overflow", runSize: hybrid.Q, profit: round2(hybrid.profit) },
  ].sort((a, b) => b.profit - a.profit);
  const sRun = stock.Q ? sales(i.demand, stock.Q) : { sold: 0, over: 0 };
  const notes = [];
  if (marginPod <= 0) notes.push("Print-on-demand loses money on every sale at this price; raise its price or find a cheaper partner.");
  if (marginStock <= 0) notes.push("The factory run loses money on every sale at this price.");
  if (stock.Q === 0 && marginStock > 0) notes.push("No factory run beats print-on-demand at this demand.");
  if (i.moq > 0 && stock.Q === 0 && marginStock > 0) notes.push(`The factory minimum of ${i.moq} is more than this demand can use.`);
  if (atMoq != null && atMoq < 0) notes.push(`Ordering the minimum (${Math.ceil(i.moq)}) loses ${round2(-atMoq)} on average at this demand.`);
  if (crossover == null && marginStock > marginPod) notes.push("The factory run does not overtake print-on-demand up to 20,000 sales.");
  if (crossover != null) notes.push(`The factory run starts to win at about ${crossover} sales; if you doubt demand is that high, start with print-on-demand and order stock once orders pass it.`);
  return {
    options, best: options[0],
    stock: { runSize: stock.Q, profit: round2(stock.profit), expectedSold: round2(sRun.sold), expectedLeftover: round2(stock.Q - sRun.sold), cashOut: round2(stock.Q * i.landed + i.setup) },
    hybrid: { runSize: hybrid.Q, profit: round2(hybrid.profit) },
    pod: { profit: round2(pod), marginPerSale: round2(marginPod) },
    marginPerSale: round2(marginStock), crossoverDemand: crossover, notes,
  };
}

/** Expected profit of each route across a range of demands (for a table). */
export function sweep(input, demands) {
  return demands.map(d => {
    const c = compare({ ...input, demand: d });
    return { demand: d, pod: c.pod.profit, stock: c.stock.profit, stockQ: c.stock.runSize, hybrid: c.hybrid.profit, hybridQ: c.hybrid.runSize, best: c.best.route };
  });
}

export function podCsv(rows) {
  const out = ["demand,pod_profit,run_profit,run_size,hybrid_profit,hybrid_run_size,best"];
  for (const r of rows) out.push([r.demand, r.pod, r.stock, r.stockQ, r.hybrid, r.hybridQ, `"${r.best}"`].join(","));
  return out.join("\n") + "\n";
}
