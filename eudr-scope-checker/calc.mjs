// EU Deforestation Regulation (Regulation (EU) 2023/1115) scope and duties.
// A first read of the Regulation as amended in 2024 and again in December 2025
// (Regulation (EU) 2025/2650). Every result names the Article it rests on.
// Pure functions, no I/O: the page and the tests both import this file.

export const ROLES = [
  { id: "operator", label: "Operator: I place relevant products on the EU market for the first time, or export them from the EU" },
  { id: "downstream", label: "Downstream operator: I place products on the market that were made with relevant commodities I bought inside the EU" },
  { id: "trader", label: "Trader: I only make relevant products available on the market, without being an operator" },
];

export const SIZES = [
  { id: "large", label: "Large (not a micro, small or medium enterprise)" },
  { id: "medium", label: "Medium enterprise" },
  { id: "small", label: "Small enterprise" },
  { id: "micro", label: "Micro enterprise" },
];

export const RISK = [
  { id: "unknown", label: "Not sure of the country's benchmark rating" },
  { id: "low", label: "Low-risk country or region of production" },
  { id: "standard", label: "Standard-risk country or region" },
  { id: "high", label: "High-risk country or region" },
];

// What the user trades. Each maps to the commodity it brings in scope.
export const PRODUCTS = [
  { id: "cattle", commodity: "cattle", label: "Cattle, beef, bovine hides and leather" },
  { id: "cocoa", commodity: "cocoa", label: "Cocoa beans, paste, butter, powder, chocolate" },
  { id: "coffee", commodity: "coffee", label: "Coffee, green, roasted or ground" },
  { id: "palm", commodity: "oil palm", label: "Palm oil, palm kernel products and certain derivatives" },
  { id: "rubber", commodity: "rubber", label: "Natural rubber, rubber goods, tyres" },
  { id: "soya", commodity: "soya", label: "Soya beans, soya meal and oil, feed" },
  { id: "wood", commodity: "wood", label: "Wood, charcoal, pulp, paper, furniture, prefabricated wooden buildings" },
];

// Things that take a product out of scope, with the reason.
export const OUT_OF_SCOPE = [
  { id: "printed", label: "Printed books, newspapers, printed pictures (Chapter 49)", reason: "Printed products were removed from Annex I by the December 2025 amendment. Confirm against the current Annex I." },
  { id: "waste", label: "Waste or scrap that has finished its life as a product (recycled material)", reason: "Products that have completed their life cycle and would otherwise be disposed of as waste are not in scope (Art 1(1) and Annex I note). Confirm for your material." },
  { id: "packaging", label: "Only packaging material that supports, protects or carries another product", reason: "Packaging used solely to support, protect or carry another product is not itself a relevant product (Annex I note)." },
];

export const EU_LINK = [
  { id: "market", label: "I place or make the products available on the EU market, or export them from the EU" },
  { id: "none", label: "No: no EU market and no export from the EU" },
];

// Heading-level screen of Annex I Combined Nomenclature codes. "yes" means the
// 4-digit heading is in Annex I wholly or in the part that matters most;
// "check" means only some subheadings are listed so the 8-digit code decides.
const HEADINGS = {
  cattle: { yes: ["0102", "0201", "0202", "4101", "4104", "4107"], check: ["0206", "0210", "1602"] },
  cocoa: { yes: ["1801", "1802", "1803", "1804", "1805", "1806"], check: [] },
  coffee: { yes: ["0901"], check: [] },
  "oil palm": { yes: ["1511"], check: ["1207", "1513", "2306", "2905", "2915", "3823"] },
  rubber: { yes: ["4001", "4005", "4006", "4007", "4008", "4010", "4011", "4012", "4013"], check: ["4015", "4016", "4017"] },
  soya: { yes: ["1201", "1507", "2304"], check: ["1208"] },
  wood: {
    yes: ["4401", "4402", "4403", "4406", "4407", "4408", "4409", "4410", "4411", "4412", "4413", "4415", "4416", "4418", "4701", "4702", "4703", "4704", "4705", "4706", "4707"],
    check: ["4404", "4414", "4417", "4419", "4420", "4421", "9401", "9403", "9406"],
  },
};
const PAPER_CHECK_CHAPTER = "48"; // many but not all paper headings are in Annex I

