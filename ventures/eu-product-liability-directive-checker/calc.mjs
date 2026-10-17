// EU Product Liability Directive (EU) 2024/2853 first-read checker: given a
// business's role in the supply chain, what it sells (hardware, software, AI,
// digital manufacturing files), its licence and when it places the product on the
// EU market, is it inside the new strict-liability regime, who answers for a
// defect, and what to prepare. Pure functions, no I/O. Bad input is rejected with
// a message, never clamped. Rules were written from memory of the Directive and its
// recitals WITHOUT network access in the building session; every result names the
// source to verify before it is quoted or relied on.

export const APPLIES_FROM = "2026-12-09";
export const VERIFY = "Directive (EU) 2024/2853 of 23 October 2024 (OJ L, 18.11.2024), Arts. 4, 5, 8, 11, 17 and 19, and recitals 13-16";

export const ROLES = [
  { id: "manufacturer", label: "Manufacturer / developer of the finished product" },
  { id: "component", label: "Maker of a component, software module or related service built into another product" },
  { id: "modifier", label: "I substantially modify a product already on the market" },
  { id: "importer", label: "Importer into the EU of a product made outside it" },
  { id: "authrep", label: "Authorised representative in the EU for a non-EU maker" },
  { id: "fulfilment", label: "Fulfilment service provider (warehousing, packing, shipping)" },
  { id: "distributor", label: "Distributor or retailer" },
  { id: "platform", label: "Online marketplace or platform" },
];

export const KINDS = [
  { id: "physical", label: "Physical product (hardware, appliance, toy, tool)" },
  { id: "software", label: "Software or app (installed, embedded or firmware)" },
  { id: "ai", label: "AI system or model supplied as software" },
  { id: "file", label: "Digital manufacturing file (3D-print file, CNC or CAD recipe)" },
  { id: "service", label: "A pure service (consulting, hosting, no product delivered)" },
];

export const LICENCES = [
  { id: "na", label: "Not software or not applicable" },
  { id: "commercial", label: "Sold, licensed or subscribed for money" },
  { id: "oss_free", label: "Open source, developed and supplied outside any commercial activity" },
  { id: "oss_commercial", label: "Open source, but supplied as part of a commercial activity (paid support, bundled, monetised)" },
];

export const PLACED = [
  { id: "after", label: "On or after 9 December 2026" },
  { id: "before", label: "Before 9 December 2026" },
  { id: "unsure", label: "Not sure / continuous releases" },
];

export const BASES = [
  { id: "eu", label: "My business is established in the EU" },
  { id: "noneu", label: "My business is outside the EU" },
];

const SOFT = new Set(["software", "ai", "file"]);
const MAKERS = new Set(["manufacturer", "component", "modifier"]);

const DAY = 86400000;
function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function fmt(iso) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "not fixed";
}
export function daysUntil(iso, today) {
  const d = parseDate(iso), t = parseDate(today);
  if (!d || !t) return null;
  return Math.round((d - t) / DAY);
}
export function statusOf(iso, today) {
  if (!iso) return { state: "pending", text: "No date fixed yet" };
  const n = daysUntil(iso, today);
  if (n <= 0) return { state: "inforce", text: `Applying since ${fmt(iso)}` };
  return { state: n <= 365 ? "soon" : "later", text: `Applies to products placed on the market from ${fmt(iso)} (${n} day${n === 1 ? "" : "s"} away)` };
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const role = String(i.role || "");
  const kind = String(i.kind || "");
  if (!ROLES.some((r) => r.id === role)) errors.push("Choose your role in the supply chain.");
  if (!KINDS.some((k) => k.id === kind)) errors.push("Choose what you supply.");
  const licence = LICENCES.some((l) => l.id === i.licence) ? i.licence : "na";
  const placed = PLACED.some((p) => p.id === i.placed) ? i.placed : "unsure";
  const base = BASES.some((b) => b.id === i.base) ? i.base : "eu";
  const updates = i.updates === "no" ? "no" : "yes";
  const today = i.today && parseDate(i.today) ? i.today : new Date().toISOString().slice(0, 10);
  return { errors, role, kind, licence, placed, base, updates, today };
}

