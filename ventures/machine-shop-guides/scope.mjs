/**
 * CMMC scoping worksheet: sort a shop's assets into the 32 CFR 170.19 asset
 * categories and list what each one has to have documented.
 *
 * The categories, their descriptions and what the rule asks of each are in
 * table 3 to 32 CFR 170.19(c)(1) (Level 2) and paragraph (b) (Level 1); the
 * ESP rows are table 4 to (c)(2)(i). The text was read from the eCFR on
 * 25 Nov 2026 (section 170.19 as amended 16 Dec 2024; hashes in SOURCES.md),
 * and the strings in QUOTES are verbatim substrings of it, pinned by
 * scope.test.mjs. The questions and the order they are asked in are ours: the
 * rule defines the categories, it does not give a decision tree. Where our
 * order decides a tie (an asset that is both a security asset and holds CUI
 * is a CUI Asset), the reason is in the code.
 *
 * Nothing here decides a scope for anyone. It writes down the shop's own
 * answers and says which category those answers point to, and where the
 * answers do not fit any category.
 */

export const QUOTES = {
  cui: "Assets that process, store, or transmit CUI",
  spa: "Assets that provide security functions or capabilities to the OSA's CMMC Assessment Scope",
  crma: "Assets that can, but are not intended to, process, store, or transmit CUI because of security policy, procedures, and practices in place",
  crmaSep: "Assets are not required to be physically or logically separated from CUI assets.",
  specialized: "Assets that can process, store, or transmit CUI but are unable to be fully secured, including: Internet of Things (IoT) devices, Industrial Internet of Things (IIoT) devices, Operational Technology (OT), Government Furnished Equipment (GFE), Restricted Information Systems, and Test Equipment",
  oos: "Assets that cannot process, store, or transmit CUI; and do not provide security protections for CUI Assets",
  oosSep: "Assets that are physically or logically separated from CUI assets",
  oosNever: "Assets that fall into any in-scope asset category cannot be considered an Out-of-Scope Asset",
  vdi: "An endpoint hosting a VDI client configured to not allow any processing, storage, or transmission of CUI beyond the Keyboard/Video/Mouse sent to the VDI client is considered an Out-of-Scope Asset",
  oosJustify: "Prepare to justify the inability of an Out-of-Scope Asset to process, store, or transmit CUI",
  specializedManaged: "Show these assets are managed using the contractor's risk-based security policies, procedures, and practices.",
  crmaLimited: "the assessor can conduct a limited check to identify deficiencies.",
  cspCui: "The CSP shall meet the FedRAMP requirements in 48 CFR 252.204-7012",
  espNot: "A service provider that does not process CUI or SPD does not meet the CMMC definition of an ESP",
  l1Scope: "OSA information systems which process, store, or transmit FCI are in scope for CMMC Level 1 and must be self-assessed against applicable CMMC security requirements.",
  l1Oos: "There are no documentation requirements for out-of-scope assets.",
  l1Specialized: "Specialized Assets are not part of the Level 1 CMMC Assessment Scope and are not assessed against CMMC security requirements.",
};

const DOC_ALL = ["asset inventory", "SSP (how the asset is treated)", "network diagram of the assessment scope"];

/** Level 2 categories (table 3 to 32 CFR 170.19(c)(1)); `assessed` is our short form of the table's last column. */
export const CATEGORIES = {
  cui: { label: "CUI Asset", inScope: true, describes: QUOTES.cui, document: DOC_ALL, assessed: "Against all Level 2 security requirements." },
  spa: { label: "Security Protection Asset", inScope: true, describes: QUOTES.spa, document: DOC_ALL, assessed: "Against the Level 2 security requirements relevant to the capabilities it provides." },
  crma: { label: "Contractor Risk Managed Asset", inScope: true, describes: QUOTES.crma, document: DOC_ALL, assessed: "The assessor reviews the SSP. If it is documented well enough, not assessed against other requirements; if the documentation raises questions, the assessor can do a limited check." },
  specialized: { label: "Specialized Asset", inScope: true, describes: QUOTES.specialized, document: [...DOC_ALL, "how it is managed under your risk-based security policies, procedures and practices"], assessed: "The assessor reviews the SSP; not assessed against other CMMC security requirements." },
  oos: { label: "Out-of-Scope Asset", inScope: false, describes: QUOTES.oos, document: ["a justification of why it cannot process, store or transmit CUI"], assessed: "None." },
  unresolved: { label: "Not resolved", inScope: true, describes: "", document: DOC_ALL, assessed: "Until the answers fit a category, plan on it being a CUI Asset." },
};

