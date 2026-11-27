// Quality checklist status and the readiness summary. Pure: the Worker and the UI share it.
// A readiness figure is the shop's own self-check before a registrar's audit. Only an accredited
// certification body issues ISO 9001 certification; this never says a shop is certified or ready.
import {
  ISO9001_CLAUSES,
  ISO9001_SECTIONS,
  type Iso9001Section,
  type QualityClause,
} from "./iso9001";

export const QUALITY_STATUSES = [
  "not_assessed",
  "gap",
  "partial",
  "in_place",
  "not_applicable",
] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const QUALITY_STATUS_LABEL: Record<QualityStatus, string> = {
  not_assessed: "Not assessed",
  gap: "Gap",
  partial: "Partly in place",
  in_place: "In place",
  not_applicable: "Not applicable",
};

export interface ClauseState {
  status: QualityStatus;
  notes: string;
  /** Files linked to the clause directly plus files on its related CMMC requirements. */
  evidenceCount: number;
  /** The member who owns the clause; optional so callers without owners can omit it. */
  ownerUserId?: string | null;
}

/**
 * Problems with a status the shop wants to set. A clause marked not applicable needs the reason in
 * its notes, as the scope statement has to give one; an "in place" clause with no evidence is
 * allowed but flagged by `qualityReadiness`.
 */
export function validateClauseState(status: QualityStatus, notes: string): string[] {
  if (status === "not_applicable" && notes.trim().length < 10) {
    return [
      "Say why the clause does not apply in the notes (at least a sentence): the scope statement has to give the reason.",
    ];
  }
  return [];
}

export interface SectionReadiness {
  section: Iso9001Section;
  name: string;
  total: number;
  applicable: number;
  inPlace: number;
  partial: number;
  gaps: number;
  notAssessed: number;
}

export interface QualityReadiness {
  total: number;
  applicable: number;
  inPlace: number;
  partial: number;
  gaps: number;
  notAssessed: number;
  notApplicable: number;
  /** Whole percent of applicable clauses in place (partial counts half); null before any answer. */
  percentInPlace: number | null;
  sections: SectionReadiness[];
  /** Clauses marked in place with no evidence file anywhere: the first thing an auditor asks for. */
  inPlaceWithoutEvidence: string[];
  /** Gaps and partly-in-place clauses, in clause order: the work list. */
  openItems: string[];
  /** Open items (gaps, partly in place) nobody owns yet: the work nobody has picked up. */
  openWithoutOwner: string[];
}

const EMPTY: ClauseState = { status: "not_assessed", notes: "", evidenceCount: 0 };

export function qualityReadiness(
  states: ReadonlyMap<string, ClauseState>,
  clauses: readonly QualityClause[] = ISO9001_CLAUSES,
): QualityReadiness {
  const sections = new Map<Iso9001Section, SectionReadiness>();
  for (const [key, name] of Object.entries(ISO9001_SECTIONS) as [Iso9001Section, string][]) {
    sections.set(key, {
      section: key,
      name,
      total: 0,
      applicable: 0,
      inPlace: 0,
      partial: 0,
      gaps: 0,
      notAssessed: 0,
    });
  }
  const out: QualityReadiness = {
    total: 0,
    applicable: 0,
    inPlace: 0,
    partial: 0,
    gaps: 0,
    notAssessed: 0,
    notApplicable: 0,
    percentInPlace: null,
    sections: [],
    inPlaceWithoutEvidence: [],
    openItems: [],
    openWithoutOwner: [],
  };
  for (const c of clauses) {
    const s = states.get(c.id) ?? EMPTY;
    const sec = sections.get(c.section);
    if (!sec) continue;
    out.total++;
    sec.total++;
    if (s.status === "not_applicable") {
      out.notApplicable++;
      continue;
    }
    out.applicable++;
    sec.applicable++;
    if (s.status === "in_place") {
      out.inPlace++;
      sec.inPlace++;
      if (s.evidenceCount === 0) out.inPlaceWithoutEvidence.push(c.number);
    } else if (s.status === "partial") {
      out.partial++;
      sec.partial++;
      out.openItems.push(c.number);
      if (!s.ownerUserId) out.openWithoutOwner.push(c.number);
    } else if (s.status === "gap") {
      out.gaps++;
      sec.gaps++;
      out.openItems.push(c.number);
      if (!s.ownerUserId) out.openWithoutOwner.push(c.number);
    } else {
      out.notAssessed++;
      sec.notAssessed++;
    }
  }
  // Floor, so 99.6% never shows as 100 while a clause is still open.
  if (out.applicable - out.notAssessed > 0) {
    out.percentInPlace = Math.floor(((out.inPlace + out.partial / 2) / out.applicable) * 100);
  }
  out.sections = [...sections.values()].filter((s) => s.total > 0);
  return out;
}

// ---- API shapes (worker and client) -------------------------------------------------------------

export interface QualityEvidenceRef {
  id: string;
  title: string;
  fileName: string;
  /** "clause" when linked to this clause; otherwise the CMMC requirement it is attached to. */
  via: "clause" | string;
  /** Only for "clause" links: the link id, used to unlink. */
  linkId: string | null;
}

export interface QualityClauseDto extends QualityClause {
  status: QualityStatus;
  notes: string;
  ownerUserId: string | null;
  updatedAt: string | null;
  evidence: QualityEvidenceRef[];
}

export interface QualityChecklistResponse {
  standard: string;
  verification: { checkedAgainstCopy: boolean; note: string };
  items: QualityClauseDto[];
  readiness: QualityReadiness;
}