// Who is liable in the order the Directive lays out (Arts. 8 and 11).
function chain(p) {
  switch (p.role) {
    case "manufacturer":
      return { severity: "high", title: "You are the first person claimants sue: the manufacturer is strictly liable for a defective product, with no fault needed and no cap on damages." };
    case "component":
      return { severity: "high", title: "A component maker is liable alongside the finished-product maker for a defect in the component (joint and several), and can face the claim directly. Your contract recourse against the integrator matters." };
    case "modifier":
      return { severity: "high", title: "A substantial modification (one changing the product's purpose, performance or risk and made outside the original maker's control) makes you the manufacturer of the modified product for the defects it causes." };
    case "importer":
      return { severity: "high", title: p.base === "eu" ? "If the maker is outside the EU you are liable as the importer, as if you were the manufacturer." : "Importer liability attaches to a business established in the EU; from outside the EU you need an EU importer or authorised representative to sell here." };
    case "authrep":
      return { severity: "high", title: "Where the maker is outside the EU and there is no importer, the authorised representative is liable in the importer's place." };
    case "fulfilment":
      return { severity: "medium", title: "A fulfilment provider is liable only as a last resort: where the product has no EU manufacturer, importer or authorised representative." };
    case "distributor":
      return { severity: "medium", title: "A distributor is liable only if it fails to name the manufacturer, importer or its own supplier within one month of a claimant's request. Keep supplier records so you can answer in time." };
    case "platform":
      return { severity: "medium", title: "An online platform is treated like a distributor, and can be liable, when it lets a consumer conclude a contract in a way that makes them believe the platform itself supplies the product, or a trader on it is one it presents as its own." };
    default:
      return { severity: "info", title: "" };
  }
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const findings = [];
  const status = statusOf(APPLIES_FROM, p.today);
  const soft = SOFT.has(p.kind);
  let scope = "in";

  if (p.kind === "service") {
    scope = "out";
    findings.push({ severity: "medium", title: "A pure service with no product delivered is not a 'product' under the Directive, so this regime does not apply to the service itself. Fault-based national liability and your contracts still do. A service that is integrated into or interconnected with a product (a 'related service' that controls the product) is treated as a component: choose the component role instead." });
  } else if (soft && p.licence === "oss_free") {
    scope = "out";
    findings.push({ severity: "medium", title: "Free and open-source software developed or supplied outside the course of a commercial activity is excluded. Donations that only cover costs do not make it commercial; paid support, a monetised distribution or embedding it in something you sell does, and then the embedding business is liable for it as a component." });
  } else if (p.placed === "before") {
    scope = "old";
    findings.push({ severity: "medium", title: "A product placed on the market before 9 December 2026 stays under the old 1985 Directive (and national law), where software's status as a 'product' is less clear. The new regime attaches to the date each unit is placed on the market, so each new release or version after that date is new exposure." });
  }

  findings.unshift({ severity: scope === "in" ? "high" : "info", title: `Timing: ${status.text}. Member States transpose it by the same date.` });

  if (scope === "in") {
    if (p.placed === "unsure") findings.push({ severity: "medium", title: "You are not sure when a unit is placed on the market. For continuous releases and updates, each version you make available after 9 December 2026 counts, so plan as though you are in scope." });
    findings.push(chain(p));
    findings.push({ severity: "info", title: soft ? "Software, firmware, apps, AI systems and digital manufacturing files are expressly 'products', whether installed, embedded or delivered in the cloud." : "Physical products are covered including when they contain software, and software or connected services that the product needs to work are covered with them." });
    findings.push({ severity: "info", title: "Compensable harm: death and personal injury (including recognised psychological harm), damage to property not used exclusively for professional purposes, and destruction or corruption of data not used for professional purposes. There is no EUR 500 threshold and no overall cap." });
    findings.push({ severity: "info", title: "Time limits: 3 years from when the claimant knew or should have known, with a 10-year long-stop from placing the product on the market (25 years for latent personal injury). Keep technical files, test records and release notes for at least 10 years." });
    findings.push({ severity: "high", title: "Courts can order you to disclose relevant evidence, and a claimant can benefit from presumptions of defect or causation when the case is technically complex or you refuse disclosure. Prepare your design, test and risk documentation now; a gap in it is evidence." });
    if (MAKERS.has(p.role) && soft) {
      const control = p.updates === "yes";
      findings.push({ severity: "high", title: control ? "You control updates, so you stay liable for defects introduced by an update and for failing to supply a security or safety update needed to keep the product safe, for as long as the product is in the market and within your control. Document your patch policy and end-of-support dates." : "You say you do not control updates. The Directive still treats a missing update the maker could have supplied, and a cybersecurity weakness the maker failed to fix, as potential defects. Say clearly in contracts and documentation who patches what." });
    }
    if (MAKERS.has(p.role) && p.base === "noneu") findings.push({ severity: "high", title: "Selling into the EU from outside it needs an EU importer or authorised representative, otherwise the first EU fulfilment provider or distributor carries liability and will pass the cost back to you by contract." });
    findings.push({ severity: "info", title: "Practical steps: check product-liability insurance wording for software, AI and data-loss cover; add recourse and indemnity terms with component suppliers and integrators; keep a one-month response process for 'who made this' requests; align with the Cyber Resilience Act and GPSR obligations, which feed what counts as 'defective'." });
  }
  findings.push({ severity: "info", title: "Liability under the Directive cannot be excluded or limited by contract toward the injured person." });
  return { errors: [], input: p, scope, status, findings };
}

export const SAMPLE = { role: "manufacturer", kind: "ai", licence: "commercial", placed: "after", base: "noneu", updates: "yes", today: "2026-10-13" };

const SCOPE_LABEL = { in: "IN SCOPE of the new regime", out: "OUTSIDE the regime on these facts", old: "Under the old 1985 regime for units placed before 9 December 2026" };

export function summaryText(r) {
  const role = ROLES.find((x) => x.id === r.input.role).label;
  const kind = KINDS.find((x) => x.id === r.input.kind).label;
  return [
    "EU Product Liability Directive check (first read, not legal advice)",
    `Role: ${role}`,
    `Supplying: ${kind}`,
    `Result: ${SCOPE_LABEL[r.scope]}`,
    `Timing: ${r.status.text}`,
    "",
    ...r.findings.filter((f) => f.severity !== "info" || r.scope === "in").map((f) => `- ${f.title}`),
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with a lawyer or your insurer.",
  ].join("\n");
}
