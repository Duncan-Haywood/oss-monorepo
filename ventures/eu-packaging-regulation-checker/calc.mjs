// EU Packaging and Packaging Waste Regulation (PPWR, Regulation (EU) 2025/40) first read for a maker, importer or
// seller of packaged goods: which obligations reach the packaging, from what date, and which are still open.
// Pure functions, no I/O; `today` is a parameter so every answer is repeatable. Bad input is rejected with a
// message, never clamped. Dates and Article numbers were written from memory of the published text without
// network access to EUR-Lex in the building session; verify them against CELEX 32025R0040 before quoting them.
// Delegated and implementing acts (recyclability grades, labelling, recycled-content method) may move dates.
// Micro-enterprise derogations that exist for some duties are not modelled.

export const CATEGORIES = [
  { id: "food", label: "Food-contact packaging (trays, wraps, cups, boxes, bags that touch food or drink)", mode: "in" },
  { id: "plastic", label: "Plastic sales packaging (bottles, pouches, tubs, film around a product)", mode: "in" },
  { id: "ecommerce", label: "E-commerce, transport or grouped packaging (mailers, cartons, pallet wrap, multipacks)", mode: "in" },
  { id: "other", label: "Other sales packaging (paper, cardboard, glass, metal, wood)", mode: "in" },
  { id: "reusable", label: "Reusable or refillable packaging (returnable crates, refill pouches, deposit bottles)", mode: "in" },
  { id: "compostable", label: "Tea bags, coffee pods, fruit stickers and similar items the Regulation says must be compostable", mode: "in" },
  { id: "none", label: "No packaging is placed on the EU market", mode: "out" },
];

export const ROLES = [
  { id: "manufacturer", label: "Manufacturer (you make it, or have it made under your name or brand)" },
  { id: "importer", label: "Importer (you bring it into the EU from outside)" },
  { id: "distributor", label: "Distributor or reseller (you sell it on without changing it)" },
  { id: "distance", label: "Seller direct to EU buyers online from outside the EU" },
  { id: "fulfilment", label: "Fulfilment service provider (you store, pack or ship for others)" },
];

export const LOCATIONS = { eu: "Established in the EU", noneu: "Established outside the EU" };
const ALL = ["food", "plastic", "ecommerce", "other", "reusable", "compostable"];
const SELL = ["food", "plastic", "ecommerce", "other"];
const OPS = ["manufacturer", "importer", "distance"];

// Each duty: who it reaches (categories, roles), the date it applies from (null = waits on an EU act),
// and the evidence a seller can mark done.
export const OBLIGATIONS = [
  { id: "substances", label: "Lead, cadmium, mercury and hexavalent chromium stay under the combined limit; no intentionally added PFAS above the limits in food-contact packaging", article: "Art 5", from: "2026-08-12", categories: ALL, roles: ["manufacturer", "importer", "distributor", "distance"], done: "substances" },
  { id: "conformity", label: "Conformity assessment done, technical documentation kept, EU declaration of conformity drawn up", article: "Arts 38 and 39", from: "2026-08-12", categories: ALL, roles: OPS, done: "conformity" },
  { id: "epr", label: "Registered as a producer in each EU country you sell packaged goods into; an authorised representative appointed there if you sell from abroad; take-back and recycling financed", article: "Arts 44 to 46", from: "2026-08-12", categories: ALL, roles: ["manufacturer", "importer", "distance"], done: "epr" },
  { id: "compostable", label: "Tea bags, coffee pods and fruit stickers are compostable in industrial composting and labelled so", article: "Art 9", from: "2028-02-12", categories: ["compostable"], roles: OPS, done: "compostable" },
  { id: "label", label: "Harmonised label naming the packaging material so the buyer can sort it; QR code or label on reusable packaging", article: "Art 12", from: "2028-08-12", categories: ALL, roles: OPS, done: "label" },
  { id: "recyclable", label: "Packaging designed for recycling and meeting its recyclability performance grade", article: "Art 6", from: "2030-01-01", categories: SELL, roles: OPS, done: "recyclable" },
  { id: "recycled", label: "Minimum recycled content in the plastic part of the packaging", article: "Art 7", from: "2030-01-01", categories: ["plastic", "food"], roles: OPS, done: "recycled" },
  { id: "minimise", label: "Packaging weight and volume reduced to the minimum needed; empty space in grouped, transport and e-commerce packaging at most 50%", article: "Arts 10 and 24", from: "2030-01-01", categories: ["ecommerce", "plastic", "other"], roles: ["manufacturer", "importer", "distance"], done: "minimise" },
  { id: "formats", label: "Single-use formats on the restricted list (such as plastic wrap on small fruit and vegetable packs) are not placed on the market", article: "Art 25 and Annex V", from: "2030-01-01", categories: ["plastic", "food"], roles: ["manufacturer", "importer", "distributor", "distance"], done: "formats" },
  { id: "reuse", label: "Reuse and refill targets met for your packaging type; refill offered where required", article: "Arts 29 to 33", from: "2030-01-01", categories: ["reusable", "food"], roles: ["manufacturer", "importer", "distance"], done: "reuse" },
];

export const DONE_KEYS = ["substances", "conformity", "epr", "compostable", "label", "recyclable", "recycled", "minimise", "formats", "reuse"];

function opt(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const category = CATEGORIES.find((c) => c.id === i.category);
  if (!category) errors.push("Choose what the packaging is.");
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const location = ["eu", "noneu"].includes(i.location) ? i.location : null;
  if (!location) errors.push("Say where you are established.");
  const today = i.today === undefined || i.today === "" ? new Date().toISOString().slice(0, 10) : String(i.today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) errors.push("Today's date must be written YYYY-MM-DD.");
  const sellsEu = opt(i.sellsEu, ["yes", "no", "unsure"], "yes");
  const euOperator = opt(i.euOperator, ["yes", "no", "unsure"], "unsure");
  const done = {};
  for (const k of DONE_KEYS) done[k] = Boolean(i[k]) && i[k] !== "0";
  return { errors, category, role, location, today, sellsEu, euOperator, done };
}

