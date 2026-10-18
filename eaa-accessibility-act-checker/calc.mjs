// European Accessibility Act (Directive (EU) 2019/882) applicability check from what a business
// sells, its role and its size. Pure functions, no I/O. Bad input is rejected with a message, never
// clamped. Encodes Article 2 (products and services in scope), Article 4(5) (microenterprise service
// exemption) and the microenterprise ceilings of Commission Recommendation 2003/361/EC. It does not
// know how any Member State transposed the Directive; national law decides, so the answer is a first read.

// `kind` says whether the category is a product or a service; the role must fit it.
export const CATEGORIES = [
  { id: "none", label: "None of the products or services below", kind: null, article: null },
  // Products, Art 2(1)
  { id: "p-computer", label: "Product: consumer general purpose computer hardware and its operating system", kind: "product", article: "Art 2(1)(a)" },
  { id: "p-payment", label: "Product: payment terminal (self-service)", kind: "product", article: "Art 2(1)(b)" },
  { id: "p-atm", label: "Product: ATM, ticketing machine or check-in machine for services in scope", kind: "product", article: "Art 2(1)(b)" },
  { id: "p-info-kiosk", label: "Product: interactive self-service information terminal (not built into a vehicle, ship or train)", kind: "product", article: "Art 2(1)(b)" },
  { id: "p-comms-terminal", label: "Product: consumer terminal with interactive computing capability used for electronic communications (smartphone, router with interface)", kind: "product", article: "Art 2(1)(c)" },
  { id: "p-av-terminal", label: "Product: consumer terminal with interactive computing capability used to reach audiovisual media (smart TV, set-top box)", kind: "product", article: "Art 2(1)(d)" },
  { id: "p-ereader", label: "Product: e-reader", kind: "product", article: "Art 2(1)(e)" },
  // Services, Art 2(2)
  { id: "s-ecomms", label: "Service: electronic communications (phone, messaging, internet access), not machine-to-machine", kind: "service", article: "Art 2(2)(a)" },
  { id: "s-av", label: "Service: access to audiovisual media services (streaming, broadcast portals, guides)", kind: "service", article: "Art 2(2)(b)" },
  { id: "s-transport", label: "Service: air, bus, rail or waterborne passenger transport (website, app, e-tickets, information, self-service terminals)", kind: "service", article: "Art 2(2)(c)" },
  { id: "s-banking", label: "Service: consumer banking (current accounts, consumer credit, payments, online banking)", kind: "service", article: "Art 2(2)(d)" },
  { id: "s-ebooks", label: "Service: e-books and the dedicated software to read them", kind: "service", article: "Art 2(2)(e)" },
  { id: "s-ecommerce", label: "Service: e-commerce (an online shop or app where consumers buy goods or services)", kind: "service", article: "Art 2(2)(f)" },
];

export const ROLES = [
  { id: "manufacturer", label: "Manufacturer (designs and makes, or has made, under your name)", kind: "product", article: "Art 7" },
  { id: "importer", label: "Importer (places a product from outside the EU on the EU market)", kind: "product", article: "Art 8" },
  { id: "distributor", label: "Distributor (supplies a product on the EU market without changing it)", kind: "product", article: "Art 9" },
  { id: "provider", label: "Service provider (offers the service to consumers)", kind: "service", article: "Art 13" },
];

export const SIZE_LABEL = { micro: "microenterprise", notmicro: "not a microenterprise" };

// Recommendation 2003/361/EC Article 2(3): fewer than 10 persons AND turnover or balance sheet of
// EUR 2 million or less. Whole-group figures; linked enterprises count in full.
export function isMicro(staff, turnoverM, balanceM) {
  return staff < 10 && (turnoverM <= 2 || balanceM <= 2);
}

function num(raw, name, errors) {
  const s = raw === undefined || raw === null ? "" : String(raw).trim().replace(/[€,\s]/g, "");
  if (s === "") { errors.push(`${name} is required (enter 0 if none).`); return 0; }
  const v = Number(s);
  if (!Number.isFinite(v)) { errors.push(`${name} must be a number.`); return 0; }
  if (v < 0) { errors.push(`${name} cannot be negative.`); return 0; }
  return v;
}

