// JSON-LD rich-result validator and builder. Pure functions, no imports, no I/O.
// Extracts JSON-LD from pasted HTML or raw JSON, checks each entity against the
// required / recommended properties Google documents for its rich result, and
// builds starter JSON-LD for the common types. A linter for the markup you
// supplied: it does not fetch the page and cannot tell you what Google will show.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness", "Restaurant", "Store", "ProfessionalService", "LegalService", "Dentist", "Physician",
  "MedicalBusiness", "AutoRepair", "AutoDealer", "BeautySalon", "HairSalon", "HomeAndConstructionBusiness",
  "Plumber", "Electrician", "RoofingContractor", "GeneralContractor", "HVACBusiness", "Locksmith", "MovingCompany",
  "RealEstateAgent", "AccountingService", "FinancialService", "InsuranceAgency", "Hotel", "LodgingBusiness",
  "FoodEstablishment", "CafeOrCoffeeShop", "Bakery", "BarOrPub", "HealthClub", "DaySpa", "PetStore", "Florist",
]);
const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle"]);

export const SUPPORTED_TYPES = [
  "Article", "BreadcrumbList", "Event", "FAQPage", "JobPosting", "LocalBusiness", "Organization", "Product",
  "Recipe", "SoftwareApplication", "VideoObject",
];

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const typesOf = (n) => arr(n && n["@type"]).map(String);
const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const isUrl = (s) => typeof s === "string" && /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s.trim());
const getPath = (o, path) => path.split(".").reduce((a, k) => (a === undefined || a === null ? undefined : Array.isArray(a) ? a[0]?.[k] : a[k]), o);

export function extractJsonLd(input) {
  const text = String(input ?? "").trim();
  const blocks = [];
  const problems = [];
  if (!text) return { blocks, problems: [{ level: "error", path: "", message: "Nothing to check. Paste a page's HTML or a JSON-LD block." }] };
  if (/^[\[{]/.test(text)) {
    try { blocks.push(JSON.parse(text)); } catch (e) { problems.push({ level: "error", path: "", message: `Invalid JSON: ${e.message}. Google ignores a block that does not parse.` }); }
    return { blocks, problems };
  }
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(text))) {
    i += 1;
    const body = m[1].replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim();
    if (!body) { problems.push({ level: "error", path: `block ${i}`, message: "Empty JSON-LD script block." }); continue; }
    try { blocks.push(JSON.parse(body)); } catch (e) { problems.push({ level: "error", path: `block ${i}`, message: `Invalid JSON: ${e.message}. Google ignores a block that does not parse (check for trailing commas and unescaped quotes).` }); }
  }
  if (!i) problems.push({ level: "error", path: "", message: 'No <script type="application/ld+json"> block found. If you pasted raw JSON-LD, it must start with { or [.' });
  return { blocks, problems };
}

export function flattenEntities(blocks) {
  const out = [];
  const visit = (node, ctx) => {
    if (Array.isArray(node)) { node.forEach((n) => visit(n, ctx)); return; }
    if (!node || typeof node !== "object") return;
    const context = node["@context"] ?? ctx;
    if (Array.isArray(node["@graph"])) { node["@graph"].forEach((n) => visit(n, context)); return; }
    out.push({ node, context });
  };
  blocks.forEach((b) => visit(b, undefined));
  return out;
}

function need(f, node, path, level, why) {
  const v = getPath(node, path);
  if (blank(v)) { f.push({ level, path, message: `Missing ${level === "error" ? "required" : "recommended"} property "${path}"${why ? ` — ${why}` : ""}.` }); return false; }
  return true;
}
function date(f, node, path) {
  const v = getPath(node, path);
  if (!blank(v) && !(typeof v === "string" && ISO_DATE.test(v.trim()))) f.push({ level: "warning", path, message: `"${path}" should be ISO 8601 (for example 2026-03-01 or 2026-03-01T09:00:00-05:00); got ${JSON.stringify(v)}.` });
}
function duration(f, node, path) {
  const v = getPath(node, path);
  if (!blank(v) && !(typeof v === "string" && ISO_DURATION.test(v.trim()))) f.push({ level: "warning", path, message: `"${path}" should be an ISO 8601 duration such as PT30M or PT1H15M; got ${JSON.stringify(v)}.` });
}
function url(f, node, path, level = "warning") {
  for (const v of arr(getPath(node, path))) {
    const s = typeof v === "object" && v ? v.url ?? v["@id"] : v;
    if (typeof s === "string" && s && !isUrl(s)) f.push({ level, path, message: `"${path}" should be an absolute http(s) URL; got ${JSON.stringify(s)}.` });
  }
}

