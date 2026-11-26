// Per-org AI search plans for discovery (services/discovery/plans.ts). One row per org; re-planned
// when the org's profile/facts/projects hash changes or the plan is older than 14 days.
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { json, ts } from "./_columns";
import { organization } from "./auth";

/** One validated Grants.gov search: keyword + optional filters (official codes only). */
export interface DiscoverySearchPlan {
  keyword: string;
  rationale: string;
  /** Grants.gov eligibility codes, e.g. "12". */
  eligibilityCodes: string[];
  /** Grants.gov funding category codes, e.g. "ELT". */
  fundingCategories: string[];
  /** Assistance Listing Numbers, "NN.NNN". */
  assistanceListings: string[];
}

export const discoveryPlans = sqliteTable("discovery_plans", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plans: json<DiscoverySearchPlan[]>("plans").notNull().default([]),
  /** sha256 of the planner input (profile + confirmed facts + projects + planner version). */
  factsHash: text("facts_hash").notNull(),
  createdAt: ts("created_at").notNull(),
});
