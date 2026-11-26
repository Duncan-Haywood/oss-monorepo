// System Security Plan generator. Pure: takes the org's data, returns Markdown. Only ACCEPTED
// implementation statements are printed; unreviewed AI drafts are counted, never included.
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
import { markdownCell } from "@shared/markdown";

export interface SspRecord {
  controlId: string;
  status: ControlState["status"];
  partialCredit: ControlState["partialCredit"];
  statement: string;
  draftStatement: string | null;
  ownerName: string | null;
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
    out.push(`- Evidence files on record: ${input.evidenceCount[c.id] ?? 0}`);
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
      out.push(`| ${i.controlId} | ${markdownCell(i.weakness)} | ${i.scheduledCompletion} |`);
    }
  }
  out.push("");
  return out.join("\n");
}
