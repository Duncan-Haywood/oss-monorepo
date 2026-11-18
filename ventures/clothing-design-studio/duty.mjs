/**
 * Landed cost by destination: import duty, any extra tariff, and import VAT.
 *
 * costing.mjs takes one flat duty percent. The real figure depends on what the
 * garment is made of, where it is made and where it is going, and on a customs
 * value that is built differently by destination:
 *
 *   US   customs value = price paid to the factory (FOB); international
 *        freight and insurance are NOT dutiable.
 *   EU, UK   customs value = CIF: factory price + freight + insurance.
 *
 *   duty        = customs value x (rate + extra tariff)
 *   import VAT  = (customs value + duty) x VAT   (EU, UK; the US has none at
 *                 the border). A VAT-registered business reclaims it, so it is
 *                 shown apart and kept out of the cost per garment.
 *
 * THE RATES BELOW ARE TYPED FROM MEMORY, NOT CHECKED. The USITC, UK and EU
 * tariff sites could not be reached from the build host (2026-11-06). They are
 * editable defaults on the page. US "extra tariff" changed several times in
 * 2025 and later: it defaults to 0 and you must type today's figure for your
 * origin. Preference (0% from least-developed countries under the EU and UK
 * schemes) needs proof of origin and rules-of-origin compliance; this module
 * only applies the zero when the designer says the proof is in hand.
 * Not customs or legal advice: a licensed customs broker classifies goods.
 */

export const DUTY_SOURCES = Object.freeze({
  US: "https://hts.usitc.gov/",
  EU: "https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en",
  UK: "https://www.trade-tariff.service.gov.uk/",
});

/** Product keys → heading and general (most-favoured-nation) rate percent per destination. Knitted garments. */
export const PRODUCTS = Object.freeze({
  "tee-cotton":    { label: "T-shirt or long-sleeve tee, cotton, knitted",          codes: { US: "6109.10.00", EU: "6109 10 00", UK: "6109 10 00" }, rates: { US: 16.5, EU: 12, UK: 12 } },
  "tee-synthetic": { label: "T-shirt or long-sleeve tee, polyester or other man-made fibre, knitted", codes: { US: "6109.90.10", EU: "6109 90 20", UK: "6109 90 20" }, rates: { US: 32, EU: 12, UK: 12 } },
  "hoodie-cotton": { label: "Sweatshirt or hoodie, cotton, knitted",                codes: { US: "6110.20.20", EU: "6110 20 91", UK: "6110 20 91" }, rates: { US: 16.5, EU: 12, UK: 12 } },
  "hoodie-synthetic": { label: "Sweatshirt or hoodie, man-made fibre, knitted",     codes: { US: "6110.30.30", EU: "6110 30 91", UK: "6110 30 91" }, rates: { US: 32, EU: 12, UK: 12 } },
});

export const DESTINATIONS = Object.freeze({
  US: { label: "United States", currency: "USD", valuation: "FOB", vatPct: 0 },
  EU: { label: "European Union (standard rate varies by state)", currency: "EUR", valuation: "CIF", vatPct: 21 },
  UK: { label: "United Kingdom", currency: "GBP", valuation: "CIF", vatPct: 20 },
});

/** Countries with zero-duty access to the EU and UK schemes for least-developed countries, if the origin proof is held. */
export const PREFERENCE_ORIGINS = Object.freeze(["Bangladesh", "Cambodia", "Myanmar", "Nepal", "Laos"]);

const r2 = v => Math.round(v * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(+v) && v !== "" && v !== null ? +v : d);

/**
 * @param {object} i  product, destination, quantity, factoryPrice (per garment,
 *   in the destination's currency), freightTotal and insuranceTotal for the whole
 *   shipment, rateOverridePct, extraTariffPct, origin, haveOriginProof, vatPct.
 */
