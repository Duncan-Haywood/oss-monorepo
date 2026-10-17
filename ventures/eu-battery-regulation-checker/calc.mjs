// EU Batteries Regulation (Regulation (EU) 2023/1542) first read for a maker, importer or seller of
// batteries and battery-powered products: which obligations reach the product, from what date, and
// which are still open. Pure functions, no I/O; `today` is a parameter so every answer is repeatable.
// Bad input is rejected with a message, never clamped. Dates and Article numbers were written from
// memory of the published text (and of the 2025 postponement of the due-diligence duties) without
// network access to EUR-Lex in the building session; verify them against CELEX 32023R1542 before
// quoting them. Delegated and implementing acts (carbon-footprint method, passport format) may move dates.

export const CATEGORIES = [
  { id: "portable", label: "Portable battery (sealed, under 5 kg, for consumer use: cells, packs, power banks, battery inside a device)", mode: "in" },
  { id: "lmt", label: "Light means of transport battery (e-bike, e-scooter, mobility device)", mode: "in" },
  { id: "sli", label: "Starting, lighting and ignition battery (vehicle starter battery)", mode: "in" },
  { id: "industrial-big", label: "Industrial battery over 2 kWh (storage, forklifts, back-up power)", mode: "in" },
  { id: "industrial-small", label: "Industrial battery of 2 kWh or less", mode: "in" },
  { id: "ev", label: "Electric vehicle battery (car, van, truck, bus traction battery)", mode: "in" },
  { id: "exempt", label: "Battery only for military, space or nuclear use", mode: "out" },
  { id: "none", label: "No battery is placed on the EU market", mode: "out" },
];

export const ROLES = [
  { id: "manufacturer", label: "Manufacturer (you make it, or have it made under your name or brand)" },
  { id: "importer", label: "Importer (you bring it into the EU from outside)" },
  { id: "distributor", label: "Distributor or reseller (you sell it on without changing it)" },
  { id: "distance", label: "Seller direct to EU buyers online from outside the EU" },
  { id: "fulfilment", label: "Fulfilment service provider (you store, pack or ship for others)" },
];

export const LOCATIONS = { eu: "Established in the EU", noneu: "Established outside the EU" };
const NONPORTABLE = ["lmt", "sli", "industrial-big", "industrial-small", "ev"];
const ALL = ["portable", ...NONPORTABLE];

// Each duty: who it reaches (categories, roles), the date it applies from (null = waits on an EU act),
// and the evidence a seller can mark done.
export const OBLIGATIONS = [
  { id: "substances", label: "Mercury, cadmium and lead stay under the limits in the Regulation", article: "Art 6", from: "2024-02-18", categories: ALL, roles: ["manufacturer", "importer", "distributor", "distance"], done: "substances" },
  { id: "conformity", label: "Conformity assessment done, EU declaration of conformity drawn up, CE marking on the battery", article: "Chapter VI (conformity)", from: "2024-08-18", categories: ALL, roles: ["manufacturer", "importer", "distributor", "distance"], done: "conformity" },
  { id: "epr", label: "Registered as a producer for each EU country you sell into; an authorised representative appointed there if you sell from abroad; take-back and recycling financed", article: "Art 56 and following", from: "2025-08-18", categories: ALL, roles: ["manufacturer", "importer", "distance"], done: "epr" },
  { id: "label", label: "General information label: manufacturer, type, date of manufacture, capacity, hazard and separate-collection symbol", article: "Art 13(1)", from: "2026-08-18", categories: ALL, roles: ["manufacturer", "importer"], done: "label" },
  { id: "removable", label: "A portable battery in an appliance can be removed and replaced by the user; an e-bike or e-scooter battery by an independent professional", article: "Art 11", from: "2027-02-18", categories: ["portable", "lmt"], roles: ["manufacturer", "importer"], done: "removable" },
  { id: "qr", label: "QR code printed or engraved on the battery, linking to its digital record", article: "Art 13(6)", from: "2027-02-18", categories: NONPORTABLE, roles: ["manufacturer", "importer"], done: "passport" },
  { id: "passport", label: "Digital battery passport for the battery, with the data fields the Regulation lists", article: "Art 77", from: "2027-02-18", categories: ["lmt", "industrial-big", "ev"], roles: ["manufacturer", "importer"], done: "passport" },
  { id: "diligence", label: "Supply-chain due-diligence policy for cobalt, natural graphite, lithium and nickel, with third-party verification (not for micro, small and medium firms)", article: "Arts 48 to 52", from: "2027-08-18", categories: ALL, roles: ["manufacturer", "importer"], done: "diligence", notSme: true },
  { id: "recycled", label: "Documentation of recycled content for cobalt, lead, lithium and nickel in the battery", article: "Art 8", from: "2028-08-18", categories: ["ev", "industrial-big", "sli"], roles: ["manufacturer", "importer"], done: "recycled" },
  { id: "carbon", label: "Carbon-footprint declaration and performance class", article: "Art 7", from: null, categories: ["ev", "industrial-big", "lmt"], roles: ["manufacturer", "importer"], done: "carbon" },
];

