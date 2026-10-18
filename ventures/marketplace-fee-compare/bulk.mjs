// Bulk mode: compare a whole catalogue, one row per item, in the browser.
//
// A seller with 200 SKUs does not retype 200 items. This reads a pasted CSV or
// spreadsheet selection, runs each item through the same `compareChannels`
// model the single-item page uses (so the two cannot disagree), and answers the
// catalogue-level question: which channel wins how many items, and what does
// listing everything on one habitual channel leave on the table?
//
// Pure functions only. Nothing here touches the DOM, storage or network.
import { CATEGORY_PRESETS, CHANNELS, compareChannels, loadItem } from "./calc.mjs";

export const MAX_ROWS = 500;

// Header spellings accepted for each field, matched after lower-casing and
// stripping everything that is not a letter or digit.
const ALIASES = {
  name: ["name", "title", "sku", "item", "product", "description"],
  price: ["price", "listprice", "saleprice", "sellingprice"],
  itemCost: ["cost", "itemcost", "cogs", "landedcost", "unitcost"],
  shippingCharged: ["shippingcharged", "shippingpaidbybuyer", "buyershipping", "shipcharged"],
  shippingCost: ["shippingcost", "postage", "shipcost", "yourshipping"],
  otherCost: ["othercost", "packaging", "othercosts", "supplies"],
  monthlyOrders: ["monthlyorders", "orders", "ordersmonth", "unitspermonth", "volume"],
  categoryId: ["category", "categoryid", "cat"],
};

const norm = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Split one CSV/TSV record, honouring double-quoted fields and "" escapes. */
function splitLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

// Accept a category by id or by its visible label ("Jewelry", "Home & kitchen").
function resolveCategory(raw) {
  if (!raw) return "everything_else";
  const key = norm(raw);
  for (const [id, preset] of Object.entries(CATEGORY_PRESETS)) {
    if (norm(id) === key || norm(preset.label) === key) return id;
  }
  return null;
}

/** "$1,234.50" -> 1234.5. Empty stays empty so `loadItem` applies its default. */
function money(raw) {
  if (raw === undefined || raw === "") return "";
  return String(raw).replace(/[$,\s]/g, "");
}

/**
 * Parse pasted catalogue text. Returns `{ items, errors }`: rows that fail are
 * reported with their line number and skipped, so one bad row never hides the
 * other 199. Needs a header row naming at least `price` and `cost`.
 */
export function parseCatalog(text) {
  const errors = [];
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { items: [], errors: ["Paste a header row and at least one item."] };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitLine(lines[0], delimiter).map(norm);
  const column = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const at = header.findIndex((h) => names.includes(h));
    if (at !== -1) column[field] = at;
  }
  if (column.price === undefined || column.itemCost === undefined) {
    return {
      items: [],
      errors: ['The first row must be a header naming at least a "price" column and a "cost" column.'],
    };
  }
  const items = [];
  const body = lines.slice(1);
  if (body.length > MAX_ROWS) {
    errors.push(`Only the first ${MAX_ROWS} of ${body.length} rows were read.`);
  }
  body.slice(0, MAX_ROWS).forEach((line, index) => {
    const lineNo = index + 2;
    const cells = splitLine(line, delimiter);
    const get = (field) => (column[field] === undefined ? "" : cells[column[field]] ?? "");
    try {
      const categoryId = resolveCategory(get("categoryId"));
      if (categoryId === null) throw new Error(`Unknown category "${get("categoryId")}"`);
      const item = loadItem({
        price: money(get("price")),
        itemCost: money(get("itemCost")),
        shippingCharged: money(get("shippingCharged")),
        shippingCost: money(get("shippingCost")),
        otherCost: money(get("otherCost")),
        monthlyOrders: money(get("monthlyOrders")),
        categoryId,
      });
      if (!(item.price > 0)) throw new Error("Price must be above zero");
      items.push({ name: get("name") || `Row ${lineNo}`, line: lineNo, item });
    } catch (error) {
      errors.push(`Line ${lineNo}: ${error.message}`);
    }
  });
  return { items, errors };
}

/**
 * Compare every item. `baselineId` is the channel the seller lists on today
 * out of habit; the summary reports what moving each item to its best
 * buyer-bringing channel would change versus that.
 *
 * Own-store is never "the best channel": it sends no buyers (see calc.mjs), so
 * the winner is the best channel with `demandIncluded`, and the own-store
 * figure stays visible as a row value rather than a recommendation.
 */
export function compareCatalog(entries, baselineId = "ebay", overrides = {}) {
  if (!CHANNELS.some((c) => c.id === baselineId)) {
    throw new Error(`Unknown baseline channel: ${baselineId}`);
  }
  const rows = entries.map(({ name, line, item }) => {
    const ranked = compareChannels(item, overrides);
    const buyers = ranked.filter((r) => r.demandIncluded);
    const best = buyers[0];
    const base = ranked.find((r) => r.id === baselineId);
    const gain = best.profit - base.profit;
    return {
      name,
      line,
      item,
      bestId: best.id,
      bestLabel: best.label,
      bestProfit: best.profit,
      baselineProfit: base.profit,
      // A gain under 50 cents is inside the noise of a guessed category rate.
      gain: gain < 0.005 ? 0 : gain,
      moves: best.id !== baselineId && gain >= 0.5,
      losesMoney: best.profit <= 0,
      profits: Object.fromEntries(ranked.map((r) => [r.id, r.profit])),
    };
  });
  const wins = {};
  for (const row of rows) {
    const chosen = row.moves ? row.bestId : baselineId;
    wins[chosen] = (wins[chosen] || 0) + 1;
  }
  const weighted = (fn) => rows.reduce((sum, r) => sum + fn(r) * r.item.monthlyOrders, 0);
  return {
    rows,
    wins,
    baselineId,
    movedCount: rows.filter((r) => r.moves).length,
    unprofitableCount: rows.filter((r) => r.losesMoney).length,
    // Per month, assuming each item's own orders/month all move with it.
    monthlyGain: weighted((r) => (r.moves ? r.gain : 0)),
  };
}

// A cell starting with = + - @ is read as a formula by spreadsheet apps.
const safeCell = (value) => {
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/** CSV of the result, formula-safe, for pasting back into the seller's sheet. */
export function catalogCsv(result) {
  const head = ["name", "best_channel", "best_profit", "baseline_profit", "gain_per_sale", "move"];
  const lines = result.rows.map((r) =>
    [r.name, r.bestLabel, r.bestProfit.toFixed(2), r.baselineProfit.toFixed(2), r.gain.toFixed(2), r.moves ? "yes" : "no"]
      .map(safeCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export const SAMPLE_CATALOG = `name,price,cost,shipping_cost,category,orders
Vintage denim jacket,64,18,9,Clothing & accessories,6
Silver stacking ring set,28,5,3,Jewelry,40
USB-C hub 7-port,39,14,5,Electronics,25
Cast iron skillet 10in,45,12,11,Home & kitchen,8
Retro handheld console,89,41,6,Toys & games,12`;
