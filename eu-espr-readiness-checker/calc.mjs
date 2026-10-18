// EU Ecodesign for Sustainable Products Regulation (ESPR, Regulation (EU) 2024/1781) first read for
// sellers of consumer goods: (1) the ban on destroying unsold apparel, clothing accessories and
// footwear and the public disclosure of discarded unsold goods, (2) whether the product is on the
// Commission's Digital Product Passport (DPP) path and what data to start collecting, and (3) a
// draft of the annual disclosure table from your own unsold-stock numbers. Pure functions, no I/O;
// `now` is a parameter so every answer is repeatable. Bad input is rejected with a message, never
// clamped. Article numbers, dates and the product working plan were written from memory of the
// published text without network access in the building session; verify them against CELEX
// 32024R1781, the Commission's ESPR working plan and the delegated acts before quoting them.

export const BAN_LARGE = "2026-07-19";
export const BAN_MEDIUM = "2030-07-19";

export const ROLES = {
  manufacturer: "Brand owner or manufacturer placing goods on the EU market",
  importer: "Importer bringing goods into the EU",
  retailer: "Retailer or distributor selling goods made by others",
  marketplace: "Online marketplace or platform hosting other sellers",
};

export const SIZES = {
  micro: "Microenterprise (fewer than 10 staff and turnover or balance sheet of 2 million euro or less)",
  small: "Small enterprise (fewer than 50 staff and turnover or balance sheet of 10 million euro or less)",
  medium: "Medium-sized enterprise (fewer than 250 staff and turnover up to 50 million euro or balance sheet up to 43 million euro)",
  large: "Large enterprise (above the medium thresholds)",
};

// dpp: "soon" = first-wave product group in the Commission's working plan; "later" = in the plan,
// later wave; "own" = already has its own passport rules; "none" = not in the plan today.
export const PRODUCTS = [
  { id: "apparel", label: "Clothing, clothing accessories or footwear", consumer: true, banCategory: true, dpp: "soon", dppNote: "Textiles (garments and footwear) are in the first working plan; the delegated act sets the data and the date, targeted for around 2027." },
  { id: "textiles", label: "Other textiles (home textiles, fabrics)", consumer: true, banCategory: false, dpp: "soon", dppNote: "Textile products are in the first working plan; check whether your items fall under the textiles delegated act." },
  { id: "furniture", label: "Furniture", consumer: true, banCategory: false, dpp: "later", dppNote: "Furniture is in the working plan, behind textiles on the timetable." },
  { id: "mattress", label: "Mattresses", consumer: true, banCategory: false, dpp: "later", dppNote: "Mattresses are in the working plan, behind textiles on the timetable." },
  { id: "tyres", label: "Tyres", consumer: true, banCategory: false, dpp: "soon", dppNote: "Tyres are in the working plan with a delegated act targeted around 2027." },
  { id: "metal", label: "Iron, steel or aluminium (intermediate products)", consumer: false, banCategory: false, dpp: "soon", dppNote: "Steel and aluminium are in the first working plan, aimed at business buyers." },
  { id: "electronics", label: "Consumer electronics, phones, tablets or other ICT", consumer: true, banCategory: false, dpp: "later", dppNote: "Energy-related products and ICT are in the plan through product-specific rules; check the smartphone and tablet measures." },
  { id: "battery", label: "Batteries", consumer: true, banCategory: false, dpp: "own", dppNote: "Batteries already have a passport duty under the Batteries Regulation (Regulation (EU) 2023/1542), due 18 February 2027 for industrial and electric-vehicle batteries. Use a battery-specific checker." },
  { id: "other", label: "Something else", consumer: true, banCategory: false, dpp: "none", dppNote: "Not on the working plan today. The Commission can add products by delegated act, so re-check each year." },
];

