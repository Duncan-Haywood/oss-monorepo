// Eligibility intelligence: criteria extracted once per opportunity (shared catalog cache) and each
// org's checklist against them (tenant rows).
import type { EligibilityCriterion, EligibilityResult } from "@shared/eligibility";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, json, ts } from "./_columns";
import { organization } from "./auth";
import { opportunities } from "./opportunities";

/**
 * Cached criteria for one opportunity. Not tenant data: derived from the listing only, and readable
 * only through an opportunity the caller can see (private imports cascade with the opportunity).
 */
export const opportunityCriteria = sqliteTable("opportunity_criteria", {
  opportunityId: text("opportunity_id")
    .primaryKey()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  criteria: json<EligibilityCriterion[]>("criteria").notNull(),
  model: text("model").notNull(),
  /** sha256 of the prompt version + rendered listing text; re-extract when the listing changes. */
  sourceHash: text("source_hash").notNull(),
  createdAt: createdAt(),
});

export const orgEligibility = sqliteTable(
  "org_eligibility",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    result: json<EligibilityResult>("result").notNull(),
    checkedAt: ts("checked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.opportunityId] })],
);