export const DONE_KEYS = ["substances", "conformity", "epr", "label", "removable", "passport", "diligence", "recycled", "carbon"];

function opt(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const category = CATEGORIES.find((c) => c.id === i.category);
  if (!category) errors.push("Choose what the battery is.");
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const location = ["eu", "noneu"].includes(i.location) ? i.location : null;
  if (!location) errors.push("Say where you are established.");
  const today = i.today === undefined || i.today === "" ? new Date().toISOString().slice(0, 10) : String(i.today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) errors.push("Today's date must be written YYYY-MM-DD.");
  const sme = opt(i.sme, ["yes", "no"], "yes");
  const sellsEu = opt(i.sellsEu, ["yes", "no", "unsure"], "yes");
  const euOperator = opt(i.euOperator, ["yes", "no", "unsure"], "unsure");
  const done = {};
  for (const k of DONE_KEYS) done[k] = Boolean(i[k]) && i[k] !== "0";
  return { errors, category, role, location, today, sme, sellsEu, euOperator, done };
}

// Does an EU-established operator stand behind the battery?
export function responsible({ role, location, euOperator }) {
  if (location === "eu" && ["manufacturer", "importer", "fulfilment"].includes(role.id)) {
    return { status: "self", reason: "You are established in the EU in a role that can carry the operator's duties." };
  }
  if (euOperator === "yes") return { status: "covered", reason: "An EU-established manufacturer, importer or authorised representative is named for the battery." };
  if (location === "eu" && role.id === "distributor") {
    return { status: "check", reason: "You are an EU distributor. Check that an EU manufacturer or importer is named on the battery; if none is, do not make it available." };
  }
  if (euOperator === "no") return { status: "gap", reason: "No EU-established manufacturer, importer or authorised representative stands behind the battery. Appoint one or sell through an EU importer." };
  return { status: "unknown", reason: "You are not sure an EU-established operator is named. Find out before selling to EU buyers." };
}

export function classify({ category, sellsEu }) {
  if (sellsEu === "no") return { status: "out", reason: "The Regulation covers batteries placed on the EU market. Without sales into the EU it does not apply directly." };
  if (!category) return { status: "out", reason: "No battery was chosen." };
  if (category.mode === "out") return { status: "out", reason: "This kind of battery is outside the Regulation (military, space and nuclear use are excluded) or no battery is placed on the market." };
  return { status: "in", reason: "A battery of this category placed on the EU market is covered by the Regulation." };
}

const DAY = 86400000;
export function daysUntil(from, today) {
  return Math.round((Date.parse(from) - Date.parse(today)) / DAY);
}

export function timeline(p) {
  if (!p.category) return [];
  const rows = OBLIGATIONS.filter((o) => o.categories.includes(p.category.id) && o.roles.includes(p.role.id) && !(o.notSme && p.sme === "yes")).map((o) => {
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
    if (!open.length) findings.push({ severity: "info", title: "Every duty listed for your battery and role is marked done. Keep the evidence; an authority can ask for it." });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, category: p.category, role: p.role, location: p.location, verdict, responsible: rp, timeline: rows, open, overdue, findings };
}

export const SAMPLE = { category: "lmt", role: "importer", location: "noneu", sellsEu: "yes", euOperator: "no", sme: "yes", today: "", substances: "", conformity: "1", epr: "", label: "", removable: "", passport: "", diligence: "", recycled: "", carbon: "" };

const STATE_TEXT = { applies: "applies now", soon: "applies within a year", later: "applies later", pending: "date not yet set" };
const RP_TEXT = { self: "you can carry the operator's duties", covered: "covered by an EU operator", check: "check who is named", gap: "gap: no EU operator", unknown: "not confirmed" };

export function summaryText(r) {
  const lines = [
    "EU Batteries Regulation check (first read, not legal advice)",
    `Battery: ${r.category.label}`,
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