/** Level 1 (32 CFR 170.19(b)): in scope, specialized (excluded), out of scope. */
export const L1_CATEGORIES = {
  in: { label: "In scope (FCI)", inScope: true, describes: QUOTES.l1Scope, document: ["Level 1 self-assessment scope"], assessed: "Self-assessed against the 15 Level 1 requirements." },
  specialized: { label: "Specialized Asset (not in Level 1 scope)", inScope: false, describes: QUOTES.l1Specialized, document: [], assessed: "Not assessed." },
  oos: { label: "Out of scope", inScope: false, describes: QUOTES.l1Oos, document: [], assessed: "None." },
};

/** Asset kinds a small shop has. `specialized` marks kinds the rule lists as Specialized Assets. */
export const KINDS = [
  { id: "workstation", label: "Workstation or laptop" },
  { id: "cam", label: "CAD/CAM workstation" },
  { id: "server", label: "Server, NAS or file share" },
  { id: "mobile", label: "Phone or tablet" },
  { id: "printer", label: "Printer, scanner or copier" },
  { id: "network", label: "Firewall, router, switch or Wi-Fi" },
  { id: "security", label: "Security tool (MFA, antivirus/EDR, logging, backup, identity)" },
  { id: "cloud", label: "Cloud or managed service (email, file storage, MSP)", service: true },
  { id: "cnc", label: "CNC machine controller or DNC system", specialized: "Operational Technology (OT)" },
  { id: "cmm", label: "CMM or other inspection / test equipment", specialized: "Test Equipment" },
  { id: "iot", label: "IoT / IIoT device (machine monitoring, cameras, badge readers)", specialized: "IoT or IIoT" },
  { id: "gfe", label: "Government furnished equipment", specialized: "Government Furnished Equipment (GFE)" },
  { id: "removable", label: "USB drive or other removable media" },
  { id: "paper", label: "Paper prints and travelers (not an IT asset; track how they are handled)" },
  { id: "other", label: "Something else" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

const CUI_ANSWERS = ["unknown", "yes", "can", "cannot"]; // does it handle CUI on purpose / could it / separated
const ESP_DATA = ["unknown", "cui", "spd", "neither"];

export function emptyAsset(kind = "workstation") {
  return { name: "", kind: KIND[kind] ? kind : "other", owner: "", location: "", cui: "unknown", fci: "unknown", security: false, unsecurable: Boolean(KIND[kind]?.specialized), policy: "", separation: "", espData: "unknown", csp: false, notes: "" };
}

export function emptyScope() {
  return { level: "2", company: "", enclave: "", assets: [] };
}

const str = (v, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** Bring any parsed object (a saved file, a stored draft) back to a clean scope. */
export function normaliseScope(raw) {
  const s = emptyScope();
  if (!raw || typeof raw !== "object") return s;
  s.level = raw.level === "1" ? "1" : "2";
  s.company = str(raw.company, 200);
  s.enclave = str(raw.enclave);
  const list = Array.isArray(raw.assets) ? raw.assets.slice(0, 500) : [];
  s.assets = list.filter((a) => a && typeof a === "object").map((a) => {
    const kind = KIND[a.kind] ? a.kind : "other";
    return {
      name: str(a.name, 200), kind, owner: str(a.owner, 200), location: str(a.location, 200),
      cui: pick(a.cui, CUI_ANSWERS, "unknown"), fci: pick(a.fci, ["unknown", "yes", "no"], "unknown"),
      security: a.security === true, unsecurable: typeof a.unsecurable === "boolean" ? a.unsecurable : Boolean(KIND[kind].specialized),
      policy: str(a.policy), separation: str(a.separation),
      espData: pick(a.espData, ESP_DATA, "unknown"), csp: a.csp === true, notes: str(a.notes),
    };
  });
  return s;
}

/**
 * The category one asset's answers point to, with the reason and anything
 * still missing. Level 2 unless `level` is "1".
 */
export function classify(a, level = "2") {
  const kind = KIND[a.kind] ?? KIND.other;
  const specialKind = Boolean(kind.specialized) && a.unsecurable;
  const gaps = [];

  if (level === "1") {
    if (a.fci === "unknown") return { cat: "in", ...L1_CATEGORIES.in, reason: "Answer whether it processes, stores or transmits FCI. Until then, count it in.", gaps: ["Answer the FCI question."] };
    if (a.fci === "no") return { cat: "oos", ...L1_CATEGORIES.oos, reason: "It does not process, store or transmit FCI (32 CFR 170.19(b)(2)(i)).", gaps };
    if (specialKind) return { cat: "specialized", ...L1_CATEGORIES.specialized, reason: `${kind.specialized} that cannot be fully secured: a Specialized Asset, outside the Level 1 scope (170.19(b)(2)(ii)).`, gaps };
    return { cat: "in", ...L1_CATEGORIES.in, reason: "It processes, stores or transmits FCI (170.19(b)(1)).", gaps };
  }

  const out = (cat, reason) => ({ cat, ...CATEGORIES[cat], reason, gaps });

  // An external service is scoped by table 4 first: what it holds, and whether it is a cloud provider.
  if (kind.service) {
    if (a.espData === "unknown") {
      gaps.push("Say whether the service holds CUI, Security Protection Data (logs, configuration) or neither.");
      return out("unresolved", "An outside service is scoped by what it holds (table 4 to 170.19(c)(2)(i)).");
    }
    if (a.espData === "cui") {
      if (a.csp) gaps.push("Get the provider's evidence that it meets security requirements equivalent to the FedRAMP Moderate baseline (DFARS 252.204-7012(b)(2)(ii)(D)), and its customer responsibility matrix.");
      else gaps.push("Get the provider's service description and customer responsibility matrix (170.19(c)(2)(ii)).");
      return out("cui", a.csp
        ? "A cloud provider that holds CUI: " + QUOTES.cspCui + "."
        : "A service provider that holds CUI: its services are in your assessment scope and assessed as part of your assessment (table 4).");
    }
    if (a.espData === "spd") {
      gaps.push("Get the provider's service description and customer responsibility matrix (170.19(c)(2)(ii)).");
      return out("spa", "A provider that holds Security Protection Data but no CUI: its services are assessed as Security Protection Assets (table 4).");
    }
    return out("oos", QUOTES.espNot + " (table 4). Keep a line on why, in case an assessor asks.");
  }

  if (a.cui === "unknown") {
    gaps.push("Answer whether it handles CUI.");
    return out("unresolved", "Not answered yet: whether it processes, stores or transmits CUI.");
  }
  if (a.cui === "yes") {
    // A security tool that also holds CUI is still a CUI Asset: it gets every requirement, which covers the narrower SPA set.
    if (specialKind) return out("specialized", `${kind.specialized} that handles CUI and cannot be fully secured: a Specialized Asset. Show how it is managed under your risk-based policies.`);
    return out("cui", "It processes, stores or transmits CUI.");
  }
  if (a.security) {
    // Table 3: "Assets that fall into any in-scope asset category cannot be considered an Out-of-Scope Asset",
    // so a security tool for the scope stays in even if it is separated from CUI.
    return out("spa", "It provides security functions to the assessment scope (for example MFA, logging, a firewall, endpoint protection or backup of in-scope systems).");
  }
  if (a.cui === "can") {
    if (specialKind) return out("specialized", `${kind.specialized} that could reach CUI and cannot be fully secured: a Specialized Asset.`);
    if (!a.policy.trim()) {
      gaps.push("Write the policy, procedure or practice that keeps CUI off it, or treat it as a CUI Asset.");
      return out("unresolved", "It could reach CUI but no written policy keeps CUI off it. A Contractor Risk Managed Asset is one that is not intended to handle CUI \"because of security policy, procedures, and practices in place\".");
    }
    return out("crma", "It could reach CUI but is not intended to, because of the policy you named. It does not need to be separated from CUI assets.");
  }
  // cannot
  if (!a.separation.trim()) gaps.push("Say how it is physically or logically separated from CUI assets: the rule asks you to be ready to justify it.");
  return out("oos", "It cannot process, store or transmit CUI and gives no security protection to CUI assets.");
}

/** Every asset classified, totals by category, and what is still open. */
export function review(scope) {
  const s = normaliseScope(scope);
  const rows = s.assets.map((a, i) => ({ i, asset: a, ...classify(a, s.level) }));
  const counts = {};
  for (const r of rows) counts[r.cat] = (counts[r.cat] || 0) + 1;
  const issues = [];
  for (const r of rows) {
    const nm = r.asset.name.trim() || `Asset ${r.i + 1}`;
    if (!r.asset.name.trim()) issues.push(`${nm}: give it a name an assessor can find on the network diagram.`);
    for (const g of r.gaps) issues.push(`${nm}: ${g}`);
  }
  if (s.level === "2") {
    const anyCui = rows.some((r) => r.cat === "cui" || (r.cat === "specialized" && r.asset.cui === "yes"));
    if (rows.length && !anyCui) issues.push("No asset is marked as handling CUI. If the contract has DFARS 252.204-7012, the drawings land somewhere: email, a file share, a CAM workstation.");
    if (rows.length && !rows.some((r) => r.cat === "spa" || r.asset.security)) issues.push("No security tool listed (firewall, MFA, antivirus/EDR, logging, backup). Most scopes have some; each is a Security Protection Asset.");
    if (rows.some((r) => r.cat === "cui") && !rows.some((r) => KIND[r.asset.kind]?.service)) issues.push("No email or cloud service listed. If drawings arrive by email, the mail service is in scope.");
  }
  const inScope = rows.filter((r) => r.inScope).length;
  return { level: s.level, rows, counts, inScope, outOfScope: rows.length - inScope, issues };
}

function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The asset inventory as CSV, one row per asset. */
export function inventoryCsv(scope) {
  const r = review(scope);
  const head = ["asset", "kind", "owner", "location", r.level === "1" ? "handles FCI" : "handles CUI", "security function", "category", "in scope", "document in", "assessed", "policy (CRMA)", "separation (out of scope)", "reason", "open items", "notes"];
  const rows = [head];
  for (const x of r.rows) {
    const a = x.asset;
    rows.push([a.name, KIND[a.kind]?.label ?? a.kind, a.owner, a.location, r.level === "1" ? a.fci : (KIND[a.kind]?.service ? `service holds ${a.espData}${a.csp ? " (cloud provider)" : ""}` : a.cui), a.security ? "yes" : "no", x.label, x.inScope ? "yes" : "no", x.document.join("; "), x.assessed, a.policy, a.separation, x.reason, x.gaps.join(" "), a.notes]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/**
 * One line per in-scope asset in the form the SSP template's "Hardware,
 * software and services in scope" box asks for: item, owner, what it does with CUI.
 */
export function sspInventoryLines(scope) {
  const r = review(scope);
  return r.rows.filter((x) => x.inScope).map((x) => {
    const a = x.asset;
    const role = x.cat === "cui" ? "processes/stores/transmits CUI"
      : x.cat === "spa" ? "provides security functions to the scope"
      : x.cat === "crma" ? `not intended to handle CUI (${a.policy.trim().replace(/\s+/g, " ")})`
      : x.cat === "specialized" ? `${KIND[a.kind]?.specialized ?? "specialized asset"}, managed under risk-based policy`
      : x.cat === "in" ? "processes/stores/transmits FCI"
      : "category not resolved";
    return [a.name.trim() || "(unnamed)", a.owner.trim() || "(owner?)", `${x.label}: ${role}`].join(", ");
  }).join("\n");
}

export function scopeToJson(scope) {
  return JSON.stringify({ format: "machine-shop-guides/cmmc-scope", version: 1, ...normaliseScope(scope) }, null, 2) + "\n";
}

/** An invented example shop, for the "load an example" button. Not a real company. */
export function exampleScope() {
  const a = (kind, o) => ({ ...emptyAsset(kind), ...o });
  const s = normaliseScope({
    level: "2", company: "Example Precision (invented)",
    enclave: "CUI jobs: one Microsoft 365 GCC High mailbox and SharePoint site, two CAM workstations, the DNC server and the CNC controllers on a separate VLAN.",
    assets: [
      a("cloud", { name: "M365 GCC High (CUI mail and files)", owner: "Owner", espData: "cui", csp: true }),
      a("cam", { name: "CAM-01", owner: "Programmer", location: "Office", cui: "yes" }),
      a("cam", { name: "CAM-02", owner: "Programmer", location: "Office", cui: "yes" }),
      a("server", { name: "DNC server", owner: "Shop lead", location: "Shop floor", cui: "yes" }),
      a("cnc", { name: "Mill 1 controller", owner: "Shop lead", location: "Cell 1", cui: "yes" }),
      a("cmm", { name: "CMM", owner: "Quality", location: "Inspection room", cui: "can" }),
      a("network", { name: "Firewall", owner: "MSP", security: true, cui: "cannot" }),
      a("security", { name: "MFA and endpoint protection", owner: "MSP", security: true, cui: "cannot" }),
      a("cloud", { name: "MSP remote monitoring (logs, config)", owner: "MSP", espData: "spd" }),
      a("printer", { name: "Office printer", owner: "Office", cui: "can", policy: "CUI prints only on the shop-floor printer in the enclave; office printer blocked from the CUI VLAN." }),
      a("workstation", { name: "Front office PC", owner: "Office manager", cui: "cannot", separation: "On the guest/office VLAN with no route to the CUI VLAN; no GCC High account." }),
      a("mobile", { name: "Owner's phone", owner: "Owner", cui: "can" }),
    ],
  });
  // Level 1 answers for the same list: anything that holds or could hold the drawings holds FCI too.
  for (const x of s.assets) x.fci = x.cui === "yes" || x.cui === "can" || x.espData === "cui" ? "yes" : "no";
  return s;
}
