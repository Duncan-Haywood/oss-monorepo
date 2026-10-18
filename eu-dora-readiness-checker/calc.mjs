// EU Digital Operational Resilience Act (DORA, Regulation (EU) 2022/2554) first read: is the
// organisation a financial entity in scope or an ICT third-party provider to one, which of the
// duty areas are still open, what a financial entity's contracts must say to a provider, and the
// major-ICT-incident reporting clocks (initial notification within 4 hours of classification and
// at most 24 hours from awareness, intermediate within 72 hours of the initial one, final within
// one month of the last intermediate one). Pure functions, no I/O; `now` is a parameter so every
// answer is repeatable. Bad input is rejected with a message, never clamped. Article numbers and
// periods were written from memory of the published text and of the incident-reporting technical
// standards without network access in the building session; verify them against CELEX 32022R2554
// and the current delegated acts, and with your supervisor, before quoting them.

export const ENTITIES = [
  { id: "credit", label: "Credit institution (bank)", scope: "in" },
  { id: "payment", label: "Payment institution or account-information service provider", scope: "in" },
  { id: "emoney", label: "Electronic money institution", scope: "in" },
  { id: "investment", label: "Investment firm", scope: "in" },
  { id: "casp", label: "Crypto-asset service provider or issuer of asset-referenced tokens (MiCA)", scope: "in" },
  { id: "market", label: "Trading venue, central counterparty, central securities depository, trade repository or data-reporting service provider", scope: "in" },
  { id: "insurer", label: "Insurance or reinsurance undertaking", scope: "in" },
  { id: "intermediary", label: "Insurance, reinsurance or ancillary insurance intermediary", scope: "intermediary" },
  { id: "iorp", label: "Occupational pension fund (IORP)", scope: "in" },
  { id: "manager", label: "Fund manager (UCITS management company or alternative investment fund manager)", scope: "in" },
  { id: "crowdfunding", label: "Crowdfunding service provider", scope: "in" },
  { id: "rating", label: "Credit rating agency, benchmark administrator or securitisation repository", scope: "in" },
  { id: "provider", label: "ICT third-party service provider (software, cloud, data or other digital services sold to financial entities)", scope: "provider" },
  { id: "other", label: "None of these", scope: "out" },
];

export const SIZES = {
  micro: "Microenterprise (fewer than 10 staff and turnover or balance sheet of 2 million euro or less)",
  sme: "Small or medium-sized enterprise",
  large: "Larger than an SME",
};

// Duty areas for a financial entity. `simplified` marks the areas Article 16 lightens.
export const FE_DUTIES = [
  { id: "governance", label: "The management body defines, approves and oversees the ICT risk framework, is trained, and owns the risk", article: "Art 5" },
  { id: "framework", label: "A documented ICT risk-management framework: asset inventory, protection and prevention, detection, response and recovery, backup, learning, communication", article: "Arts 6 to 14", simplified: "Art 16" },
  { id: "incident", label: "An ICT incident process that logs, classifies (by clients affected, duration, spread, data loss, criticality, economic impact) and escalates incidents", article: "Arts 17 and 18" },
  { id: "reporting", label: "Procedures and contacts to file major-incident initial, intermediate and final reports, and to notify clients where their interests are hit", article: "Arts 19 and 20" },
  { id: "testing", label: "A digital operational resilience testing programme, with tests of ICT tools and systems at least yearly", article: "Arts 24 and 25", simplified: "Art 16" },
  { id: "register", label: "A register of information on every contract with an ICT third-party provider, kept up to date and ready to give the supervisor", article: "Art 28(3)" },
  { id: "preContract", label: "Due diligence and a concentration-risk check before contracting an ICT provider, and a documented third-party risk strategy", article: "Arts 28 and 29" },
  { id: "contracts", label: "Contracts with ICT providers carry the mandatory provisions (see the provider list below)", article: "Art 30" },
  { id: "exit", label: "Exit strategies and tested transition plans for ICT services that support critical or important functions", article: "Art 28(8)" },
];

export const TLPT = { id: "tlpt", label: "Threat-led penetration testing (TLPT) on live production systems at least every three years, when your authority identifies you", article: "Arts 26 and 27" };