function offerChecks(f, offer, prefix, needPrice = true) {
  for (const o of arr(offer)) {
    if (!o || typeof o !== "object") continue;
    const has = (k) => !blank(o[k]);
    const price = o.price ?? o.lowPrice;
    if (needPrice) {
      if (blank(price)) f.push({ level: "error", path: `${prefix}.price`, message: `Offer is missing "price" (use 0 for free). Google needs a price for Product and SoftwareApplication rich results.` });
      else if (!/^\d+(\.\d+)?$/.test(String(price).trim())) f.push({ level: "error", path: `${prefix}.price`, message: `"price" must be a plain number with no currency symbol or thousands separator; got ${JSON.stringify(price)}.` });
    }
    if (!has("priceCurrency") && !has("priceSpecification")) f.push({ level: "error", path: `${prefix}.priceCurrency`, message: 'Offer is missing "priceCurrency" (a 3-letter ISO 4217 code such as USD).' });
    else if (has("priceCurrency") && !/^[A-Z]{3}$/.test(String(o.priceCurrency))) f.push({ level: "warning", path: `${prefix}.priceCurrency`, message: `"priceCurrency" should be an uppercase ISO 4217 code like USD; got ${JSON.stringify(o.priceCurrency)}.` });
    if (!has("availability")) f.push({ level: "warning", path: `${prefix}.availability`, message: 'Add "availability" (for example https://schema.org/InStock) so shopping surfaces can show stock.' });
    else if (!/^(https?:\/\/schema\.org\/)?(InStock|OutOfStock|PreOrder|BackOrder|SoldOut|LimitedAvailability|OnlineOnly|InStoreOnly|Discontinued|PreSale)$/.test(String(o.availability))) f.push({ level: "warning", path: `${prefix}.availability`, message: `"availability" is not a recognised schema.org ItemAvailability value: ${JSON.stringify(o.availability)}.` });
    if (has("priceValidUntil")) date(f, o, "priceValidUntil");
  }
}

