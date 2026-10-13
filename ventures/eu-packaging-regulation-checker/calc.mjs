// EU Packaging and Packaging Waste Regulation (PPWR, Regulation (EU) 2025/40) first read for a maker,
// brand owner, importer or online seller: which duties reach the packaging, from what date, and which are
// still open. Pure functions, no I/O; `today` is a parameter so every answer is repeatable.
// Bad input is rejected with a message, never clamped. Dates were written from memory of the published
// text (general application 12 August 2026, most design duties 1 January 2030) without network access to
// EUR-Lex in the building session; verify them against CELEX 32025R0040 before quoting them. Delegated and
// implementing acts (labels, recyclability grades, recycled-content method) set the real detail and may move dates.
// Article numbers are deliberately not given: they were not checkable here.

export const CATEGORIES = [
  { id: "sales", label: "Sales packaging for a consumer product (box, bottle, pouch, tray, wrapper)", mode: "in" },
  { id: "foodcontact", label: "Packaging in direct contact with food or drink", mode: "in" },
  { id: "beverage", label: "Single-use plastic bottle (up to 3 litres) or metal can for drinks", mode: "in" },
  { id: "ecommerce", label: "E-commerce packaging (mailer, carton, void fill) used to ship orders to buyers", mode: "in" },
  { id: "transport", label: "Grouped or transport packaging (outer carton, pallet wrap, crate, strapping)", mode: "in" },
  { id: "none", label: "No packaging is placed on the EU market", mode: "out" },
];

export const MATERIALS = [
  { id: "plastic", label: "Plastic (film, bottle, tray, pouch, foam)", plastic: true },
  { id: "multi", label: "Mixed or laminated (includes a plastic layer)", plastic: true },
  { id: "paper", label: "Paper or cardboard", plastic: false },
  { id: "glass", label: "Glass", plastic: false },
  { id: "metal", label: "Metal (steel, aluminium)", plastic: false },
  { id: "wood", label: "Wood or other natural material", plastic: false },
];

export const ROLES = [
  { id: "manufacturer", label: "Packaging manufacturer or supplier (you make the packaging itself)" },
  { id: "producer", label: "Brand owner or filler (you pack goods under your own name)" },
  { id: "importer", label: "Importer (you bring packaged goods or packaging into the EU)" },
  { id: "distance", label: "Online seller shipping to EU buyers" },
  { id: "distributor", label: "Distributor or retailer (you sell packaged goods on)" },
  { id: "fulfilment", label: "Fulfilment service provider (you store, pack or ship for others)" },
];

export const LOCATIONS = { eu: "Established in the EU", noneu: "Established outside the EU" };
const ALL = ["sales", "foodcontact", "beverage", "ecommerce", "transport"];
const MAKERS = ["manufacturer", "producer", "importer"];

