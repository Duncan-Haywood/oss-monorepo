// Submission package: the immutable record of exactly what was submitted. Pure functions only —
// index.ts loads the rows, stores package.json + package.md in R2 and hashes the JSON.
//
// Anti-fabrication: the package contains ONLY the org's own profile identity fields (entered by a
// human), the approved application version (every factual claim cites fact ids) and the funder's
// published requirements. Nothing here is generated.
import type {
  ApplicationContent,
  DraftSection,
  GroundingReport,
  OpportunityRequirements,
  RequirementSection,
} from "@shared/content";
import type { ReviewTier, SubmissionMethodHint } from "@shared/enums";

export const PACKAGE_SCHEMA_VERSION = 1;

export interface PackageInput {
  submissionId: string;
  generatedAt: Date;
  application: {
    id: string;
    title: string;
    requestedAmountCents: number | null;
    deadline: Date | null;
    reviewTier: ReviewTier | null;
  };
  version: {
    id: string;
    versionNumber: number;
    content: ApplicationContent;
    executiveSummary: string;
    keyPoints: string[];
    groundingReport: GroundingReport | null;
  };
  opportunity: {
    id: string;
    title: string;
    funderName: string;
    opportunityNumber: string | null;
    closeDate: Date | null;
    sourceUrl: string | null;
    submissionMethod: SubmissionMethodHint;
    submissionEmail: string | null;
    submissionUrl: string | null;
    requirements: OpportunityRequirements | null;
  };
  profile: {
    legalName: string;
    dba: string | null;
    orgType: string;
    ein: string | null;
    uei: string | null;
    websiteUrl: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  approval: {
    submittedByType: "user" | "autopilot";
    submittedBy: string | null;
    approvedBy: string | null;
  };
  /** Checklist state per requirement name (services/attachments); omitted = list only. */
  attachments?: PackageAttachmentState[];
}

/** Attachments checklist state merged into the package (by requirement name). */
export interface PackageAttachmentState {
  name: string;
  status: "missing" | "matched" | "uploaded" | "waived";
  documentId: string | null;
  documentTitle: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  note: string | null;
}

export interface PackageSection {
  key: string;
  title: string;
  /** The funder's question, when known. */
  prompt: string;
  text: string;
  wordCount: number;
  charCount: number;
  wordLimit: number | null;
  charLimit: number | null;
  overLimit: boolean;
  /** Unanswered questions (never filled with invented text). */
  gaps: { question: string; why: string }[];
}

export interface PackageAttachment {
  name: string;
  required: boolean;
  description: string;
  /** From the attachments checklist when present: what was attached (or waived, and why). */
  status?: PackageAttachmentState["status"];
  documentId?: string | null;
  documentTitle?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  note?: string | null;
}

/** The funder's attachment requirements, deduped by name (listed attachments + attachment sections). */
export function attachmentRequirements(
  reqs: OpportunityRequirements | null | undefined,
): { name: string; required: boolean; description: string }[] {
  const out: { name: string; required: boolean; description: string }[] = [];
  const seen = new Set<string>();
  for (const a of reqs?.attachments ?? []) {
    const k = a.name.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: a.name, required: a.required, description: a.description ?? "" });
  }
  for (const s of reqs?.sections ?? []) {
    if (s.kind !== "attachment") continue;
    const k = s.title.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: s.title, required: s.required, description: s.prompt });
  }
  return out;
}

export interface PackageCitation {
  claimId: string;
  sectionKey: string;
  text: string;
  factIds: string[];
}