export function parse(input) {
  const errors = [];
  const i = input || {};
  const category = CATEGORIES.find((c) => c.id === i.category);
  if (!category) errors.push("Choose what you make or sell.");
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose your role.");
  if (category && role && category.kind && category.kind !== role.kind) {
    errors.push(category.kind === "product"
      ? "A product is made, imported or distributed. Choose manufacturer, importer or distributor as your role."
      : "A service is offered by a service provider. Choose service provider as your role.");
  }
  const staff = num(i.staff, "Staff (people employed, whole group)", errors);
  const turnover = num(i.turnover, "Annual turnover (EUR millions)", errors);
  const balance = num(i.balance, "Annual balance sheet total (EUR millions)", errors);
  const eu = ["yes", "no", "unsure"].includes(i.eu) ? i.eu : "yes";
  const audience = ["consumers", "business"].includes(i.audience) ? i.audience : "consumers";
  const legacy = Boolean(i.legacy) && i.legacy !== "0";
  return { errors, category, role, staff, turnover, balance, eu, audience, legacy };
}

// One applicability decision. `micro` only matters for services (Art 4(5)).
export function classify({ category, role, micro, eu = "yes", audience = "consumers" }) {
  if (eu === "no") {
    return { status: "out", via: "Art 1, Art 2", reason: "The Directive covers products placed on the Union market and services offered to consumers in the Union. Without a Union market, it does not apply directly." };
  }
  if (!category || category.kind === null) {
    return { status: "out", via: "Art 2", reason: "The Directive covers the products and services listed in Article 2. None of them describes what you make or sell, so it does not apply directly." };
  }
  if (audience === "business" && category.kind === "service") {
    return { status: "out", via: "Art 2(2)", reason: "The service rules are about services offered to consumers. A service sold only to businesses is outside the Directive, though a business customer may still ask for accessibility." };
  }
  if (category.kind === "service" && micro) {
    return { status: "exempt-micro", via: "Art 4(5)", reason: "Microenterprises providing services are exempt from the accessibility requirements and the obligations that go with them." };
  }
  const via = `${category.article}, ${role ? role.article : ""}`.replace(/, $/, "");
  return {
    status: "in",
    via,
    reason: category.kind === "product"
      ? "This product is listed in Article 2(1), and the Directive's microenterprise exemption in Article 4(5) names service providers, not the makers, importers or distributors of products."
      : "This service is listed in Article 2(2) and you are not a microenterprise, so the service accessibility requirements apply.",
  };
}

