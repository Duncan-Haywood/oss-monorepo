// EU General Product Safety Regulation (Regulation (EU) 2023/988, applying since 13 December 2024)
// first read for a seller of consumer goods: is the product in scope, does an EU-established
// responsible economic operator exist, and which of the basic duties are still open. Pure functions,
// no I/O. Bad input is rejected with a message, never clamped. It does not know sector law in detail
// or any Member State's enforcement; the answer is a first read. Article numbers follow the
// Regulation as published; check them against the text (CELEX 32023R0988) before quoting them.

export const CATEGORIES = [
  { id: "general", label: "A general consumer product (home goods, furniture, sports gear, clothing, tools, accessories)", mode: "in", article: "Art 2(1)" },
  { id: "childcare", label: "A child-care or children's product that is not a toy (cots, strollers, feeding items)", mode: "in", article: "Art 2(1)" },
  { id: "toy", label: "A toy (Toy Safety Directive 2009/48/EC covers it)", mode: "sector", article: "Art 2(1), Art 2(2)" },
  { id: "electrical", label: "Electrical or electronic product with CE marking (Low Voltage, Radio Equipment)", mode: "sector", article: "Art 2(1), Art 2(2)" },
  { id: "cosmetic", label: "A cosmetic product", mode: "sector", article: "Art 2(1), Art 2(2)" },
  { id: "ppe-machinery", label: "Machinery, personal protective equipment or another CE-marked product", mode: "sector", article: "Art 2(1), Art 2(2)" },
  { id: "medicine", label: "A medicinal product or medical device", mode: "out", article: "Art 2(1)" },
  { id: "food", label: "Food or animal feed", mode: "out", article: "Art 2(1)" },
  { id: "antique", label: "An antique, or a product that needs repair before use and is sold as such", mode: "out", article: "Art 2(1)" },
  { id: "services", label: "A service, not a physical product", mode: "out", article: "Art 2(1)" },
];

export const ROLES = [
  { id: "manufacturer", label: "Manufacturer (you design and make it, or have it made under your name or brand)", article: "Art 9" },
  { id: "importer", label: "Importer (you bring it into the EU from outside)", article: "Art 11" },
  { id: "distributor", label: "Distributor or reseller (you sell it on without changing it)", article: "Art 12" },
  { id: "fulfilment", label: "Fulfilment service provider (you store, pack or ship for others)", article: "Art 16" },
  { id: "marketplace", label: "Online marketplace (you host other sellers' offers)", article: "Art 22" },
];

export const LOCATIONS = { eu: "Established in the EU", noneu: "Established outside the EU" };

// Duties a seller can mark done. `roles` limits who it applies to.
export const DUTIES = [
  { id: "identity", label: "Your name, postal address and an electronic contact are on the product, its packaging or a document with it", roles: ["manufacturer", "importer"], article: "Art 9, Art 11" },
  { id: "batch", label: "A type, batch or serial number identifies the product", roles: ["manufacturer"], article: "Art 9" },
  { id: "instructions", label: "Instructions and safety information are in a language the consumers in each EU country can easily understand", roles: ["manufacturer", "importer"], article: "Art 9, Art 11" },
  { id: "techdoc", label: "A risk analysis and technical documentation exist and are kept for 10 years", roles: ["manufacturer"], article: "Art 9" },
  { id: "listing", label: "Each online listing shows the manufacturer and the EU responsible person, an image, the product identification and any warnings", roles: ["manufacturer", "importer", "distributor"], article: "Art 19" },
  { id: "gateway", label: "You know how to report a serious accident through the Safety Business Gateway and how to act on a recall", roles: ["manufacturer", "importer", "distributor", "fulfilment", "marketplace"], article: "Art 20" },
];

function opt(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const category = CATEGORIES.find((c) => c.id === i.category);
  if (!category) errors.push("Choose what the product is.");
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  const location = ["eu", "noneu"].includes(i.location) ? i.location : null;
  if (!location) errors.push("Say where you are established.");
  const sellsEu = opt(i.sellsEu, ["yes", "no", "unsure"], "yes");
  const euOperator = opt(i.euOperator, ["yes", "no", "unsure"], "unsure");
  const channel = opt(i.channel, ["own", "marketplace", "shop"], "own");
  const done = {};
  for (const d of DUTIES) done[d.id] = Boolean(i[d.id]) && i[d.id] !== "0";
  return { errors, category, role, location, sellsEu, euOperator, channel, done };
}

// Does an EU-established operator stand behind the product? Art 16.
export function responsible({ role, location, euOperator }) {
  if (location === "eu" && (role.id === "manufacturer" || role.id === "importer" || role.id === "fulfilment")) {
    return { status: "self", reason: "You are established in the EU in a role that can be the responsible economic operator, so the tasks in Art 16 sit with you." };
  }
  if (euOperator === "yes") {
    return { status: "covered", reason: "An EU-established manufacturer, importer or authorised representative is named for this product." };
  }
  if (location === "eu" && role.id === "distributor") {
    return { status: "check", reason: "You are an EU distributor. Check that the manufacturer or an importer in the EU is named on the product. If none is, you may not place it on the market." };
  }
  if (euOperator === "no") {
    return { status: "gap", reason: "No EU-established manufacturer, importer or authorised representative stands behind the product. The Regulation does not allow it on the EU market without one." };
  }
  return { status: "unknown", reason: "You are not sure an EU-established operator is named. Find out; without one the product may not be placed on the EU market." };
}

