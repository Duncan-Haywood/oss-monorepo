// NIS2 (Directive (EU) 2022/2555) scope check from an entity's own sector and size figures.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Encodes Articles 2 and 3 and Annexes I and II of the Directive, and the size ceilings of
// Commission Recommendation 2003/361/EC that Article 2 points to. It does not know how any
// Member State transposed the Directive; national law decides, so the answer is a first read.

// `regardless` marks sectors that are in scope whatever the size (Art 2(2)(a), Art 3(1)(b)/(d));
// `ecomms` is public electronic communications, essential from medium size and important below it.
export const SECTORS = [
  { id: "none", label: "None of the sectors below", annex: null },
  // Annex I
  { id: "energy-electricity", label: "Energy: electricity (supply, distribution, transmission, production, nominated operators, market participants)", annex: "I" },
  { id: "energy-heating", label: "Energy: district heating and cooling", annex: "I" },
  { id: "energy-oil", label: "Energy: oil (pipelines, production, refining, storage, central stockholding)", annex: "I" },
  { id: "energy-gas", label: "Energy: gas (supply, distribution, transmission, storage, LNG, undertakings)", annex: "I" },
  { id: "energy-hydrogen", label: "Energy: hydrogen production, storage and transmission", annex: "I" },
  { id: "transport-air", label: "Transport: air (carriers, airports, traffic control)", annex: "I" },
  { id: "transport-rail", label: "Transport: rail (infrastructure managers, railway undertakings)", annex: "I" },
  { id: "transport-water", label: "Transport: water (shipping companies, ports, vessel traffic services)", annex: "I" },
  { id: "transport-road", label: "Transport: road (road authorities, intelligent transport systems operators)", annex: "I" },
  { id: "banking", label: "Banking: credit institutions", annex: "I" },
  { id: "fmi", label: "Financial market infrastructure: trading venues, central counterparties", annex: "I" },
  { id: "health-provider", label: "Health: healthcare providers (hospitals, clinics)", annex: "I" },
  { id: "health-pharma", label: "Health: pharmaceutical manufacturing or pharmaceutical R&D", annex: "I" },
  { id: "health-lab", label: "Health: EU reference laboratories, critical medical device makers in a health emergency", annex: "I" },
  { id: "water-drinking", label: "Drinking water: suppliers and distributors", annex: "I" },
  { id: "water-waste", label: "Waste water: collection, disposal or treatment", annex: "I" },
  { id: "digital-ixp", label: "Digital infrastructure: internet exchange point provider", annex: "I" },
  { id: "digital-dns", label: "Digital infrastructure: DNS service provider", annex: "I", regardless: "essential" },
  { id: "digital-tld", label: "Digital infrastructure: top-level domain name registry", annex: "I", regardless: "essential" },
  { id: "digital-cloud", label: "Digital infrastructure: cloud computing service provider", annex: "I" },
  { id: "digital-datacentre", label: "Digital infrastructure: data centre service provider", annex: "I" },
  { id: "digital-cdn", label: "Digital infrastructure: content delivery network provider", annex: "I" },
  { id: "trust-qualified", label: "Digital infrastructure: qualified trust service provider", annex: "I", regardless: "essential" },
  { id: "trust-other", label: "Digital infrastructure: trust service provider that is not qualified", annex: "I", regardless: "important" },
  { id: "ecomms", label: "Digital infrastructure: public electronic communications network or service provider", annex: "I", ecomms: true },
  { id: "ict-msp", label: "ICT service management (B2B): managed service provider", annex: "I" },
  { id: "ict-mssp", label: "ICT service management (B2B): managed security service provider", annex: "I" },
  { id: "public-central", label: "Public administration: central government body", annex: "I", regardless: "essential" },
  { id: "space", label: "Space: operators of ground-based infrastructure supporting space-based services", annex: "I" },
  // Annex II
  { id: "postal", label: "Postal and courier services", annex: "II" },
  { id: "waste", label: "Waste management", annex: "II" },
  { id: "chemicals", label: "Chemicals: manufacture, production and distribution of substances and articles", annex: "II" },
  { id: "food", label: "Food: wholesale distribution, industrial production and processing", annex: "II" },
  { id: "mfg-medical", label: "Manufacturing: medical devices and in vitro diagnostic devices", annex: "II" },
  { id: "mfg-computers", label: "Manufacturing: computer, electronic and optical products", annex: "II" },
  { id: "mfg-electrical", label: "Manufacturing: electrical equipment", annex: "II" },
  { id: "mfg-machinery", label: "Manufacturing: machinery and equipment not elsewhere classified", annex: "II" },
  { id: "mfg-vehicles", label: "Manufacturing: motor vehicles, trailers and semi-trailers", annex: "II" },
  { id: "mfg-transport", label: "Manufacturing: other transport equipment (ships, rail, aircraft, spacecraft)", annex: "II" },
  { id: "marketplace", label: "Digital providers: online marketplace", annex: "II" },
  { id: "search", label: "Digital providers: online search engine", annex: "II" },
  { id: "social", label: "Digital providers: social networking services platform", annex: "II" },
  { id: "research", label: "Research organisations", annex: "II" },
];

