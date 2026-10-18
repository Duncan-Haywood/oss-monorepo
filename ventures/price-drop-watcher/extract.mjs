// Pull price, currency and stock status out of a product page's HTML, and decide
// what changed between two readings. Pure functions: no network, no storage.
// Shared by the browser page and watch.mjs.

const AVAIL = [
  [/outofstock|soldout|discontinued/i, "out_of_stock"],
  [/instock|limitedavailability|onlineonly|instoreonly/i, "in_stock"],
  [/preorder|presale|backorder/i, "preorder"],
];

export function normaliseAvailability(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\s_-]/g, "");
  for (const [re, name] of AVAIL) if (re.test(s)) return name;
  return null;
}

// "$1,299.00", "1.299,00 €", "1 299,50", "12.5", 12.5 -> number or null.
export function parsePrice(v) {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (v == null) return null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("");
    if (dec === ",") s = s.replace(",", ".");
  } else if (lastComma >= 0) {
    // 1,299 is thousands; 12,50 is a decimal comma.
    s = /,\d{3}$/.test(s) && s.split(",").length >= 2 && !/^0,/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR" };
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

function walk(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  if (!node || typeof node !== "object") return;
  const type = [].concat(node["@type"] || []);
  if (type.includes("Product")) out.push(node);
  for (const k of Object.keys(node)) if (typeof node[k] === "object") walk(node[k], out);
}

function fromJsonLd(html) {
  const products = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), products); } catch { /* malformed block: skip it */ }
  }
  for (const p of products) {
    const offers = [].concat(p.offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
    const priced = offers.map((o) => ({
      price: parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price),
      currency: o.priceCurrency || o.priceSpecification?.priceCurrency || null,
      availability: normaliseAvailability(o.availability),
    })).filter((o) => o.price != null);
    if (priced.length) {
      priced.sort((a, b) => a.price - b.price);
      const stocked = priced.find((o) => o.availability === "in_stock") || priced[0];
      return { title: p.name ? decode(p.name) : null, ...stocked, source: "json-ld" };
    }
  }
  return null;
}

function metaContent(html, names) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*>`, "i");
    const tag = re.exec(html);
    const c = tag && /content=["']([^"']*)["']/i.exec(tag[0]);
    if (c) return decode(c[1]);
  }
  return null;
}

function fromMeta(html) {
  const price = parsePrice(metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1", "price"]));
  if (price == null) return null;
  return {
    title: metaContent(html, ["og:title"]), price,
    currency: metaContent(html, ["product:price:currency", "og:price:currency"]),
    availability: normaliseAvailability(metaContent(html, ["product:availability", "og:availability"])),
    source: "meta",
  };
}

function fromMicrodata(html) {
  const price = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html) || /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i.exec(html);
  const p = price && parsePrice(price[1]);
  if (p == null) return null;
  const cur = /itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const av = /(?:itemprop=["']availability["'][^>]*(?:href|content)=["']([^"']+)["'])|(?:(?:href|content)=["']([^"']+)["'][^>]*itemprop=["']availability["'])/i.exec(html);
  return { title: null, price: p, currency: cur ? cur[1] : null, availability: av ? normaliseAvailability(av[1] || av[2]) : null, source: "microdata" };
}

// A user rule beats guessing: `priceRegex` has one capture group for the number.
export function extractProduct(html, rule = {}) {
  const page = String(html || "");
  if (!page.trim()) return { ok: false, error: "The page was empty." };
  let found = null;
  if (rule.priceRegex) {
    let re;
    try { re = new RegExp(rule.priceRegex, "i"); } catch (e) { return { ok: false, error: `priceRegex is not a valid expression: ${e.message}` }; }
    const m = re.exec(page);
    const price = m && parsePrice(m[1] ?? m[0]);
    if (price == null) return { ok: false, error: "priceRegex did not match a price on this page." };
    found = { title: metaContent(page, ["og:title"]), price, currency: rule.currency || null, availability: null, source: "regex" };
    const base = fromJsonLd(page) || fromMeta(page) || fromMicrodata(page);
    if (base) { found.availability = base.availability; found.currency = found.currency || base.currency; found.title = found.title || base.title; }
  } else {
    found = fromJsonLd(page) || fromMeta(page) || fromMicrodata(page);
  }
  if (!found) return { ok: false, error: "No machine-readable price found. Add a priceRegex for this page." };
  if (rule.stockRegex) {
    try { found.availability = new RegExp(rule.stockRegex, "i").test(page) ? "in_stock" : "out_of_stock"; } catch (e) { return { ok: false, error: `stockRegex is not a valid expression: ${e.message}` }; }
  }
  if (!found.currency) { const sym = /([$€£¥₹])\s?\d/.exec(page); found.currency = sym ? SYMBOLS[sym[1]] : null; }
  if (!found.title) { const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page); found.title = t ? decode(t[1]).trim().replace(/\s+/g, " ") : null; }
  return { ok: true, ...found };
}

// prev: last stored reading or null. cur: new reading. rule: { targetPrice, minDropPercent, alertOnRise }
export function diffReading(prev, cur, rule = {}) {
  const events = [];
  const min = rule.minDropPercent ?? 0;
  if (!prev) return { events: [{ type: "first_reading", text: `Now watching at ${money(cur)}` }], target: false };
  if (prev.price != null && cur.price != null && prev.price !== cur.price) {
    const pct = ((prev.price - cur.price) / prev.price) * 100;
    if (pct > 0 && pct >= min) events.push({ type: "price_drop", text: `Price fell ${prev.price} -> ${cur.price} (${pct.toFixed(1)}% off)`, pct });
    if (pct < 0 && rule.alertOnRise) events.push({ type: "price_rise", text: `Price rose ${prev.price} -> ${cur.price} (${(-pct).toFixed(1)}% up)`, pct });
  }
  if (prev.availability && cur.availability && prev.availability !== cur.availability) {
    if (cur.availability === "in_stock") events.push({ type: "back_in_stock", text: "Back in stock" });
    else if (cur.availability === "out_of_stock") events.push({ type: "out_of_stock", text: "Went out of stock" });
  }
  const hit = rule.targetPrice != null && cur.price != null && cur.price <= rule.targetPrice;
  const wasHit = rule.targetPrice != null && prev.price != null && prev.price <= rule.targetPrice;
  if (hit && !wasHit) events.push({ type: "target_hit", text: `At or below your target of ${rule.targetPrice}: now ${cur.price}` });
  return { events, target: hit };
}

export function money(r) { return r.price == null ? "no price" : `${r.currency ? r.currency + " " : ""}${r.price}`; }

// Minimal robots.txt check (User-agent groups, Allow/Disallow, * and $). Longest match wins.
export function robotsAllows(robotsTxt, path, agent = "price-drop-watcher") {
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(robotsTxt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === "user-agent") { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(m[2].toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push([k, m[2]]);
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const use = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const g of use) for (const [kind, pat] of g.rules) {
    if (!pat) continue;
    const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || pat.length > best.len || (pat.length === best.len && kind === "allow"))) best = { len: pat.length, kind };
  }
  return !best || best.kind === "allow";
}

export const SAMPLE_HTML = `<html><head><title>Trail Runner 2 | Fell &amp; Co</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Trail Runner 2","offers":{"@type":"Offer","price":"129.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>
</head><body>Trail Runner 2</body></html>`;
