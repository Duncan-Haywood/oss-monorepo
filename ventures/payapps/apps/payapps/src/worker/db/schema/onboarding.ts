// Getting-started emails (services/payapps/onboarding.ts, docs/EMAIL.md): one row per company per
// kind, written before the send as its claim, so a company gets each email at most once even when a
// request or the cron runs twice. A failed send deletes the row and the next chance tries again.
// A member who pressed the reminders' "stop" link has a row of kind `stop:<userId>` for that company
// (no migration: the kind column is plain text in SQLite), which the reminders skip.
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_columns";
import { organization } from "./auth";

export type OnboardingEmailKind = "welcome" | "no-job" | "first-send" | `stop:${string}`;

export const onboardingEmails = sqliteTable(
  "onboarding_emails",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /**
     * "welcome" (on creating the company), "no-job" and "first-send" (the reminders, from the
     * cron), or `stop:<userId>` (that member stopped the reminders for this company).
     */
    kind: text("kind").$type<OnboardingEmailKind>().notNull(),
    /** UTC day (YYYY-MM-DD) the send was claimed, or the stop pressed. */
    sentOn: text("sent_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.kind] })],
);
