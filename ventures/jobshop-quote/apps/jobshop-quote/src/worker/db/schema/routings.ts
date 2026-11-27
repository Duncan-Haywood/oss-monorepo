// Routing templates (src/shared/routings.ts): a named list of operations and finishing steps a shop
// reuses across a part family. Inputs only, never prices; applying one prices the line from today's
// rate card.

import type { RoutingFinishing, RoutingOperation } from "@shared/routings";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, json, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const routings = sqliteTable(
  "routings",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** routingNameKey(name): one routing of a name per shop, ignoring case and spacing. */
    nameKey: text("name_key").notNull(),
    partFamily: text("part_family"),
    operations: json<RoutingOperation[]>("operations").notNull(),
    finishing: json<RoutingFinishing[]>("finishing")
      .notNull()
      .$defaultFn(() => []),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("routings_org_name_uq").on(t.orgId, t.nameKey),
    index("routings_org_idx").on(t.orgId),
  ],
);
