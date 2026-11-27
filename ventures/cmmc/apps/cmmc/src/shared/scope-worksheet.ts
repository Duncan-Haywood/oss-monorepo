// Asset inventory, part 2: the public CMMC scoping worksheet's saved file ("Save as a file (JSON)",
// format `machine-shop-guides/cmmc-scope` version 1) read into Level 2 assets. The file holds the
// shop's answers, not a category column, so the worksheet's own Level 2 `classify` is ported here
// from oss-monorepo `ventures/machine-shop-guides/scope.mjs` (MIT, same owner; read 2026-11-26).
// Only the category decision is ported, not the worksheet's documentation lists or wording:
// `scope-worksheet.test.ts` checks every branch against the worksheet's own results for the same
// answers, so a change there shows up as a failing test here, never as a silent drift.
//
// Nothing is guessed beyond what the worksheet itself concludes. Where its answers fit no category
// ("Not resolved"), the asset is listed with the worksheet's open questions and left out, exactly as
// the worksheet's CSV export's "Not resolved" rows are.

export const SCOPE_FORMAT = "machine-shop-guides/cmmc-scope";

/** The worksheet's asset kinds, with the specialized kind the rule names for the ones it lists. */
export const WORKSHEET_KINDS: Record<
  string,
  { label: string; service?: true; specialized?: "ot" | "test_equipment" | "gfe" | "iot_or_iiot" }
> = {
  workstation: { label: "Workstation or laptop" },
  cam: { label: "CAD/CAM workstation" },
  server: { label: "Server, NAS or file share" },
  mobile: { label: "Phone or tablet" },
  printer: { label: "Printer, scanner or copier" },
  network: { label: "Firewall, router, switch or Wi-Fi" },
  security: { label: "Security tool (MFA, antivirus/EDR, logging, backup, identity)" },
  cloud: { label: "Cloud or managed service (email, file storage, MSP)", service: true },
  cnc: { label: "CNC machine controller or DNC system", specialized: "ot" },
  cmm: { label: "CMM or other inspection / test equipment", specialized: "test_equipment" },
  iot: {
    label: "IoT / IIoT device (machine monitoring, cameras, badge readers)",
    specialized: "iot_or_iiot",
  },
  gfe: { label: "Government furnished equipment", specialized: "gfe" },
  removable: { label: "USB drive or other removable media" },
  paper: { label: "Paper prints and travelers (not an IT asset; track how they are handled)" },
  other: { label: "Something else" },
};

export interface WorksheetAsset {
  name: string;
  kind: string;
  owner: string;
  location: string;
  cui: "unknown" | "yes" | "can" | "cannot";
  security: boolean;
  unsecurable: boolean;
  policy: string;
  separation: string;
  espData: "unknown" | "cui" | "spd" | "neither";
  csp: boolean;
  notes: string;
}

export interface WorksheetScope {
  level: "1" | "2";
  company: string;
  assets: WorksheetAsset[];
}

export type WorksheetCategory = "cui" | "spa" | "crma" | "specialized" | "oos" | "unresolved";

/** The worksheet caps a list at 500 assets and these field lengths; the same here. */
export const WORKSHEET_MAX_ASSETS = 500;

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
function pick<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return list.includes(v as T) ? (v as T) : d;
}

/** True when a parsed value is the worksheet's saved file (by its `format` field). */
export function isWorksheetFile(raw: unknown): raw is Record<string, unknown> {
  return (
    !!raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as { format?: unknown }).format === SCOPE_FORMAT
  );
}

/** Port of the worksheet's `normaliseScope`: any parsed object back to clean answers. */
export function normaliseWorksheet(raw: Record<string, unknown>): WorksheetScope {
  const list = Array.isArray(raw.assets) ? raw.assets.slice(0, WORKSHEET_MAX_ASSETS) : [];
  return {
    level: raw.level === "1" ? "1" : "2",
    company: str(raw.company, 200),
    assets: list
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => {
        const kind = typeof a.kind === "string" && WORKSHEET_KINDS[a.kind] ? a.kind : "other";
        return {
          name: str(a.name, 200),
          kind,
          owner: str(a.owner, 200),
          location: str(a.location, 200),
          cui: pick(a.cui, ["unknown", "yes", "can", "cannot"] as const, "unknown"),
          security: a.security === true,
          unsecurable:
            typeof a.unsecurable === "boolean"
              ? a.unsecurable
              : Boolean(WORKSHEET_KINDS[kind]?.specialized),
          policy: str(a.policy),
          separation: str(a.separation),
          espData: pick(a.espData, ["unknown", "cui", "spd", "neither"] as const, "unknown"),
          csp: a.csp === true,
          notes: str(a.notes),
        };
      }),
  };
}

/**
 * Port of the worksheet's Level 2 `classify`: the category one asset's answers point to and the
 * questions still open. Same order of questions as the worksheet: an outside service by what it
 * holds (table 4 to 32 CFR 170.19(c)(2)(i)); then CUI on purpose, a security function, CUI possible
 * (specialized if it cannot be fully secured, CRMA only with a written policy), and cannot.
 */
export function classifyWorksheetAsset(a: WorksheetAsset): {
  cat: WorksheetCategory;
  gaps: string[];
} {
  const kind = WORKSHEET_KINDS[a.kind] ?? WORKSHEET_KINDS.other;
  const specialKind = Boolean(kind?.specialized) && a.unsecurable;
  const gaps: string[] = [];
  if (kind?.service) {
    if (a.espData === "unknown") {
      gaps.push(
        "Say whether the service holds CUI, Security Protection Data (logs, configuration) or neither.",
      );
      return { cat: "unresolved", gaps };
    }
    if (a.espData === "cui") return { cat: "cui", gaps };
    if (a.espData === "spd") return { cat: "spa", gaps };
    return { cat: "oos", gaps };
  }
  if (a.cui === "unknown") {
    gaps.push("Answer whether it handles CUI.");
    return { cat: "unresolved", gaps };
  }
  if (a.cui === "yes") return { cat: specialKind ? "specialized" : "cui", gaps };
  if (a.security) return { cat: "spa", gaps };
  if (a.cui === "can") {
    if (specialKind) return { cat: "specialized", gaps };
    if (!a.policy.trim()) {
      gaps.push(
        "Write the policy, procedure or practice that keeps CUI off it, or treat it as a CUI Asset.",
      );
      return { cat: "unresolved", gaps };
    }
    return { cat: "crma", gaps };
  }
  return { cat: "oos", gaps };
}