const RULES = {
  Product(n, f) {
    need(f, n, "name", "error");
    const hasOne = ["offers", "review", "aggregateRating"].some((k) => !blank(n[k]));
    if (!hasOne) f.push({ level: "error", path: "offers", message: 'Product needs at least one of "offers", "review" or "aggregateRating" to qualify for a product rich result.' });
    offerChecks(f, n.offers, "offers");
    need(f, n, "image", "warning", "products with images are far more likely to be shown");
    need(f, n, "description", "warning");
    need(f, n, "brand", "warning");
    if (blank(n.sku) && blank(n.gtin) && blank(n.gtin13) && blank(n.gtin12) && blank(n.gtin8) && blank(n.mpn)) f.push({ level: "info", path: "sku", message: 'Add "sku", "gtin" or "mpn" so the product can be matched to merchant listings.' });
    const ar = n.aggregateRating;
    if (ar && typeof ar === "object") {
      need(f, ar, "ratingValue", "error"); if (blank(ar.ratingCount) && blank(ar.reviewCount)) f.push({ level: "error", path: "aggregateRating.ratingCount", message: 'aggregateRating needs "ratingCount" or "reviewCount".' });
    }
    url(f, n, "url");
  },
  Article(n, f) {
    need(f, n, "headline", "warning", "keep it under about 110 characters");
    if (typeof n.headline === "string" && n.headline.length > 110) f.push({ level: "warning", path: "headline", message: `"headline" is ${n.headline.length} characters; Google recommends staying under about 110.` });
    need(f, n, "image", "warning", "Google recommends several aspect ratios (16x9, 4x3, 1x1)");
    need(f, n, "datePublished", "warning"); date(f, n, "datePublished"); date(f, n, "dateModified");
    if (blank(n.dateModified)) f.push({ level: "info", path: "dateModified", message: 'Add "dateModified" when the article is updated.' });
    if (need(f, n, "author", "warning")) {
      for (const a of arr(n.author)) {
        if (typeof a === "string") f.push({ level: "warning", path: "author", message: 'Use an object ({"@type":"Person","name":"…"}) for "author", not a plain string.' });
        else if (blank(a.name)) f.push({ level: "warning", path: "author.name", message: 'Author is missing "name".' });
      }
    }
    url(f, n, "mainEntityOfPage");
  },
  LocalBusiness(n, f) {
    need(f, n, "name", "error");
    if (need(f, n, "address", "error", "a PostalAddress")) {
      const a = Array.isArray(n.address) ? n.address[0] : n.address;
      if (typeof a === "string") f.push({ level: "warning", path: "address", message: 'Use a PostalAddress object (streetAddress, addressLocality, addressRegion, postalCode, addressCountry), not a plain string.' });
      else if (a && typeof a === "object") for (const k of ["streetAddress", "addressLocality", "postalCode", "addressCountry"]) if (blank(a[k])) f.push({ level: "warning", path: `address.${k}`, message: `Address is missing "${k}".` });
    }
    need(f, n, "telephone", "warning");
    need(f, n, "url", "warning"); url(f, n, "url");
    if (blank(n.openingHoursSpecification) && blank(n.openingHours)) f.push({ level: "warning", path: "openingHoursSpecification", message: 'Add "openingHoursSpecification" so hours can appear in search.' });
    need(f, n, "geo", "info"); need(f, n, "image", "warning");
    if (blank(n.priceRange)) f.push({ level: "info", path: "priceRange", message: 'Add "priceRange" (for example $$) if it applies.' });
    if (blank(n.sameAs)) f.push({ level: "info", path: "sameAs", message: 'Add "sameAs" links to profiles that identify the business.' });
  },
  Organization(n, f) {
    need(f, n, "name", "warning"); need(f, n, "url", "warning"); url(f, n, "url");
    need(f, n, "logo", "warning", "an image URL at least 112×112 px"); url(f, n, "logo");
    if (blank(n.sameAs)) f.push({ level: "info", path: "sameAs", message: 'Add "sameAs" links to official profiles.' });
    if (blank(n.contactPoint)) f.push({ level: "info", path: "contactPoint", message: 'Add "contactPoint" if you want a support contact understood.' });
  },
  Recipe(n, f) {
    need(f, n, "name", "error"); need(f, n, "image", "error");
    for (const k of ["author", "datePublished", "description", "recipeIngredient", "recipeInstructions", "recipeYield", "aggregateRating", "video"]) need(f, n, k, "warning");
    if (blank(n.cookTime) && blank(n.totalTime)) f.push({ level: "warning", path: "totalTime", message: 'Add "cookTime" or "totalTime".' });
    for (const k of ["prepTime", "cookTime", "totalTime"]) duration(f, n, k);
    date(f, n, "datePublished");
    if (blank(getPath(n, "nutrition.calories"))) f.push({ level: "info", path: "nutrition.calories", message: 'Add "nutrition.calories" (for example "270 calories").' });
  },
  Event(n, f) {
    need(f, n, "name", "error"); need(f, n, "startDate", "error"); date(f, n, "startDate"); date(f, n, "endDate");
    const loc = n.location;
    if (blank(loc)) f.push({ level: "error", path: "location", message: 'Missing required property "location" (a Place with name and address, or a VirtualLocation with url).' });
    else for (const l of arr(loc)) {
      const t = typesOf(l);
      if (t.includes("VirtualLocation")) { if (blank(l.url)) f.push({ level: "error", path: "location.url", message: "VirtualLocation needs a url." }); }
      else { if (blank(l.name)) f.push({ level: "error", path: "location.name", message: 'Place is missing "name".' }); if (blank(l.address)) f.push({ level: "error", path: "location.address", message: 'Place is missing "address".' }); }
    }
    for (const k of ["description", "endDate", "image", "offers", "organizer", "performer"]) need(f, n, k, "warning");
    if (blank(n.eventStatus)) f.push({ level: "info", path: "eventStatus", message: 'Add "eventStatus" (EventScheduled, EventCancelled, EventPostponed, EventRescheduled or EventMovedOnline).' });
    if (blank(n.eventAttendanceMode)) f.push({ level: "info", path: "eventAttendanceMode", message: 'Add "eventAttendanceMode" (Offline, Online or Mixed).' });
    if (!blank(n.offers)) offerChecks(f, n.offers, "offers", false);
  },
  JobPosting(n, f) {
    need(f, n, "title", "error"); need(f, n, "description", "error", "full HTML description of the job");
    need(f, n, "datePosted", "error"); date(f, n, "datePosted"); need(f, n, "hiringOrganization", "error");
    if (blank(n.jobLocation) && n.jobLocationType !== "TELECOMMUTE") f.push({ level: "error", path: "jobLocation", message: 'Missing "jobLocation" (or set jobLocationType to TELECOMMUTE with applicantLocationRequirements).' });
    if (n.jobLocationType === "TELECOMMUTE" && blank(n.applicantLocationRequirements)) f.push({ level: "error", path: "applicantLocationRequirements", message: 'Remote jobs need "applicantLocationRequirements".' });
    if (blank(n.validThrough)) f.push({ level: "warning", path: "validThrough", message: 'Add "validThrough" so expired jobs drop out of results.' }); else date(f, n, "validThrough");
    need(f, n, "employmentType", "warning");
    if (blank(n.baseSalary)) f.push({ level: "warning", path: "baseSalary", message: 'Add "baseSalary" with currency, value and unitText; job listings with pay are shown more prominently and some jurisdictions require pay transparency.' });
    if (blank(n.directApply)) f.push({ level: "info", path: "directApply", message: 'Set "directApply" to true if applicants can apply on your page.' });
  },
  FAQPage(n, f) {
    const items = arr(n.mainEntity);
    if (!items.length) { f.push({ level: "error", path: "mainEntity", message: 'FAQPage needs "mainEntity": a list of Question objects.' }); return; }
    items.forEach((q, i) => {
      if (!typesOf(q).includes("Question")) f.push({ level: "error", path: `mainEntity[${i}]`, message: 'Each mainEntity item must have "@type": "Question".' });
      if (blank(q.name)) f.push({ level: "error", path: `mainEntity[${i}].name`, message: "Question is missing its text in \"name\"." });
      const ans = arr(q.acceptedAnswer)[0];
      if (!ans || blank(ans.text)) f.push({ level: "error", path: `mainEntity[${i}].acceptedAnswer.text`, message: "Question is missing acceptedAnswer.text." });
      else if (!typesOf(ans).includes("Answer")) f.push({ level: "warning", path: `mainEntity[${i}].acceptedAnswer`, message: 'acceptedAnswer should have "@type": "Answer".' });
    });
    f.push({ level: "info", path: "", message: "Since August 2023 Google shows FAQ rich results only for well-known government and health sites. The markup is still valid and other engines and assistants read it, but do not expect expandable answers in Google for an ordinary site." });
  },
  BreadcrumbList(n, f) {
    const items = arr(n.itemListElement);
    if (!items.length) { f.push({ level: "error", path: "itemListElement", message: 'BreadcrumbList needs "itemListElement".' }); return; }
    items.forEach((it, i) => {
      if (blank(it.position)) f.push({ level: "error", path: `itemListElement[${i}].position`, message: 'ListItem is missing "position" (1, 2, 3 …).' });
      else if (Number(it.position) !== i + 1) f.push({ level: "warning", path: `itemListElement[${i}].position`, message: `Positions should run 1, 2, 3 in order; item ${i + 1} has position ${it.position}.` });
      const nm = it.name ?? (it.item && typeof it.item === "object" ? it.item.name : undefined);
      if (blank(nm)) f.push({ level: "error", path: `itemListElement[${i}].name`, message: 'ListItem is missing "name".' });
      if (i < items.length - 1 && blank(it.item)) f.push({ level: "error", path: `itemListElement[${i}].item`, message: 'All items except the last need an "item" URL.' });
      const href = typeof it.item === "string" ? it.item : it.item?.["@id"];
      if (href && !isUrl(href)) f.push({ level: "warning", path: `itemListElement[${i}].item`, message: `"item" should be an absolute URL; got ${JSON.stringify(href)}.` });
    });
  },
  SoftwareApplication(n, f) {
    need(f, n, "name", "error");
    const hasOne = ["offers", "aggregateRating", "review"].some((k) => !blank(n[k]));
    if (!hasOne) f.push({ level: "error", path: "offers", message: 'Needs "offers" (price, 0 if free) or "aggregateRating" / "review" to qualify.' });
    offerChecks(f, n.offers, "offers"); need(f, n, "applicationCategory", "warning"); need(f, n, "operatingSystem", "warning");
    if (n.aggregateRating) { need(f, n.aggregateRating, "ratingValue", "error"); if (blank(n.aggregateRating.ratingCount) && blank(n.aggregateRating.reviewCount)) f.push({ level: "error", path: "aggregateRating.ratingCount", message: 'aggregateRating needs "ratingCount" or "reviewCount".' }); }
  },
  VideoObject(n, f) {
    need(f, n, "name", "error"); need(f, n, "thumbnailUrl", "error"); need(f, n, "uploadDate", "error"); date(f, n, "uploadDate");
    need(f, n, "description", "warning");
    if (blank(n.contentUrl) && blank(n.embedUrl)) f.push({ level: "warning", path: "contentUrl", message: 'Add "contentUrl" or "embedUrl" so Google can find the video file.' });
    duration(f, n, "duration"); url(f, n, "thumbnailUrl");
  },
};

