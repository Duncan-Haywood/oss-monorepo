// External service providers (ESPs) for a Level 2 assessment: table 4 to 32 CFR 170.19(c)(2)(i)
// and the documentation paragraph (c)(2)(ii), plus pure checks on a shop's provider list.
//
// Every string in ESP_QUOTES is a verbatim substring of 32 CFR 170.19 as read in full from the
// eCFR versioner API on 2026-11-26 (https://www.ecfr.gov/api/versioner/v1/full/2026-11-20/
// title-32.xml?part=170&section=170.19, amended 16 Dec 2024; file sha256
// 69465e2bd4fc5a15247db28a15728a36aa2988ad32c1d3c08ad6299de084f197, the same file the public
// scoping worksheet pinned on 2026-11-25). service-providers.test.ts pins the quotes' hash.
// The plain-language `summary` and `needs` lines are this app's own wording of the table.
import { controlById } from "./controls";

export const ESP_QUOTES = {
  intro:
    "The OSA must consider whether the ESP is a Cloud Service Provider (CSP) and whether the ESP processes, stores, or transmits CUI and/or Security Protection Data (SPD).",
  cspCui: "The CSP shall meet the FedRAMP requirements in 48 CFR 252.204-7012",
  espCui:
    "The services provided by the ESP are in the OSA's assessment scope and shall be assessed as part of the OSA's assessment.",
  cspSpd:
    "The services provided by the CSP are in the OSA's assessment scope and shall be assessed as Security Protection Assets",
  espSpd:
    "The services provided by the ESP are in the OSA's assessment scope and shall be assessed as Security Protection Assets.",
  neither:
    "A service provider that does not process CUI or SPD does not meet the CMMC definition of an ESP",
  document:
    "The use of an ESP, its relationship to the OSA, and the services provided need to be documented in the OSA's SSP and described in the ESP's service description and customer responsibility matrix (CRM), which describes the responsibilities of the OSA and ESP with respect to the services provided.",
} as const;

export const ESP_RULE_VERIFICATION = {
  source: "32 CFR 170.19(c)(2) (table 4, ESP scoping requirements, and paragraph (ii))",
  url: "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.19",
  readOn: "2026-11-26",
  checkedAgainstRule: true,
  note: "The quoted lines are the rule's own words (32 CFR 170.19(c)(2), as read on eCFR on 26 November 2026). The plain-language notes are this app's summaries. The rule governs; read it, and DFARS 252.204-7012 for cloud providers that hold CUI, before deciding a scope.",
} as const;

/** What the provider processes, stores or transmits: the rows of table 4. */
export const ESP_DATA = ["cui", "spd", "neither"] as const;
export type EspData = (typeof ESP_DATA)[number];

export const ESP_DATA_LABEL: Record<EspData, string> = {
  cui: "CUI (with or without Security Protection Data)",
  spd: "Security Protection Data, no CUI",
  neither: "Neither CUI nor Security Protection Data",
};

/** Who carries a requirement, as the provider's customer responsibility matrix says. */
export const RESPONSIBILITIES = ["provider", "shared"] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

export const RESPONSIBILITY_LABEL: Record<Responsibility, string> = {
  provider: "Provider",
  shared: "Shared",
};

export interface EspScope {
  /** Whether table 4 puts the provider's services in the OSA's assessment scope. */
  inScope: boolean;
  /** Whether the provider meets the CMMC definition of an ESP at all. */
  isEsp: boolean;
  label: string;
  /** Verbatim cell of table 4 for this row and column. */
  rule: string;
  /** This app's one-line reading of that cell. */
  summary: string;
  /** What to have on file, in this app's words, citing the paragraph each comes from. */
  needs: string[];
}

const DOC_NEEDS = [
  "Describe the provider, its relationship to you and the services it provides in your SSP (170.19(c)(2)(ii)).",
  "Keep the provider's service description and customer responsibility matrix (CRM) (170.19(c)(2)(ii)).",
];

/** Table 4 to 32 CFR 170.19(c)(2)(i), one cell per (data, CSP or not). Pure. */
export function espScope(data: EspData, isCsp: boolean): EspScope {
  if (data === "neither")
    return {
      inScope: false,
      isEsp: false,
      label: "Not an ESP",
      rule: ESP_QUOTES.neither,
      summary:
        "Not in the assessment scope as a service provider. Keep a line on why, in case an assessor asks.",
      needs: [],
    };
  if (data === "cui")
    return isCsp
      ? {
          inScope: true,
          isEsp: true,
          label: "Cloud provider holding CUI",
          rule: ESP_QUOTES.cspCui,
          summary:
            "The cloud service must meet DFARS 252.204-7012's FedRAMP requirement: FedRAMP Moderate authorized, or security requirements equivalent to the FedRAMP Moderate baseline.",
          needs: [
            "Record the basis for the FedRAMP requirement: the FedRAMP Moderate authorization, or the provider's evidence of equivalency (48 CFR 252.204-7012(b)(2)(ii)(D)).",
            ...DOC_NEEDS,
          ],
        }
      : {
          inScope: true,
          isEsp: true,
          label: "Service provider holding CUI",
          rule: ESP_QUOTES.espCui,
          summary:
            "Its services are part of your assessment: the requirements it carries are assessed as yours.",
          needs: DOC_NEEDS,
        };
  return {
    inScope: true,
    isEsp: true,
    label: isCsp
      ? "Cloud provider holding Security Protection Data"
      : "Service provider holding Security Protection Data",
    rule: isCsp ? ESP_QUOTES.cspSpd : ESP_QUOTES.espSpd,
    summary:
      "Its services are assessed as Security Protection Assets: against the requirements relevant to the capabilities it provides.",
    needs: DOC_NEEDS,
  };
}

