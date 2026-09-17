// Deterministic product-feed checker: parse a Google Merchant Center / Meta
// Catalog style product feed (CSV, TSV, or JSON) and report exactly which
// items are missing a required attribute, carry a malformed one, or trip a
// documented disapproval trigger -- before Google's or Meta's own crawler
// finds it after the fact.
//
// No network call lives here -- this module only checks the feed data it is
// given, against the publicly documented product-data specification, so the
// identical logic runs in the browser page (pasted/loaded feed) and the Node
// CLI (a local file, usable as a CI gate before a feed is synced). See
// README.md for the specific, sourced disapproval reasons this is built
// against.
//
// Scope, stated plainly: this checks feed *data-specification* conformance --
// required fields present, formats valid, enums correct, GTIN checksums
// correct. It cannot and does not check Shopping/Catalog *policy* compliance
// (misrepresentation, prohibited products, business verification, landing-page
// price match) -- those require Google/Meta's own account-level review and
// are not observable from a feed file alone. See the "What this is not"
// section of README.md.

// --- Constants from the published spec (see README for sources) -----------

export const REQUIRED_CORE_FIELDS = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "availability",
  "price",
];

export const AVAILABILITY_VALUES = new Set([
  "in stock",
  "out of stock",
  "preorder",
  "backorder",
]);

export const CONDITION_VALUES = new Set(["new", "refurbished", "used"]);

export const ID_MAX_LENGTH = 50;
export const TITLE_MAX_LENGTH = 150;
export const DESCRIPTION_MAX_LENGTH = 5000;

// Phrases Google's and Meta's shopping-ads policies disallow in title/
// description as promotional or price-in-text content -- the "promotional
// text" disapproval reason. Matched case-insensitively as whole-ish phrases,
// not single common words, to keep false positives low.
export const PROMOTIONAL_PHRASES = [
  "free shipping",
  "% off",
  "percent off",
  "buy now",
  "buy 1 get 1",
  "bogo",
  "best price",
  "best seller",
  "lowest price",
  "limited time",
  "act now",
  "guaranteed",
  "clearance sale",
  "sale price",
  "won't last",
  "click here",
];

/**
 * Real, documented reasons Google Merchant Center / Meta Commerce Manager
 * disapprove product-feed items. Each is sourced in README.md. This is
 * context for why each check below exists, not a live feed of anything.
 */
export const KNOWN_DISAPPROVAL_REASONS = [
  {
    reason: "Missing or invalid unique product identifier (GTIN/MPN + brand)",
    checkedBy: "missing-identifier / invalid-gtin",
  },
  {
    reason: "Price or availability does not match what a shopper sees on the landing page",
    checkedBy: "price-format (format/positivity only -- this tool cannot fetch your landing page)",
  },
  {
    reason: "Promotional or price-related text in the title or description",
    checkedBy: "promotional-text",
  },
  {
    reason: "Missing required attribute (title, description, link, image_link, price, availability)",
    checkedBy: "missing-required",
  },
  {
    reason: "Duplicate item IDs across the feed",
    checkedBy: "duplicate-id",
  },
];

// --- GTIN checksum ----------------------------------------------------------

/**
 * GS1 GTIN check-digit algorithm (identical rule for GTIN-8/12/13/14 and
 * UPC-A): strip the check digit, weight the remaining digits 3/1 alternating
 * from the digit immediately left of the check digit, sum, and the check
 * digit is (10 - sum % 10) % 10. Verified against the canonical EAN-13
 * worked example in engine.test.mjs (4006381333931 -> check digit 1).
 */
export function gtinChecksumValid(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const checkDigit = Number(digits[digits.length - 1]);
  const payload = digits.slice(0, -1).split("").reverse();
  let sum = 0;
  payload.forEach((d, i) => {
    sum += Number(d) * (i % 2 === 0 ? 3 : 1);
  });
  const computed = (10 - (sum % 10)) % 10;
  return computed === checkDigit;
}

export function gtinLengthValid(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  return [8, 12, 13, 14].includes(digits.length);
}

// --- Field parsing / normalization -----------------------------------------

// Column-name aliases across Google's text-feed spec and Meta's Catalog CSV,
// which share the same core vocabulary with a few naming variants.
const FIELD_ALIASES = {
  id: ["id", "item_id", "sku", "retailer_id", "content_id"],
  title: ["title", "name", "item_title"],
  description: ["description", "item_description"],
  link: ["link", "url", "product_url"],
  image_link: ["image_link", "image_url", "imageurl", "image"],
  availability: ["availability", "stock_status"],
  price: ["price"],
  sale_price: ["sale_price", "saleprice"],
  sale_price_effective_date: ["sale_price_effective_date"],
  condition: ["condition", "item_condition"],
  brand: ["brand", "manufacturer"],
  gtin: ["gtin", "upc", "ean", "isbn"],
  mpn: ["mpn"],
  identifier_exists: ["identifier_exists"],
  google_product_category: ["google_product_category", "product_category", "product_type"],
};

