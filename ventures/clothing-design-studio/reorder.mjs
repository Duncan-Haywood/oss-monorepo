/**
 * Reorder planner for a small clothing line: when to place the next factory
 * order so a bestselling piece does not run out while the factory is still
 * making it, and how much cash that order ties up.
 *
 * Model (textbook continuous-review inventory, an assumption, not your data):
 * weekly sales are roughly normal with a mean and a spread you type; the
 * factory takes `leadWeeks` from the order to stock on your shelf (production,
 * freight, customs, receiving). Safety stock = z x spread x sqrt(lead weeks),
 * with z from the service level (the chance of not running out during one
 * lead time). Reorder point = mean x lead weeks + safety stock. When stock on
 * hand plus stock already on order is at or below the reorder point, order now.
 * If you are already late, the lost sales and lost profit before the new run
 * lands are shown. Real sales are lumpier than a normal curve (a post goes
 * viral, a season turns), so treat the answer as a floor for a fast seller.
 */
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

/** z for one-sided service levels (standard normal table values). */
export const SERVICE_Z = Object.freeze({ 80: 0.8416, 85: 1.0364, 90: 1.2816, 95: 1.6449, 98: 2.0537, 99: 2.3263 });

const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
};

/**
 * @param {{weeklyRate:number, weeklySd?:number, leadWeeks:number, onHand:number, onOrder?:number,
 *   service?:number, coverWeeks?:number, moq?:number, landed:number, profitPerUnit?:number, today?:string}} o
 */