export const SIZE_LABEL = { small: "micro or small", medium: "medium", large: "large" };

// Recommendation 2003/361/EC Article 2, as NIS2 Article 2(1) uses it. Whole-group figures.
export function sizeClass(staff, turnoverM, balanceM) {
  if (staff < 50 && (turnoverM <= 10 || balanceM <= 10)) return "small";
  if (staff < 250 && (turnoverM <= 50 || balanceM <= 43)) return "medium";
  return "large";
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
  const sector = SECTORS.find((s) => s.id === i.sector);
  if (!sector) errors.push("Choose the sector that best describes what the entity does.");
  const staff = num(i.staff, "Staff (full-time equivalents)", errors);
  const turnover = num(i.turnover, "Annual turnover (EUR millions)", errors);
  const balance = num(i.balance, "Annual balance sheet total (EUR millions)", errors);
  const eu = ["yes", "no", "unsure"].includes(i.eu) ? i.eu : "yes";
  return { errors, sector, staff, turnover, balance, eu, designated: Boolean(i.designated) && i.designated !== "0", cer: Boolean(i.cer) && i.cer !== "0" };
}

// One scope decision for a given sector and size class. `via` says which Article the call rests on.
export function classify({ sector, size, eu = "yes", designated = false, cer = false }) {
  if (eu === "no") {
    return { status: "out", category: null, via: "Art 2(1)", reason: "The Directive applies to entities that provide services or carry out activities within the Union. Without that, it does not apply directly." };
  }
  if (cer) {
    return { status: "in", category: "essential", via: "Art 2(3), Art 3(1)", reason: "Entities identified as critical entities under the CER Directive are in scope whatever their size and are essential entities." };
  }
  if (!sector || sector.annex === null) {
    if (designated) return { status: "in", category: "set by your Member State", via: "Art 2(2)(b)-(e)", reason: "Member States can designate an entity in scope whatever its size or sector type where it is a sole provider, a systemic risk or nationally critical. The category follows the designation." };
    return { status: "out", category: null, via: "Annex I and II", reason: "The Directive covers the sectors and types listed in Annex I and Annex II. Nothing here lists the entity, so it is not in scope directly." };
  }
  if (sector.regardless) {
    return { status: "in", category: sector.regardless, via: sector.id === "public-central" ? "Art 2(2)(f), Art 3(1)(d)" : sector.regardless === "essential" ? "Art 2(2)(a), Art 3(1)(b)" : "Art 2(2)(a), Art 3(2)", reason: "This type of entity is in scope whatever its size." };
  }
  if (sector.ecomms) {
    return { status: "in", category: size === "small" ? "important" : "essential", via: size === "small" ? "Art 2(2)(a), Art 3(2)" : "Art 3(1)(c)", reason: "Public electronic communications providers are in scope whatever their size; they are essential from medium size and important below it." };
  }
  if (size === "small") {
    if (designated) return { status: "in", category: "set by your Member State", via: "Art 2(2)(b)-(e)", reason: "Below medium size the Directive does not apply by size, but a Member State can designate the entity in scope; the category follows the designation." };
    return { status: "maybe-out", category: null, via: "Art 2(1)", reason: "Below medium size an entity in an Annex sector is outside the Directive unless a Member State designates it, or a rule on sole providers, systemic risk or critical entities applies. Check national law." };
  }
  if (sector.annex === "I" && size === "large") return { status: "in", category: "essential", via: "Art 3(1)(a)", reason: "A large entity in an Annex I sector is an essential entity." };
  return { status: "in", category: "important", via: "Art 3(2)", reason: sector.annex === "I" ? "A medium entity in an Annex I sector is an important entity." : "A medium or large entity in an Annex II sector is an important entity." };
}