// What a financial entity's contract with an ICT provider has to contain (Art 30). `critical` items
// apply only where the service supports a critical or important function.
export const CONTRACT_TERMS = [
  { id: "description", label: "A clear description of all functions and services, and whether and on what conditions subcontracting is allowed", article: "Art 30(2)(a)" },
  { id: "locations", label: "The countries and regions where the service is provided and data is processed and stored, with notice of any change", article: "Art 30(2)(b)" },
  { id: "dataProtection", label: "Provisions on availability, authenticity, integrity and confidentiality of data, including personal data", article: "Art 30(2)(c)" },
  { id: "dataReturn", label: "Access to, recovery and return of data in an easily accessible format if the provider is insolvent, resolved or the contract ends", article: "Art 30(2)(d)" },
  { id: "sla", label: "Service-level descriptions, with precise quantitative and qualitative performance targets", article: "Art 30(2)(e), Art 30(3)(a)" },
  { id: "incidentHelp", label: "The provider helps with ICT incidents, at no extra cost or at a cost fixed in advance", article: "Art 30(2)(f)" },
  { id: "authorities", label: "The provider cooperates with the competent and resolution authorities", article: "Art 30(2)(g)" },
  { id: "termination", label: "Termination rights and minimum notice periods that match what authorities expect", article: "Art 30(2)(h)" },
  { id: "training", label: "The provider takes part in the entity's ICT security awareness and resilience training", article: "Art 30(2)(i)" },
  { id: "notice", label: "Notice periods and reporting duties for developments that could materially affect the service", article: "Art 30(3)(b)", critical: true },
  { id: "contingency", label: "The provider implements and tests business-contingency and security plans", article: "Art 30(3)(c)", critical: true },
  { id: "tlptCooperation", label: "The provider takes part in and fully cooperates in the entity's TLPT", article: "Art 30(3)(d)", critical: true },
  { id: "audit", label: "Unrestricted rights of access, inspection and audit for the entity, its auditors and authorities", article: "Art 30(3)(e)", critical: true },
  { id: "exitTerms", label: "Exit strategies, including a mandatory adequate transition period in which the provider keeps serving", article: "Art 30(3)(f)", critical: true },
];

const HOUR = 3600000;
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, "0");
export function fmt(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Parse YYYY-MM-DDTHH:MM (or with a space). Read as one fixed clock; the user must use one time zone.
export function parseStamp(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(raw || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return Number.isNaN(d.getTime()) || fmt(d) !== `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` ? null : d;
}

// Add whole calendar months in UTC, clamping to the month end (31 Jan + 1 month = 28/29 Feb).
export function addMonths(d, n) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), d.getUTCHours(), d.getUTCMinutes()));
}

// Are you inside DORA, and in which role?
export function scope(entity, size, exempt) {
  if (entity.scope === "out") return { status: "out", basis: "Not a type of financial entity DORA lists, and not an ICT provider selling to one. DORA does not apply to you directly; a financial-sector customer may still impose parts of it by contract." };
  if (entity.scope === "provider") return { status: "provider", basis: "DORA does not regulate you directly unless the European Supervisory Authorities designate you a critical ICT third-party provider (Art 31). But every financial-entity customer must put the Article 30 terms in your contract, so in practice the contract list below is your DORA." };
  if (entity.scope === "intermediary" && size !== "large") return { status: "out", basis: "Insurance intermediaries that are micro, small or medium-sized enterprises are excluded from DORA (Art 2(3)). A larger intermediary is in scope." };
  if (exempt) return { status: "check", basis: "You say a listed exemption applies (for example a sub-threshold alternative investment fund manager, a small insurer under Solvency II Article 4, an IORP with fewer than 15 members, or a firm exempt under MiFID II Articles 2 and 3). Confirm that exemption in writing with your supervisor before treating DORA as not applying (Art 2(3))." };
  return { status: "in", basis: "You are a type of financial entity DORA lists (Art 2(1)). DORA has applied since 17 January 2025." };
}

