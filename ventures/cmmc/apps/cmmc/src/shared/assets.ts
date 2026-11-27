// Level 2 asset inventory: the five asset categories of the CMMC Level 2 scoping rule
// (32 CFR 170.19(c)(1), table 3 to that paragraph) and pure checks on an inventory.
//
// Each category's `rule` and the Specialized Asset kinds are verbatim substrings of 32 CFR 170.19
// as read in full from the eCFR versioner API on 2026-11-25 (amended 16 Dec 2024; file sha256
// 69465e2b...f197). They were copied from the public repository's
// ventures/machine-shop-guides/scope.mjs `QUOTES`, where scope.test.mjs pins their hash and
// SOURCES.md records the fetch; the session that built this app could not reach eCFR itself.
// `summary` and `document` are this app's own plain-language wording of the same table row.

export const ASSET_CATEGORIES = [
  "cui",
  "security_protection",
  "contractor_risk_managed",
  "specialized",
  "out_of_scope",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** The kinds table 3 lists for Specialized Assets, in the rule's order. */
export const SPECIALIZED_TYPES = [
  "iot",
  "iiot",
  "ot",
  "gfe",
  "restricted_information_system",
  "test_equipment",
] as const;
export type SpecializedType = (typeof SPECIALIZED_TYPES)[number];

export const ASSET_RULE_VERIFICATION = {
  source:
    "32 CFR 170.19(c)(1), table 3 (CMMC Level 2 asset categories and associated requirements)",
  url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.19",
  readOn: "2026-11-25",
  checkedAgainstRule: true,
  note: "The quoted descriptions are the rule's own words (32 CFR 170.19, table 3, as read on eCFR on 25 November 2026). The plain-language notes under them are this app's summaries. The rule governs; read it before deciding a scope.",
} as const;

export interface CategoryInfo {
  key: AssetCategory;
  label: string;
  /** Verbatim from table 3 to 32 CFR 170.19(c)(1). */
  rule: string;
  /** The app's own one-line summary, with machine-shop examples. */
  summary: string;
  /** The app's own summary of what the organization documents and how the asset is assessed. */
  document: string;
  /** Whether the SSP's asset table must explain how the asset is managed (notes). */
  needsManagementNote: boolean;
}

export const CATEGORY_INFO: Record<AssetCategory, CategoryInfo> = {
  cui: {
    key: "cui",
    label: "CUI Assets",
    rule: "Assets that process, store, or transmit CUI",
    summary: "The laptops, file shares, email and CAM workstations that touch drawings marked CUI.",
    document:
      "List in the asset inventory, the SSP and the network diagram of the assessment scope. Assessed against all Level 2 security requirements.",
    needsManagementNote: false,
  },
  security_protection: {
    key: "security_protection",
    label: "Security Protection Assets",
    rule: "Assets that provide security functions or capabilities to the OSA's CMMC Assessment Scope",
    summary:
      "Firewall, MFA, antivirus/EDR, logging and backup for the in-scope systems, whether or not they touch CUI.",
    document:
      "List in the asset inventory, the SSP and the network diagram. Assessed against the Level 2 security requirements relevant to the capabilities they provide.",
    needsManagementNote: false,
  },
  contractor_risk_managed: {
    key: "contractor_risk_managed",
    label: "Contractor Risk Managed Assets",
    rule: "Assets that can, but are not intended to, process, store, or transmit CUI because of security policy, procedures, and practices in place",
    summary:
      "Could reach CUI but a written rule keeps CUI off them (the rule adds: they need not be separated from CUI assets).",
    document:
      "List in the asset inventory, the SSP (with the policy that keeps CUI off) and the network diagram. The assessor reviews the SSP; if the documentation raises questions, the assessor can do a limited check.",
    needsManagementNote: true,
  },
  specialized: {
    key: "specialized",
    label: "Specialized Assets",
    rule: "Assets that can process, store, or transmit CUI but are unable to be fully secured, including: Internet of Things (IoT) devices, Industrial Internet of Things (IIoT) devices, Operational Technology (OT), Government Furnished Equipment (GFE), Restricted Information Systems, and Test Equipment",
    summary:
      "CNC controllers and DNC boxes (OT), CMMs (test equipment), machine monitoring (IIoT).",
    document:
      "List in the asset inventory, the SSP and the network diagram, and show in the SSP they are managed using your risk-based security policies, procedures and practices. The assessor reviews the SSP; not assessed against other CMMC security requirements.",
    needsManagementNote: true,
  },
  out_of_scope: {
    key: "out_of_scope",
    label: "Out-of-Scope Assets",
    rule: "Assets that cannot process, store, or transmit CUI; and do not provide security protections for CUI Assets",
    summary:
      "Physically or logically separated from CUI assets. An asset that fits any in-scope category cannot be out of scope.",
    document:
      'Not assessed. The rule asks you to "Prepare to justify the inability of an Out-of-Scope Asset to process, store, or transmit CUI": keep that reason in the notes.',
    needsManagementNote: true,
  },
};

export const SPECIALIZED_LABEL: Record<SpecializedType, string> = {
  iot: "Internet of Things (IoT) device",
  iiot: "Industrial Internet of Things (IIoT) device",
  ot: "Operational Technology (OT)",
  gfe: "Government Furnished Equipment (GFE)",
  restricted_information_system: "Restricted Information System",
  test_equipment: "Test Equipment",
};

export interface AssetLike {
  id: string;
  name: string;
  category: AssetCategory;
  specializedType: SpecializedType | null;
  notes: string;
}

export interface InventoryCheck {
  total: number;
  counts: Record<AssetCategory, number>;
  /** Plain-language problems an assessor would ask about first, in order. */
  issues: { assetId: string | null; message: string }[];
}

/** Counts by category and the gaps worth fixing before the SSP goes out. Pure. */
/**
 * Verbatim from table 3 to 32 CFR 170.19(c)(1), "OSA requirements" of the CUI, Security Protection,
 * Contractor Risk Managed and Specialized Asset rows (eCFR, read 2026-11-26; same file sha256
 * 69465e2b...f197 as ASSET_RULE_VERIFICATION). Out-of-Scope Assets carry no such line.
 */
export const NETWORK_DIAGRAM_QUOTE =
  "Document in the network diagram of the CMMC Assessment Scope.";

/** Categories whose table 3 row asks for the network diagram (every one but out of scope). */
export const DIAGRAM_CATEGORIES: readonly AssetCategory[] = [
  "cui",
  "security_protection",
  "contractor_risk_managed",
  "specialized",
];

export interface InventoryOptions {
  /** Whether a network diagram file is linked to the inventory. Omitted: not checked. */
  hasNetworkDiagram?: boolean;
}

export function checkInventory(assets: AssetLike[], opts: InventoryOptions = {}): InventoryCheck {
  const counts = Object.fromEntries(ASSET_CATEGORIES.map((k) => [k, 0])) as Record<
    AssetCategory,
    number
  >;
  const issues: InventoryCheck["issues"] = [];
  for (const a of assets) counts[a.category]++;
  if (assets.length > 0 && counts.cui === 0)
    issues.push({
      assetId: null,
      message:
        "No CUI asset is listed. Name every system that processes, stores or transmits CUI, or the SSP has nothing in scope.",
    });
  if (assets.length > 0 && counts.security_protection === 0)
    issues.push({
      assetId: null,
      message:
        "No Security Protection Asset is listed. Firewalls, MFA, endpoint protection and backup that protect the CUI systems usually belong here.",
    });
  if (
    opts.hasNetworkDiagram === false &&
    assets.some((a) => DIAGRAM_CATEGORIES.includes(a.category))
  )
    issues.push({
      assetId: null,
      message: `No network diagram is linked. For every in-scope category the rule says: "${NETWORK_DIAGRAM_QUOTE}" Link the diagram file under Network diagram.`,
    });
  for (const a of assets) {
    if (a.category === "specialized" && !a.specializedType)
      issues.push({
        assetId: a.id,
        message: `${a.name}: choose which kind of specialized asset it is.`,
      });
    if (CATEGORY_INFO[a.category].needsManagementNote && !a.notes.trim()) {
      const what =
        a.category === "out_of_scope"
          ? "why it cannot process, store or transmit CUI"
          : a.category === "contractor_risk_managed"
            ? "which policies and practices keep CUI off it"
            : "how risk-based practices manage it";
      issues.push({ assetId: a.id, message: `${a.name}: add a note saying ${what}.` });
    }
  }
  return { total: assets.length, counts, issues };
}

/** Error text for an invalid category/type pair, or null when it is fine. */
export function categoryProblem(
  category: AssetCategory,
  specializedType: SpecializedType | null | undefined,
): string | null {
  if (category === "specialized" && !specializedType)
    return "Choose which kind of specialized asset this is.";
  if (category !== "specialized" && specializedType)
    return "Only specialized assets take a specialized asset type.";
  return null;
}

export interface AssetCsvRow extends AssetLike {
  assetType: string;
  location: string;
  provider: string;
  owner: string;
}

/** RFC 4180 CSV; cells starting with = + - @ tab or CR get a leading ' against formula injection. */
export function assetsCsv(rows: AssetCsvRow[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Asset",
    "Category (32 CFR 170.19(c))",
    "Specialized asset type",
    "Type",
    "Location",
    "Provided by",
    "Owner",
    "Notes",
  ];
  const lines = rows.map((r) =>
    [
      r.name,
      CATEGORY_INFO[r.category].label,
      r.specializedType ? SPECIALIZED_LABEL[r.specializedType] : "",
      r.assetType,
      r.location,
      r.provider,
      r.owner,
      r.notes,
    ]
      .map(cell)
      .join(","),
  );
  return `${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}

/** Hard cap per organization, so one tenant cannot fill the database. */
export const MAX_ASSETS_PER_ORG = 2000;