function ruleFor(types) {
  for (const t of types) {
    if (LOCAL_BUSINESS_TYPES.has(t)) return "LocalBusiness";
    if (ARTICLE_TYPES.has(t)) return "Article";
    if (RULES[t]) return t;
  }
  return null;
}

export function validate(input) {
  const { blocks, problems } = extractJsonLd(input);
  const entities = flattenEntities(blocks);
  const results = [];
  for (const { node, context } of entities) {
    const types = typesOf(node);
    const f = [];
    if (!types.length) {
      if (Object.keys(node).length) f.push({ level: "error", path: "@type", message: 'Entity has no "@type", so it describes nothing Google can use.' });
    } else {
      const ctx = JSON.stringify(context ?? "");
      if (!context) f.push({ level: "error", path: "@context", message: 'Missing "@context": "https://schema.org".' });
      else if (!/schema\.org/.test(ctx)) f.push({ level: "error", path: "@context", message: `"@context" should be https://schema.org; got ${ctx}.` });
      else if (/http:\/\/schema\.org/.test(ctx)) f.push({ level: "info", path: "@context", message: 'Use "https://schema.org" (https) rather than http.' });
      const rule = ruleFor(types);
      if (rule) RULES[rule](node, f);
      else f.push({ level: "info", path: "@type", message: `"${types.join(", ")}" has no Google rich result checked by this tool. It may still be valid schema.org markup.` });
    }
    const errors = f.filter((x) => x.level === "error").length;
    const warnings = f.filter((x) => x.level === "warning").length;
    results.push({ types, name: typeof node.name === "string" ? node.name : typeof node.headline === "string" ? node.headline : typeof node.title === "string" ? node.title : "", findings: f, errors, warnings, eligible: Boolean(types.length && ruleFor(types)) && errors === 0 });
  }
  const parseErrors = problems.filter((p) => p.level === "error").length;
  return {
    blocks: blocks.length, problems, entities: results,
    errors: parseErrors + results.reduce((a, r) => a + r.errors, 0),
    warnings: results.reduce((a, r) => a + r.warnings, 0),
  };
}

