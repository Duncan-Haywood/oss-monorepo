// Funder relationship tracker (OWNER: funders-crm). `funders` / `funder_profiles` stay global
// catalogs; everything here is per org: the relationship itself (stage, owner, next step), the
// people at the funder (personal data: included in privacy export and deleted with the org via
// tenantTables(), which picks up every table with an `orgId` column) and the interactions log.

import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  FUNDER_INTERACTION_KINDS,
  FUNDER_RELATION_ORIGINS,
  FUNDER_STAGES,
  PREFERRED_CONTACT_METHODS,
} from "../../../shared/api/funders";
import { createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";
import { funders } from "./opportunities";

export {
  FUNDER_INTERACTION_KINDS,
  FUNDER_RELATION_ORIGINS,
  FUNDER_STAGES,
  PREFERRED_CONTACT_METHODS,
};
export type FunderStage = (typeof FUNDER_STAGES)[number];
export type FunderInteractionKind = (typeof FUNDER_INTERACTION_KINDS)[number];
export type FunderRelationOrigin = (typeof FUNDER_RELATION_ORIGINS)[number];
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export const orgFunderRelations = sqliteTable(
  "org_funder_relations",
  {
    id: text("id").primaryKey(), // frl_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The global funder (opportunities.funderId); null for foundations known only by EIN / name. */
    funderId: text("funder_id").references(() => funders.id, { onDelete: "set null" }),
    /** 9-digit EIN of a foundation prospect (funder_profiles.ein), when linked. */
    prospectEin: text("prospect_ein"),
    displayName: text("display_name").notNull(),
    /** normalizeFunderName(displayName): links awards / watch sources that only carry a name. */
    normalizedName: text("normalized_name").notNull(),
    stage: text("stage").$type<FunderStage>().notNull().default("prospect"),
    /** "auto": the stage follows applications / awards; "manual": a person set it, keep it. */
    stageSource: text("stage_source").$type<"auto" | "manual">().notNull().default("auto"),
    /** What created the relation (manual, or the signal that auto-linked it). */
    origin: text("origin").$type<FunderRelationOrigin>().notNull().default("manual"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    nextStepAt: ts("next_step_at"),
    nextStepNote: text("next_step_note").notNull().default(""),
    /** Set when the due next step was sent to the notification center (reset when it changes). */
    nextStepNotifiedAt: ts("next_step_notified_at"),
    tags: json<string[]>("tags").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("funder_rel_org_stage_idx").on(t.orgId, t.stage, t.updatedAt),
    index("funder_rel_org_name_idx").on(t.orgId, t.normalizedName),
    uniqueIndex("funder_rel_org_funder_uq")
      .on(t.orgId, t.funderId)
      .where(sql`${t.funderId} is not null`),
    uniqueIndex("funder_rel_org_ein_uq")
      .on(t.orgId, t.prospectEin)
      .where(sql`${t.prospectEin} is not null`),
    // Reminder sweep: due, not yet notified.
    index("funder_rel_next_step_idx").on(t.nextStepNotifiedAt, t.nextStepAt),
    index("funder_rel_funder_idx").on(t.funderId),
    index("funder_rel_owner_idx").on(t.ownerId),
  ],
);

/** People at a funder. Personal data: never logged, never put in audit metadata or notifications. */
export const orgFunderContacts = sqliteTable(
  "org_funder_contacts",
  {
    id: text("id").primaryKey(), // fco_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    relationId: text("relation_id")
      .notNull()
      .references(() => orgFunderRelations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes").notNull().default(""),
    preferredContact: text("preferred_contact").$type<PreferredContactMethod>(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("funder_contacts_rel_idx").on(t.orgId, t.relationId),
    index("funder_contacts_created_by_idx").on(t.createdBy),
  ],
);

export const orgFunderInteractions = sqliteTable(
  "org_funder_interactions",
  {
    id: text("id").primaryKey(), // fin_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    relationId: text("relation_id")
      .notNull()
      .references(() => orgFunderRelations.id, { onDelete: "cascade" }),
    /** Who at the funder it was with, if recorded. */
    contactId: text("contact_id").references(() => orgFunderContacts.id, { onDelete: "set null" }),
    kind: text("kind").$type<FunderInteractionKind>().notNull(),
    occurredAt: ts("occurred_at").notNull(),
    summary: text("summary").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("funder_interactions_rel_idx").on(t.orgId, t.relationId, t.occurredAt),
    index("funder_interactions_contact_idx").on(t.contactId),
    index("funder_interactions_created_by_idx").on(t.createdBy),
  ],
);
