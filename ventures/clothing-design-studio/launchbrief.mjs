/**
 * Launch brief: the numbers the studio already worked out, handed to the
 * launch tools so a designer types them once.
 *
 * The studio costs a design (landed cost, price, run size, fees, lead time).
 * The cash-flow, pre-order, wholesale, reorder and time-and-action pages each
 * had their own boxes with placeholder values. `briefFromStudio` boils the
 * studio's result down to a flat object, `prefillFor` turns it into the
 * values for one page's boxes, and `saveBrief` / `loadBrief` pass it between
 * pages through the browser's own storage (it never leaves the browser).
 *
 * Nothing here knows a price. It only copies and rearranges what the
 * designer's supplier sheet and plan already said.
 */

export const BRIEF_KEY = "clothing-design-studio-brief";

const r2 = v => Math.round(v * 100) / 100;
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param {{quantity:number, price:number}} design
 * @param {object} sheet supplier sheet (moq, leadTimeDays, dutyPct, freightPerUnit, trimsPerUnit, packagingPerUnit)
 * @param {object} plan  selling plan (salesTaxPct, channelFeePct, paymentFeePct, paymentFixed)
 * @param {object} cost  result of unitCost(): { landed, lines, currency }
 */
export function briefFromStudio(design, sheet, plan, cost) {
  const landed = num(cost?.landed);
  if (landed == null || !(design?.quantity > 0) || !(design?.price >= 0)) return null;
  const duty = (sheet.dutyPct || 0) / 100;
  const freightUnit = sheet.freightPerUnit || 0;
  const extras = (sheet.trimsPerUnit || 0) + (sheet.packagingPerUnit || 0);
  // landed = goods * (1 + duty) + freight, so goods = (landed - freight) / (1 + duty)
  const goods = Math.max(0, (landed - freightUnit) / (1 + duty));
  const factoryPerUnit = Math.max(0, goods - extras);
  const net = design.price / (1 + (plan.salesTaxPct || 0) / 100);
  const fees = design.price * ((plan.channelFeePct || 0) + (plan.paymentFeePct || 0)) / 100 + (plan.paymentFixed || 0);
  const perSale = net - fees;
  return {
    version: 1,
    savedAt: null,
    currency: cost.currency || sheet.currency || "EUR",
    quantity: design.quantity,
    price: r2(design.price),
    landed: r2(landed),
    factoryPerUnit: r2(factoryPerUnit),
    extrasPerUnit: r2(extras),
    freightTotal: r2(freightUnit * design.quantity),
    dutyPct: sheet.dutyPct || 0,
    moq: sheet.moq || 0,
    leadTimeDays: num(sheet.leadTimeDays),
    salesTaxPct: plan.salesTaxPct || 0,
    feePct: r2((plan.channelFeePct || 0) + (plan.paymentFeePct || 0)),
    paymentFeePct: plan.paymentFeePct || 0,
    fixedFee: plan.paymentFixed || 0,
    netPerSale: r2(perSale),
    profitPerSale: r2(perSale - landed),
    example: !!sheet.example,
  };
}

/**
 * The same brief for a pair of sunglasses. The eyewear sheet names its extras
 * differently (cleaning cloth instead of trims) and has no lead time unless the
 * designer's quote gives one, so map them across and reuse briefFromStudio.
 * `landed` is the figure the designer is using: the sheet's, or their own
 * factory's when typed over it.
 * @param {{quantity:number, price:number}} eyewear
 * @param {object} sheet eyewear supplier sheet (moq, dutyPct, freightPerUnit, clothPerUnit, packagingPerUnit, leadTimeDays?)
 * @param {object} plan  selling plan (salesTaxPct, channelFeePct, paymentFeePct, paymentFixed)
 * @param {{landed:number, currency?:string}} cost
 */
export function briefFromEyewear(eyewear, sheet, plan, cost) {
  const mapped = { ...sheet, trimsPerUnit: sheet.clothPerUnit || 0, packagingPerUnit: sheet.packagingPerUnit || 0 };
  const b = briefFromStudio(eyewear, mapped, plan, cost);
  if (b) b.kind = "sunglasses";
  return b;
}

