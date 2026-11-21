// EU Batteries Regulation (Regulation (EU) 2023/1542) first read for a maker, importer or seller of
// batteries and battery-powered products: which obligations reach the product, from what date, and
// which are still open. Pure functions, no I/O; `today` is a parameter so every answer is repeatable.
// Bad input is rejected with a message, never clamped. Dates and Article numbers were first written from
// memory; on 2026-11-15 they were checked against the Official Journal text of CELEX 32023R1542 (Arts 1,
// 3(47), 13, 40, 43, 47, 55, 91, 96) and the 2025/1561 postponement of due diligence, and the table below
// follows that text. Delegated and implementing acts (labelling, carbon-footprint method) may move dates.

export const CATEGORIES = [
  { id: "portable", label: "Portable battery (sealed, 5 kg or less, not designed specifically for industrial use: cells, packs, power banks, cordless-tool packs, battery inside a device)", mode: "in" },
  { id: "lmt", label: "Light means of transport battery (sealed, 25 kg or less, traction for an e-bike, e-scooter or mobility device)", mode: "in" },
  { id: "sli", label: "Starting, lighting and ignition battery (vehicle starter battery)", mode: "in" },
  { id: "industrial-big", label: "Industrial battery over 2 kWh (storage, forklifts, back-up power)", mode: "in" },
  { id: "industrial-small", label: "Industrial battery of 2 kWh or less", mode: "in" },
  { id: "ev", label: "Electric vehicle battery (traction for a car, van, truck or bus, or for an e-motorbike or other L-category vehicle when over 25 kg)", mode: "in" },
  { id: "exempt", label: "Battery only for military or security equipment, or for equipment sent into space", mode: "out" },
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
  { id: "substances", label: "Mercury (all batteries) and cadmium (portable) stay under the Annex I limits; the 0.01 % lead limit for portable batteries applies from 18 Aug 2024 (zinc-air button cells from 18 Aug 2028)", article: "Art 6, Annex I", from: "2024-02-18", categories: ALL, roles: ["manufacturer", "importer", "distributor", "distance"], done: "substances" },
  { id: "conformity", label: "Conformity assessment done, EU declaration of conformity drawn up, CE marking on the battery", article: "Chapter IV (conformity), Art 17", from: "2024-08-18", categories: ALL, roles: ["manufacturer", "importer", "distributor", "distance"], done: "conformity" },
  { id: "epr", chapter: "VIII", label: "Registered as a producer for each EU country you sell into; an authorised representative appointed there if you sell from abroad; take-back and recycling financed", article: "Art 56 and following", from: "2025-08-18", categories: ALL, roles: ["manufacturer", "importer", "distance"], done: "epr" },
  { id: "handling", label: "Warehousing, packaging, addressing and dispatching do not put the battery out of compliance; cooperate with national authorities on request and tell them at once if a battery presents a risk", article: "Art 43 (with Art 40(3)(c) and 40(4))", from: "2024-08-18", categories: ALL, roles: ["fulfilment"], done: "handling" },
  { id: "operator", label: "As the responsible economic operator for a battery with no EU manufacturer, importer or authorised representative: check the EU declaration of conformity and technical documentation exist, keep the declaration available to authorities, put your name and contact details on the battery, its packaging, parcel or accompanying document, and act on risks", article: "Regulation (EU) 2019/1020 Art 4 (Batteries Regulation added to its Art 4(5) by Art 91)", from: "2024-08-18", categories: ALL, roles: ["fulfilment"], onlyIf: "fallback", done: "operator" },
  { id: "epr-first", chapter: "VIII", label: "Registered as a producer in each EU country where you are the first to supply the battery on a professional basis (you buy it from another EU country or from outside the EU), or where you resell it under your own name", article: "Art 3(47)(b) and (c), Art 55(2)", from: "2025-08-18", categories: ALL, roles: ["distributor"], done: "epr" },
  { id: "collection", chapter: "III", label: "Separate-collection symbol (crossed-out wheeled bin) on the battery, with Cd or Pb beneath it above 0.002 % cadmium or 0.004 % lead", article: "Art 13(4) and (5)", from: "2025-08-18", categories: ALL, roles: ["manufacturer", "importer"], done: "collection" },
  { id: "label", chapter: "III", label: "General information label: manufacturer, type, date of manufacture, capacity and hazard information (from 18 Aug 2026, or 18 months after the EU labelling implementing act if that is later)", article: "Art 13(1) to (3)", from: "2026-08-18", categories: ALL, roles: ["manufacturer", "importer"], done: "label" },
  { id: "removable", label: "A portable battery in an appliance can be removed and replaced by the user; an e-bike or e-scooter battery by an independent professional", article: "Art 11", from: "2027-02-18", categories: ["portable", "lmt"], roles: ["manufacturer", "importer"], done: "removable" },
  { id: "qr", chapter: "III", label: "QR code printed or engraved on the battery, linking to its required information (and to its battery passport where one is required); applies to every category, portable included", article: "Art 13(6)", from: "2027-02-18", categories: ALL, roles: ["manufacturer", "importer"], done: "qr" },
  { id: "passport", label: "Digital battery passport for the battery, with the data fields the Regulation lists", article: "Art 77", from: "2027-02-18", categories: ["lmt", "industrial-big", "ev"], roles: ["manufacturer", "importer"], done: "passport" },
  { id: "diligence", label: "Supply-chain due-diligence policy for cobalt, natural graphite, lithium and nickel, with third-party verification (not for operators with net turnover under EUR 40 million that are not in a group over that limit)", article: "Arts 47 to 52 (date as amended by Regulation (EU) 2025/1561)", from: "2027-08-18", categories: ALL, roles: ["manufacturer", "importer"], done: "diligence", notSmall: true },
  { id: "recycled", label: "Documentation of recycled content for cobalt, lead, lithium and nickel in the battery", article: "Art 8", from: "2028-08-18", categories: ["ev", "industrial-big", "sli"], roles: ["manufacturer", "importer"], done: "recycled" },
  { id: "carbon", label: "Carbon-footprint declaration and performance class", article: "Art 7", from: null, categories: ["ev", "industrial-big", "lmt"], roles: ["manufacturer", "importer"], done: "carbon" },
];