// What passport data you will most likely need ready. The delegated act for your product decides.
export const DPP_ITEMS = [
  { id: "identifier", label: "A unique product identifier for each model or batch (for example a GS1 GTIN), kept stable over the product's life", article: "Art 9 and Art 10" },
  { id: "operators", label: "Identifiers for the economic operator and each production facility (for example GLN or EORI), with the importer or authorised representative named", article: "Art 9(2)" },
  { id: "composition", label: "Material composition by component with percentages, including recycled content where claimed", article: "Annex I and the delegated act" },
  { id: "supplyChain", label: "A supplier map with the location of each production step, back at least to the finishing and dyeing sites", article: "Art 7 and the delegated act" },
  { id: "substances", label: "Substances of concern in the product, checked against the REACH candidate list, with supplier declarations", article: "Art 7(5) and Art 9" },
  { id: "careRepair", label: "Care, repair and end-of-life instructions that a consumer or recycler can act on", article: "Art 5 and Annex I" },
  { id: "footprint", label: "Environmental footprint figures (carbon, water) with the method used, where the delegated act asks for them", article: "Annex I and the delegated act" },
  { id: "carrier", label: "A data carrier (QR code or GS1 Digital Link) planned for the product, label or packaging, linking to the passport", article: "Art 10" },
  { id: "export", label: "Product data held in one structured file (CSV or JSON), with a named owner, instead of scattered documents", article: "Art 9 to 11" },
];

export const TREATMENTS = [
  { id: "reuse", label: "Preparation for reuse (resale, outlet, donation, repair)", destroys: false },
  { id: "remanufacture", label: "Remanufacture", destroys: false },
  { id: "recycle", label: "Recycling", destroys: false },
  { id: "energy", label: "Energy recovery (incineration with energy recovery)", destroys: true },
  { id: "disposal", label: "Disposal (landfill or incineration without recovery)", destroys: true },
];

const pad = (n) => String(n).padStart(2, "0");
export function parseDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` !== raw.trim() ? null : d;
}
const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const DAY = 86400000;

function num(raw, label, errors) {
  if (raw === "" || raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a number of zero or more.`); return 0; }
  return n;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const product = PRODUCTS.find((p) => p.id === i.product);
  if (!product) errors.push("Choose what kind of product you sell.");
  const role = Object.hasOwn(ROLES, i.role) ? i.role : "manufacturer";
  if (i.size && !Object.hasOwn(SIZES, i.size)) errors.push("Choose a size from the list.");
  const size = Object.hasOwn(SIZES, i.size) ? i.size : "small";
  const sellsInEu = i.sellsInEu === "no" ? "no" : "yes";
  const done = {};
  for (const d of DPP_ITEMS) done[d.id] = Boolean(i[d.id]) && i[d.id] !== "0";
  const unsold = {};
  for (const t of TREATMENTS) {
    unsold[t.id] = {
      units: Math.round(num(i[`units_${t.id}`], `${t.label}: units`, errors)),
      kg: num(i[`kg_${t.id}`], `${t.label}: weight in kg`, errors),
    };
    if (unsold[t.id].units === 0 && unsold[t.id].kg > 0) errors.push(`${t.label}: you entered a weight but no units.`);
  }
  const reasons = String(i.reasons || "").trim().slice(0, 400);
  const now = i.now ? parseDate(i.now) : new Date();
  if (i.now && !now) errors.push("Today must be a real date written YYYY-MM-DD.");
  return { errors, product, role, size, sellsInEu, done, unsold, reasons, now };
}

