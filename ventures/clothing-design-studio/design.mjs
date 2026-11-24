/**
 * The design model: one garment, its fabric and colour, and the artwork
 * placed on it. Every change is an operation applied by `applyOp`, a pure
 * function, so the mouse, the keyboard, a typed or spoken command and an AI
 * model all edit the design the same way, and every change can be undone.
 */

import { GARMENTS, FABRICS, METHODS, COLOURS, luminance } from "./catalogue.mjs";
import { stockColours } from "./suppliers.mjs";
import { labOfHex } from "./shade.mjs";
import { ciede2000 } from "./colour.mjs";

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function newDesign(overrides = {}) {
  return {
    name: "Untitled design",
    garment: "tee",
    side: "front",
    colour: COLOURS.black,
    colourName: "black",
    fabric: "heavyweight-cotton",
    gsm: 260,
    placements: [],
    selected: null,
    quantity: 100,
    sizes: { XS: 0, S: 15, M: 30, L: 30, XL: 20, XXL: 5 },
    price: 45,
    nextId: 1,
    ...overrides,
  };
}

export function area(design, areaId) {
  return GARMENTS[design.garment]?.areas[areaId] ?? null;
}

function clampPlacement(design, p) {
  const a = area(design, p.area) ?? area(design, "front");
  const areaId = area(design, p.area) ? p.area : "front";
  const aspect = p.aspect > 0 ? p.aspect : 1;
  const w = Math.max(1, Math.min(p.w, a.w, a.h / aspect));
  const h = w * aspect;
  const maxX = (a.w - w) / 2;
  const maxY = (a.h - h) / 2;
  const round = v => Math.round(v * 10) / 10;
  return {
    ...p,
    area: areaId,
    w: round(w),
    x: round(Math.max(-maxX, Math.min(maxX, p.x))),
    y: round(Math.max(-maxY, Math.min(maxY, p.y))),
    rotate: ((Math.round(p.rotate || 0) % 360) + 360) % 360,
  };
}

function updateSelected(design, fn) {
  const id = design.selected ?? design.placements.at(-1)?.id;
  if (id == null) throw new OpError("There is no artwork to change yet. Add a motif, an image or some text first.");
  return {
    ...design,
    selected: id,
    placements: design.placements.map(p => (p.id === id ? clampPlacement(design, fn(p)) : p)),
  };
}

export class OpError extends Error {}

/** Original pixel size of an uploaded image (the stored copy is a downscaled preview), kept for the print-resolution check. */
function srcPx(v) {
  const w = Math.round(Number(v?.w)), h = Math.round(Number(v?.h));
  return w > 0 && h > 0 && w <= 100000 && h <= 100000 ? { srcPx: { w, h } } : {};
}

/**
 * Apply one operation. Throws OpError with a sentence a designer can read
 * when the operation does not make sense for this design.
 */
