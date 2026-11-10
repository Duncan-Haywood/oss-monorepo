/**
 * Fabric weight, width and length: the conversions a designer needs when a
 * mill quotes knit cloth by the kilo and a factory quotes by the metre, or when
 * a sample is "180 gsm" and the order is in kilos.
 *
 * Definitions (exact):
 *   GSM = grams per square metre of cloth.
 *   Cloth mass for a length L (m) of width W (m): kg = GSM x W x L / 1000.
 *   Linear metres per kilo: 1000 / (GSM x W).
 *   Price per metre = price per kilo x GSM x W / 1000.
 * Width is the cut (usable) width, not the selvedge-to-selvedge width. Tubular
 * knit is quoted flat or open; ask which, because a tube is double the flat
 * width. Linear ounces per yard are a different unit and are not handled here.
 */
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

export const gsmFromOzYd2 = oz => num(oz, "Ounces per square yard", 0.01, 100) * 33.9057;   // 1 oz/yd2 = 33.9057 g/m2
export const ozYd2FromGsm = g => num(g, "GSM", 1, 3000) / 33.9057;

/** Metres of cloth in a kilo. */
export function metresPerKg(gsm, widthCm) {
  num(gsm, "GSM", 1, 3000); num(widthCm, "Width (cm)", 10, 400);
  return 1000 / (gsm * widthCm / 100);
}

/** Convert a price between per-kilo and per-metre for a given cloth. */
export function convertPrice({ gsm, widthCm, perKg, perMetre }) {
  num(gsm, "GSM", 1, 3000); num(widthCm, "Width (cm)", 10, 400);
  const kgPerM = gsm * widthCm / 100 / 1000;
  if (perKg !== undefined && perKg !== null && perKg !== "") {
    num(perKg, "Price per kg", 0, 1e6);
    return { perKg, perMetre: perKg * kgPerM, kgPerMetre: kgPerM, metresPerKg: 1 / kgPerM };
  }
  num(perMetre, "Price per metre", 0, 1e6);
  return { perKg: perMetre / kgPerM, perMetre, kgPerMetre: kgPerM, metresPerKg: 1 / kgPerM };
}

/**
 * Order size: garments and cloth per garment (metres, waste included) to the
 * kilos to order, rounded up to a mill minimum, with the cost and the surplus.
 */
export function orderFromGarments({ gsm, widthCm, garments, metresPerGarment, pricePerKg = 0, minKg = 0 }) {
  num(garments, "Garments", 1, 1e7); num(metresPerGarment, "Metres per garment", 0.01, 50);
  num(pricePerKg, "Price per kg", 0, 1e6); num(minKg, "Minimum kg", 0, 1e7);
  const mpk = metresPerKg(gsm, widthCm);
  const metres = garments * metresPerGarment, kg = metres / mpk;
  const kgBought = Math.max(kg, minKg), surplusKg = kgBought - kg;
  return { metres, kg, kgBought, surplusKg, cost: kgBought * pricePerKg,
    costPerGarment: kgBought * pricePerKg / garments,
    garmentsFromBought: kgBought * mpk / metresPerGarment, kgPerGarment: kg / garments };
}

/** Plain-language flags. */
export function notes({ gsm, widthCm }) {
  const out = [];
  if (gsm < 120) out.push("Under 120 gsm is a light, often sheer cloth: check opacity and whether a print will show through.");
  if (gsm > 320) out.push("Over 320 gsm is heavy fleece or denim weight: check your machine and shipping weight.");
  if (widthCm < 90) out.push("Under 90 cm is a narrow width for knit cloth: is this the flat width of a tube? A tube is twice its flat width open.");
  return out;
}