export function classify({ category, sellsEu }) {
  if (sellsEu === "no") {
    return { status: "out", via: "Art 2(1)", reason: "The Regulation covers products made available to consumers in the Union, including by online sale. Without sales to the EU, it does not apply directly." };
  }
  if (!category) return { status: "out", via: "Art 2", reason: "No product was chosen." };
  if (category.mode === "out") {
    return { status: "out", via: category.article, reason: "This kind of product or service falls outside the Regulation's scope in Art 2(1)." };
  }
  if (category.mode === "sector") {
    return { status: "partial", via: category.article, reason: "A sector law covers this product's main safety requirements. The Regulation still applies to risks and aspects the sector law does not cover, and sector law has its own EU-operator and marking duties." };
  }
  return { status: "in", via: category.article, reason: "A consumer product sold in the EU with no sector law of its own is covered by the Regulation's general safety requirement." };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const verdict = classify({ category: p.category, sellsEu: p.sellsEu });
  const rp = responsible({ role: p.role, location: p.location, euOperator: p.euOperator });
  const ladder = ["eu", "noneu"].map((loc) => {
    const r = responsible({ role: p.role, location: loc, euOperator: p.euOperator });
    return { location: loc, status: r.status, via: "Art 16", reason: r.reason };
  });
  const applies = verdict.status === "in" || verdict.status === "partial";
  const open = applies ? DUTIES.filter((d) => d.roles.includes(p.role.id) && !p.done[d.id]) : [];
  const findings = [];
  if (applies) {
    findings.push({ severity: "high", title: `${verdict.status === "in" ? "In scope" : "Partly in scope"}: the Regulation has applied since 13 December 2024 (${verdict.via}).` });
    if (rp.status === "gap" || rp.status === "unknown") findings.push({ severity: "high", title: "No EU responsible person is confirmed. Appoint an EU authorised representative, sell through an EU importer, or use an EU fulfilment provider that takes the role (Art 16), then put their name and address on the product and listing." });
    if (rp.status === "check") findings.push({ severity: "medium", title: rp.reason });
    if (p.channel === "marketplace") findings.push({ severity: "medium", title: "Marketplaces must be able to trace sellers and may take down listings that lack manufacturer and EU contact details (Art 22). Keep these ready." });
    if (p.channel === "own" || p.channel === "marketplace") findings.push({ severity: "medium", title: "Online offers for sale must show the manufacturer, the EU responsible person, a product image, identification and any warnings (Art 19)." });
    if (verdict.status === "partial") findings.push({ severity: "medium", title: "Sector law (CE marking, declaration of conformity) comes first for the aspects it covers. Do not treat this tool as a conformity check." });
    for (const d of open) findings.push({ severity: "medium", title: `Open: ${d.label} (${d.article}).` });
    if (open.length === 0) findings.push({ severity: "info", title: "All the basic duties listed for your role are marked done. Keep the evidence; an authority can ask for it." });
  } else {
    findings.push({ severity: "info", title: verdict.reason });
  }
  return { input: p, category: p.category, role: p.role, location: p.location, verdict, responsible: rp, ladder, open, findings };
}

export const SAMPLE = { category: "general", role: "distributor", location: "noneu", sellsEu: "yes", euOperator: "no", channel: "marketplace", identity: "", batch: "", instructions: "", techdoc: "", listing: "", gateway: "" };

const STATUS_TEXT = { in: "in scope", partial: "partly in scope", out: "not in scope directly" };
const RP_TEXT = { self: "you can be the responsible operator", covered: "covered by an EU operator", check: "check who is named", gap: "gap: no EU operator", unknown: "not confirmed" };

export function summaryText(r) {
  const v = r.verdict;
  const lines = [
    "EU General Product Safety Regulation check (first read, not legal advice)",
    `Product: ${r.category.label}`,
    `Role: ${r.role.label}`,
    `Established: ${LOCATIONS[r.location]}`,
    `Result: ${STATUS_TEXT[v.status]} [${v.via}]`,
    v.reason,
    `EU responsible operator: ${RP_TEXT[r.responsible.status]}. ${r.responsible.reason}`,
    "",
    "Same facts, other place of establishment:",
    ...r.ladder.map((l) => `  ${LOCATIONS[l.location]}: ${RP_TEXT[l.status]}`),
  ];
  if (r.open.length) lines.push("", "Open duties:", ...r.open.map((d) => `  - ${d.label} (${d.article})`));
  lines.push("", "Confirm with your national market surveillance authority or counsel.");
  return lines.join("\n");
}

export function ladderCsv(r) {
  return ["established,status,basis", ...r.ladder.map((l) => [LOCATIONS[l.location], l.status, l.via].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}