export function applyOp(design, op) {
  switch (op.op) {
    case "name":
      return { ...design, name: String(op.value).slice(0, 80) || design.name };
    case "garment": {
      if (!GARMENTS[op.value]) throw new OpError(`No garment called ${op.value}.`);
      const next = { ...design, garment: op.value };
      next.placements = design.placements.map(p => clampPlacement(next, { ...p, area: GARMENTS[op.value].areas[p.area] ? p.area : "front" }));
      return next;
    }
    case "side":
      return { ...design, side: op.value === "back" ? "back" : "front" };
    case "colour": {
      const hex = /^#[0-9a-f]{6}$/i.test(op.value) ? op.value.toLowerCase() : COLOURS[op.value];
      if (!hex) throw new OpError(`I don't know the colour ${op.value}.`);
      return { ...design, colour: hex, colourName: op.name ?? (COLOURS[op.value] ? op.value : hex) };
    }
    case "fabric": {
      const f = FABRICS[op.value];
      if (!f) throw new OpError(`No fabric called ${op.value}.`);
      const gsm = Math.min(f.gsm[1], Math.max(f.gsm[0], design.gsm));
      return { ...design, fabric: op.value, gsm };
    }
    case "gsm": {
      const v = Math.round(Number(op.value));
      if (!(v >= 80 && v <= 600)) throw new OpError("Fabric weight should be between 80 and 600 grams per square metre.");
      return { ...design, gsm: v };
    }
    case "add": {
      const id = design.nextId;
      const a = op.area && area(design, op.area) ? op.area : (design.side === "back" ? "back" : "front");
      const base = { id, area: a, kind: op.kind, x: 0, y: 0, w: op.w ?? area(design, a).w * 0.7, aspect: op.aspect ?? 1, rotate: 0,
        method: op.method ?? "dtg", colours: op.colours ?? 1, label: op.label ?? op.kind };
      if (op.kind === "text") Object.assign(base, { text: String(op.text ?? "").slice(0, 60), ink: op.ink ?? (luminance(design.colour) < 0.4 ? "#f2ead8" : "#1b1b1d"), font: op.font ?? "serif", aspect: op.aspect ?? 0.22 });
      else if (op.kind === "motif") Object.assign(base, { motif: op.motif, ink: op.ink ?? (luminance(design.colour) < 0.4 ? "#e9cf8f" : "#3a2a12") });
      else if (op.kind === "image") Object.assign(base, { src: op.src }, srcPx(op.srcPx));
      else throw new OpError(`Unknown artwork kind ${op.kind}.`);
      const placed = clampPlacement(design, base);
      return { ...design, nextId: id + 1, selected: id, side: placed.area === "back" ? "back" : "front", placements: [...design.placements, placed] };
    }
    case "select": {
      if (!design.placements.some(p => p.id === op.id)) throw new OpError("That artwork is not on the design.");
      return { ...design, selected: op.id };
    }
    case "remove": {
      const id = op.id ?? design.selected ?? design.placements.at(-1)?.id;
      if (id == null) throw new OpError("There is nothing to remove.");
      const placements = design.placements.filter(p => p.id !== id);
      return { ...design, placements, selected: placements.at(-1)?.id ?? null };
    }
    case "move":
      return updateSelected(design, p => ({ ...p, x: p.x + (op.dx || 0), y: p.y + (op.dy || 0) }));
    case "moveTo":
      return updateSelected(design, p => ({ ...p, x: op.x ?? p.x, y: op.y ?? p.y }));
    case "center":
      return updateSelected(design, p => ({ ...p, x: 0, y: op.vertical === false ? p.y : 0 }));
    case "scale":
      return updateSelected(design, p => ({ ...p, w: p.w * op.factor }));
    case "width":
      return updateSelected(design, p => ({ ...p, w: Number(op.value) }));
    case "fill":
      return updateSelected(design, p => ({ ...p, w: 999, x: 0, y: 0 }));
    case "rotate":
      return updateSelected(design, p => ({ ...p, rotate: (p.rotate || 0) + Number(op.deg) }));
    case "area": {
      if (!area(design, op.value)) throw new OpError(`A ${GARMENTS[design.garment].label.toLowerCase()} has no ${op.value} print area here.`);
      const next = updateSelected(design, p => ({ ...p, area: op.value, x: 0, y: 0 }));
      return { ...next, side: op.value === "back" ? "back" : "front" };
    }
    case "method": {
      if (!METHODS[op.value]) throw new OpError(`No decoration method called ${op.value}.`);
      return updateSelected(design, p => ({ ...p, method: op.value }));
    }
    case "inkColours": {
      const n = Math.round(Number(op.value));
      if (!(n >= 1 && n <= 12)) throw new OpError("A screen print uses between 1 and 12 colours.");
      return updateSelected(design, p => ({ ...p, colours: n }));
    }
    case "ink": {
      const hex = /^#[0-9a-f]{6}$/i.test(op.value) ? op.value : COLOURS[op.value];
      if (!hex) throw new OpError(`I don't know the colour ${op.value}.`);
      return updateSelected(design, p => {
        if (p.kind === "image") throw new OpError("An uploaded image keeps its own colours; ink colour applies to text and motifs.");
        return { ...p, ink: hex };
      });
    }
    case "text":
      return updateSelected(design, p => {
        if (p.kind !== "text") throw new OpError("The selected artwork is not text.");
        return { ...p, text: String(op.value).slice(0, 60) };
      });
    case "quantity": {
      const q = Math.round(Number(op.value));
      if (!(q >= 1 && q <= 1_000_000)) throw new OpError("Quantity should be a whole number of garments.");
      return { ...design, quantity: q, sizes: splitSizes(design.sizes, q) };
    }
    case "price": {
      const v = Number(op.value);
      if (!(v > 0 && v < 100000)) throw new OpError("The selling price should be a positive amount.");
      return { ...design, price: Math.round(v * 100) / 100 };
    }
    default:
      throw new OpError(`Unknown operation ${op.op}.`);
  }
}

