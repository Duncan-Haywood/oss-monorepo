// Stocker / backgrounding margin for a pen or pasture of purchased calves: buy weaned calves, put weight on them, sell.
// Pure arithmetic over what the user types. Price slide: heavier cattle sell for less per cwt than lighter ones, so the
// sale price per cwt is the base price minus the slide for every cwt the cattle gained over the base weight.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (v) => (v === "" || v == null ? 0 : Number(String(v).replace(/[$,%\s]/g, "")));
const money = (x) => "$" + round2(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sale price per cwt for cattle at `outWeight`, given the quote at `baseWeight` and a slide in $/cwt per 100 lb heavier.
export function slidePrice(basePrice, baseWeight, outWeight, slide) {
  return basePrice - (slide * (outWeight - baseWeight)) / 100;
}

export function plan(input) {
  const head = Math.round(num(input.head));
  const inWeight = num(input.inWeight);
  const buyPrice = num(input.buyPrice);
  const days = Math.round(num(input.days));
  const adg = num(input.adg);
  if (!(head > 0)) return { error: "Enter how many head you are buying." };
  if (!(inWeight > 0) || !(buyPrice > 0)) return { error: "Enter the purchase weight and the purchase price per cwt." };
  if (!(days > 0) || !(adg > 0)) return { error: "Enter days on grass or feed and average daily gain." };
  const deathPct = num(input.deathLossPct);
  if (deathPct < 0 || deathPct >= 100) return { error: "Death loss must be between 0 and 99 percent." };
  const shrinkPct = num(input.shrinkPct);
  if (shrinkPct < 0 || shrinkPct >= 50) return { error: "Sale shrink looks wrong; type 2 for 2 percent." };

  const outWeight = inWeight + adg * days;
  const salePriceBase = num(input.salePrice);
  const baseWeight = num(input.slideBaseWeight) || outWeight;
  const slide = num(input.slide);
  const salePrice = slidePrice(salePriceBase, baseWeight, outWeight, slide);
  if (!(salePrice > 0)) return { error: "After the price slide the sale price is zero or less; check the slide and base weight." };
  const sold = (head * (100 - deathPct)) / 100;
  const payWeight = outWeight * (1 - shrinkPct / 100);

  const cattleCost = round2(head * ((inWeight * buyPrice) / 100));
  const hauling = round2(head * num(input.haulingPerHead));
  const processing = round2(head * num(input.healthPerHead));
  const feed = round2(head * days * num(input.feedPerDay));
  const pasture = round2(head * days * num(input.pastureYardagePerDay));
  const labor = round2(num(input.otherFixed));
  const interestRate = num(input.interestPct);
  const financedShare = Math.min(100, Math.max(0, input.financedPct === "" || input.financedPct == null ? 100 : num(input.financedPct)));
  // Interest on the cattle purchase for the whole period, and on half of the operating costs (spent evenly over the period).
  const interest = round2(((cattleCost + (feed + pasture + processing) / 2) * (financedShare / 100) * (interestRate / 100) * days) / 365);
  const commission = num(input.commissionPct);
  const grossRevenue = round2(sold * ((payWeight * salePrice) / 100));
  const sellCost = round2((grossRevenue * commission) / 100 + sold * num(input.haulingOutPerHead));
  const lines = [
    { label: "Purchase of calves", amount: cattleCost },
    { label: "Hauling in", amount: hauling },
    { label: "Processing and health", amount: processing },
    { label: "Feed", amount: feed },
    { label: "Pasture rent and yardage", amount: pasture },
    { label: "Interest", amount: interest },
    { label: "Labor and other fixed", amount: labor },
    { label: "Selling cost (commission, hauling out)", amount: sellCost },
  ].filter((l) => l.amount > 0);
  const totalCost = round2(lines.reduce((s, l) => s + l.amount, 0));
  const margin = round2(grossRevenue - totalCost);
  const marginPerHead = round2(margin / head);

  // Break-even sale price per cwt at the pay weight with the same death loss and costs (selling cost percent included).
  const nonPctCost = totalCost - round2((grossRevenue * commission) / 100);
  const breakEvenPrice = sold > 0 ? round2((nonPctCost * 100) / (sold * payWeight * (1 - commission / 100))) : null;
  // Break-even purchase price: what the calves could cost per cwt for the pen to break even at the quoted sale price.
  const otherCosts = totalCost - cattleCost - interest - sellCost;
  const k = (financedShare / 100) * (interestRate / 100) * (days / 365);
  const buyBreakEven = round2((((grossRevenue - sellCost - otherCosts - (k * (feed + pasture + processing)) / 2) / (1 + k)) * 100) / (head * inWeight));
  const costOfGain = round2((totalCost - cattleCost - interest - sellCost) / (head * adg * days));
  const valueOfGain = round2(((sold * payWeight * salePrice) / 100 - (sold * inWeight * buyPrice) / 100) / (sold * (outWeight - inWeight)));

  const priceSteps = [-10, -5, 0, 5, 10].map((d) => {
    const p = round2(salePrice + d);
    const rev = (sold * payWeight * p) / 100;
    const sc = (rev * commission) / 100 + sold * num(input.haulingOutPerHead);
    return { price: p, delta: d, marginPerHead: round2((rev - sc - (totalCost - sellCost)) / head) };
  });
  const deathSteps = [0, 2, 4, 6].map((d) => {
    const s = (head * (100 - d)) / 100;
    const rev = (s * payWeight * salePrice) / 100;
    const sc = (rev * commission) / 100 + s * num(input.haulingOutPerHead);
    return { deathPct: d, marginPerHead: round2((rev - sc - (totalCost - sellCost)) / head) };
  });

  const advice = [
    `${head} head in at ${inWeight} lb, out at about ${Math.round(outWeight)} lb after ${days} days at ${adg} lb a day, sold at ${money(salePrice)} per cwt${slide ? ` (slid from ${money(salePriceBase)})` : ""}.`,
    margin >= 0
      ? `Margin ${money(margin)} for the pen, ${money(marginPerHead)} a head.`
      : `Loss ${money(-margin)} for the pen, ${money(-marginPerHead)} a head.`,
    `Break-even sale price ${money(breakEvenPrice)} per cwt; break-even purchase price ${money(buyBreakEven)} per cwt; cost of gain ${money(costOfGain)} per lb against ${money(valueOfGain)} per lb of value added.`,
  ];
  if (valueOfGain < costOfGain) advice.push("Cost of gain is above the value of the gain: the weight you add costs more than the market pays for it at this slide. Shorten the program, cut feed cost, or buy lighter.");
  if (slide > 0) advice.push(`The price slide takes ${money((slide * (outWeight - baseWeight)) / 100)} per cwt off the sale price at this weight.`);
  if (deathPct > 0) advice.push(`Death loss of ${deathPct}% removes ${round2(head - sold)} head from the sale and spreads their cost over the rest.`);
  const biggest = [...lines].sort((a, c) => c.amount - a.amount).find((l) => l.label !== "Purchase of calves");
  if (biggest) advice.push(`Largest cost after the calves: ${biggest.label}, ${money(biggest.amount)}.`);
  return {
    head, sold, inWeight, outWeight, payWeight, salePrice, lines, grossRevenue, totalCost, margin, marginPerHead,
    breakEvenPrice, buyBreakEven, costOfGain, valueOfGain, priceSteps, deathSteps, advice,
  };
}

export function sampleInput() {
  return {
    head: 100, inWeight: 500, buyPrice: 285, days: 150, adg: 1.8, deathLossPct: 2, shrinkPct: 2,
    salePrice: 255, slideBaseWeight: 500, slide: 8, haulingPerHead: 6, healthPerHead: 22, feedPerDay: 0.6,
    pastureYardagePerDay: 0.35, otherFixed: 800, interestPct: 8.5, financedPct: 100, commissionPct: 2, haulingOutPerHead: 8,
  };
}

export function toCsv(r) {
  const q = (c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c);
  const rows = r.lines.map((l) => [l.label, l.amount.toFixed(2)].map(q).join(","));
  return ["item,amount", ...rows, `total_cost,${r.totalCost.toFixed(2)}`, `revenue,${r.grossRevenue.toFixed(2)}`, `margin,${r.margin.toFixed(2)}`].join("\n") + "\n";
}
