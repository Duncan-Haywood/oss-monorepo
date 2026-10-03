// App subscription proceeds: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  price: 9.99,
  taxPct: 0,
  storeFeePct: 30,
  storeFeeYear2Pct: 15,
  refundPct: 3,
  churnPct: 8,
  cac: 25,
  webFeePct: 2.9,
  webFixed: 0.3,
  horizon: 36,
};

export const INPUT_NOTES = [
  { what: "Price", detail: "What the subscriber is charged each month, as shown in the store. For an annual plan enter the price divided by 12 and a churn figure that matches how many annual subscribers leave per year." },
  { what: "Tax or VAT included", detail: "Many stores show a tax-inclusive price outside the US. Enter the average share that is tax so it is taken off before the fee. Leave 0 if you only sell where tax is added on top." },
  { what: "Store fee, first year", detail: "Editable. Apple's and Google's published subscription rates and small-business programs are the store's and change; read your own agreement. Common published figures are 30% standard and 15% for enrolled small developers." },
  { what: "Store fee, after one year", detail: "Apple has reduced its rate for subscribers kept longer than a year; Google's rate for subscriptions has been 15% from the start. Set the same figure as the first year if neither applies to you." },
  { what: "Refund rate", detail: "Share of charges refunded. Check your own refund report; it is not the same as cancellations." },
  { what: "Monthly churn", detail: "Share of active subscribers who do not renew each month. Count a few cohorts of your own; an early-trial figure and a long-tenured figure are very different numbers." },
  { what: "Cost to acquire a subscriber", detail: "Ad spend and any influencer fees divided by paying subscribers gained, not by installs." },
  { what: "Web checkout fee", detail: "A card processor's percentage and fixed fee per charge. Only comparable where the store lets you link to your own checkout; read the current rules for your country before relying on it." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};

export function money(v) {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function core(o) {
  const price = num(o.price, "Price");
  const tax = num(o.taxPct, "Tax included") / 100;
  const fee1 = num(o.storeFeePct, "Store fee") / 100;
  const fee2 = num(o.storeFeeYear2Pct, "Store fee after one year") / 100;
  const refund = num(o.refundPct, "Refund rate") / 100;
  const churn = num(o.churnPct, "Monthly churn") / 100;
  const cac = num(o.cac, "Cost to acquire a subscriber");
  const webPct = num(o.webFeePct, "Web fee percent") / 100;
  const webFixed = num(o.webFixed, "Web fixed fee");
  const horizon = Math.round(num(o.horizon, "Horizon in months", { min: 1 }));
  if (fee1 >= 1 || fee2 >= 1) throw new Error("Store fee must be under 100%.");
  if (refund > 1) throw new Error("Refund rate cannot be over 100%.");
  if (churn > 1) throw new Error("Monthly churn cannot be over 100%.");
  if (tax >= 1) throw new Error("Tax included must be under 100%.");
  if (horizon > 120) throw new Error("Horizon in months must be 120 or less.");

  const exTax = price / (1 + tax);
  const keptBeforeFee = exTax * (1 - refund);
  const netYear1 = keptBeforeFee * (1 - fee1);
  const netYear2 = keptBeforeFee * (1 - fee2);
  // The processor keeps its fee on a refunded charge, so it comes off after the refund share.
  const webNet = keptBeforeFee - (price * webPct + webFixed);

  let ltv = 0, webLtv = 0, cumulative = 0, payback = null, cum12 = 0, active = 0;
  for (let t = 0; t < horizon; t++) {
    const alive = Math.pow(1 - churn, t);
    const inc = alive * (t < 12 ? netYear1 : netYear2);
    ltv += inc;
    webLtv += alive * webNet;
    cumulative += inc;
    if (payback == null && cumulative >= cac) payback = t + 1;
    if (t === 11) cum12 = cumulative;
    active += alive;
  }
  if (horizon < 12) cum12 = cumulative;
  return {
    price, exTax, keptBeforeFee, netYear1, netYear2, webNet, ltv, webLtv, cac, horizon, churn, fee1, fee2,
    avgLifetimeMonths: churn > 0 ? 1 / churn : null,
    expectedPaidMonths: active,
    ltvToCac: cac > 0 ? ltv / cac : null,
    payback,
    maxCacTwelveMonthPayback: cum12,
    webGain: webLtv - ltv,
    webGainPct: ltv > 0 ? (webLtv - ltv) / ltv : null,
    effectiveFeeYear1: price > 0 ? 1 - netYear1 / price : null,
  };
}

export function computeProceeds(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const churnScenarios = [0.5, 1, 1.5, 2].map((k) => {
    const x = core({ ...o, churnPct: Math.min(100, r.churn * 100 * k) });
    return { factor: k, churnPct: r.churn * 100 * k, ltv: x.ltv, ltvToCac: x.ltvToCac, payback: x.payback, current: k === 1 };
  });
  const feeScenarios = [...new Set([[30, 15], [15, 15], [r.fee1 * 100, r.fee2 * 100]].map((p) => p.join(":")))].map((key) => {
    const [a, b] = key.split(":").map(Number);
    const x = core({ ...o, storeFeePct: a, storeFeeYear2Pct: b });
    return { fee1: a, fee2: b, ltv: x.ltv, ltvToCac: x.ltvToCac, payback: x.payback, current: Math.abs(a - r.fee1 * 100) < 1e-9 && Math.abs(b - r.fee2 * 100) < 1e-9 };
  });
  return { ...r, churnScenarios, feeScenarios };
}

export function summarize(r) {
  const good = r.ltvToCac == null || r.ltvToCac >= 1;
  const parts = [
    `A ${money(r.price)} charge leaves ${money(r.netYear1)} in year one and ${money(r.netYear2)} after that (about ${pct(r.effectiveFeeYear1 * 100)} of the price goes to fees, tax and refunds in year one).`,
    `At ${pct(r.churn * 100)} monthly churn a subscriber pays for about ${Math.round(r.expectedPaidMonths * 10) / 10} months in ${r.horizon}, worth ${money(r.ltv)}.`,
  ];
  if (r.cac > 0) {
    parts.push(`Against a ${money(r.cac)} cost to acquire one, that is ${Math.round(r.ltvToCac * 100) / 100}x${r.payback == null ? " and it does not pay back inside the horizon" : `, paid back in month ${r.payback}`}.`);
  }
  parts.push(`To pay back within 12 months you can spend at most ${money(r.maxCacTwelveMonthPayback)} per subscriber.`);
  parts.push(`On a web checkout at your typed processor fee the same subscriber would be worth ${money(r.webLtv)}, a difference of ${money(r.webGain)} each.`);
  return { status: good ? "ok" : "warn", text: parts.join(" ") };
}