// Each duty: who it reaches (uses, roles, optionally materials), the date it applies from, and the key the
// reader can mark done. `notMicro` duties do not reach a microenterprise.
export const OBLIGATIONS = [
  { id: "substances", label: "Heavy metals in packaging stay under the limit and PFAS in food-contact packaging stays under the new limits", article: "substances chapter", from: "2026-08-12", categories: ALL, roles: ["manufacturer", "producer", "importer", "distributor", "distance"], done: "substances" },
  { id: "conformity", label: "Conformity assessment done, technical documentation kept and EU declaration of conformity drawn up", article: "conformity chapter", from: "2026-08-12", categories: ALL, roles: MAKERS, done: "conformity" },
  { id: "epr", label: "Registered in the producer register of each EU country you put packaged goods into; an authorised representative appointed there if you are not established there; collection and recycling financed", article: "producer responsibility chapter", from: "2026-08-12", categories: ALL, roles: ["producer", "importer", "distance"], done: "epr" },
  { id: "fulfilment", label: "Fulfilment services offered only to producers who are registered, and checked", article: "producer responsibility chapter", from: "2026-08-12", categories: ALL, roles: ["fulfilment"], done: "fulfilment" },
  { id: "drs", label: "Deposit-return system covers single-use plastic bottles and metal drink cans (unless a 90 percent separate-collection rate is already met)", article: "collection chapter", from: "2029-01-01", categories: ["beverage"], roles: ["producer", "importer"], done: "drs" },
  { id: "label", label: "Harmonised label for material composition and sorting information on the packaging", article: "labelling chapter", from: "2028-08-12", categories: ["sales", "foodcontact", "beverage", "ecommerce"], roles: MAKERS, done: "label" },
  { id: "recyclable", label: "Packaging designed for recycling: meets the recyclability criteria for its material", article: "recyclability requirements", from: "2030-01-01", categories: ALL, roles: MAKERS, done: "recyclable" },
  { id: "recycled", label: "Plastic packaging carries the minimum share of recycled content for its type", article: "recycled-content requirements", from: "2030-01-01", categories: ALL, roles: MAKERS, materials: ["plastic", "multi"], done: "recycled" },
  { id: "minimise", label: "Packaging weight and volume kept to the minimum needed for function and safety", article: "minimisation requirements", from: "2030-01-01", categories: ALL, roles: MAKERS, done: "minimise" },
  { id: "emptyspace", label: "Empty space in grouped, transport and e-commerce packaging is 50 percent or less", article: "empty-space requirements", from: "2030-01-01", categories: ["ecommerce", "transport"], roles: ["producer", "importer", "distance", "fulfilment"], done: "emptyspace" },
  { id: "reuse", label: "Reuse targets for transport and grouped packaging (pallet wrap, crates, boxes) are met", article: "reuse targets", from: "2030-01-01", categories: ["transport"], roles: ["producer", "importer", "distributor"], done: "reuse", notMicro: true },
  { id: "singleuse", label: "Restricted single-use formats avoided (for example plastic wrap on small fruit and vegetable packs)", article: "restricted formats annex", from: "2030-01-01", categories: ["sales", "foodcontact"], roles: ["producer", "importer", "distributor", "distance"], materials: ["plastic", "multi"], done: "singleuse" },
];

export const DONE_KEYS = ["substances", "conformity", "epr", "fulfilment", "drs", "label", "recyclable", "recycled", "minimise", "emptyspace", "reuse", "singleuse"];

function opt(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const category = CATEGORIES.find((c) => c.id === i.category);
  if (!category) errors.push("Choose what the packaging is.");
  const material = MATERIALS.find((m) => m.id === i.material);
  if (!material && category && category.mode === "in") errors.push("Choose the main material.");
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const location = ["eu", "noneu"].includes(i.location) ? i.location : null;
  if (!location) errors.push("Say where you are established.");
  const today = i.today === undefined || i.today === "" ? new Date().toISOString().slice(0, 10) : String(i.today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) errors.push("Today's date must be written YYYY-MM-DD.");
  const micro = opt(i.micro, ["yes", "no"], "no");
  const sellsEu = opt(i.sellsEu, ["yes", "no", "unsure"], "yes");
  const euOperator = opt(i.euOperator, ["yes", "no", "unsure"], "unsure");
  const done = {};
  for (const k of DONE_KEYS) done[k] = Boolean(i[k]) && i[k] !== "0";
  return { errors, category, material, role, location, today, micro, sellsEu, euOperator, done };
}

// Does an EU-established operator stand behind the packaging or the packaged goods?
export function responsible({ role, location, euOperator }) {
  if (location === "eu" && ["manufacturer", "producer", "importer", "fulfilment"].includes(role.id)) {
    return { status: "self", reason: "You are established in the EU in a role that can carry the operator's duties. Producer registration is still per country you sell into." };
  }
  if (euOperator === "yes") return { status: "covered", reason: "An EU-established producer, importer or authorised representative is named for the packaging or packaged goods." };
  if (location === "eu" && ["distributor", "distance"].includes(role.id)) {
    return { status: "check", reason: "You are established in the EU, but a producer in another EU country may need its own registration or authorised representative there. Check who is named for each country you ship to." };
  }
  if (euOperator === "no") return { status: "gap", reason: "No EU-established producer, importer or authorised representative stands behind the packaging. Appoint an authorised representative in each country you sell into, or sell through an EU importer." };
  return { status: "unknown", reason: "You are not sure an EU-established operator is named. Find out before shipping to EU buyers." };
}

