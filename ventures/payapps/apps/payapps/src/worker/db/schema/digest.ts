// Weekly "money to chase" email (services/payapps/digest.ts, docs/EMAIL.md). One row per member who
// opted in for a company; no row means no email. Tenant table keyed by org_id with ON DELETE
// CASCADE from organization, like every other table; removing the user removes the row.
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_columns";
import { organization, user } from "./auth";

export const cashDigestSubscriptions = sqliteTable(
  "cash_digest_subscriptions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The member's local day (YYYY-MM-DD) the last digest went to this member, or the day a send was claimed. A
     * send is claimed with a conditional update on this column, so a retried cron never mails twice.
     */
    lastSentOn: text("last_sent_on"),
    /**
     * Day of the week the member gets it, in their own time zone: 0 Sunday ... 6 Saturday
     * (src/shared/cash-digest.ts).
     */
    weekday: integer("weekday").notNull().default(1),
    /** Hour of the day (0-23) in `time_zone` from which it goes out; 13 with UTC for older rows. */
    hour: integer("hour").notNull().default(13),
    /** IANA time zone name the weekday and hour are read in ("America/Chicago"). */
    timeZone: text("time_zone").notNull().default("UTC"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);
