import { createApp } from "./app";
import { createAppContext } from "./context";
import type { Env } from "./env";
import { receiveEmail } from "./services/inbound";
import { expireQuotes } from "./services/quotes";
import { remindExpiringQuotes } from "./services/quotes/expiry-reminders";
import { remindFollowUps } from "./services/quotes/follow-ups";

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // The only cron (wrangler.jsonc, daily at 11:17 UTC, after midnight in every US time zone): sent
  // quotes whose valid-until day has passed become "expired" (services/quotes, expireQuotes).
  // Inbound RFQ email (services/inbound): Email Routing's rule rfq@INBOUND_EMAIL_DOMAIN
  // (subaddressed rfq+<token>@, scripts/email-routing.mjs). A
  // refused message gets a permanent SMTP error with the reason, so the sender knows.
  email: async (message, env) => {
    const result = await receiveEmail(createAppContext(env), {
      from: message.from,
      to: message.to,
      rawSize: message.rawSize,
      raw: message.raw,
      // Cloudflare's own SPF/DKIM/DMARC results come first (shared/sender-auth.ts).
      authenticationResults: message.headers.get("authentication-results"),
    });
    if (!result.ok) message.setReject(result.reason);
  },
  scheduled: (controller, env, ctx) => {
    const now = new Date(controller.scheduledTime);
    // Then the day-before emails about sent quotes that expire today or tomorrow (expiry-reminders.ts).
    const app = createAppContext(env, { now: () => now });
    ctx.waitUntil(
      expireQuotes(app)
        .then(() => remindExpiringQuotes(app))
        // Then each estimator's sent quotes due for a follow-up (follow-ups.ts), once per due day.
        .then(() => remindFollowUps(app))
        .then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;