export function classify({ category, sellsEu }) {
  if (sellsEu === "no") return { status: "out", reason: "The Regulation covers packaging placed on the EU market. Without sales into the EU it does not apply directly." };
  if (!category) return { status: "out", reason: "No packaging was chosen." };
  if (category.mode === "out") return { status: "out", reason: "No packaging is placed on the EU market, so the Regulation does not apply." };
  return { status: "in", reason: "Packaging of this kind placed on the EU market, or packaging around goods sold there, is covered by the Regulation." };
}

const DAY = 86400000;
export function daysUntil(from, today) {
  return Math.round((Date.parse(from) - Date.parse(today)) / DAY);
}

export function timeline(p) {
  if (!p.category) return [];
  const plastic = Boolean(p.material && p.material.plastic);
  const rows = OBLIGATIONS.filter((o) => o.categories.includes(p.category.id) && o.roles.includes(p.role.id)
    && !(o.notMicro && p.micro === "yes") && !(o.materials && !(plastic && o.materials.includes(p.material.id)))).map((o) => {
    const days = daysUntil(o.from, p.today);
    const state = days <= 0 ? "applies" : days <= 365 ? "soon" : "later";
    return { ...o, state, days, done: Boolean(p.done[o.done]) };
  });
  return rows.sort((a, b) => a.from.localeCompare(b.from));
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
    if (!rows.length) findings.push({ severity: "info", title: "No dated duty in this tool reaches your role for this packaging. Check the Regulation for duties on your role that it does not list." });
    else findings.push({ severity: overdue.length ? "high" : "medium", title: `${overdue.length} of ${rows.length} duties already apply to you and are not marked done.` });
    if (rp.status === "gap" || rp.status === "unknown") findings.push({ severity: "high", title: "No EU operator is confirmed. Appoint an authorised representative for producer registration in each country you sell into, or sell through an EU importer." });
    if (rp.status === "check") findings.push({ severity: "medium", title: rp.reason });
    for (const r of overdue) findings.push({ severity: "high", title: `Applies since ${r.from}: ${r.label}.` });
    for (const r of open.filter((x) => x.state === "soon")) findings.push({ severity: "medium", title: `Applies in ${r.days} days (${r.from}): ${r.label}.` });
    if (rows.length && !open.length) findings.push({ severity: "info", title: "Every duty listed for your packaging and role is marked done. Keep the evidence; an authority can ask for it." });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, category: p.category, material: p.material, role: p.role, location: p.location, verdict, responsible: rp, timeline: rows, open, overdue, findings };
}

export const SAMPLE = { category: "ecommerce", material: "plastic", role: "distance", location: "noneu", sellsEu: "yes", euOperator: "no", micro: "no", today: "", substances: "", conformity: "", epr: "", fulfilment: "", drs: "", label: "", recyclable: "", recycled: "", minimise: "", emptyspace: "", reuse: "", singleuse: "" };

const STATE_TEXT = { applies: "applies now", soon: "applies within a year", later: "applies later" };
const RP_TEXT = { self: "you can carry the operator's duties", covered: "covered by an EU operator", check: "check who is named", gap: "gap: no EU operator", unknown: "not confirmed" };

export function summaryText(r) {
  const lines = [
    "EU Packaging Regulation (PPWR) check (first read, not legal advice)",
    `Packaging: ${r.category.label}`,
    `Material: ${r.material ? r.material.label : "not needed"}`,
    `Role: ${r.role.label}`,
    `Established: ${LOCATIONS[r.location]}`,
    `Reference date: ${r.input.today}`,
    `Result: ${r.verdict.status === "in" ? "in scope" : "not in scope directly"}. ${r.verdict.reason}`,
    `EU operator: ${RP_TEXT[r.responsible.status]}. ${r.responsible.reason}`,
  ];
  if (r.timeline.length) {
    lines.push("", "Timeline:");
    for (const t of r.timeline) lines.push(`  ${t.from}  ${STATE_TEXT[t.state].padEnd(24)} ${t.done ? "[done]" : "[open]"} ${t.label}`);
  }
  lines.push("", "Dates written from memory: confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function timelineCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["applies_from,status,done,duty,basis", ...r.timeline.map((t) => [t.from, STATE_TEXT[t.state], t.done ? "yes" : "no", t.label, t.article].map(q).join(","))].join("\n");
}