export function reportCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["entity", "level", "path", "message"]];
  for (const p of res.problems) rows.push(["(input)", p.level, p.path, p.message]);
  for (const e of res.entities) for (const x of e.findings) rows.push([e.types.join("/") + (e.name ? ` ${e.name}` : ""), x.level, x.path, x.message]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

const ctx = "https://schema.org";
const clean = (o) => {
  if (Array.isArray(o)) return o.map(clean).filter((v) => !blank(v));
  if (o && typeof o === "object") { const r = {}; for (const [k, v] of Object.entries(o)) { const c = clean(v); if (!blank(c) && !(typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0)) r[k] = c; } return r; }
  return typeof o === "string" ? o.trim() : o;
};
const lines = (s) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

// Builders take plain form strings and return a JSON-LD object (not a string).
export const BUILDERS = {
  FAQPage(f) {
    const qa = lines(f.qa).map((l) => l.split("|")).filter((p) => p.length >= 2 && p[0].trim() && p.slice(1).join("|").trim());
    return clean({ "@context": ctx, "@type": "FAQPage", mainEntity: qa.map(([q, ...a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.join("|") } })) });
  },
  Product(f) {
    return clean({ "@context": ctx, "@type": "Product", name: f.name, image: lines(f.image), description: f.description, sku: f.sku, brand: f.brand ? { "@type": "Brand", name: f.brand } : undefined,
      offers: f.price !== undefined && String(f.price).trim() !== "" ? { "@type": "Offer", url: f.url, price: String(f.price).trim(), priceCurrency: (f.currency || "USD").toUpperCase(), availability: `https://schema.org/${f.availability || "InStock"}`, itemCondition: "https://schema.org/NewCondition" } : undefined });
  },
  LocalBusiness(f) {
    return clean({ "@context": ctx, "@type": f.subtype || "LocalBusiness", name: f.name, url: f.url, telephone: f.phone, image: lines(f.image), priceRange: f.priceRange,
      address: { "@type": "PostalAddress", streetAddress: f.street, addressLocality: f.city, addressRegion: f.region, postalCode: f.postal, addressCountry: f.country },
      geo: f.lat && f.lng ? { "@type": "GeoCoordinates", latitude: Number(f.lat), longitude: Number(f.lng) } : undefined,
      openingHours: lines(f.hours), sameAs: lines(f.sameAs) });
  },
  Article(f) {
    return clean({ "@context": ctx, "@type": f.subtype || "Article", headline: f.headline, image: lines(f.image), datePublished: f.published, dateModified: f.modified || f.published,
      author: f.author ? { "@type": "Person", name: f.author, url: f.authorUrl } : undefined, publisher: f.publisher ? { "@type": "Organization", name: f.publisher, logo: f.logo ? { "@type": "ImageObject", url: f.logo } : undefined } : undefined,
      mainEntityOfPage: f.url ? { "@type": "WebPage", "@id": f.url } : undefined });
  },
  BreadcrumbList(f) {
    const items = lines(f.trail).map((l) => l.split("|")).map(([name, href]) => ({ name: (name || "").trim(), href: (href || "").trim() })).filter((x) => x.name);
    return clean({ "@context": ctx, "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: i < items.length - 1 || it.href ? it.href || undefined : undefined })) });
  },
};

export function build(type, fields) {
  const fn = BUILDERS[type];
  if (!fn) return { error: `No builder for ${type}.` };
  const json = fn(fields || {});
  const text = JSON.stringify(json, null, 2);
  return { json, text, script: `<script type="application/ld+json">\n${text.replace(/</g, "\\u003c")}\n</script>`, check: validate(text) };
}