export function landedByDestination(i) {
  // own keys only: "constructor" or "toString" would find Object.prototype and throw further down
  const prod = Object.hasOwn(PRODUCTS, i.product) ? PRODUCTS[i.product] : null;
  const dest = Object.hasOwn(DESTINATIONS, i.destination) ? DESTINATIONS[i.destination] : null;
  if (!prod) return { error: "Choose a garment type." };
  if (!dest) return { error: "Choose a destination." };
  const qty = Math.floor(num(i.quantity));
  if (qty < 1) return { error: "Quantity must be at least 1." };
  const price = num(i.factoryPrice, NaN);
  if (!(price >= 0)) return { error: "Type the price the factory charges per garment." };
  const freight = Math.max(0, num(i.freightTotal)), insurance = Math.max(0, num(i.insuranceTotal));
  const notes = [];
  const goods = price * qty;
  const customsValue = dest.valuation === "CIF" ? goods + freight + insurance : goods;
  if (dest.valuation === "FOB" && (freight || insurance)) notes.push("US duty is on the factory price; international freight and insurance are not dutiable.");
  const mfn = prod.rates[i.destination];
  const hasOverride = i.rateOverridePct !== undefined && i.rateOverridePct !== "" && i.rateOverridePct !== null;
  let rate = hasOverride ? Math.max(0, num(i.rateOverridePct)) : mfn;
  let preference = false;
  if (!hasOverride && i.destination !== "US" && PREFERENCE_ORIGINS.includes(i.origin)) {
    if (i.haveOriginProof) { rate = 0; preference = true; notes.push(`0% duty assumes a valid origin proof from ${i.origin} and that the garment meets the scheme's rules of origin (usually a made-from-yarn or fabric rule). Without it the full rate applies.`); }
    else notes.push(`${i.origin} garments can enter at 0% under the least-developed-country scheme with an origin proof; tick the box only if you hold one.`);
  }
  const extra = Math.max(0, num(i.extraTariffPct));
  if (i.destination === "US" && extra === 0) notes.push("No extra US tariff is applied. Additional tariffs by country of origin changed several times in 2025 onward: type today's figure for your origin.");
  const duty = customsValue * rate / 100, extraDuty = customsValue * extra / 100;
  const vatPct = i.vatPct !== undefined && i.vatPct !== "" ? Math.max(0, num(i.vatPct)) : dest.vatPct;
  const importVat = (customsValue + duty + extraDuty) * vatPct / 100;
  // Freight into the destination is a cost whichever way customs values it.
  const landedTotal = goods + freight + insurance + duty + extraDuty;
  const perGarment = landedTotal / qty;
  const dutyOnlyPerGarment = (duty + extraDuty) / qty;
  return {
    product: prod.label, code: prod.codes[i.destination], destination: dest.label, valuation: dest.valuation,
    mfnRatePct: mfn, ratePct: rate, extraTariffPct: extra, preference,
    customsValue: r2(customsValue), duty: r2(duty), extraDuty: r2(extraDuty),
    importVat: r2(importVat), vatPct, vatReclaimable: dest.vatPct > 0,
    landedTotal: r2(landedTotal), landedPerGarment: r2(perGarment),
    dutyPerGarment: r2(dutyOnlyPerGarment),
    dutyShareOfLandedPct: landedTotal ? r2((duty + extraDuty) / landedTotal * 100) : 0,
    source: DUTY_SOURCES[i.destination], notes,
  };
}

/** The same shipment compared across destinations, for choosing where to sell first. `extraTariffPct` applies to the US only; a rate override applies to all three. */
export function compareDestinations(i) {
  return Object.keys(DESTINATIONS).map(d => ({ ...landedByDestination({ ...i, destination: d, vatPct: undefined, extraTariffPct: d === "US" ? i.extraTariffPct : 0 }), destination: d }));
}

/** Break-even order size at which a shipment's fixed freight stops mattering: where freight per garment drops below `targetPct` of the factory price. */
export function freightBreakQty(factoryPrice, freightTotal, targetPct = 5) {
  const p = num(factoryPrice), f = num(freightTotal);
  if (!(p > 0) || !(f >= 0) || !(targetPct > 0)) return null;
  return Math.ceil(f / (p * targetPct / 100));
}

/** Map a studio design (garment id, fabric polyester share 0..1) to a duty product key. Crewnecks and hoodies use the sweatshirt heading; tees and long-sleeves the tee heading. Man-made when polyester is over 50% (the heading goes by the fibre that predominates by weight). */
export function productForDesign(garmentId, polyesterShare = 0) {
  const synthetic = num(polyesterShare) > 0.5;
  const sweat = garmentId === "hoodie" || garmentId === "crewneck";
  return (sweat ? "hoodie-" : "tee-") + (synthetic ? "synthetic" : "cotton");
}

/** One duty percent for the studio's cost sheet: duty + any extra tariff, as a share of the factory price. EU/UK duty is on CIF value, so it is scaled up by (1 + freight share); pass `freightPerGarment` to include that. Returns null when the inputs do not make sense. */
export function dutyPctFor({ garmentId, polyesterShare, destination, origin, haveOriginProof, extraTariffPct, factoryPrice, freightPerGarment }) {
  const price = num(factoryPrice, NaN);
  if (!(price > 0)) return null;
  const r = landedByDestination({
    product: productForDesign(garmentId, polyesterShare), destination, quantity: 1, factoryPrice: price,
    freightTotal: num(freightPerGarment), insuranceTotal: 0, origin, haveOriginProof, extraTariffPct,
  });
  if (r.error) return null;
  return Math.round(r.customsValue * (r.ratePct + r.extraTariffPct) / price * 10) / 10;
}