function normalizeKey(key) {
  return String(key ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** Maps a raw record's keys (any casing/spacing) onto the known field names. */
function normalizeItem(raw) {
  const item = {};
  const rawKeys = Object.keys(raw).map((k) => [normalizeKey(k), k]);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const found = rawKeys.find(([norm]) => norm === alias);
      if (found && raw[found[1]] !== undefined && raw[found[1]] !== null && String(raw[found[1]]).trim() !== "") {
        item[field] = String(raw[found[1]]).trim();
        break;
      }
    }
  }
  return item;
}

function splitDelimitedLine(line, delimiter) {
  // Minimal quoted-field support: a field wrapped in double quotes may
  // contain the delimiter; "" inside a quoted field is a literal quote.
  // Documented limitation (see README): nested/escaped edge cases beyond
  // this are not handled -- use the JSON format for anything exotic.
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parses a feed given as JSON (array of objects, or {items:[...]} /
 * {entries:[...]}), CSV, or TSV text into normalized item records. Delimiter
 * is auto-detected for delimited text: tab if any header cell contains one,
 * else comma.
 */
export function parseFeed(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") || raw.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`not valid JSON (${err.message})`);
    }
    const list = Array.isArray(data) ? data : data.items || data.entries || data.products;
    if (!Array.isArray(list)) {
      throw new Error("expected a JSON array of feed items, or {items: [...]}");
    }
    return list.map(normalizeItem);
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitDelimitedLine(lines[0], delimiter);
  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    const raw = {};
    header.forEach((h, i) => {
      raw[h] = cells[i] ?? "";
    });
    return normalizeItem(raw);
  });
}

// --- Per-item checks ---------------------------------------------------

function isAbsoluteUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Google's spec: "NUMBER CURRENCY", e.g. "19.99 USD". Meta accepts the same
// shape. A bare number with no currency, or a currency symbol instead of an
// ISO code, is the most common formatting rejection.
const PRICE_RE = /^(\d+(?:\.\d{1,2})?)\s+([A-Z]{3})$/;

function parsePrice(value) {
  const m = PRICE_RE.exec(String(value ?? "").trim());
  if (!m) return null;
  return { amount: Number(m[1]), currency: m[2] };
}

function isAllCapsTitle(title) {
  const letters = title.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 10) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length > 0.85;
}

/**
 * Checks one normalized item. Returns { errors: [{code,message}],
 * warnings: [{code,message}] }. Errors are spec violations Google/Meta are
 * documented to reject or disapprove for; warnings are documented common
 * disapproval triggers this tool cannot verify with certainty from the feed
 * alone (see each message).
 */