// Article 16 lightens the ICT risk framework for small, non-interconnected firms.
export function simplifiedFramework(entity, size, simplified) {
  const eligible = ["investment", "payment", "emoney", "credit", "iorp"].includes(entity.id);
  return eligible && simplified === "yes" && size !== "large";
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const entity = ENTITIES.find((e) => e.id === i.entity);
  if (!entity) errors.push("Choose what kind of organisation you are.");
  const size = Object.hasOwn(SIZES, i.size) ? i.size : "sme";
  const exempt = i.exempt === "yes";
  const simplified = i.simplified === "yes" ? "yes" : "no";
  const tlptIdentified = ["yes", "no"].includes(i.tlptIdentified) ? i.tlptIdentified : "no";
  const critical = i.critical === "yes";
  const done = {};
  for (const d of [...FE_DUTIES, TLPT, ...CONTRACT_TERMS]) done[d.id] = Boolean(i[d.id]) && i[d.id] !== "0";
  const stamps = {};
  for (const [key, label] of [["aware", "Awareness"], ["classified", "Classification"], ["initialSent", "Initial notification"], ["intermediateSent", "Intermediate report"]]) {
    if (i[key]) {
      stamps[key] = parseStamp(i[key]);
      if (!stamps[key]) errors.push(`${label} time must be a real date and time written YYYY-MM-DDTHH:MM.`);
    } else stamps[key] = null;
  }
  const now = i.now ? parseStamp(i.now) : new Date();
  if (i.now && !now) errors.push("Now must be a real date and time written YYYY-MM-DDTHH:MM.");
  if (!errors.length) {
    if ((stamps.classified || stamps.initialSent || stamps.intermediateSent) && !stamps.aware) errors.push("Enter the time you became aware of the incident first.");
    if (stamps.classified && stamps.aware && stamps.classified < stamps.aware) errors.push("Classification cannot be before awareness.");
    if (stamps.initialSent && stamps.aware && stamps.initialSent < stamps.aware) errors.push("The initial notification cannot be before awareness.");
    if (stamps.intermediateSent && !stamps.initialSent) errors.push("Enter the initial notification time before the intermediate report time.");
    if (stamps.intermediateSent && stamps.initialSent && stamps.intermediateSent < stamps.initialSent) errors.push("The intermediate report cannot be before the initial notification.");
  }
  return { errors, entity, size, exempt, simplified, tlptIdentified, critical, done, stamps, now };
}

// Major-incident clocks. Initial: 4 hours from classification as major, never later than 24 hours
// from awareness. Intermediate: 72 hours from the initial notification (or from its deadline if not
// yet sent). Final: one month from the latest intermediate report (or its deadline).
export function clocks(p) {
  const { aware, classified, initialSent, intermediateSent } = p.stamps;
  if (!aware) return null;
  const outer = new Date(aware.getTime() + 24 * HOUR);
  const fromClass = classified ? new Date(classified.getTime() + 4 * HOUR) : null;
  const initialDue = fromClass && fromClass < outer ? fromClass : outer;
  const interFrom = initialSent || initialDue;
  const intermediateDue = new Date(interFrom.getTime() + 72 * HOUR);
  const finalFrom = intermediateSent || intermediateDue;
  const finalDue = addMonths(finalFrom, 1);
  const left = (d) => Math.round(((d - p.now) / HOUR) * 10) / 10;
  return {
    initialDue: fmt(initialDue), initialBound: fromClass && fromClass < outer ? "4 hours after classification" : "24 hours after awareness",
    initialSent: Boolean(initialSent), initialLate: initialSent ? initialSent > initialDue : p.now > initialDue,
    initialHoursLeft: initialSent ? null : left(initialDue), classifiedYet: Boolean(classified),
    intermediateDue: fmt(intermediateDue), intermediateSent: Boolean(intermediateSent),
    intermediateLate: intermediateSent ? intermediateSent > intermediateDue : p.now > intermediateDue,
    intermediateHoursLeft: intermediateSent ? null : left(intermediateDue),
    finalDue: fmt(finalDue), finalLate: p.now > finalDue, finalHoursLeft: left(finalDue),
  };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const sc = scope(p.entity, p.size, p.exempt);
  const lite = simplifiedFramework(p.entity, p.size, p.simplified);
  const isFE = sc.status === "in" || sc.status === "check";
  const open = [];
  if (isFE) {
    for (const d of FE_DUTIES) if (!p.done[d.id]) open.push(d);
    if (p.tlptIdentified === "yes" && p.size !== "micro" && !p.done.tlpt) open.push(TLPT);
  }
  const terms = (sc.status === "provider" || isFE) ? CONTRACT_TERMS.filter((t) => !t.critical || p.critical) : [];
  const termsOpen = terms.filter((t) => !p.done[t.id]);
  const c = isFE ? clocks(p) : null;
  const findings = [];
  findings.push({ severity: sc.status === "in" ? "high" : "info", title: sc.basis });
  if (isFE) {
    if (lite) findings.push({ severity: "info", title: "Article 16 gives small, non-interconnected firms a simplified ICT risk framework: fewer prescribed elements, same duty to keep ICT risk under control. Check that your supervisor agrees you qualify." });
    if (p.size === "micro") findings.push({ severity: "info", title: "As a microenterprise you are not required to do TLPT, and the proportionality rule (Art 4) scales the rest to your size, risk and complexity. Incident reporting and the register of information still apply in full." });
    else if (p.tlptIdentified === "yes") findings.push({ severity: "medium", title: "Your authority has identified you for TLPT. Plan a test on live production systems at least every three years with a certified provider, under the supervisor's scheme (Arts 26 and 27)." });
    for (const d of open) {
      const high = ["register", "reporting", "contracts", "governance"].includes(d.id);
      findings.push({ severity: high ? "high" : "medium", title: `Open: ${d.label} (${d.article}).` });
    }
    if (!open.length) findings.push({ severity: "info", title: "Every duty area is marked done. Keep the evidence (framework document, board minutes, register extract, test report): supervisors ask for it." });
  }
  if (terms.length) {
    for (const t of termsOpen) findings.push({ severity: "medium", title: `${sc.status === "provider" ? "Your contracts lack" : "Contract check, missing"}: ${t.label} (${t.article}).` });
    if (!termsOpen.length) findings.push({ severity: "info", title: "Every listed contract term is marked present. Compare them against the signed text, not the template." });
  }
  if (c) {
    if (!c.initialSent) findings.push({ severity: c.initialLate ? "high" : (c.initialHoursLeft <= 2 ? "high" : "medium"), title: c.initialLate ? `Initial notification was due ${c.initialDue} (${c.initialBound}) and is overdue. File it now.` : `File the initial notification by ${c.initialDue} (${c.initialBound}), ${c.initialHoursLeft} hours left.` });
    else if (c.initialLate) findings.push({ severity: "medium", title: `The initial notification went in after its limit (${c.initialDue}). Record why and fix the process.` });
    if (!c.classifiedYet && !c.initialSent) findings.push({ severity: "info", title: "Not yet classified. The 24-hour limit from awareness already runs; if the incident is classified as major earlier, the deadline becomes 4 hours after that." });
    findings.push({ severity: c.intermediateLate ? "high" : "info", title: c.intermediateSent ? `Intermediate report ${c.intermediateLate ? "went in late (due " + c.intermediateDue + ")" : "filed on time"}.` : (c.intermediateLate ? `Intermediate report was due ${c.intermediateDue} and is overdue.` : `Intermediate report due ${c.intermediateDue}, ${c.intermediateHoursLeft} hours left. Send an update sooner if the situation changes materially.`) });
    findings.push({ severity: c.finalLate ? "high" : "info", title: c.finalLate ? `Final report was due ${c.finalDue} and is overdue.` : `Final report (with root cause) due ${c.finalDue}.` });
  }
  return { input: p, scope: sc, financialEntity: isFE, simplified: lite, open, terms, termsOpen, clocks: c, findings };
}