export const DONE_KEYS = ["substances", "conformity", "epr", "handling", "operator", "collection", "label", "removable", "qr", "passport", "diligence", "recycled", "carbon"];

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today)) || new Date(today + "T00:00:00Z").toISOString().slice(0, 10) !== today) errors.push("Today's date must be written YYYY-MM-DD.");
  // Art 47: due diligence does not reach an operator with net turnover under EUR 40 million in the
  // financial year before last, unless its group exceeds that on a consolidated basis. "unsure" shows it.
  const under40m = opt(i.under40m, ["yes", "no", "unsure"], "unsure");
  const sellsEu = opt(i.sellsEu, ["yes", "no", "unsure"], "yes");
  const euOperator = opt(i.euOperator, ["yes", "no", "unsure"], "unsure");
  const done = {};
  for (const k of DONE_KEYS) done[k] = Boolean(i[k]) && i[k] !== "0";
  const nuclear = opt(i.nuclear, ["yes", "no"], "no");
  return { errors, category, role, location, today, under40m, nuclear, sellsEu, euOperator, done };
}

// Does an EU-established operator stand behind the battery?
export function responsible({ role, location, euOperator }) {
  if (location === "eu" && role.id === "fulfilment") {
    // Regulation (EU) 2019/1020 Art 4(2)(d): with no EU manufacturer, importer or authorised
    // representative, the EU fulfilment service provider is the responsible economic operator.
    if (euOperator === "yes") return { status: "covered", reason: "An EU-established manufacturer, importer or authorised representative is named for the battery, so it carries the operator's duties; yours are the handling duties of Art 43." };
    if (euOperator === "no") return { status: "fallback", reason: "No EU manufacturer, importer or authorised representative is named, so you, as the EU fulfilment service provider, are the responsible economic operator for this battery (Regulation (EU) 2019/1020 Art 4). Take on those tasks or do not ship it." };
    return { status: "unknown", reason: "You are not sure an EU manufacturer, importer or authorised representative is named. If none is, you as the EU fulfilment service provider are the responsible economic operator (Regulation (EU) 2019/1020 Art 4). Find out before shipping." };
  }
  if (location === "eu" && ["manufacturer", "importer"].includes(role.id)) {
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
  if (category.mode === "out") return { status: "out", reason: "This kind of battery is outside the Regulation (Art 1(5) excludes batteries for essential-security, arms and military equipment and for equipment sent into space) or no battery is placed on the market." };
  return { status: "in", reason: "A battery of this category placed on the EU market is covered by the Regulation." };
}

const DAY = 86400000;
export function daysUntil(from, today) {
  return Math.round((Date.parse(from) - Date.parse(today)) / DAY);
}

// Art 1(6): Chapters III (labelling, marking, QR code) and VIII (waste batteries, producer
// responsibility) do not apply to equipment specifically designed for the safety of nuclear
// installations. Every other chapter, the passport and due diligence included, still does.
export const NUCLEAR_DISAPPLIED_CHAPTERS = ["III", "VIII"];

export function timeline(p, rp = null) {
  if (!p.category) return [];
  const rows = OBLIGATIONS.filter((o) => o.categories.includes(p.category.id) && o.roles.includes(p.role.id) && !(o.notSmall && p.under40m === "yes") && (!o.onlyIf || rp?.status === o.onlyIf) && !(p.nuclear === "yes" && NUCLEAR_DISAPPLIED_CHAPTERS.includes(o.chapter))).map((o) => {
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
  const rows = verdict.status === "in" ? timeline(p, rp) : [];
  const open = rows.filter((r) => !r.done);
  const overdue = open.filter((r) => r.state === "applies");
  const findings = [];
  if (verdict.status === "in") {
    findings.push({ severity: overdue.length ? "high" : "medium", title: `${overdue.length} of ${rows.length} duties already apply to you and are not marked done.` });
    if (rp.status === "gap" || rp.status === "unknown") findings.push({ severity: "high", title: "No EU operator is confirmed. Name an EU authorised representative or sell through an EU importer, and appoint an EPR representative in each country you sell into." });
    if (rp.status === "fallback") findings.push({ severity: "high", title: rp.reason });
    if (rp.status === "check") findings.push({ severity: "medium", title: rp.reason });
    if (p.role.id === "importer" && p.location === "noneu") findings.push({ severity: "high", title: "An importer is, by definition, established in the EU (Art 3). If you are established outside the EU and put your name or brand on the battery, you are its manufacturer: an EU importer or authorised representative must stand behind it, and the duties above fall on you through them." });
    if (p.nuclear === "yes") findings.push({ severity: "info", title: "For equipment designed for the safety of nuclear installations, Chapter III (label, collection symbol, QR code) and Chapter VIII (producer registration and take-back) do not apply (Art 1(6)). Every other duty does." });
    for (const r of overdue) findings.push({ severity: "high", title: `Applies since ${r.from}: ${r.label} (${r.article}).` });
    for (const r of open.filter((x) => x.state === "soon")) findings.push({ severity: "medium", title: `Applies in ${r.days} days (${r.from}): ${r.label} (${r.article}).` });
    for (const r of open.filter((x) => x.state === "pending")) findings.push({ severity: "info", title: `Date waits on EU delegated or implementing acts: ${r.label} (${r.article}).` });
    if (rows.length && !open.length) findings.push({ severity: "info", title: "Every duty listed for your battery and role is marked done. Keep the evidence; an authority can ask for it." });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, category: p.category, role: p.role, location: p.location, verdict, responsible: rp, timeline: rows, open, overdue, findings };
}

export const SAMPLE = { category: "lmt", role: "importer", location: "noneu", sellsEu: "yes", euOperator: "no", under40m: "yes", nuclear: "no", today: "", substances: "", conformity: "1", epr: "", handling: "", operator: "", collection: "", label: "", removable: "", qr: "", passport: "", diligence: "", recycled: "", carbon: "" };

const STATE_TEXT = { applies: "applies now", soon: "applies within a year", later: "applies later", pending: "date not yet set" };
const RP_TEXT = { self: "you can carry the operator's duties", fallback: "you are the responsible operator", covered: "covered by an EU operator", check: "check who is named", gap: "gap: no EU operator", unknown: "not confirmed" };

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
  const q = (c) => { let v = String(c); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d,.]*$/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // formula injection guard (CWE-1236)
  return ["applies_from,status,done,duty,basis", ...r.timeline.map((t) => [t.from || "tbd", STATE_TEXT[t.state], t.done ? "yes" : "no", t.label, t.article].map(q).join(","))].join("\n");
}