export function reorderPlan(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the weekly sales, the lead time and the stock on hand." };
  try {
    const rate = num(o.weeklyRate, "Weekly sales", 0.01, 1e6);
    const sd = num(o.weeklySd ?? rate * 0.5, "Weekly sales spread", 0, 1e6);
    const lead = num(o.leadWeeks, "Lead time (weeks)", 0.5, 104);
    const onHand = num(o.onHand, "Stock on hand", 0, 1e7);
    const onOrder = num(o.onOrder ?? 0, "Stock already on order", 0, 1e7);
    const service = o.service ?? 95;
    const z = SERVICE_Z[service];
    if (z === undefined) throw new Error(`Service level must be one of ${Object.keys(SERVICE_Z).join(", ")} (percent).`);
    const cover = num(o.coverWeeks ?? 12, "Weeks one order should cover", 1, 104);
    const moq = num(o.moq ?? 1, "Factory minimum", 1, 1e7);
    const landed = num(o.landed, "Landed cost per piece", 0, 1e6);
    const profit = o.profitPerUnit === undefined ? undefined : num(o.profitPerUnit, "Profit per piece", -1e6, 1e6);
    if (o.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(o.today)) throw new Error("Today must be a date like 2026-11-06.");

    const safety = Math.ceil(z * sd * Math.sqrt(lead));
    const demandInLead = rate * lead;
    const reorderPoint = Math.ceil(demandInLead + safety);
    const position = onHand + onOrder;
    const weeksOfStock = onHand / rate;
    const weeksUntilReorder = (position - reorderPoint) / rate;
    const orderNow = position <= reorderPoint;
    const quantity = Math.max(moq, Math.ceil(rate * cover + safety - Math.max(0, orderNow ? position - safety : 0)));
    // Sales missed if the order goes in today: the run lands after `lead` weeks and only
    // on-hand stock (on-order lands within the lead time, so it is ignored: cautious) sells till then.
    const shortWeeks = Math.max(0, lead - (onHand + onOrder) / rate);
    const lostUnits = Math.floor(shortWeeks * rate);
    const notes = [];
    if (orderNow) notes.push(`Order now: stock plus stock on order (${position}) is at or under the reorder point (${reorderPoint}).`);
    else notes.push(`Not yet: about ${round1(weeksUntilReorder)} weeks of selling until stock plus stock on order falls to the reorder point (${reorderPoint}).`);
    if (lostUnits > 0) notes.push(`Even an order today lands ${round1(shortWeeks)} weeks after you run out: about ${lostUnits} sales missed${profit !== undefined ? ` (${round2(lostUnits * profit)} of profit)` : ""}. Ask the factory about air freight or a split first delivery.`);
    if (quantity === moq && rate * cover + safety < moq) notes.push(`The factory minimum (${moq}) is more than ${cover} weeks of sales: the order covers about ${round1(moq / rate)} weeks, so it ties up more cash than the cover you asked for.`);
    if (sd < rate * 0.2) notes.push("A small spread assumes steady sales; a new line rarely sells that evenly. Try half the weekly rate as the spread.");
    notes.push("Apparel sells by size: split the order with the size run (size finder) and reorder the sizes that sell out first, not the average.");
    const out = {
      ok: true, serviceLevel: service, z, safetyStock: safety, demandInLeadTime: round1(demandInLead), reorderPoint,
      position, weeksOfStock: round1(weeksOfStock), weeksUntilReorder: round1(weeksUntilReorder), orderNow,
      quantity, weeksCovered: round1(quantity / rate), cashTiedUp: round2(quantity * landed), shortWeeks: round1(shortWeeks), lostUnits,
      lostProfit: profit === undefined ? undefined : round2(lostUnits * profit), notes,
    };
    if (o.today) {
      out.stockoutDate = addDays(o.today, weeksOfStock * 7);
      out.orderByDate = orderNow ? o.today : addDays(o.today, weeksUntilReorder * 7);
      out.arrivalDate = addDays(out.orderByDate, lead * 7);
    }
    return out;
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Reorder per size. Total weekly sales split by a size mix (shares of sales,
 * which fit.mjs's size run or your own sell-through gives). For a size with
 * share p of a total with mean m and spread s, the size's weekly spread is
 * sqrt(p^2 s^2 + p(1-p) m): the total's wobble scaled down, plus the random
 * choice of size per buyer (multinomial). Each size is planned alone with
 * reorderPlan (no minimum), then the factory minimum is applied to the whole
 * order: if the sizes needing stock add up to less, the extra is spread over
 * them in proportion. Sizes not yet at their reorder point are left out of
 * the order (listed with their weeks to go) unless `all` is true.
 * Assumes sizes sell independently of each other, which overstates the
 * pooling a little; real size curves also shift with the audience.
 *
 * @param {{mix:Record<string,number>, onHand:Record<string,number>, onOrder?:Record<string,number>,
 *   all?:boolean} & Parameters<typeof reorderPlan>[0]} o  mix values are percents or counts (normalised).
 */
export function reorderBySize(o) {
  if (!o || typeof o !== "object" || !o.mix || typeof o.mix !== "object") return { error: "Give the size mix, e.g. {S: 15, M: 35, L: 30, XL: 20}." };
  try {
    const sizes = Object.keys(o.mix);
    if (sizes.length < 1 || sizes.length > 20) throw new Error("Give 1 to 20 sizes.");
    let total = 0;
    for (const s of sizes) total += num(o.mix[s], `Share for ${s}`, 0, 1e9);
    if (total <= 0) throw new Error("The size shares add to zero.");
    const m = num(o.weeklyRate, "Weekly sales", 0.01, 1e6);
    const sd = num(o.weeklySd ?? m * 0.5, "Weekly sales spread", 0, 1e6);
    const rows = [];
    for (const s of sizes) {
      const p = o.mix[s] / total;
      if (p === 0) continue;
      const sdS = Math.sqrt(p * p * sd * sd + p * (1 - p) * m);
      const hand = num(o.onHand?.[s] ?? 0, `Stock on hand (${s})`, 0, 1e7);
      const ord = num(o.onOrder?.[s] ?? 0, `On order (${s})`, 0, 1e7);
      const r = reorderPlan({ ...o, weeklyRate: m * p, weeklySd: sdS, onHand: hand, onOrder: ord, moq: 1, today: o.today });
      if (r.error) throw new Error(`${s}: ${r.error}`);
      rows.push({ size: s, share: round1(p * 100), ...r });
    }
    const include = rows.filter(r => r.orderNow || o.all);
    let sum = include.reduce((a, r) => a + r.quantity, 0);
    const moq = num(o.moq ?? 1, "Factory minimum", 1, 1e7);
    const notes = [];
    const finalQty = new Map(include.map(r => [r.size, r.quantity]));
    if (sum > 0 && sum < moq) {
      let left = moq - sum;
      const base = sum;
      for (const r of include) {
        const add = Math.floor((moq - base) * r.quantity / base);
        finalQty.set(r.size, r.quantity + add); left -= add;
      }
      const big = include.reduce((a, b) => (b.quantity > a.quantity ? b : a));
      finalQty.set(big.size, finalQty.get(big.size) + left);
      notes.push(`The sizes at their reorder point add up to ${base}, under the factory minimum of ${moq}: the extra ${moq - base} is spread in proportion.`);
    }
    sum = [...finalQty.values()].reduce((a, b) => a + b, 0);
    if (!include.length) notes.push("No size is at its reorder point yet.");
    const lost = rows.reduce((a, r) => a + r.lostUnits, 0);
    if (lost > 0) notes.push(`Sizes already short lose about ${lost} sales before an order lands.`);
    notes.push("Sizes are planned independently from a typed mix; use your own sell-through by size once you have it.");
    const lines = rows.map(r => ({
      size: r.size, sharePercent: r.share, weeklySales: round1(m * r.share / 100),
      safetyStock: r.safetyStock, reorderPoint: r.reorderPoint, position: r.position, orderNow: r.orderNow,
      weeksUntilReorder: r.weeksUntilReorder, lostUnits: r.lostUnits, order: finalQty.get(r.size) ?? 0,
    }));
    return { ok: true, lines, orderTotal: sum, cashTiedUp: round2(sum * num(o.landed, "Landed cost per piece", 0, 1e6)), notes };
  } catch (e) {
    return { error: e.message };
  }
}