export const SAMPLE = {
  entity: "payment", size: "sme", exempt: "no", simplified: "no", tlptIdentified: "no", critical: "yes",
  governance: "1", framework: "1", incident: "1", reporting: "", testing: "", register: "1", preContract: "", contracts: "", exit: "", tlpt: "",
  description: "1", locations: "1", dataProtection: "1", dataReturn: "", sla: "1", incidentHelp: "", authorities: "", termination: "1", training: "",
  notice: "", contingency: "", tlptCooperation: "", audit: "", exitTerms: "",
  aware: "2026-10-12T08:30", classified: "2026-10-12T10:00", initialSent: "", intermediateSent: "", now: "2026-10-12T12:00",
};

export function summaryText(r) {
  const lines = ["EU DORA readiness check (first read, not legal advice)", `Organisation: ${r.input.entity.label}`, `Result: ${r.scope.status}`, r.scope.basis];
  if (r.open.length) lines.push("", "Open duty areas:", ...r.open.map((d) => `  - ${d.label} (${d.article})`));
  if (r.termsOpen.length) lines.push("", "Contract terms missing:", ...r.termsOpen.map((d) => `  - ${d.label} (${d.article})`));
  if (r.clocks) lines.push("", "Major-incident clocks (times as entered):", `  Initial notification by: ${r.clocks.initialDue}${r.clocks.initialLate ? "  <-- late" : ""}`, `  Intermediate report by:  ${r.clocks.intermediateDue}${r.clocks.intermediateLate ? "  <-- late" : ""}`, `  Final report by:         ${r.clocks.finalDue}${r.clocks.finalLate ? "  <-- late" : ""}`);
  lines.push("", "Confirm with your supervisor or counsel. Never put real incident details in this tool.");
  return lines.join("\n");
}

export function checklistCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  const rows = [];
  if (r.financialEntity) for (const d of FE_DUTIES) rows.push(["duty", d.label, d.article, r.open.includes(d) ? "open" : "done"]);
  for (const t of r.terms) rows.push(["contract term", t.label, t.article, r.termsOpen.includes(t) ? "missing" : "present"]);
  return ["kind,item,article,status", ...rows.map((x) => x.map(q).join(","))].join("\n");
}