// Ban on destroying unsold apparel, clothing accessories and footwear (Art 25), and the public
// disclosure duty for firms that are not SMEs (Art 24).
export function destruction(product, size, sellsInEu, now) {
  const isLarge = size === "large", isMedium = size === "medium";
  const largeDate = parseDate(BAN_LARGE), mediumDate = parseDate(BAN_MEDIUM);
  const days = (d) => Math.round((d - now) / DAY);
  let ban;
  if (sellsInEu === "no") ban = { status: "out", basis: "The ESPR rules apply to products placed on the EU market. If you sell nothing into the EU, they do not reach you directly." };
  else if (!product.banCategory) ban = { status: "none", basis: "The destruction ban covers apparel, clothing accessories and footwear today. Your product is not in that category. The Commission can extend the ban to other products by delegated act." };
  else if (size === "micro" || size === "small") ban = { status: "exempt", basis: "Micro and small enterprises are exempt from the ban on destroying unsold apparel and footwear. Medium-sized firms follow in 2030." };
  else if (isLarge) ban = { status: now >= largeDate ? "inForce" : "upcoming", date: BAN_LARGE, daysLeft: days(largeDate), basis: `Large enterprises may not destroy unsold apparel, clothing accessories or footwear from ${BAN_LARGE}. Destroying means disposal or energy recovery; resale, donation, remanufacture and recycling remain open. Narrow exceptions exist (for example safety or health grounds, or goods that infringe intellectual property), set by the Commission by delegated act.` };
  else ban = { status: now >= mediumDate ? "inForce" : "upcoming", date: BAN_MEDIUM, daysLeft: days(mediumDate), basis: `Medium-sized enterprises face the ban on destroying unsold apparel and footwear from ${BAN_MEDIUM}. Large enterprises have been bound since ${BAN_LARGE}; if you are in a group with large enterprises you may be counted as large, so check your group status.` };
  let disclosure;
  if (sellsInEu === "no" || !product.consumer) disclosure = { status: "none", basis: "The disclosure duty covers unsold consumer products placed on the EU market." };
  else if (isLarge) disclosure = { status: now >= largeDate ? "inForce" : "upcoming", basis: `Large enterprises must publish each year the number and weight of unsold consumer products they discard, the reasons, and the share going to reuse, remanufacture, recycling, energy recovery and disposal, from ${BAN_LARGE}. The table below drafts it.` };
  else disclosure = { status: "notRequired", basis: "The public disclosure duty applies to enterprises that are not SMEs. As an SME you are not bound today, but the Commission can extend it to medium-sized enterprises later, and publishing the figures early costs little." };
  return { ban, disclosure };
}

export function dppReadiness(product, role, sellsInEu) {
  if (sellsInEu === "no") return { status: "out", note: "Passport duties attach to products placed on the EU market." };
  const lane = { soon: "first wave", later: "later wave", own: "own regime", none: "not planned" }[product.dpp];
  const roleNote = {
    manufacturer: "As manufacturer you create the passport data and carry the main duty.",
    importer: "As importer you must check the manufacturer has done the passport and that the data carrier is on the product before you place it on the market.",
    retailer: "As a retailer you must check the passport is there and the carrier works before you sell. Ask your suppliers now for the data in the list below.",
    marketplace: "As an online marketplace you are asked to cooperate with authorities and to act on non-compliant listings. Expect sellers to be asked for the passport link.",
  }[role];
  return { status: product.dpp, lane, note: product.dppNote, roleNote };
}