// Does an EU-established operator stand behind the packaging?
export function responsible({ role, location, euOperator }) {
  if (location === "eu" && ["manufacturer", "importer", "fulfilment"].includes(role.id)) {
    return { status: "self", reason: "You are established in the EU in a role that can carry the operator's duties." };
  }
  if (euOperator === "yes") return { status: "covered", reason: "An EU-established manufacturer, importer or authorised representative is named for the packaging." };
  if (location === "eu" && role.id === "distributor") {
    return { status: "check", reason: "You are an EU distributor. Check that an EU manufacturer or importer is named on the packaging; if none is, do not make it available." };
  }
  if (euOperator === "no") return { status: "gap", reason: "No EU-established manufacturer, importer or authorised representative stands behind the packaging. Appoint one or sell through an EU importer." };
  return { status: "unknown", reason: "You are not sure an EU-established operator is named. Find out before selling to EU buyers." };
}

export function classify({ category, sellsEu }) {
  if (sellsEu === "no") return { status: "out", reason: "The Regulation covers packaging placed on the EU market. Without sales into the EU it does not apply directly." };
  if (!category) return { status: "out", reason: "No packaging was chosen." };
  if (category.mode === "out") return { status: "out", reason: "No packaging is placed on the EU market, so the Regulation has nothing to apply to." };
  return { status: "in", reason: "Packaging of this kind placed on the EU market is covered by the Regulation." };
}

const DAY = 86400000;
export function daysUntil(from, today) {
  return Math.round((Date.parse(from) - Date.parse(today)) / DAY);
}

export function timeline(p) {
  if (!p.category) return [];
  const rows = OBLIGATIONS.filter((o) => o.categories.includes(p.category.id) && o.roles.includes(p.role.id)).map((o) => {
    let state;
    let days = null;
    if (o.from === null) state = "pending";
    else {
      days = daysUntil(o.from, p.today);
      state = days <= 0 ? "applies" : days <= 365 ? "soon" : "later";
    }
    return { ...o, state, days, done: Boolean(p.done[o.done]) };
  });
  return rows.sort((a, b) => (a.from || "9999").localeCompare(b.from || "9999"));
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const verdict = classify({ category: p.category, sellsEu: p.sellsEu });
  const rp = responsible({ role: p.role, location: p.location, euOperator: p.euOperator });
  const rows = verdict.status === "in" ? timeline(p) : [];
  const open = rows.filter((r) => !r.done);
  const overdue = open.filter((r) => r.state === "applies");
  const findings = [];
  if (verdict.status === "in") {
    findings.push({ severity: overdue.length ? "high" : "medium", title: `${overdue.length} of ${rows.length} duties already apply to you and are not marked done.` });
    if (rp.status === "gap" || rp.status === "unknown") findings.push({ severity: "high", title: "No EU operator is confirmed. Name an EU authorised representative or sell through an EU importer, and appoint an EPR representative in each country you sell into." });
    if (rp.status === "check") findings.push({ severity: "medium", title: rp.reason });
    for (const r of overdue) findings.push({ severity: "high", title: `Applies since ${r.from}: ${r.label} (${r.article}).` });
    for (const r of open.filter((x) => x.state === "soon")) findings.push({ severity: "medium", title: `Applies in ${r.days} days (${r.from}): ${r.label} (${r.article}).` });
    for (const r of open.filter((x) => x.state === "pending")) findings.push({ severity: "info", title: `Date waits on an EU implementing act: ${r.label} (${r.article}).` });
    if (!open.length) findings.push({ severity: "info", title: "Every duty listed for your packaging and role is marked done. Keep the evidence; an authority can ask for it." });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, category: p.category, role: p.role, location: p.location, verdict, responsible: rp, timeline: rows, open, overdue, findings };
}

export const SAMPLE = { category: "ecommerce", role: "distance", location: "noneu", sellsEu: "yes", euOperator: "no", today: "", substances: "", conformity: "", epr: "", compostable: "", label: "", recyclable: "", recycled: "", minimise: "", formats: "", reuse: "" };

const STATE_TEXT = { applies: "applies now", soon: "applies within a year", later: "applies later", pending: "date not yet set" };
const RP_TEXT = { self: "you can carry the operator's duties", covered: "covered by an EU operator", check: "check who is named", gap: "gap: no EU operator", unknown: "not confirmed" };

export function summaryText(r) {
  const lines = [
    "EU Packaging Regulation (PPWR) check (first read, not legal advice)",
    `Packaging: ${r.category.label}`,
    `Role: ${r.role.label}`,
    `Established: ${LOCATIONS[r.location]}`,
    `Reference date: ${r.input.today}`,
    `Result: ${r.verdict.status === "in" ? "in scope" : "not in scope directly"}. ${r.verdict.reason}`,
    `EU operator: ${RP_TEXT[r.responsible.status]}. ${r.responsible.reason}`,
  ];
  if (r.timeline.length) {
    lines.push("", "Timeline:");
    for (const t of r.timeline) lines.push(`  ${t.from || "tbd       "}  ${STATE_TEXT[t.state].padEnd(24)} ${t.done ? "[done]" : "[open]"} ${t.label} (${t.article})`);
  }
  lines.push("", "Confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function timelineCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["applies_from,status,done,duty,basis", ...r.timeline.map((t) => [t.from || "tbd", STATE_TEXT[t.state], t.done ? "yes" : "no", t.label, t.article].map(q).join(","))].join("\n");
}