/** Screen one Combined Nomenclature / HS code. Returns { code, status, commodity, note }. */
export function classifyCode(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 4) return { code: String(raw ?? "").trim(), status: "invalid", commodity: null, note: "Enter at least the 4-digit heading." };
  const heading = digits.slice(0, 4);
  const chapter = digits.slice(0, 2);
  const code = digits.length > 4 ? `${heading} ${digits.slice(4)}`.trim() : heading;
  if (chapter === "49") {
    return { code, status: "out", commodity: null, note: "Chapter 49 (printed matter) was removed from Annex I by the 2025 amendment. Confirm against the current Annex I." };
  }
  for (const [commodity, h] of Object.entries(HEADINGS)) {
    if (h.yes.includes(heading)) return { code, status: "likely", commodity, note: `Heading ${heading} is listed for ${commodity}. Confirm the 8-digit code against Annex I.` };
    if (h.check.includes(heading)) return { code, status: "check", commodity, note: `Only some ${heading} subheadings are in Annex I. The 8-digit code decides.` };
  }
  if (chapter === PAPER_CHECK_CHAPTER) return { code, status: "check", commodity: "wood", note: "Most paper and paperboard headings in Chapter 48 are in Annex I, but not all. The 8-digit code decides." };
  return { code, status: "not-listed", commodity: null, note: "Not in this heading screen, so probably out of scope. Confirm against Annex I before relying on it." };
}

export function classifyCodes(text) {
  return String(text ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 500).map(classifyCode);
}

// Dates. Large and medium: 30 Dec 2026. Micro and small: 30 Jun 2027, except
// those already covered by the EU Timber Regulation, who start 30 Dec 2026.
export function applicationDate(size, eutr) {
  if ((size === "micro" || size === "small") && !eutr) return "2027-06-30";
  return "2026-12-30";
}

export function daysUntil(date, today) {
  const t = Date.parse(`${today}T00:00:00Z`), d = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(d)) return null;
  return Math.round((d - t) / 86400000);
}

const ids = (raw) => (Array.isArray(raw) ? raw.map(String) : typeof raw === "string" && raw.trim() ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []);
const flag = (v) => Boolean(v) && v !== "0";

export function parse(input) {
  const i = input || {};
  const errors = [];
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const size = SIZES.find((s) => s.id === i.size);
  if (!size) errors.push("Choose your company size.");
  const eu = ["market", "none"].includes(i.eu) ? i.eu : null;
  if (!eu) errors.push("Say whether you place products on the EU market or export from the EU.");
  const risk = i.risk === undefined || i.risk === "" ? "unknown" : i.risk;
  if (!RISK.some((r) => r.id === risk)) errors.push("Choose a country risk option.");
  const products = ids(i.products);
  for (const p of products) if (!PRODUCTS.some((x) => x.id === p)) errors.push(`Products: "${p}" is not an option.`);
  const outOfScope = ids(i.outOfScope);
  for (const p of outOfScope) if (!OUT_OF_SCOPE.some((x) => x.id === p)) errors.push(`Out of scope: "${p}" is not an option.`);
  return {
    errors,
    role: role?.id ?? null,
    size: size?.id ?? null,
    eu,
    risk,
    products: PRODUCTS.filter((p) => products.includes(p.id)),
    outOfScope: OUT_OF_SCOPE.filter((p) => outOfScope.includes(p.id)),
    eutr: flag(i.eutr),
  };
}

const row = (who, article, text) => ({ who, article, text });