export interface SubmissionPackage {
  schemaVersion: number;
  submissionId: string;
  generatedAt: string;
  application: {
    id: string;
    title: string;
    requestedAmountCents: number | null;
    deadline: string | null;
    reviewTier: ReviewTier | null;
    versionId: string;
    versionNumber: number;
  };
  opportunity: {
    id: string;
    title: string;
    funderName: string;
    opportunityNumber: string | null;
    deadline: string | null;
    sourceUrl: string | null;
    submissionMethod: SubmissionMethodHint;
    submissionEmail: string | null;
    submissionUrl: string | null;
    submissionInstructions: string;
  };
  applicant: {
    legalName: string;
    dba: string | null;
    orgType: string;
    ein: string | null;
    uei: string | null;
    websiteUrl: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string;
    };
    contact: { name: string | null; email: string | null; phone: string | null };
  };
  executiveSummary: string;
  keyPoints: string[];
  sections: PackageSection[];
  /** The exact structured content of the submitted version. */
  content: ApplicationContent;
  attachmentsChecklist: PackageAttachment[];
  grounding: Omit<GroundingReport, "verdicts"> | null;
  citations: PackageCitation[];
  approval: PackageInput["approval"];
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Plain-text rendering of one drafted section: claims joined into paragraphs. */
export function renderSectionText(section: DraftSection): string {
  return section.paragraphs
    .map((p) =>
      p.claims
        .map((c) => c.text.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function buildSubmissionPackage(input: PackageInput): SubmissionPackage {
  const { application: app, version, opportunity: opp, profile } = input;
  const reqs = opp.requirements;
  const reqByKey = new Map<string, RequirementSection>(
    (reqs?.sections ?? []).map((s) => [s.key, s]),
  );

  const sections: PackageSection[] = version.content.sections.map((s) => {
    const req = reqByKey.get(s.key);
    const text = renderSectionText(s);
    const wordCount = countWords(text);
    const charCount = text.length;
    const wordLimit = req?.wordLimit ?? null;
    const charLimit = req?.charLimit ?? null;
    return {
      key: s.key,
      title: s.title || req?.title || s.key,
      prompt: req?.prompt ?? "",
      text,
      wordCount,
      charCount,
      wordLimit,
      charLimit,
      overLimit:
        (wordLimit !== null && wordCount > wordLimit) ||
        (charLimit !== null && charCount > charLimit),
      gaps: s.gaps ?? [],
    };
  });

  const states = new Map(
    (input.attachments ?? []).map((a) => [a.name.trim().toLowerCase(), a] as const),
  );
  const attachments: PackageAttachment[] = attachmentRequirements(reqs).map((a) => {
    const st = states.get(a.name.trim().toLowerCase());
    if (!st) return a;
    const { name: _name, ...state } = st;
    return { ...a, ...state };
  });

  const citations: PackageCitation[] = [];
  for (const s of version.content.sections) {
    for (const p of s.paragraphs) {
      for (const c of p.claims) {
        if (c.kind !== "factual") continue;
        citations.push({ claimId: c.id, sectionKey: s.key, text: c.text, factIds: c.factIds });
      }
    }
  }

  let grounding: SubmissionPackage["grounding"] = null;
  if (version.groundingReport) {
    const { verdicts: _verdicts, ...summary } = version.groundingReport;
    grounding = summary;
  }

  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    submissionId: input.submissionId,
    generatedAt: input.generatedAt.toISOString(),
    application: {
      id: app.id,
      title: app.title,
      requestedAmountCents: app.requestedAmountCents,
      deadline: iso(app.deadline ?? opp.closeDate),
      reviewTier: app.reviewTier,
      versionId: version.id,
      versionNumber: version.versionNumber,
    },
    opportunity: {
      id: opp.id,
      title: opp.title,
      funderName: opp.funderName,
      opportunityNumber: opp.opportunityNumber,
      deadline: iso(opp.closeDate),
      sourceUrl: opp.sourceUrl,
      submissionMethod: opp.submissionMethod,
      submissionEmail: opp.submissionEmail,
      submissionUrl: opp.submissionUrl,
      submissionInstructions: reqs?.submissionInstructions ?? "",
    },
    applicant: {
      legalName: profile.legalName,
      dba: profile.dba,
      orgType: profile.orgType,
      ein: profile.ein,
      uei: profile.uei,
      websiteUrl: profile.websiteUrl,
      address: {
        line1: profile.addressLine1,
        line2: profile.addressLine2,
        city: profile.city,
        state: profile.state,
        postalCode: profile.postalCode,
        country: profile.country,
      },
      contact: {
        name: profile.contactName,
        email: profile.contactEmail,
        phone: profile.contactPhone,
      },
    },
    executiveSummary: version.executiveSummary,
    keyPoints: version.keyPoints,
    sections,
    content: version.content,
    attachmentsChecklist: attachments,
    grounding,
    citations,
    approval: input.approval,
  };
}

/** Canonical serialization: the bytes stored in R2 and hashed. */
export function serializePackage(pkg: SubmissionPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const dateOnly = (isoStr: string | null) => (isoStr ? isoStr.slice(0, 10) : "—");
const or = (v: string | null | undefined) => (v?.trim() ? v : "—");

export function formatAddress(a: SubmissionPackage["applicant"]["address"]): string {
  const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter((x) => x && String(x).trim())
    .join(", ");
  return [a.line1, a.line2, cityLine, a.country].filter((x) => x && String(x).trim()).join(", ");
}

/** Human-readable rendering of the package (attached to funder emails, used for manual submission). */
export function renderPackageMarkdown(pkg: SubmissionPackage, opts: { sha256?: string } = {}) {
  const o = pkg.opportunity;
  const a = pkg.applicant;
  const lines: string[] = [];
  lines.push(`# ${pkg.application.title}`, "");
  lines.push(
    `**Funder:** ${o.funderName}  `,
    `**Opportunity:** ${o.title}${o.opportunityNumber ? ` (${o.opportunityNumber})` : ""}  `,
    `**Deadline:** ${dateOnly(o.deadline ?? pkg.application.deadline)}  `,
    `**Requested amount:** ${formatCents(pkg.application.requestedAmountCents)}  `,
    `**Version:** ${pkg.application.versionNumber} · **Package:** ${pkg.submissionId}`,
    "",
  );

  lines.push("## Applicant", "");
  lines.push(
    `- Legal name: ${a.legalName}${a.dba ? ` (DBA ${a.dba})` : ""}`,
    `- EIN: ${or(a.ein)}`,
    `- UEI: ${or(a.uei)}`,
    `- Address: ${or(formatAddress(a.address))}`,
    `- Website: ${or(a.websiteUrl)}`,
    `- Contact: ${[a.contact.name, a.contact.email, a.contact.phone].filter(Boolean).join(" · ") || "—"}`,
    "",
  );

  if (pkg.executiveSummary.trim()) {
    lines.push("## Executive summary", "", pkg.executiveSummary.trim(), "");
  }

  for (const s of pkg.sections) {
    lines.push(`## ${s.title}`, "");
    if (s.prompt) lines.push(`> ${s.prompt.replace(/\n+/g, " ")}`, "");
    lines.push(s.text || "_(no content)_", "");
    const limit = [
      s.wordLimit !== null ? `limit ${s.wordLimit} words` : null,
      s.charLimit !== null ? `limit ${s.charLimit} characters` : null,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `_${s.wordCount} words${limit ? ` (${limit})` : ""}${s.overLimit ? " — OVER LIMIT" : ""}_`,
      "",
    );
    if (s.gaps.length) {
      lines.push("**Unanswered (left blank on purpose):**");
      for (const g of s.gaps) lines.push(`- ${g.question}`);
      lines.push("");
    }
  }

  lines.push("## Attachments checklist", "");
  if (pkg.attachmentsChecklist.length === 0) lines.push("_No attachments listed by the funder._");
  for (const att of pkg.attachmentsChecklist) {
    const done = att.status === "matched" || att.status === "uploaded" || att.status === "waived";
    const state =
      att.status === "waived"
        ? ` — waived${att.note ? `: ${att.note}` : ""}`
        : att.filename
          ? ` — attached: ${att.filename}`
          : "";
    lines.push(
      `- [${done ? "x" : " "}] ${att.name}${att.required ? " (required)" : " (optional)"}${att.description ? ` — ${att.description}` : ""}${state}`,
    );
  }
  lines.push("");

  if (o.submissionInstructions.trim()) {
    lines.push("## Funder submission instructions", "", o.submissionInstructions.trim(), "");
  }

  lines.push("## Grounding report", "");
  if (pkg.grounding) {
    const g = pkg.grounding;
    lines.push(
      `- Result: ${g.passed ? "passed" : "NOT passed"}`,
      `- Factual claims: ${g.factualClaims} (supported ${g.supported}, partially ${g.partiallySupported}, unsupported ${g.unsupported})`,
      `- Numeric mismatches: ${g.numericMismatches} · Unconfirmed fact citations: ${g.unconfirmedFactCitations} · Gaps: ${g.gaps}`,
      "",
    );
  } else {
    lines.push("_Not verified._", "");
  }

  lines.push("## Appendix: citations", "");
  if (pkg.citations.length === 0) lines.push("_No factual claims._");
  for (const c of pkg.citations) {
    lines.push(`- **${c.claimId}** ${c.text} → ${c.factIds.join(", ") || "(no facts cited)"}`);
  }
  lines.push("");

  lines.push(
    "---",
    `Generated ${pkg.generatedAt} by Grant Autopilot from ${a.legalName}'s own documents and interviews.`,
  );
  if (opts.sha256) lines.push(`SHA-256 of package.json: \`${opts.sha256}\``);
  return `${lines.join("\n")}\n`;
}