/** Spread a new total over the sizes in the old proportions. */
export function splitSizes(old, total) {
  const sum = SIZES.reduce((s, k) => s + (old[k] || 0), 0) || 1;
  const raw = SIZES.map(k => ((old[k] || 0) / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return Object.fromEntries(SIZES.map((k, i) => [k, out[i]]));
}

/** Undo and redo over a stack of designs. */
export class History {
  constructor(design, limit = 200) {
    this.past = [];
    this.present = design;
    this.future = [];
    this.limit = limit;
  }
  apply(ops) {
    let next = this.present;
    for (const op of [].concat(ops)) next = applyOp(next, op);
    if (next === this.present) return next;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
    return next;
  }
  replace(design) {
    this.past.push(this.present);
    this.present = design;
    this.future = [];
    return design;
  }
  undo() {
    if (!this.past.length) return this.present;
    this.future.push(this.present);
    this.present = this.past.pop();
    return this.present;
  }
  redo() {
    if (!this.future.length) return this.present;
    this.past.push(this.present);
    this.present = this.future.pop();
    return this.present;
  }
}

const LIGHT_ALTERNATIVES = ["cream", "bone", "off white", "sand", "sage"];
const DARK_ALTERNATIVES = ["black", "navy", "burgundy", "forest green", "chocolate", "charcoal"];

/**
 * The garment colour for the first alternative: the opposite lightness
 * (light if the garment is dark, dark if light), so the artwork reads anew.
 *
 * With no stock list (no sheet, or a sheet that lists no colours) it is the
 * first catalogue colour of the fixed pool, as before. With a stock list for
 * the design's fabric it is a colour the factory keeps dyed:
 *   1. a stocked colour from the pool, in pool order;
 *   2. else another stocked colour of the opposite lightness, the most
 *      neutral first (low CIELAB chroma: the safest second colour), ties to
 *      the one furthest in lightness;
 *   3. else the stocked colour furthest from the current one (CIEDE2000),
 *      said so, as the sheet has nothing of the opposite lightness;
 *   4. else (the sheet stocks only this colour) the pool colour, marked as
 *      dyed to order.
 * Returns { name, hex, stocked, listed, note }.
 */
export function alternativeColour(design, sheet = null) {
  const dark = luminance(design.colour) < 0.4;
  const pool = dark ? LIGHT_ALTERNATIVES : DARK_ALTERNATIVES;
  const poolPick = pool.find(c => COLOURS[c] !== design.colour) ?? pool[0];
  const stock = sheet ? stockColours(sheet, design.fabric) : null;
  if (!stock) return { name: poolPick, hex: COLOURS[poolPick], stocked: true, listed: false, note: "" };
  const fabric = FABRICS[design.fabric]?.label?.toLowerCase() ?? design.fabric;
  const entries = Object.entries(stock).filter(([, hex]) => hex !== design.colour.toLowerCase());
  const opposite = entries.filter(([, hex]) => (luminance(hex) < 0.4) !== dark);
  const fromPool = pool.map(n => opposite.find(([name, hex]) => name === n || hex === COLOURS[n])).find(Boolean);
  if (fromPool) return { name: fromPool[0], hex: fromPool[1], stocked: true, listed: true, note: `Stocked in ${fabric} on your sheet.` };
  const here = labOfHex(design.colour);
  const chroma = hex => { const [, a, b] = labOfHex(hex); return Math.hypot(a, b); };
  const lift = hex => Math.abs(labOfHex(hex)[0] - here[0]);
  if (opposite.length) {
    const [name, hex] = [...opposite].sort((x, y) => (Math.round(chroma(x[1]) / 5) - Math.round(chroma(y[1]) / 5)) || lift(y[1]) - lift(x[1]))[0];
    return { name, hex, stocked: true, listed: true, note: `Stocked in ${fabric} on your sheet.` };
  }
  if (entries.length) {
    const [name, hex] = [...entries].sort((x, y) => ciede2000(here, labOfHex(y[1])) - ciede2000(here, labOfHex(x[1])))[0];
    return { name, hex, stocked: true, listed: true, note: `Your sheet stocks no ${dark ? "light" : "dark"} colour in ${fabric}; this is the stocked colour furthest from ${design.colourName}.` };
  }
  return { name: poolPick, hex: COLOURS[poolPick], stocked: false, listed: true, note: `Your sheet stocks no other colour in ${fabric}: ${poolPick} would be dyed to order (lab dip and a minimum dye lot).` };
}

/**
 * Three alternatives to compare side by side, each one change away from the
 * current design so the designer can say "the third one" and see why:
 *   1. a different garment colour (light if dark, dark if light), with ink
 *      flipped to stay readable; from the supplier sheet's stock colours
 *      for the fabric when the sheet lists them (`alternativeColour`);
 *   2. the artwork larger and higher (a statement piece), or smaller on the
 *      chest if it is already large;
 *   3. a different decoration: raised if flat, flat if raised.
 * With no artwork, 2 and 3 are another garment and another fabric; the
 * fabric alternative says when the sheet does not stock the colour in it.
 * Each alternative carries `stocked` (false when its garment colour would be
 * dyed to order on the sheet; true when stocked or there is no list).
 */
export function variants(design, { sheet = null } = {}) {
  const out = [];
  const stockedIn = (fabric, hex) => { const st = sheet ? stockColours(sheet, fabric) : null; return !st || Object.values(st).includes(String(hex).toLowerCase()); };
  const alt = alternativeColour(design, sheet);
  let v1 = applyOp(design, { op: "colour", value: alt.hex, name: alt.name });
  const lightGarment = luminance(alt.hex) >= 0.4;
  v1 = { ...v1, placements: v1.placements.map(p => (p.kind === "image" ? p : { ...p, ink: lightGarment ? "#2a1d0e" : "#e9cf8f" })) };
  out.push({ label: `${capital(alt.name)} garment`, why: `Same artwork on ${alt.name} instead of ${design.colourName}.${alt.note ? " " + alt.note : ""}`, design: v1, stocked: alt.stocked });

  if (design.placements.length) {
    const p = design.placements.find(q => q.id === design.selected) ?? design.placements.at(-1);
    const a = area(design, p.area);
    const big = p.w >= a.w * 0.6;
    const v2 = big
      ? applyOp(applyOp(applyOp(design, { op: "select", id: p.id }), { op: "area", value: "chest" in GARMENTS[design.garment].areas ? "chest" : p.area }), { op: "fill" })
      : applyOp(applyOp(design, { op: "select", id: p.id }), { op: "fill" });
    out.push({ label: big ? "Small on the chest" : "Full-size statement", why: big ? "The artwork moved to a left-chest placement: quieter, and cheaper to decorate." : "The artwork enlarged to fill the print area.", design: v2, stocked: stockedIn(v2.fabric, v2.colour) });

    const raised = ["high-density", "puff", "3d-puff-embroidery"].includes(p.method);
    const nextMethod = raised ? "dtg" : (p.kind === "image" ? "dtf" : "high-density");
    const v3 = applyOp(applyOp(design, { op: "select", id: p.id }), { op: "method", value: nextMethod });
    out.push({ label: METHODS[nextMethod].label, why: `${METHODS[p.method].label} changed to ${METHODS[nextMethod].label.toLowerCase()}. ${METHODS[nextMethod].note}`, design: v3, stocked: stockedIn(v3.fabric, v3.colour) });
  } else {
    const v2 = applyOp(design, { op: "garment", value: design.garment === "hoodie" ? "crewneck" : "hoodie" });
    out.push({ label: GARMENTS[v2.garment].label, why: `The same colour and fabric as a ${GARMENTS[v2.garment].label.toLowerCase()}.`, design: v2, stocked: stockedIn(v2.fabric, v2.colour) });
    const v3 = applyOp(design, { op: "fabric", value: design.fabric === "heavyweight-cotton" ? "organic-cotton" : "heavyweight-cotton" });
    const ok = stockedIn(v3.fabric, v3.colour);
    out.push({ label: FABRICS[v3.fabric].label, why: FABRICS[v3.fabric].note + (ok ? "" : ` Your sheet does not stock ${design.colourName} in ${FABRICS[v3.fabric].label.toLowerCase()}: dyed to order.`), design: v3, stocked: ok });
  }
  return out;
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

/** A design as a link-safe string (no uploaded images: they are too big for a URL). */
export function encodeDesign(design) {
  const lite = { ...design, placements: design.placements.map(p => (p.kind === "image" ? { ...p, src: null } : p)) };
  const json = JSON.stringify(lite);
  return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
}

export function decodeDesign(text) {
  const json = typeof atob === "function" ? decodeURIComponent(escape(atob(text))) : Buffer.from(text, "base64").toString("utf8");
  const raw = JSON.parse(json);
  return sanitizeDesign(raw);
}

/** Rebuild a design from untrusted JSON (a shared link, a saved file), keeping only known fields. */
export function sanitizeDesign(raw) {
  let d = newDesign();
  if (!raw || typeof raw !== "object") return d;
  const tryOp = op => { try { d = applyOp(d, op); } catch { /* skip a bad field */ } };
  if (typeof raw.name === "string") tryOp({ op: "name", value: raw.name });
  if (raw.garment) tryOp({ op: "garment", value: String(raw.garment) });
  if (raw.fabric) tryOp({ op: "fabric", value: String(raw.fabric) });
  if (raw.gsm) tryOp({ op: "gsm", value: raw.gsm });
  if (raw.colour) tryOp({ op: "colour", value: String(raw.colour), name: typeof raw.colourName === "string" ? raw.colourName.slice(0, 30) : undefined });
  if (raw.quantity) tryOp({ op: "quantity", value: raw.quantity });
  if (raw.sizes && typeof raw.sizes === "object") d = { ...d, sizes: Object.fromEntries(SIZES.map(k => [k, Math.max(0, Math.round(Number(raw.sizes[k]) || 0))])) };
  if (raw.price) tryOp({ op: "price", value: raw.price });
  for (const p of Array.isArray(raw.placements) ? raw.placements.slice(0, 20) : []) {
    if (!p || typeof p !== "object") continue;
    const kind = ["text", "motif", "image"].includes(p.kind) ? p.kind : null;
    if (!kind) continue;
    if (kind === "image" && !(typeof p.src === "string" && p.src.startsWith("data:image/"))) continue;
    tryOp({ op: "add", kind, area: String(p.area || "front"), text: p.text, motif: typeof p.motif === "string" ? p.motif : undefined,
      src: p.src, w: Number(p.w) || undefined, aspect: Number(p.aspect) || undefined, method: METHODS[p.method] ? p.method : undefined,
      ink: /^#[0-9a-f]{6}$/i.test(p.ink) ? p.ink : undefined, label: typeof p.label === "string" ? p.label.slice(0, 40) : undefined,
      colours: Number(p.colours) || undefined, srcPx: p.srcPx });
    tryOp({ op: "moveTo", x: Number(p.x) || 0, y: Number(p.y) || 0 });
    if (p.rotate) tryOp({ op: "rotate", deg: Number(p.rotate) || 0 });
  }
  if (raw.side === "back") d = { ...d, side: "back" };
  return d;
}
