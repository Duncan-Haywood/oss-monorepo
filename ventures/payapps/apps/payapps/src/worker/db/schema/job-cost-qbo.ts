// Job costs read from QuickBooks Online (docs/QUICKBOOKS.md, "Job costs from QuickBooks"): which
// QuickBooks customer or job (sub-customer), or which class, a PayApps job's costs are tagged to. Tenant table keyed
// by org_id with ON DELETE CASCADE, like every other table.
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { projects } from "./payapps";

/**
 * One link per job. Customer and class ids belong to one QuickBooks company, so `realm_id` records
 * which; connecting a different company ignores the link, reconnecting the same one brings it back.
 * `match_by` says what the id is: a customer or job (the default, and every link made before
 * 2026-11-26), or a class, for a company that tracks jobs by class instead of by customer. The
 * columns keep their first names (`customer_id`, `customer_name`) so the migration only adds one;
 * they hold the class's id and full name when `match_by` is "class". The name is for display only.
 */
export const jobCostQboLinks = sqliteTable(
  "job_cost_qbo_links",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    realmId: text("realm_id").notNull(),
    matchBy: text("match_by", { enum: ["customer", "class"] })
      .notNull()
      .default("customer"),
    refId: text("customer_id").notNull(),
    refName: text("customer_name").notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("job_cost_qbo_links_org_idx").on(t.orgId)],
);