const OBLIGATIONS = [
  "Take appropriate and proportionate cyber risk-management measures (Art 21), including incident handling, business continuity, supply chain security, vulnerability handling, cryptography and access control, and multi-factor authentication where appropriate.",
  "Management bodies must approve the measures, oversee them and can be held liable, and must be trained (Art 20).",
  "Report significant incidents: an early warning within 24 hours of becoming aware, an incident notification within 72 hours, and a final report within one month (Art 23).",
];

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const size = sizeClass(p.staff, p.turnover, p.balance);
  const base = { sector: p.sector, eu: p.eu, designated: p.designated, cer: p.cer };
  const verdict = classify({ ...base, size });
  const ladder = ["small", "medium", "large"].map((s) => ({ size: s, ...classify({ ...base, size: s }) }));
  const findings = [];
  const inScope = verdict.status === "in";
  if (inScope) {
    findings.push({ severity: "high", title: `Likely in scope as ${verdict.category === "set by your Member State" ? "an entity whose category your Member State sets" : `an ${verdict.category === "essential" ? "essential" : "important"} entity`} (${verdict.via}).` });
    if (verdict.category === "essential") findings.push({ severity: "medium", title: "Essential entities face proactive (ex ante) supervision and fines of up to at least EUR 10 million or 2% of worldwide turnover, whichever is higher (Art 32, Art 34)." });
    if (verdict.category === "important") findings.push({ severity: "medium", title: "Important entities face reactive (ex post) supervision and fines of up to at least EUR 7 million or 1.4% of worldwide turnover, whichever is higher (Art 33, Art 34)." });
    if (p.sector && ["banking", "fmi"].includes(p.sector.id)) findings.push({ severity: "medium", title: "Financial entities within DORA are generally covered by that Regulation for ICT risk management and incident reporting instead of the NIS2 rules (Art 4); confirm which national and sector rules apply." });
  } else if (verdict.status === "maybe-out") {
    findings.push({ severity: "medium", title: "Not in scope by size, but check your Member State for designations and for national rules that go beyond the Directive." });
  } else {
    findings.push({ severity: "info", title: "Not in scope directly on these answers." });
  }
  if (!inScope) findings.push({ severity: "info", title: "Customers that are in scope must manage supply chain risk (Art 21(2)(d)), so expect security questionnaires and contract clauses even when the Directive does not apply to you." });
  if (p.eu === "unsure") findings.push({ severity: "medium", title: "You answered unsure on whether services are provided in the Union. Settle that first: it decides whether the Directive applies at all." });
  findings.push({ severity: "info", title: "Linked enterprises count in full towards size; partner enterprises count in proportion. Enter whole-group figures. Proportional partner rules are not applied here." });
  return { errors: [], size, sizeLabel: SIZE_LABEL[size], sector: p.sector, verdict, ladder, findings, obligations: inScope ? OBLIGATIONS : [], input: { staff: p.staff, turnover: p.turnover, balance: p.balance, eu: p.eu } };
}

export const SAMPLE = { sector: "digital-cloud", staff: "120", turnover: "22", balance: "18", eu: "yes", designated: "", cer: "" };

export function summaryText(r) {
  const v = r.verdict;
  const lines = [
    "NIS2 scope check (first read, not legal advice)",
    `Sector: ${r.sector.label}`,
    `Size on whole-group figures: ${r.sizeLabel} (${r.input.staff} staff, EUR ${r.input.turnover}M turnover, EUR ${r.input.balance}M balance sheet)`,
    `Result: ${v.status === "in" ? `in scope, ${v.category}` : v.status === "maybe-out" ? "not in scope by size; check national designation" : "not in scope directly"} [${v.via}]`,
    v.reason,
    "",
    "Same sector at other sizes:",
    ...r.ladder.map((l) => `  ${SIZE_LABEL[l.size]}: ${l.status === "in" ? `in scope, ${l.category}` : "not in scope by size or sector"}`),
  ];
  if (r.obligations.length) lines.push("", "Main duties:", ...r.obligations.map((o) => `  - ${o}`));
  lines.push("", "Member States transposed the Directive into national law with differences. Confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function ladderCsv(r) {
  return ["size,status,category,basis", ...r.ladder.map((l) => [SIZE_LABEL[l.size], l.status, l.category || "", l.via].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
}
