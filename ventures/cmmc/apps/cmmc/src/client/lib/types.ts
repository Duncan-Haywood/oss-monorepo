// Response shapes the client reads. They mirror the Worker's JSON (src/worker/routes/org/index.ts).
import type { ControlDef, ImplementationStatus, PartialCreditKey } from "@shared/controls";
import type { MemberRole, ObjectiveResult, PoamStatus } from "@shared/enums";
import type { LegalStatusDto } from "@shared/legal";

export interface Me {
  user: { id: string; email: string; name: string };
  memberships: { id: string; name: string; role: MemberRole }[];
  /** Whether this user accepted the current Terms, Privacy, Refund and Acceptable Use documents. */
  legal: LegalStatusDto;
}

export interface Profile {
  targetLevel: number;
  legalName: string;
  cageCode: string;
  systemName: string;
  systemDescription: string;
  boundaryDescription: string;
  environmentDescription: string;
  connectionsDescription: string;
  sspUpdateFrequency: string;
  affirmingOfficial: string;
}

export interface OrgInfo {
  org: { id: string; name: string };
  role: MemberRole;
  profile: Profile;
  /** The plan whose limits apply now; `level2: false` makes Level 2 read only. */
  plan: { key: string; name: string; level2: boolean; quality: boolean };
  library: {
    verification: { verifiedAgainstOfficialText: boolean; transcribedOn: string; note: string };
    level2Baseline: {
      references: string;
      checkedOn: string;
      checkedAgainstOfficialSource: boolean;
    };
  };
}

export interface ControlRecord {
  status: ImplementationStatus;
  partialCredit: PartialCreditKey | null;
  ownerUserId: string | null;
  notes: string;
  statement: string;
  statementUpdatedAt: string | null;
  draftStatement: string | null;
  draftQuestions: string[] | null;
  draftGeneratedAt: string | null;
  objectiveResults: Record<string, ObjectiveResult> | null;
}

export type ControlView = ControlDef & {
  record: ControlRecord | null;
  /** External service providers whose CRM says they carry or share this requirement (Level 2). */
  providers?: { name: string; responsibility: "provider" | "shared" }[];
};

export interface Evidence {
  id: string;
  controlId: string | null;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface PoamItem {
  id: string;
  controlId: string;
  weakness: string;
  remediation: string;
  milestones: string;
  responsible: string;
  scheduledCompletion: string;
  status: PoamStatus;
  eligible: boolean;
  eligibilityReason: string;
  overdue: boolean;
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}

export interface ScoreResponse {
  level: 1 | 2;
  level1?: { total: number; met: number; allMet: boolean; notMet: string[] };
  level2?: {
    score: number | null;
    provisionalScore: number;
    maxScore: number;
    minScore: number;
    sspImplemented: boolean;
    unassessed: number;
    counts: Record<ImplementationStatus, number>;
    deductions: { id: string; points: number }[];
  };
  conditional?: {
    meetsPoamRules: boolean;
    allMet: boolean;
    blockers: { nistId: string; reason: string }[];
  };
}