const OBLIGATIONS = {
  manufacturer: [
    "Design and make the product to meet the accessibility requirements in Annex I (Art 7).",
    "Draw up technical documentation and carry out the conformity assessment procedure, then issue the EU declaration of conformity and affix the CE marking (Art 7, Art 15, Art 16).",
    "Keep the technical documentation and declaration for five years after the product is placed on the market, and keep series production in conformity (Art 7).",
    "Give instructions and accessibility information with the product; take corrective action and tell the authorities if a product is non-conforming (Art 7).",
  ],
  importer: [
    "Place only compliant products on the market and check that the manufacturer did the conformity assessment, has the documentation, and that the CE marking and instructions are there (Art 8).",
    "Put your name and address on the product and keep a copy of the EU declaration of conformity for five years (Art 8).",
  ],
  distributor: [
    "Check that the product bears the CE marking, has the instructions and that the manufacturer and importer have met their duties before you supply it (Art 9).",
    "Do not supply a product you believe is non-compliant, and tell the manufacturer or importer and the authorities (Art 9).",
  ],
  provider: [
    "Design and provide the service so it meets the accessibility requirements in Annex I, including its website, app, e-tickets, information and self-service terminals as they apply (Art 13).",
    "Prepare accessibility information about the service in writing and in accessible formats, and keep it available to the public (Art 13, Annex V).",
    "Keep the service in conformity when it changes, and be able to show how (Art 13).",
    "If a requirement would fundamentally alter the service or impose a disproportionate burden, document the assessment and tell the authority (Art 14).",
  ],
};

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const micro = isMicro(p.staff, p.turnover, p.balance);
  const base = { category: p.category, role: p.role, eu: p.eu, audience: p.audience };
  const verdict = classify({ ...base, micro });
  const ladder = ["micro", "notmicro"].map((s) => ({ size: s, ...classify({ ...base, micro: s === "micro" }) }));
  const findings = [];
  const inScope = verdict.status === "in";
  if (inScope) {
    findings.push({ severity: "high", title: `Likely in scope: the accessibility requirements apply to you (${verdict.via}). They have applied since 28 June 2025.` });
    findings.push({ severity: "medium", title: "Penalties and enforcement are set by each Member State (Art 30). Expect market surveillance for products and a named authority for services." });
    findings.push({ severity: "medium", title: "Conformity to a harmonised standard such as EN 301 549 (which points web content at WCAG 2.1 level AA) gives a presumption of conformity once it is cited for this Directive. Check the current citation." });
    if (p.category.id === "s-ecommerce") findings.push({ severity: "medium", title: "For an online shop, the checkout, product pages, account and customer support information are the parts a consumer must be able to use. Test the whole purchase path with a keyboard and a screen reader." });
    if (p.category.id === "s-banking") findings.push({ severity: "medium", title: "Consumer banking includes the online and mobile banking app and the identification, authentication and payment steps in it." });
    if (p.category.id === "s-transport") findings.push({ severity: "medium", title: "For passenger transport the Directive covers the website, mobile services, e-tickets, travel information and interactive self-service terminals. Urban, suburban and regional transport is covered for its self-service terminals only." });
  } else if (verdict.status === "exempt-micro") {
    findings.push({ severity: "medium", title: "Exempt as a microenterprise service provider (Art 4(5)). The exemption depends on staying under the ceilings on whole-group figures, so recheck it when you hire or your turnover grows." });
    findings.push({ severity: "info", title: "Larger customers and marketplaces may still require accessibility by contract, and your Member State may have its own rules for small providers. Accessible design also widens your market." });
  } else {
    findings.push({ severity: "info", title: "Not in scope directly on these answers." });
  }
  if (p.eu === "unsure") findings.push({ severity: "medium", title: "You answered unsure on whether you serve the Union market. Settle that first: it decides whether the Directive applies at all." });
  if (p.eu === "yes" && p.role && p.role.kind === "product" && p.category.kind === "product") findings.push({ severity: "info", title: "A product from a non-EU maker is covered once it is placed on the EU market. The importer then carries the manufacturer's checks." });
  if (p.legacy && p.category && p.category.kind === "service") findings.push({ severity: "medium", title: "Transitional rules (Art 32) can let a service keep running unchanged under a contract signed before 28 June 2025, and let certain self-service terminals already in use stay in service, but only for a limited time. Read Article 32 against your contract dates." });
  findings.push({ severity: "info", title: "Linked enterprises count in full towards size. Enter whole-group figures. Partner-enterprise proportional rules are not applied here." });
  return {
    errors: [], size: micro ? "micro" : "notmicro", sizeLabel: SIZE_LABEL[micro ? "micro" : "notmicro"],
    category: p.category, role: p.role, verdict, ladder, findings,
    obligations: inScope ? OBLIGATIONS[p.role.id] : [],
    input: { staff: p.staff, turnover: p.turnover, balance: p.balance, eu: p.eu, audience: p.audience },
  };
}

export const SAMPLE = { category: "s-ecommerce", role: "provider", staff: "14", turnover: "2.6", balance: "1.1", eu: "yes", audience: "consumers", legacy: "" };

const STATUS_TEXT = { in: "in scope", "exempt-micro": "exempt as a microenterprise", out: "not in scope directly" };

export function summaryText(r) {
  const v = r.verdict;
  const lines = [
    "European Accessibility Act check (first read, not legal advice)",
    `What you make or sell: ${r.category.label}`,
    `Role: ${r.role.label}`,
    `Size on whole-group figures: ${r.sizeLabel} (${r.input.staff} people, EUR ${r.input.turnover}M turnover, EUR ${r.input.balance}M balance sheet)`,
    `Result: ${STATUS_TEXT[v.status]} [${v.via}]`,
    v.reason,
    "",
    "Same business at the other size class:",
    ...r.ladder.map((l) => `  ${SIZE_LABEL[l.size]}: ${STATUS_TEXT[l.status]}`),
  ];
  if (r.obligations.length) lines.push("", "Main duties:", ...r.obligations.map((o) => `  - ${o}`));
  lines.push("", "Member States transposed the Directive into national law with differences. Confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function ladderCsv(r) {
  return ["size,status,basis", ...r.ladder.map((l) => [SIZE_LABEL[l.size], l.status, l.via].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}
