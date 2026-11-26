// Funder rubric scoring (OWNER: quality): one report per application version, written by the
// non-blocking quality pass after verification (services/quality). Never gates submission.
import type { QualityReport } from "@shared/quality";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, json } from "./_columns";
import { applications, applicationVersions } from "./applications";
import { organization } from "./auth";

export const applicationQuality = sqliteTable(
  "application_quality",
  {
    versionId: text("version_id")
      .primaryKey()
      .references(() => applicationVersions.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    report: json<QualityReport>("report").notNull(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [
    // GET /applications/:id/quality (latest report), FK cascade from applications
    index("quality_app_idx").on(t.applicationId, t.createdAt),
    // Privacy export/delete by org
    index("quality_org_idx").on(t.orgId),
  ],
);
