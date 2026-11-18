/**
 * Sales channel comparison for a small clothing brand: what one order earns,
 * and what a month earns, on each place you could sell (your own shop with a
 * subscription, a handmade marketplace, a large marketplace), and the monthly
 * order count at which a subscription shop starts to beat a commission.
 *
 * Model (typed numbers, not a forecast): a channel takes `commissionPct` of
 * the item price, a payment fee of `paymentPct` of what the buyer pays
 * (price + shipping charged) plus `paymentFixed`, `perOrderFee` (listing or
 * label fee), and `monthly` (subscription). `adsPct` of orders come through
 * paid or platform-forced advertising that costs `adsFeePct` of the price.
 * Net per order is linear in price, so the price that earns a target profit
 * on a channel is solved exactly.
 */
const r2 = v => Math.round(v * 100) / 100;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/** Example fee shapes only. Real schedules change; the designer types the current ones. */
export const EXAMPLE_CHANNELS = [
  { name: "Own shop (subscription)", commissionPct: 0, paymentPct: 2.9, paymentFixed: 0.3, perOrderFee: 0, monthly: 39, adsPct: 0, adsFeePct: 0 },
  { name: "Handmade marketplace", commissionPct: 6.5, paymentPct: 3, paymentFixed: 0.25, perOrderFee: 0.2, monthly: 0, adsPct: 15, adsFeePct: 15 },
  { name: "Large marketplace", commissionPct: 15, paymentPct: 0, paymentFixed: 0, perOrderFee: 0, monthly: 0, adsPct: 0, adsFeePct: 0 },
];

function oneChannel(c, p, price) {
  const buyerPays = price + p.shipCharged;
  const commission = (c.commissionPct / 100) * price;
  const payment = (c.paymentPct / 100) * buyerPays + c.paymentFixed;
  const ads = (c.adsPct / 100) * (c.adsFeePct / 100) * price;
  const variableNet = buyerPays - p.landed - p.shipOut - commission - payment - c.perOrderFee - ads;
  return { commission, payment, ads, perOrderFee: c.perOrderFee, variableNet };
}

/**
 * @param {{price:number, landed:number, shipOut?:number, shipCharged?:number, orders?:number, targetProfit?:number,
 *   channels:Array<{name:string, commissionPct?:number, paymentPct?:number, paymentFixed?:number, perOrderFee?:number, monthly?:number, adsPct?:number, adsFeePct?:number}>}} o
 */
export function compareChannels(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the price, the landed cost and at least one channel." };
  try {
    const p = {
      price: num(o.price, "Price", 0.01, 1e6),
      landed: num(o.landed, "Landed cost per piece", 0, 1e6),
      shipOut: num(o.shipOut ?? 0, "Shipping you pay per parcel", 0, 1e4),
      shipCharged: num(o.shipCharged ?? 0, "Shipping the buyer pays", 0, 1e4),
    };
    const orders = num(o.orders ?? 50, "Orders per month", 0, 1e7);
    const target = num(o.targetProfit ?? 0, "Target profit per order", -1e6, 1e6);
    if (!Array.isArray(o.channels) || o.channels.length === 0 || o.channels.length > 12) return { error: "Give one to twelve channels." };
    const chans = o.channels.map((c, i) => {
      if (!c || typeof c !== "object") throw new Error(`Channel ${i + 1} is not an object.`);
      return {
        name: String(c.name ?? `Channel ${i + 1}`).slice(0, 60),
        commissionPct: num(c.commissionPct ?? 0, "Commission percent", 0, 60),
        paymentPct: num(c.paymentPct ?? 0, "Payment fee percent", 0, 30),
        paymentFixed: num(c.paymentFixed ?? 0, "Fixed payment fee", 0, 100),
        perOrderFee: num(c.perOrderFee ?? 0, "Fee per order", 0, 100),
        monthly: num(c.monthly ?? 0, "Monthly fee", 0, 1e5),
        adsPct: num(c.adsPct ?? 0, "Share of orders from ads", 0, 100),
        adsFeePct: num(c.adsFeePct ?? 0, "Ad fee percent of price", 0, 100),
      };
    });
    const rows = chans.map(c => {
      const at = oneChannel(c, p, p.price);
      const v1 = oneChannel(c, p, p.price + 1).variableNet - at.variableNet; // net gained per extra currency unit of price
      const priceForTarget = v1 > 0 ? r2(p.price + (target - at.variableNet) / v1) : null;
      const month = at.variableNet * orders - c.monthly;
      const cost = at.commission + at.payment + at.ads + at.perOrderFee;
      return {
        name: c.name,
        feesPerOrder: r2(cost),
        feesPctOfPrice: r2((cost / p.price) * 100),
        netPerOrder: r2(at.variableNet),
        monthlyFee: c.monthly,
        netPerOrderAfterMonthly: orders > 0 ? r2(month / orders) : null,
        profitPerMonth: r2(month),
        priceForTarget,
        _v: at.variableNet,
      };
    });
    const best = rows.reduce((a, b) => (b.profitPerMonth > a.profitPerMonth ? b : a));
    // Orders per month at which the dearer-subscription channel overtakes each other channel.
    const crossovers = [];
    for (let i = 0; i < chans.length; i++) for (let j = 0; j < chans.length; j++) {
      if (i === j || chans[i].monthly <= chans[j].monthly) continue;
      const dv = rows[i]._v - rows[j]._v; // per-order advantage of i
      if (dv <= 0) continue; // i never catches up
      crossovers.push({ channel: rows[i].name, beats: rows[j].name, fromOrdersPerMonth: Math.ceil((chans[i].monthly - chans[j].monthly) / dv) });
    }
    const notes = [];
    if (rows.some(r => r.netPerOrder <= 0)) notes.push(`On ${rows.filter(r => r.netPerOrder <= 0).map(r => r.name).join(", ")} an order loses money before any monthly fee.`);
    if (chans.some(c => c.adsPct > 0)) notes.push("Some marketplaces apply advertising fees to orders they credit to their ads, and you may not be able to opt out above a sales level. Type the share you expect, from your own seller statement.");
    if (orders === 0) notes.push("Zero orders per month: subscriptions are pure cost.");
    notes.push("Commission is taken on the item price and the payment fee on item plus shipping; real schedules differ (some take commission on shipping, taxes or currency conversion). Type your channel's current terms.");
    rows.forEach(r => delete r._v);
    return { orders, best: best.name, channels: rows, crossovers, notes };
  } catch (e) { return { error: e.message }; }
}
