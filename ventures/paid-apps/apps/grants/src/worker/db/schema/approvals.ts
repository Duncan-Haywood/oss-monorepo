// Approval policies (OWNER: approvals): who must approve an application before it is submitted, and
// temporary delegations of an approver's authority. Approvals themselves are the `reviews` rows with
// decision "approved" for the application's current version (applications.ts), so a new version
// (an edit or a redraft) starts the count again.
import type { ApprovalRule } from "@shared/approvals";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

/** One policy per org: an ordered rule list (first match wins; no row = the default rule). */
export const approvalPolicies = sqliteTable("approval_policies", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  rules: json<ApprovalRule[]>("rules").notNull().default([]),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * While active (createdAt <= t < until, not revoked), an approval by `toUserId` may count as one by
 * `fromUserId` (e.g. an out-of-office admin hands their sign-off to a colleague). Not transitive.
 */
export const approvalDelegations = sqliteTable(
  "approval_delegations",
  {
    id: text("id").primaryKey(), // dlg_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    until: ts("until").notNull(),
    revokedAt: ts("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("approval_delegations_org_to_idx").on(t.orgId, t.toUserId),
    index("approval_delegations_org_from_idx").on(t.orgId, t.fromUserId),
  ],
);
