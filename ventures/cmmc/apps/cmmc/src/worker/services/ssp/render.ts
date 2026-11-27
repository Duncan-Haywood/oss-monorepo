// System Security Plan generator. Pure: takes the org's data, returns Markdown. Only ACCEPTED
// implementation statements are printed; unreviewed AI drafts are counted, never included.

import {
  ASSET_CATEGORIES,
  ASSET_RULE_VERIFICATION,
  type AssetCategory,
  CATEGORY_INFO,
  DIAGRAM_CATEGORIES,
  NETWORK_DIAGRAM_QUOTE,
  SPECIALIZED_LABEL,
  type SpecializedType,
} from "@shared/assets";
import {
  type CmmcLevel,
  CONTROLS,
  type ControlState,
  FAMILIES,
  type FamilyCode,
  LEVEL2_BASELINE,
  LIBRARY_VERIFICATION,
  PARTIAL_CREDIT_RULES,
  SOURCES,
  scoreLevel1,
  scoreLevel2,
} from "@shared/controls";
import { SCOPE_DISCLAIMER } from "@shared/enums";
import {
  type ControlShare,
  ESP_DATA_LABEL,
  ESP_QUOTES,
  ESP_RULE_VERIFICATION,
  type EspData,
  espScope,
  shareSentence,
  sharesByControl,
} from "@shared/service-providers";

export interface SspAsset {
  name: string;
  category: AssetCategory;
  specializedType: SpecializedType | null;
  assetType: string;
  location: string;
  provider: string;
  notes: string;
}

export interface SspRecord {
  controlId: string;
  status: ControlState["status"];
  partialCredit: ControlState["partialCredit"];
  statement: string;
  draftStatement: string | null;
  ownerName: string | null;
}

export interface SspProvider {
  name: string;
  data: EspData;
  isCsp: boolean;
  services: string;
  fedrampBasis: string;
  serviceDescriptionRef: string;
  crmRef: string;
  /** "evidence file "CRM v3" (sha256 …)" when the document is a linked evidence file. */
  serviceDescriptionFile?: string;
  crmFile?: string;
  notes: string;
  controls: ControlShare[];
}

export interface SspInput {
  orgName: string;
  level: CmmcLevel;
  generatedAt: Date;
  profile: {
    legalName: string;
    cageCode: string;
    systemName: string;
    systemDescription: string;
    boundaryDescription: string;
    environmentDescription: string;
    connectionsDescription: string;
    sspUpdateFrequency: string;
    affirmingOfficial: string;
  };
  records: SspRecord[];
  evidenceCount: Record<string, number>;
  poam: { controlId: string; weakness: string; scheduledCompletion: string; status: string }[];
  /** Level 2 asset inventory; printed under the system boundary (Level 2 only). */
  assets?: SspAsset[];
  /** The network diagram's evidence file line (title, file name, hash), or "" when none is linked. */
  networkDiagram?: string;
  /** External service providers (32 CFR 170.19(c)(2)); Level 2 only. */
  providers?: SspProvider[];
  /** Written security policies (Policies tab); printed as section 8 when given. */
  policies?: SspPolicy[];
  /** People tab counts for 3.2.1-3.2.3 and 3.9.1-3.9.2 (Level 2 only). Counts, never names. */
  personnel?: SspPersonnel;
}

/** What the People tab's records show, per requirement, on the day the SSP is generated. */
export interface SspPersonnel {
  /** The date the counts were taken (the records' "today"). */
  asOf: string;
  /** People recorded at all (current and departed). */
  recorded: number;
  /** The organization's refresher interval in months (its own choice; NIST sets none). */
  refreshMonths: number;
  requirements: { controlId: string; applies: number; covered: number; reading: string }[];
  /** Open gaps the People tab lists, per requirement. */
  gaps: Record<string, number>;
}

const TRAINING_CONTROL_IDS = new Set(["AT.L2-3.2.1", "AT.L2-3.2.2", "AT.L2-3.2.3"]);

/** What a zero means for each requirement, said plainly instead of "0 of 0". */
const NONE_APPLY: Record<string, string> = {
  "AT.L2-3.2.1": "No current people recorded.",
  "AT.L2-3.2.2": "Nobody current is marked as having security duties.",
  "AT.L2-3.2.3": "No current people recorded.",
  "PS.L2-3.9.1": "Nobody current is marked as having access to systems containing CUI.",
  "PS.L2-3.9.2": "No departures or transfers recorded.",
};