/** Box ids and values for each page. Only boxes the brief can honestly fill. */
export function prefillFor(page, b) {
  if (!b || b.version !== 1) return {};
  const out = {};
  const put = (id, v) => { if (v != null && Number.isFinite(v)) out[id] = v; };
  switch (page) {
    case "cashflow":
      put("units", b.quantity); put("fpu", b.factoryPerUnit); put("oth", b.extrasPerUnit);
      put("frt", b.freightTotal); put("duty", b.dutyPct); put("net", b.netPerSale);
      if (b.leadTimeDays != null) put("prod", Math.max(0, Math.round(b.leadTimeDays / 7)));
      break;
    case "preorder":
      put("price", b.price); put("landed", b.landed); put("moq", b.moq || null);
      put("tax", b.salesTaxPct); put("fee", b.feePct); put("feef", b.fixedFee);
      break;
    case "wholesale":
      put("price", b.price); put("landed", b.landed); put("tax", b.salesTaxPct); put("pfee", b.paymentFeePct);
      break;
    case "reorder":
      put("moq", b.moq || null); put("landed", b.landed); put("profit", b.profitPerSale);
      break;
    case "tna":
      put("d-production", b.leadTimeDays);
      break;
  }
  return out;
}

export function saveBrief(brief, storage = globalThis.localStorage, now = new Date()) {
  if (!brief) return false;
  try { storage.setItem(BRIEF_KEY, JSON.stringify({ ...brief, savedAt: now.toISOString() })); return true; } catch { return false; }
}

export function loadBrief(storage = globalThis.localStorage) {
  try {
    const b = JSON.parse(storage.getItem(BRIEF_KEY) || "null");
    if (!b || b.version !== 1 || !(b.quantity > 0)) return null;
    return b;
  } catch { return null; }
}

/**
 * Fill a page's boxes from the saved brief and say so. Call before the first render.
 * Returns the note to show, or "" when there is no brief.
 */
export function applyBrief(page, doc = globalThis.document, storage = globalThis.localStorage) {
  const b = loadBrief(storage);
  const values = prefillFor(page, b);
  const ids = Object.keys(values);
  if (!ids.length) return "";
  for (const id of ids) { const el = doc.getElementById(id); if (el) el.value = String(values[id]); }
  const when = b.savedAt ? b.savedAt.slice(0, 10) : "earlier";
  return `Filled ${ids.length} ${ids.length === 1 ? "box" : "boxes"} from your ${b.kind === "sunglasses" ? "sunglasses design" : "studio design"} (${b.quantity} ${b.kind === "sunglasses" ? "pairs" : "pieces"} at ${b.price} ${b.currency}, saved ${when})${b.example ? ", which still uses the placeholder example supplier sheet" : ""}. Change any box; the studio is not touched.`;
}

/**
 * Move a brief between devices as a small JSON file (the browser's storage is
 * per device). `briefToFile` is what the download holds; `briefFromFile` reads
 * one back, keeping only the known numeric and text fields so a file from
 * anywhere cannot add keys, markup or non-numbers to the pages.
 */
const NUMERIC = ["quantity", "price", "landed", "factoryPerUnit", "extrasPerUnit", "freightTotal", "dutyPct", "moq",
  "leadTimeDays", "salesTaxPct", "feePct", "paymentFeePct", "fixedFee", "netPerSale", "profitPerSale"];

export function briefToFile(brief, now = new Date()) {
  if (!brief || brief.version !== 1) return null;
  return JSON.stringify({ ...brief, savedAt: brief.savedAt || now.toISOString() }, null, 2) + "\n";
}

/** @returns {{brief:object|null, error:string}} */
export function briefFromFile(text) {
  let raw;
  try { raw = JSON.parse(String(text)); } catch { return { brief: null, error: "That file is not JSON." }; }
  if (!raw || typeof raw !== "object" || raw.version !== 1) return { brief: null, error: "Not a launch brief (version 1)." };
  const b = { version: 1, savedAt: typeof raw.savedAt === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw.savedAt) ? raw.savedAt : null };
  for (const k of NUMERIC) {
    const v = raw[k];
    if (v === null || v === undefined) { b[k] = k === "leadTimeDays" ? null : 0; continue; }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e9) return { brief: null, error: `"${k}" must be a number from 0 to 1,000,000,000.` };
    b[k] = v;
  }
  if (!(b.quantity > 0)) return { brief: null, error: "The brief needs a quantity above zero." };
  b.currency = /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : "EUR";
  if (raw.kind === "sunglasses") b.kind = "sunglasses";
  b.example = !!raw.example;
  return { brief: b, error: "" };
}
