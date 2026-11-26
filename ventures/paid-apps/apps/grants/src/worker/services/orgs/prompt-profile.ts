// Compact plain-text identity block for drafting prompts. Contains only fields the org typed in
// itself (org_profiles); substantive claims must come from the fact base, not from here.
import type { OrgType } from "@shared/enums";
import type { orgProfiles } from "../../db/schema";

type OrgProfileRow = typeof orgProfiles.$inferSelect;

export const PROMPT_PROFILE_HEADER = "User-entered organization profile";

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  nonprofit_501c3: "501(c)(3) nonprofit",
  tribal_government: "Tribal government",
  tribal_organization: "Tribal organization",
  faith_based: "Faith-based organization",
  community_based: "Community-based organization",
  educational: "Educational institution",
  government: "Government entity",
  fiscally_sponsored: "Fiscally sponsored project",
  other: "Other",
};

/** Collapse whitespace/newlines so user text cannot break the block's structure. */
const clean = (v: string | null | undefined, max = 200): string | null => {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

const list = (xs: string[] | null | undefined): string | null => {
  const items = (xs ?? []).map((x) => clean(x, 120)).filter((x): x is string => !!x);
  return items.length ? items.join("; ") : null;
};

export function buildPromptProfile(p: OrgProfileRow, displayName?: string | null): string {
  const location = [clean(p.city), clean(p.state), clean(p.country, 10)].filter(Boolean).join(", ");
  const rows: [string, string | null][] = [
    ["Legal name", clean(p.legalName)],
    [
      "Also known as",
      clean(p.dba) ?? (displayName && displayName !== p.legalName ? clean(displayName) : null),
    ],
    ["Organization type", ORG_TYPE_LABELS[p.orgType] ?? clean(p.orgType)],
    ["Location", location || null],
    ["EIN", clean(p.ein, 20)],
    ["UEI", clean(p.uei, 20)],
    ["Website", clean(p.websiteUrl, 300)],
    ["Founded", p.foundedYear ? String(p.foundedYear) : null],
    ["Focus areas", list(p.focusAreas)],
    ["Service areas", list(p.serviceAreas)],
  ];
  const lines = rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
  return [
    `${PROMPT_PROFILE_HEADER} (entered by the organization; identity details only):`,
    ...lines,
  ].join("\n");
}
