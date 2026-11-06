/**
 * Duty on a single direct-to-consumer parcel (one customer order), as opposed
 * to duty.mjs, which prices a bulk shipment from the factory.
 *
 * What changed (checked by web search 2026-11-06, secondary sources; the
 * primary pages were not reachable from the build host):
 *   EU  from 1 July 2026 the EUR 150 duty-free relief ends: a flat EUR 3 customs
 *       duty per distinct item category (tariff heading) in a consignment worth
 *       under EUR 150, until July 2028. Initial scope is tied to sellers
 *       registered for IOSS. The flat amount is applied here instead of the
 *       ordinary rate for those goods.
 *   US  the USD 800 de minimis is suspended for every country (since 29 Aug 2025,
 *       continued in 2026), so ordinary duty plus any extra tariff applies to a
 *       parcel of any value. Later statutory changes are unconfirmed.
 *   UK  duty is not charged on goods worth GBP 135 or less (typed default, from
 *       memory, unchecked); above it, the ordinary rate. UK VAT is collected at
 *       the sale, not at the border, for sellers who register.
 * All figures are editable inputs. Not customs or legal advice.
 */
import { PRODUCTS } from "./duty.mjs";

const r2 = v => Math.round(v * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(+v) && v !== "" && v !== null && v !== undefined ? +v : d);

export const PARCEL_DEFAULTS = Object.freeze({
  EU: { thresholdValue: 150, flatDutyPerCategory: 3, currency: "EUR" },
  UK: { thresholdValue: 135, currency: "GBP" },
  US: { thresholdValue: 0, currency: "USD" },
});

/**
 * @param {object} i  destination (US|EU|UK), product (key of PRODUCTS), parcelValue
 *   (goods, destination currency), categories (distinct item headings in the
 *   parcel, default 1), shipping (parcel shipping paid, counted in EU/UK customs
 *   value), ioss (EU: seller registered for IOSS), extraTariffPct (US),
 *   rateOverridePct, brokerFee (carrier clearance fee the buyer or seller pays),
 *   thresholdValue, flatDutyPerCategory (overrides of the defaults).
 */
export function parcelDuty(i) {
  const prod = PRODUCTS[i.product], d = PARCEL_DEFAULTS[i.destination];
  if (!prod) return { error: "Choose a garment type." };
  if (!d) return { error: "Choose a destination." };
  const value = num(i.parcelValue, NaN);
  if (!(value > 0)) return { error: "Type what the goods in the parcel are worth." };
  const categories = Math.max(1, Math.floor(num(i.categories, 1)));
  const shipping = Math.max(0, num(i.shipping));
  const broker = Math.max(0, num(i.brokerFee));
  const extra = i.destination === "US" ? Math.max(0, num(i.extraTariffPct)) : 0;
  const hasOverride = i.rateOverridePct !== undefined && i.rateOverridePct !== "" && i.rateOverridePct !== null;
  const rate = hasOverride ? Math.max(0, num(i.rateOverridePct)) : prod.rates[i.destination];
  const threshold = num(i.thresholdValue, d.thresholdValue);
  const customsValue = i.destination === "US" ? value : value + shipping;
  const notes = [];
  let duty = 0, method = "ordinary rate";
  if (i.destination === "EU") {
    const flat = Math.max(0, num(i.flatDutyPerCategory, d.flatDutyPerCategory));
    if (value < threshold) {
      if (i.ioss) { duty = flat * categories; method = `flat ${flat} per item category x ${categories}`; }
      else { duty = 0; method = "no flat duty (seller not on IOSS)"; notes.push("The flat duty started with IOSS-registered sellers. Without IOSS the parcel may still be charged by the carrier or customs: check with them."); }
    } else { duty = customsValue * rate / 100; }
  } else if (i.destination === "UK") {
    if (customsValue <= threshold && !hasOverride) { duty = 0; method = `no duty at or under ${threshold}`; }
    else duty = customsValue * rate / 100;
    notes.push("The UK threshold is typed from memory and unchecked.");
  } else {
    duty = customsValue * (rate + extra) / 100;
    notes.push("The US duty-free threshold is suspended, so every parcel pays duty; a carrier clearance fee is usually added. Type today's extra tariff for your origin.");
  }
  const total = duty + broker;
  return {
    destination: i.destination, product: prod.label, code: prod.codes[i.destination],
    customsValue: r2(customsValue), method, categories,
    duty: r2(duty), brokerFee: r2(broker), totalAtBorder: r2(total),
    shareOfGoodsPct: r2(total / value * 100),
    notes,
  };
}

/** Bulk-vs-parcel: how much border cost one parcel carries versus the same garment in a bulk shipment (duty only). */
export function parcelVsBulk(i, bulkDutyPerGarment) {
  const p = parcelDuty(i);
  if (p.error) return p;
  const bulk = Math.max(0, num(bulkDutyPerGarment));
  return { ...p, bulkDutyPerGarment: r2(bulk), extraPerParcel: r2(p.totalAtBorder - bulk) };
}

/** Smallest basket (goods value) at which the flat EU duty falls to `maxPct` of the goods. */
export function euBasketForShare(flatDuty, categories, maxPct) {
  const f = num(flatDuty), c = Math.max(1, Math.floor(num(categories, 1))), m = num(maxPct);
  if (!(f >= 0) || !(m > 0)) return null;
  return r2(f * c / (m / 100));
}
