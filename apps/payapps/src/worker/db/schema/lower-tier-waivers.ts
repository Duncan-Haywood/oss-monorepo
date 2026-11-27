// Lower-tier lien waivers: the waivers a contractor collects from its own suppliers and
// sub-subcontractors for one of its pay applications (src/shared/lower-tier-waivers.ts for the
// rules). Tenant rows keyed by org_id like every other table; a row goes with its pay application.
import { WAIVER_KINDS } from "@shared/enums";
import { LOWER_TIER_PARTY_KINDS } from "@shared/lower-tier-waivers";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cents, createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { payApps, projects } from "./payapps";

export const lowerTierWaivers = sqliteTable(
  "lower_tier_waivers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    payAppId: text("pay_app_id")
      .notNull()
      .references(() => payApps.id, { onDelete: "cascade" }),
    /** The supplier or sub-subcontractor, as the contractor names it. */
    party: text("party").notNull(),
    partyKind: text("party_kind", { enum: LOWER_TIER_PARTY_KINDS }),
    /** Where the request goes (the party's AP or office address); null: not entered. */
    partyEmail: text("party_email"),
    kind: text("kind", { enum: WAIVER_KINDS }).notNull(),
    /** ISO dates (YYYY-MM-DD); null: not entered. */
    throughDate: text("through_date"),
    /** The amount the waiver is for; null: not entered. */
    amountCents: cents("amount_cents"),
    requestedOn: text("requested_on"),
    /** Set: the signed waiver is in hand. */
    receivedOn: text("received_on"),
    note: text("note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lower_tier_waivers_pay_app_idx").on(t.orgId, t.payAppId),
    index("lower_tier_waivers_project_idx").on(t.orgId, t.projectId),
  ],
);