/** One line under a 3.2.x or 3.9.x requirement: the count, its date and the open gaps. */
export function personnelLine(p: SspPersonnel, controlId: string): string | null {
  const r = p.requirements.find((x) => x.controlId === controlId);
  if (!r) return null;
  const where = `Personnel records (People tab, as of ${p.asOf})`;
  if (p.recorded === 0) return `- ${where}: _No people recorded yet._`;
  const reading = r.applies === 0 ? (NONE_APPLY[controlId] ?? r.reading) : r.reading;
  const interval =
    TRAINING_CONTROL_IDS.has(controlId) && r.applies > 0
      ? ` Refresher interval: every ${p.refreshMonths} months (the organization's choice; NIST SP 800-171 Rev. 2 sets none).`
      : "";
  const n = p.gaps[controlId] ?? 0;
  const gaps = n > 0 ? ` ${n} open gap(s) listed on the People tab.` : "";
  return `- ${where}: ${reading}${interval}${gaps}`;
}

export interface SspPolicy {
  family: FamilyCode;
  title: string;
  /** The approved version in force, or null when never approved. */
  versionInForce: number | null;
  approvedOn: string | null;
  reviewDue: string | null;
  /** A newer version is being drafted. */
  draftPending: boolean;
}

const STATUS_LABEL: Record<ControlState["status"], string> = {
  not_assessed: "Not yet assessed",
  not_implemented: "Not implemented",
  partially_implemented: "Partially implemented",
  implemented: "Implemented",
  not_applicable: "Not applicable",
};

