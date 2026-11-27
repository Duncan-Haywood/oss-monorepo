export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordered from least to most privileged; used by requireOrg()/requireRole(). */
export const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const POAM_STATUSES = ["open", "closed"] as const;
export type PoamStatus = (typeof POAM_STATUSES)[number];

export const OBJECTIVE_RESULTS = ["met", "not_met", "not_applicable"] as const;
export type ObjectiveResult = (typeof OBJECTIVE_RESULTS)[number];

/** Shown wherever the app could be mistaken for more than it is (UI footer, SSP, POA&M export). */
export const SCOPE_DISCLAIMER =
  "Prepared with a self-assessment preparation tool. This document is not a CMMC certification, " +
  "not a C3PAO assessment, and not endorsed by the Department of Defense. The organization's " +
  "affirming official is responsible for the accuracy of any score entered in SPRS. Do not upload " +
  "Controlled Unclassified Information (CUI): this workspace is not a CUI enclave.";