export function checkItem(item) {
  const errors = [];
  const warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });

  for (const field of REQUIRED_CORE_FIELDS) {
    if (!item[field]) err("missing-required", `Missing required field "${field}".`);
  }

  if (item.id && item.id.length > ID_MAX_LENGTH) {
    err("id-too-long", `id is ${item.id.length} characters, over the ${ID_MAX_LENGTH}-character limit.`);
  }

  if (item.title) {
    if (item.title.length > TITLE_MAX_LENGTH) {
      err("title-too-long", `title is ${item.title.length} characters, over the ${TITLE_MAX_LENGTH}-character limit.`);
    }
    if (isAllCapsTitle(item.title)) {
      warn("title-all-caps", "title is mostly uppercase -- Google/Meta treat this as promotional formatting.");
    }
    const lowerTitle = item.title.toLowerCase();
    for (const phrase of PROMOTIONAL_PHRASES) {
      if (lowerTitle.includes(phrase)) {
        warn("promotional-text", `title contains "${phrase}", a documented promotional-text disapproval trigger.`);
        break;
      }
    }
  }

  if (item.description) {
    if (item.description.length > DESCRIPTION_MAX_LENGTH) {
      err(
        "description-too-long",
        `description is ${item.description.length} characters, over the ${DESCRIPTION_MAX_LENGTH}-character limit.`,
      );
    }
    if (item.description.length < 20) {
      warn("description-too-short", "description is under 20 characters -- likely too thin to describe the product.");
    }
    const lowerDesc = item.description.toLowerCase();
    for (const phrase of PROMOTIONAL_PHRASES) {
      if (lowerDesc.includes(phrase)) {
        warn("promotional-text", `description contains "${phrase}", a documented promotional-text disapproval trigger.`);
        break;
      }
    }
  }

  if (item.link && !isAbsoluteUrl(item.link)) {
    err("invalid-link", `link "${item.link}" is not a valid absolute http(s) URL.`);
  }
  if (item.image_link && !isAbsoluteUrl(item.image_link)) {
    err("invalid-image-link", `image_link "${item.image_link}" is not a valid absolute http(s) URL.`);
  }

  if (item.availability && !AVAILABILITY_VALUES.has(item.availability.toLowerCase())) {
    err(
      "invalid-availability",
      `availability "${item.availability}" is not one of: ${[...AVAILABILITY_VALUES].join(", ")}.`,
    );
  }

  let price = null;
  if (item.price) {
    price = parsePrice(item.price);
    if (!price) {
      err("invalid-price-format", `price "${item.price}" is not in the required "NUMBER CUR" format, e.g. "19.99 USD".`);
    } else if (price.amount <= 0) {
      err("non-positive-price", `price "${item.price}" must be greater than zero.`);
    }
  }

  if (item.sale_price) {
    const salePrice = parsePrice(item.sale_price);
    if (!salePrice) {
      err("invalid-sale-price-format", `sale_price "${item.sale_price}" is not in the required "NUMBER CUR" format.`);
    } else if (price) {
      if (salePrice.currency !== price.currency) {
        err("sale-price-currency-mismatch", `sale_price currency "${salePrice.currency}" does not match price currency "${price.currency}".`);
      } else if (salePrice.amount >= price.amount) {
        err("sale-price-not-lower", `sale_price (${salePrice.amount}) must be lower than price (${price.amount}).`);
      }
    }
  }

  if (item.condition && !CONDITION_VALUES.has(item.condition.toLowerCase())) {
    err("invalid-condition", `condition "${item.condition}" is not one of: ${[...CONDITION_VALUES].join(", ")}.`);
  }

  if (item.gtin) {
    if (!gtinLengthValid(item.gtin)) {
      err("invalid-gtin-length", `gtin "${item.gtin}" must be 8, 12, 13, or 14 digits.`);
    } else if (!gtinChecksumValid(item.gtin)) {
      err("invalid-gtin-checksum", `gtin "${item.gtin}" fails the GS1 check-digit calculation -- likely mistyped.`);
    }
  }

  const identifierExistsFalse = String(item.identifier_exists ?? "").toLowerCase() === "false" || String(item.identifier_exists ?? "").toLowerCase() === "no";
  const hasIdentifierPair = (item.brand && item.gtin) || (item.brand && item.mpn);
  if (!hasIdentifierPair && !identifierExistsFalse) {
    warn(
      "missing-identifier",
      'No brand+gtin or brand+mpn pair, and identifier_exists is not "false" -- "missing unique product identifier" is one of the most common disapproval reasons.',
    );
  }

  if (!item.google_product_category) {
    warn("missing-category", "google_product_category (or product_type) is missing -- recommended for correct placement and tax/shipping rules.");
  }

  return { errors, warnings };
}

/**
 * Checks a whole feed (array of normalized items): every item's own checks,
 * plus feed-level checks that need the full set (duplicate ids, an image
 * reused across many different items).
 */
export function checkFeed(items) {
  const perItem = items.map((item) => ({ item, ...checkItem(item) }));

  const idCounts = new Map();
  for (const item of items) {
    if (!item.id) continue;
    idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
  }
  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

  const imageCounts = new Map();
  for (const item of items) {
    if (!item.image_link) continue;
    if (!imageCounts.has(item.image_link)) imageCounts.set(item.image_link, new Set());
    if (item.id) imageCounts.get(item.image_link).add(item.id);
  }
  const reusedImages = [...imageCounts.entries()].filter(([, ids]) => ids.size > 4);

  const feedErrors = duplicateIds.map((id) => ({
    code: "duplicate-id",
    message: `id "${id}" appears more than once in the feed -- each item must have a unique id.`,
  }));
  const feedWarnings = reusedImages.map(([image, ids]) => ({
    code: "reused-image",
    message: `image_link "${image}" is reused across ${ids.size} different item ids -- possible placeholder or duplicate-content trigger.`,
  }));

  const totalErrors = perItem.reduce((n, r) => n + r.errors.length, 0) + feedErrors.length;
  const totalWarnings = perItem.reduce((n, r) => n + r.warnings.length, 0) + feedWarnings.length;
  const itemsWithErrors = perItem.filter((r) => r.errors.length > 0).length;

  return {
    items: perItem,
    feedErrors,
    feedWarnings,
    totalItems: items.length,
    itemsWithErrors,
    totalErrors,
    totalWarnings,
  };
}