export function compute(input, today = new Date().toISOString().slice(0, 10)) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const out = { errors: [], status: "in", statusLabel: "", via: "", reason: "", findings: [], duties: [], dates: [], hits: p.products, role: p.role, size: p.size, risk: p.risk };
  const finish = (status, label, via, reason) => Object.assign(out, { status, statusLabel: label, via, reason });

  if (p.eu === "none") {
    finish("out", "Outside the Regulation", "Art 1, Art 2", "The Regulation covers relevant products placed on or made available on the EU market and exported from it. With neither, it does not bite on you directly (check whether your customers will ask you for data anyway).");
    return out;
  }
  if (!p.products.length) {
    finish("out", "No relevant commodity ticked", "Art 1, Annex I", "Nothing you tick falls under cattle, cocoa, coffee, oil palm, rubber, soya or wood. Confirm with the code screen below.");
    return out;
  }
  if (p.outOfScope.length) {
    finish("out", "Out of scope on your answers", "Annex I", p.outOfScope.map((o) => o.reason).join(" "));
    out.findings.push({ severity: "info", title: "If any other product you sell is not in this category, run the check again for it." });
    return out;
  }

  finish("in", "In scope", "Art 1, Annex I", `You deal in ${p.products.map((x) => x.commodity).join(", ")}, so Regulation (EU) 2023/1115 applies to those products.`);

  const date = applicationDate(p.size, p.eutr);
  const small = p.size === "micro" || p.size === "small";
  const sme = small || p.size === "medium";
  out.applicationDate = date;
  out.daysToApply = daysUntil(date, today);
  out.dates.push({ date, what: small && !p.eutr ? "Application date for micro and small enterprises" : "Application date for your size" });
  if (small && !p.eutr) out.dates.push({ date: "2026-12-30", what: "Application date for large and medium enterprises (your customers and suppliers may start asking earlier)" });
  out.dates.push({ date: "2020-12-31", what: "Deforestation cut-off: the commodity must come from land not deforested or degraded after this date" });

  const who = { operator: "Operator", downstream: "Downstream operator", trader: "Trader" }[p.role];
  const d = out.duties;

  d.push(row(who, "Art 3", "Relevant products may only be placed on or exported from the EU market if they are deforestation-free, produced in line with the laws of the country of production, and covered by a due diligence statement (where one is required of you)."));

  if (p.role === "operator") {
    if (small) {
      d.push(row(who, "Art 4, Art 12", "Micro and small primary operators that qualify may file a one-time simplified declaration instead of a statement per shipment. Check the conditions in the amended text; they relate to the country's risk rating."));
    } else {
      d.push(row(who, "Art 4(2), Art 12", "Before placing the products on the market or exporting them, submit a due diligence statement in the EU information system and hold its reference number."));
    }
    d.push(row(who, "Art 8, Art 9", "Operate a due diligence system: collect the required information, including the geolocation of every plot of land where the commodity was produced (for cattle, the establishments)."));
    if (p.risk === "low") {
      d.push(row(who, "Art 13", "For commodities from low-risk countries you may use simplified due diligence: collect the information (Art 9) but you can skip the risk assessment and mitigation steps, unless you find a risk."));
    } else {
      d.push(row(who, "Art 10, Art 11", "Assess the risk that products are non-compliant against the Art 10 criteria, and mitigate any risk above negligible before you place them on the market."));
      if (p.risk === "high") d.push(row(who, "Art 10, Art 16", "Expect the heaviest scrutiny: competent authorities must check at least 9% of operators for high-risk countries (3% standard, 1% low), and enhanced measures apply to high-risk sourcing."));
      if (p.risk === "unknown") out.findings.push({ severity: "medium", title: "Look up your country of production in the Commission's country benchmarking list; low-risk sourcing removes the risk assessment and mitigation steps." });
    }
    d.push(row(who, "Art 8(3)", "Keep the due diligence records for five years and update the system at least once a year."));
  } else if (p.role === "downstream") {
    if (sme) d.push(row(who, "Art 5, Art 4", "As an SME downstream operator you do not file a statement. Collect and keep information on who you bought from and who you sold to, for five years."));
    else d.push(row(who, "Art 4, Art 5", "As amended in 2025, downstream operators no longer file their own statement; the first downstream operator must collect and keep the reference number of the statement filed upstream, and you must keep supplier and customer information for five years."));
    d.push(row(who, "Art 3", "You still must be able to show the products you place on the market are deforestation-free and legal, through the reference numbers and data from your supplier."));
  } else {
    if (sme) d.push(row(who, "Art 5", "SME traders keep information on suppliers and customers for five years and hand it to the authorities on request."));
    else d.push(row(who, "Art 5", "Non-SME traders keep supplier and customer information for five years, pass on the reference numbers they were given, and hand them to authorities on request. As amended in 2025 they no longer file their own statement."));
    d.push(row(who, "Art 5, Art 3", "You cannot sell products that are not covered by a due diligence statement upstream, so ask your supplier for the reference number before you buy."));
  }

  d.push(row(who, "Art 25", "Penalties are set by each member state and must be dissuasive. The maximum fine must be at least 4% of the operator's EU turnover, with confiscation of the products and exclusion from public procurement and funding for up to 12 months possible."));

  if (p.size === "large" && p.role !== "operator") out.findings.push({ severity: "medium", title: "Large downstream operators and traders carry data-collection duties even though they do not file statements. Ask suppliers for reference numbers now." });
  if (p.risk === "unknown" && p.role !== "operator") out.findings.push({ severity: "info", title: "Your supplier's country of production decides how much they must do for you. Ask them for it." });
  out.findings.push({ severity: "info", title: "The Commission's simplification review and delegated act on product scope may still change Annex I. Check EUR-Lex for the text in force before relying on a result." });
  return out;
}

export const SAMPLE = {
  role: "operator",
  size: "medium",
  eu: "market",
  risk: "standard",
  products: ["coffee", "cocoa"],
  outOfScope: [],
  eutr: "",
};

export function summaryText(r) {
  const lines = ["EUDR scope check (Regulation (EU) 2023/1115; first read, not legal advice)", `Result: ${r.statusLabel}${r.via ? ` [${r.via}]` : ""}`, r.reason || ""];
  if (r.applicationDate) lines.push(`Applies to you from: ${r.applicationDate}${r.daysToApply != null ? ` (${r.daysToApply} days)` : ""}`);
  if (r.duties.length) lines.push("", "Duties:", ...r.duties.map((x) => `  - ${x.article} (${x.who}): ${x.text}`));
  if (r.dates.length) lines.push("", "Dates:", ...r.dates.map((x) => `  - ${x.date}: ${x.what}`));
  lines.push("", "Confirm with counsel or your national competent authority before relying on this.");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export function dutiesCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["role,article,duty", ...r.duties.map((x) => [x.who, x.article, x.text].map(q).join(","))].join("\n");
}

export function codesCsv(rows) {
  const q = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  return ["code,status,commodity,note", ...rows.map((x) => [x.code, x.status, x.commodity, x.note].map(q).join(","))].join("\n");
}