export interface ControlShare {
  controlId: string;
  responsibility: Responsibility;
}

export interface ProviderLike {
  id: string;
  name: string;
  data: EspData;
  isCsp: boolean;
  services: string;
  fedrampBasis: string;
  serviceDescriptionRef: string;
  crmRef: string;
  /** The same documents as evidence files the org holds; either a file or a typed reference counts. */
  serviceDescriptionEvidenceId?: string | null;
  crmEvidenceId?: string | null;
  notes: string;
  controls: ControlShare[];
}

/** True when the document is on file: a linked evidence file or a typed reference. */
export const hasDocument = (ref: string, evidenceId?: string | null) =>
  Boolean(evidenceId) || ref.trim() !== "";

export interface ProviderCheck {
  total: number;
  inScope: number;
  /** Plain-language problems an assessor would ask about first, in order. */
  issues: { providerId: string | null; message: string }[];
}

/** Gaps in the provider list worth fixing before the SSP goes out. Pure. */
export function checkProviders(providers: ProviderLike[]): ProviderCheck {
  const issues: ProviderCheck["issues"] = [];
  let inScope = 0;
  for (const p of providers) {
    const scope = espScope(p.data, p.isCsp);
    if (scope.inScope) inScope++;
    if (!scope.isEsp) {
      if (!p.notes.trim())
        issues.push({
          providerId: p.id,
          message: `${p.name}: add a note saying why it holds neither CUI nor Security Protection Data.`,
        });
      if (p.controls.length > 0)
        issues.push({
          providerId: p.id,
          message: `${p.name}: requirements are marked as carried by a provider that is not an ESP. Check what it holds, or clear the requirements.`,
        });
      continue;
    }
    if (!p.services.trim())
      issues.push({ providerId: p.id, message: `${p.name}: say which services it provides.` });
    if (p.data === "cui" && p.isCsp && !p.fedrampBasis.trim())
      issues.push({
        providerId: p.id,
        message: `${p.name}: record the FedRAMP basis (Moderate authorization or equivalency evidence) required for a cloud provider that holds CUI.`,
      });
    if (!hasDocument(p.serviceDescriptionRef, p.serviceDescriptionEvidenceId))
      issues.push({
        providerId: p.id,
        message: `${p.name}: attach its service description from Evidence, or note where it is kept.`,
      });
    if (!hasDocument(p.crmRef, p.crmEvidenceId))
      issues.push({
        providerId: p.id,
        message: `${p.name}: attach its customer responsibility matrix (CRM) from Evidence, or note where it is kept.`,
      });
    else if (p.controls.length === 0)
      issues.push({
        providerId: p.id,
        message: `${p.name}: mark the requirements its CRM says it carries, alone or shared, so the SSP shows them.`,
      });
  }
  return { total: providers.length, inScope, issues };
}

/** Control ids that are not Level 2 requirements, or listed twice. Empty when the list is fine. */
export function controlSharesProblem(shares: ControlShare[]): string | null {
  const seen = new Set<string>();
  for (const s of shares) {
    const c = controlById(s.controlId);
    if (c?.level !== 2) return `${s.controlId} is not a Level 2 requirement.`;
    if (seen.has(s.controlId)) return `${s.controlId} is listed twice.`;
    seen.add(s.controlId);
  }
  return null;
}

export interface ProviderShareLine {
  name: string;
  responsibility: Responsibility;
}

/** Per requirement, the providers that carry it (alone or shared), for the SSP and Controls page. */
export function sharesByControl(
  providers: Pick<ProviderLike, "name" | "data" | "controls">[],
): Map<string, ProviderShareLine[]> {
  const out = new Map<string, ProviderShareLine[]>();
  for (const p of providers) {
    if (p.data === "neither") continue;
    for (const s of p.controls) {
      const list = out.get(s.controlId) ?? [];
      list.push({ name: p.name, responsibility: s.responsibility });
      out.set(s.controlId, list);
    }
  }
  return out;
}

/** "Provider (Microsoft 365 GCC High); shared with PreVeil" for one requirement. */
export function shareSentence(lines: ProviderShareLine[]): string {
  const by = (r: Responsibility) =>
    lines
      .filter((l) => l.responsibility === r)
      .map((l) => l.name)
      .join(", ");
  const parts: string[] = [];
  if (by("provider")) parts.push(`carried by ${by("provider")}`);
  if (by("shared")) parts.push(`shared with ${by("shared")}`);
  return parts.join("; ");
}

/** Hard caps per organization, so one tenant cannot fill the database. */
export const MAX_PROVIDERS_PER_ORG = 200;