export function disclosureTable(p) {
  const rows = TREATMENTS.map((t) => ({ id: t.id, label: t.label, destroys: t.destroys, units: p.unsold[t.id].units, kg: Math.round(p.unsold[t.id].kg * 100) / 100 }));
  const units = rows.reduce((a, r) => a + r.units, 0);
  const kg = Math.round(rows.reduce((a, r) => a + r.kg, 0) * 100) / 100;
  for (const r of rows) {
    r.shareUnits = units ? Math.round((r.units / units) * 1000) / 10 : 0;
    r.shareKg = kg ? Math.round((r.kg / kg) * 1000) / 10 : 0;
  }
  const destroyedUnits = rows.filter((r) => r.destroys).reduce((a, r) => a + r.units, 0);
  const destroyedKg = Math.round(rows.filter((r) => r.destroys).reduce((a, r) => a + r.kg, 0) * 100) / 100;
  return { rows, units, kg, destroyedUnits, destroyedKg, entered: units > 0 || kg > 0 };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const d = destruction(p.product, p.size, p.sellsInEu, p.now);
  const dpp = dppReadiness(p.product, p.role, p.sellsInEu);
  const passportRelevant = ["soon", "later"].includes(p.product.dpp) && p.sellsInEu === "yes";
  const open = passportRelevant ? DPP_ITEMS.filter((x) => !p.done[x.id]) : [];
  const table = disclosureTable(p);
  const findings = [];
  const banLive = d.ban.status === "inForce";
  findings.push({ severity: banLive ? "high" : "info", title: d.ban.basis });
  if (table.entered && (banLive || d.ban.status === "upcoming") && table.destroyedUnits > 0)
    findings.push({ severity: banLive ? "high" : "medium", title: `You report ${table.destroyedUnits} units (${table.destroyedKg} kg) sent to energy recovery or disposal. ${banLive ? "That is the destruction the ban targets, unless a listed exception applies and you can document it." : "Plan alternatives (resale channels, donation, remanufacture, recycling) before the ban date."}` });
  findings.push({ severity: d.disclosure.status === "inForce" ? "high" : "info", title: d.disclosure.basis });
  if (d.disclosure.status === "inForce" && !table.entered) findings.push({ severity: "medium", title: "Enter your last year's unsold-stock figures below to draft the public disclosure table." });
  findings.push({ severity: ["soon"].includes(dpp.status) ? "medium" : "info", title: `Digital Product Passport: ${dpp.note || ""}` });
  if (dpp.roleNote) findings.push({ severity: "info", title: dpp.roleNote });
  for (const o of open) findings.push({ severity: "medium", title: `Start collecting: ${o.label} (${o.article}).` });
  if (passportRelevant && !open.length) findings.push({ severity: "info", title: "Every passport data group is marked ready. Re-check against the delegated act when it is published; its list decides." });
  return { input: p, destruction: d, dpp, passportRelevant, open, table, findings };
}

export const SAMPLE = {
  product: "apparel", role: "manufacturer", size: "large", sellsInEu: "yes",
  identifier: "1", operators: "1", composition: "", supplyChain: "", substances: "", careRepair: "1", footprint: "", carrier: "", export: "",
  units_reuse: "42000", kg_reuse: "12600", units_remanufacture: "0", kg_remanufacture: "", units_recycle: "9000", kg_recycle: "3150",
  units_energy: "1500", kg_energy: "480", units_disposal: "300", kg_disposal: "95",
  reasons: "Unsold end-of-season stock; returned items beyond economic repair; two lots failing chemical limits.", now: "2026-10-13",
};

export function summaryText(r) {
  const lines = ["EU ESPR readiness check (first read, not legal advice)", `Product: ${r.input.product.label}`, `Role: ${ROLES[r.input.role]}`, `Size: ${r.input.size}`, "", `Destruction ban: ${r.destruction.ban.status}`, r.destruction.ban.basis, "", `Disclosure duty: ${r.destruction.disclosure.status}`, r.destruction.disclosure.basis];
  if (r.table.entered) {
    lines.push("", "Unsold consumer products discarded (draft of the annual public disclosure):", `  Total: ${r.table.units} units, ${r.table.kg} kg`);
    for (const row of r.table.rows) lines.push(`  ${row.label}: ${row.units} units (${row.shareUnits}%), ${row.kg} kg (${row.shareKg}%)`);
    if (r.input.reasons) lines.push(`  Reasons for discarding: ${r.input.reasons}`);
  }
  if (r.open.length) lines.push("", "Passport data not yet ready:", ...r.open.map((d) => `  - ${d.label} (${d.article})`));
  lines.push("", `Digital Product Passport: ${r.dpp.note || ""}`, "", "Confirm with counsel or your regulator. Do not enter customer or supplier personal data.");
  return lines.join("\n");
}

export function checklistCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  const rows = [];
  if (r.table.entered) for (const row of r.table.rows) rows.push(["unsold goods", row.label, `${row.units} units / ${row.kg} kg`, `${row.shareUnits}% of units / ${row.shareKg}% of kg`]);
  if (r.table.entered && r.input.reasons) rows.push(["unsold goods", "Reasons for discarding", r.input.reasons, ""]);
  for (const d of DPP_ITEMS) rows.push(["passport data", d.label, d.article, r.passportRelevant ? (r.open.includes(d) ? "open" : "ready") : "not required yet"]);
  return ["kind,item,detail,status", ...rows.map((x) => x.map(q).join(","))].join("\n");
}
