// Funder-facing email attachments built from the immutable submission package: a DOCX and a
// plain-text fallback holding ONLY the org identity, the opportunity header and the section
// answers. The internal package (grounding report, citations, fact ids) never reaches a funder.
// Pure; imports nothing from the pipeline so the submission module can use it without cycles.
import type { SubmissionPackage } from "../submission/package";
import { buildApplicationDocx, DOCX_CONTENT_TYPE } from "./docx";
import type { ExportInput, ExportOptions } from "./model";
import { buildApplicationText } from "./plaintext";
import { exportFilename } from "./text";

const FUNDER: ExportOptions = { audience: "funder", citations: false, cover: false };
const date = (iso: string | null) => (iso ? new Date(iso) : null);

/** The export input for a submitted package (no facts, no summary: nothing internal). */
export function exportInputFromPackage(pkg: SubmissionPackage): ExportInput {
  return {
    // The package's own timestamp, so the attachment can be rebuilt byte-for-byte from it.
    generatedAt: new Date(pkg.generatedAt),
    org: {
      legalName: pkg.applicant.legalName,
      dba: pkg.applicant.dba,
      ein: pkg.applicant.ein,
      uei: pkg.applicant.uei,
    },
    application: {
      id: pkg.application.id,
      title: pkg.application.title,
      requestedAmountCents: pkg.application.requestedAmountCents,
      deadline: date(pkg.application.deadline),
    },
    opportunity: {
      title: pkg.opportunity.title,
      funderName: pkg.opportunity.funderName,
      opportunityNumber: pkg.opportunity.opportunityNumber,
      closeDate: date(pkg.opportunity.deadline),
    },
    requirements: {
      sections: pkg.sections.map((s) => ({
        key: s.key,
        title: s.title,
        prompt: s.prompt,
        kind: "narrative" as const,
        required: true,
        wordLimit: s.wordLimit,
        charLimit: s.charLimit,
        guidance: "",
      })),
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
    version: {
      id: pkg.application.versionId,
      versionNumber: pkg.application.versionNumber,
      content: pkg.content,
      executiveSummary: "",
      keyPoints: [],
    },
    facts: [],
  };
}

export interface FunderAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Attachment filenames (ASCII, header-safe), e.g. "red-mesa-workforce-pathways-v2.docx". */
export function funderAttachmentNames(pkg: SubmissionPackage): { docx: string; txt: string } {
  const name = {
    orgName: pkg.applicant.legalName,
    title: pkg.application.title,
    versionNumber: pkg.application.versionNumber,
  };
  return { docx: exportFilename(name, "docx"), txt: exportFilename(name, "txt") };
}

/** [DOCX, plain text] for the funder email, in that order. */
export function buildFunderAttachments(
  pkg: SubmissionPackage,
): [FunderAttachment, FunderAttachment] {
  const input = exportInputFromPackage(pkg);
  const names = funderAttachmentNames(pkg);
  return [
    {
      filename: names.docx,
      contentType: DOCX_CONTENT_TYPE,
      bytes: new Uint8Array(buildApplicationDocx(input, FUNDER)),
    },
    {
      filename: names.txt,
      contentType: "text/plain",
      bytes: new TextEncoder().encode(buildApplicationText(input, FUNDER)),
    },
  ];
}

/** Base64 for email providers (chunked so large attachments don't overflow the call stack). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