const orMissing = (s: string) => (s.trim() ? s.trim() : "_Not yet provided._");
/** Keep user text from forging headings or tables in the generated Markdown. */
const para = (s: string) => orMissing(s).replace(/^(#+|\|)/gm, "\\$1");

export function renderSsp(input: SspInput): string {
  const { profile: p, level } = input;
  const byId = new Map(input.records.map((r) => [r.controlId, r]));
  const states = new Map<string, ControlState>(
    input.records.map((r) => [r.controlId, { status: r.status, partialCredit: r.partialCredit }]),
  );
  const controls = CONTROLS[level];
  const shares = level === 2 ? sharesByControl(input.providers ?? []) : new Map();
  const drafts = controls.filter((c) => {
    const r = byId.get(c.id);
    return r?.draftStatement && !r.statement.trim();
  }).length;
  const out: string[] = [];
  out.push(`# System Security Plan — ${p.systemName.trim() || input.orgName}`);
  out.push("");
  out.push(`> ${SCOPE_DISCLAIMER}`);
  out.push("");
  out.push(`- Organization: ${p.legalName.trim() || input.orgName}`);
  if (p.cageCode.trim()) out.push(`- CAGE code: ${p.cageCode.trim()}`);
  out.push(`- CMMC level prepared for: Level ${level}`);
  out.push(`- Generated: ${input.generatedAt.toISOString().slice(0, 10)}`);
  out.push(`- SSP review frequency: ${orMissing(p.sspUpdateFrequency)}`);
  out.push(`- Affirming official: ${orMissing(p.affirmingOfficial)}`);
  out.push("");
  out.push("## Requirement baseline");
  out.push("");
  if (level === 2) {
    out.push(
      `Level 2 requirements: ${LEVEL2_BASELINE.references}. Sources: ${SOURCES.nist171r2.title}; ${SOURCES.nist171a.title}; scoring per ${SOURCES.dodMethodology.title} ${SOURCES.dodMethodology.version} and ${SOURCES.cfr32part170.title}.`,
    );
  } else {
    out.push(
      `Level 1 requirements: ${SOURCES.far52204_21.title}, as adopted by ${SOURCES.cfr32part170.title}.`,
    );
  }
  if (!LIBRARY_VERIFICATION.verifiedAgainstOfficialText) {
    out.push("");
    out.push(
      `> Requirement text in this document was transcribed from the public-domain sources above and has not yet been proofread against the official publications (${LIBRARY_VERIFICATION.transcribedOn}). Check it before relying on it.`,
    );
  }
  out.push("");
  out.push("## 1. System description");
  out.push("");
  out.push(para(p.systemDescription));
  out.push("");
  out.push("## 2. System boundary");
  out.push("");
  out.push(para(p.boundaryDescription));
  out.push("");
  if (level === 2) renderAssets(out, input.assets ?? [], input.networkDiagram ?? "");
  if (level === 2) renderProviders(out, input.providers ?? []);
  out.push("## 3. Environment of operation");
  out.push("");
  out.push(para(p.environmentDescription));
  out.push("");
  out.push("## 4. Connections to other systems");
  out.push("");
  out.push(para(p.connectionsDescription));
  out.push("");
  out.push("## 5. Self-assessment summary");
  out.push("");
  if (level === 2) {
    const s = scoreLevel2(states);
    out.push(
      s.score === null
        ? "- Score: **not computable** — requirement 3.12.4 (system security plan) is not marked implemented, and the DoD Assessment Methodology produces no score without an SSP."
        : `- Self-assessed score (DoD Assessment Methodology): **${s.score}** of 110`,
    );
    out.push(
      `- Implemented: ${s.counts.implemented} · Not applicable: ${s.counts.not_applicable} · Partially implemented: ${s.counts.partially_implemented} · Not implemented: ${s.counts.not_implemented} · Not yet assessed: ${s.counts.not_assessed}`,
    );
  } else {
    const s = scoreLevel1(states);
    out.push(
      `- Requirements met: ${s.met} of ${s.total}${s.allMet ? "" : " (Level 1 requires all 15; no POA&M is allowed)"}`,
    );
  }
  if (drafts > 0)
    out.push(
      `- ${drafts} requirement(s) have an AI draft awaiting review; drafts are not included below.`,
    );
  out.push("");
  out.push("## 6. Requirement implementation");
  let family: FamilyCode | null = null;
  for (const c of controls) {
    if (c.family !== family) {
      family = c.family;
      out.push("");
      out.push(`### ${FAMILIES[c.family]} (${c.family})`);
    }
    const r = byId.get(c.id);
    const status = r?.status ?? "not_assessed";
    const partial = r?.partialCredit
      ? PARTIAL_CREDIT_RULES.find((x) => x.key === r.partialCredit)?.label
      : null;
    out.push("");
    out.push(`#### ${c.id} — ${c.ref}`);
    out.push("");
    out.push(`_${c.text}_`);
    out.push("");
    out.push(`- Status: ${STATUS_LABEL[status]}${partial ? ` (${partial})` : ""}`);
    if (c.weight !== null)
      out.push(
        `- DoD Assessment Methodology point value: ${c.weight === 0 ? "none (no score without an SSP)" : c.weight}`,
      );
    out.push(`- Responsible: ${r?.ownerName ?? "_Unassigned_"}`);
    const carried = shares.get(c.id);
    if (carried) out.push(`- External service providers: ${tableCell(shareSentence(carried))}`);
    out.push(`- Evidence files on record: ${input.evidenceCount[c.id] ?? 0}`);
    const people = level === 2 && input.personnel ? personnelLine(input.personnel, c.id) : null;
    if (people) out.push(people);
    out.push("");
    out.push(para(r?.statement ?? ""));
  }
  const open = input.poam.filter((x) => x.status === "open");
  out.push("");
  out.push("## 7. Plan of action and milestones (open items)");
  out.push("");
  if (open.length === 0) out.push("_No open items._");
  else {
    out.push("| Requirement | Weakness | Scheduled completion |");
    out.push("| --- | --- | --- |");
    for (const i of open) {
      const cell = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
      out.push(`| ${i.controlId} | ${cell(i.weakness)} | ${i.scheduledCompletion} |`);
    }
  }
  if (input.policies) renderPolicies(out, input.policies);
  out.push("");
  return out.join("\n");
}

/** "## 8. Security policies": one row per family, the approved version in force and its review. */
function renderPolicies(out: string[], policies: SspPolicy[]) {
  out.push("");
  out.push("## 8. Security policies");
  out.push("");
  out.push(
    "One written policy per NIST SP 800-171 Rev. 2 family, kept with its approvals and reviews. Only approved versions are in force.",
  );
  out.push("");
  out.push("| Family | Policy | Version in force | Approved | Next review |");
  out.push("| --- | --- | --- | --- | --- |");
  const byFamily = new Map(policies.map((p) => [p.family, p]));
  for (const f of Object.keys(FAMILIES) as FamilyCode[]) {
    const p = byFamily.get(f);
    if (!p) {
      out.push(`| ${FAMILIES[f]} (${f}) | _Not written_ | — | — | — |`);
      continue;
    }
    const version =
      p.versionInForce === null
        ? "None (draft only)"
        : `${p.versionInForce}${p.draftPending ? " (revision in draft)" : ""}`;
    out.push(
      `| ${FAMILIES[f]} (${f}) | ${tableCell(p.title)} | ${version} | ${p.approvedOn ?? "—"} | ${p.reviewDue ?? "—"} |`,
    );
  }
}

const tableCell = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

/** "### Asset inventory": one table per category that has assets, from the Assets tab. */
function renderAssets(out: string[], assets: SspAsset[], diagram: string) {
  out.push("### Asset inventory (32 CFR 170.19(c))");
  out.push("");
  const needsDiagram = assets.some((a) => DIAGRAM_CATEGORIES.includes(a.category));
  if (diagram) out.push(`Network diagram of the assessment scope: ${tableCell(diagram)}.`);
  else if (needsDiagram)
    out.push(
      `Network diagram of the assessment scope: _Not yet linked (Assets tab)._ Table 3 to 32 CFR 170.19(c)(1) asks, for every in-scope asset category: "${NETWORK_DIAGRAM_QUOTE}"`,
    );
  if (diagram || needsDiagram) out.push("");
  if (assets.length === 0) {
    out.push("_No assets recorded yet (Assets tab)._");
    out.push("");
    return;
  }
  out.push(
    `${assets.length} asset(s), by the Level 2 asset categories of ${ASSET_RULE_VERIFICATION.source}.`,
  );
  for (const key of ASSET_CATEGORIES) {
    const rows = assets.filter((a) => a.category === key);
    if (rows.length === 0) continue;
    const info = CATEGORY_INFO[key];
    out.push("");
    out.push(`**${info.label} (${rows.length})**: "${info.rule}"`);
    out.push("");
    out.push("| Asset | Type | Location | Provided by | Notes |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const a of rows) {
      const type = [a.specializedType ? SPECIALIZED_LABEL[a.specializedType] : "", a.assetType]
        .filter((x) => x.trim())
        .join(": ");
      out.push(
        `| ${tableCell(a.name)} | ${tableCell(type)} | ${tableCell(a.location)} | ${tableCell(a.provider)} | ${tableCell(a.notes) || (info.needsManagementNote ? "_Not yet provided._" : "")} |`,
      );
    }
  }
  out.push("");
}

/** "### External service providers": table 4 scoping and where each CRM is kept. */
function renderProviders(out: string[], providers: SspProvider[]) {
  out.push("### External service providers (32 CFR 170.19(c)(2))");
  out.push("");
  if (providers.length === 0) {
    out.push("_No external service providers recorded (Service providers tab)._");
    out.push("");
    return;
  }
  out.push(`> "${ESP_QUOTES.document}" (${ESP_RULE_VERIFICATION.source})`);
  out.push("");
  out.push(
    "| Provider | Holds | Cloud provider | Services | Scope (table 4) | FedRAMP basis | Service description | Customer responsibility matrix | Requirements carried |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const p of providers) {
    const scope = espScope(p.data, p.isCsp);
    const need = (v: string, required: boolean) =>
      tableCell(v) || (required ? "_Not yet provided._" : "");
    const doc = (ref: string, file: string | undefined) =>
      need([ref.trim(), file ?? ""].filter(Boolean).join("; "), scope.isEsp);
    const carried = p.controls.length
      ? `${p.controls.filter((x) => x.responsibility === "provider").length} by the provider, ${p.controls.filter((x) => x.responsibility === "shared").length} shared`
      : "";
    out.push(
      `| ${tableCell(p.name)} | ${ESP_DATA_LABEL[p.data]} | ${p.isCsp ? "Yes" : "No"} | ${need(p.services, scope.isEsp)} | ${scope.label}: "${scope.rule}" | ${need(p.fedrampBasis, p.data === "cui" && p.isCsp)} | ${doc(p.serviceDescriptionRef, p.serviceDescriptionFile)} | ${doc(p.crmRef, p.crmFile)} | ${carried} |`,
    );
  }
  const notes = providers.filter((p) => p.notes.trim());
  if (notes.length) {
    out.push("");
    for (const p of notes) out.push(`- ${tableCell(p.name)}: ${tableCell(p.notes)}`);
  }
  out.push("");
}
