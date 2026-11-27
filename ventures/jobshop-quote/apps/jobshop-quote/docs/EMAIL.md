# Email

Job Shop Quote sends account mail and, since 2026-11-25, quotes the estimator emails to a customer;
all of it transactional (one message to the addresses an estimator typed, about a quote they asked
for). The code is a port of apps/payapps's
(2026-11-25); the rules below match that app's `docs/EMAIL.md`.

| Mail | When | Link | Expires |
| --- | --- | --- | --- |
| Confirm your email | sign-up (when verification is required), or "Send a new confirmation link" | `/verify-email?token=` | 24 hours |
| Reset your password | "Forgot password?" on the sign-in page | `/reset-password?token=` | 1 hour, single use; a reset signs the user out everywhere and marks the address verified |
| You already have an account | sign-up with an address that already has one (the API answers the same as a new sign-up, so it reveals nothing) | `/forgot-password` | n/a |
| Quote (the estimator's) | "Send email" on a sent quote | none; the quote PDF is attached | n/a |
| Quotes about to expire | daily cron, sent quotes valid until today or tomorrow | each quote's page | n/a |
| Quotes due for a follow-up | daily cron, after the expiry emails: the author's sent quotes whose follow-up day has come, once per day set | each quote's page | n/a |
| New RFQ by email | an RFQ arrives at the shop's inbound address, to members who turned it on for themselves | the RFQ in the app | n/a |
| 80% / 100% of this month's RFQs used | an AI read brings the month's count to 80%, then 100%, of the plan's allowance; owners and admins, once a month each (docs/BILLING.md, "Allowance emails") | the Billing page, only when checkout is on | n/a |

## Quotes to customers (`services/quotes/email.ts`, `src/shared/quote-email.ts`)

- What goes: the estimator's message as plain text (the quote's cover note to start), then a fixed
  footer (attached file name, "replaces Q-n" for a revision, valid-until, who replies reach). The
  HTML part is the same text with every character escaped, so no markup from the message survives.
  Subject `Quote Q-1001 Rev 2 from <shop>`, one line.
- Signature: the shop's `email_signature` (rate card settings, plain text, 1,000 characters) goes
  between the message and the footer, blank lines and trailing spaces removed, escaped in the HTML.
- The estimator's copy (`copyMe`, on by default on the page): after the customer's send succeeds, a
  second message to the sender's own confirmed address, subject `Copy: <subject>`, the same body
  and PDF under a line naming the original recipients. Not a Cc: the customer never sees a second
  address, and a failed copy is stored as `sender_copy = 'failed'` without failing the send. It is
  not an attempt, so it does not count toward the limits below.
- From: EMAIL_FROM's address with the display name `<shop> via Job Shop Quote` (quotes, angle
  brackets and line breaks removed). Reply-To: the signed-in estimator, whose address must be
  confirmed, so a customer's reply cannot be steered to an unconfirmed address. The one
  exception is the plain-http offline demo (`FAKE_EXTERNALS=true` on `http://`), where sign-up
  skips confirming because its mail goes nowhere; there the send is only recorded
  (`senderMustBeVerified`, the same rule as `requiresEmailVerification`).
- Attachment: the PDF stored at Mark sent, read from R2 and checked against `sent_pdf_sha256`; a
  mismatch refuses the send (409) and logs `quote.email_pdf_hash_mismatch`. Nothing is re-rendered.
- Who and when: estimators and up, open sent quotes only (not drafts, won, lost, expired or
  superseded); 1-5 bare addresses; 30 attempts a shop an hour and 5 a quote a day, counted from
  `quote_emails` rows (two concurrent sends at the limit can both pass, by one).
- Record: a `quote_emails` row before the send (`sending`), then `sent` (provider id, `delivered`
  false for the in-memory fake) or `failed` (error with any address replaced by `[address]`, and a
  502 to the estimator). Logs carry ids and counts, never addresses or text.
- Threading (2026-11-25): when the quote was made from an RFQ that came in at the shop's inbound
  address and one of the recipients is the address that emailed it (`rfqs.from_address`, compared
  without case), the email is a reply to that message: `In-Reply-To` and `References` carry the
  RFQ's stored Message-ID (RFC 5322 § 3.6.4) and the subject becomes `Re: <the RFQ's subject>`
  (kept as it is if it already starts with "Re:"; the quote's own subject if the RFQ had none).
  Gmail joins a thread only when the subject matches as well as the headers; the quote label stays
  in the footer and the PDF's file name. Not threaded: a pasted RFQ, one an estimator forwarded in
  (the customer never saw that message), and a Message-ID that is not one plain `<left@right>` of
  visible ASCII without brackets, quotes or backslashes (`isSafeMessageId`). The estimator's copy is
  never threaded. The form says, under the recipients, whether this send goes as a reply.
  Cloudflare's headers reference (developers.cloudflare.com/email-service/reference/headers/, not
  reachable from the session that built this; its search snippet shows `In-Reply-To` and
  `References` in the binding's `headers` example) says a refused header fails the whole request
  before sending, so on an error naming a header the same message goes once more without them
  (`quote.email_thread_headers_refused` in the log). Check one threaded send at launch.
- The RFQ's own thread (2026-11-26): when the RFQ email was itself a reply (a buyer answering an
  earlier quote, or a thread inside the buyer's company), intake stores its chain in
  `rfqs.thread_references` (`threadChain`): its `References`, else its `In-Reply-To` when that
  holds exactly one Message-ID, as RFC 5322 § 3.6.4 builds a reply's `References`. The quote's
  `References` is that chain followed by the RFQ's Message-ID, safe ids only (`messageIdsIn`),
  without repeats, cut to 20 ids and 900 characters by keeping the first (the thread's root) and
  the newest (`limitReferences`), so the header stays on one line under RFC 5322's 998-character
  limit. RFQs received before this have no chain stored and thread on their Message-ID alone.
- Without a provider (no `EMAIL` binding or `EMAIL_FROM`) the send answers 503 and the page says to
  download the PDF instead; in tests and the offline demo the fake records it as not delivered.

Invitations are still links an admin copies and sends (`/invite/:token`); emailing them from the
app is not built yet. Accepting one needs a confirmed address wherever sign-in does
(`acceptInvitation`, `requireVerifiedEmail`), so an account that was never confirmed cannot join a
shop by claiming the invited address.

Templates and the per-user throttle: `src/worker/services/auth/emails.ts`. Better Auth wiring:
`src/worker/services/auth/auth.ts`. Durable auth rate limits: `src/worker/middleware/auth-rate-limit.ts`.
Pages: `src/client/routes/account.tsx`. Tests: `test/worker/auth-email.test.ts`,
`test/worker/auth-rate-limit.test.ts`, `src/worker/ports/email.test.ts`.

## RFQs received by email (`services/inbound`, `src/shared/mime.ts`)

Each shop can turn on an address, `rfq+{token}@{INBOUND_EMAIL_DOMAIN}` (16 random base32
characters, 80 bits; `+tag` after the token is accepted and ignored). Estimators forward RFQs to it
or give it to customers; each message becomes an RFQ in the shop's inbox.

- **Who:** every member sees the address on the RFQs page; admins and owners turn it on, replace it
  ("New address": mail to the old one is refused from then on) or turn it off
  (`GET|DELETE /inbound-email`, `POST /inbound-email/rotate`). The token sits on `shop_settings`
  (unique index), so one address maps to one shop.
- **What is kept:** subject, the envelope sender (`rfqs.from_address`, shown as "Received by
  email from"), the Message-ID (a unique index per shop, so a redelivery returns the same RFQ), the
  text body (the first text/plain part, else the HTML part turned into text by a scanner, never
  rendered as HTML), and attachments the upload form accepts (PDF, text, images, STEP/IGES/STL/DXF;
  15 MB each, 10 per RFQ). Everything else is listed on the RFQ as an intake note: other file types,
  oversized files, `winmail.dat`, parts that would not decode, a body cut at 100,000 characters.
  Inline images under 40 KB with a Content-ID are signature logos and are dropped silently. A
  forwarded message attached whole (`message/rfc822`) is read too: its text under "Attached
  message" and its attachments with the rest.
- **No AI read on arrival.** The RFQ is stored as `new`; an estimator presses "Extract with AI" as
  with a pasted RFQ. So a stranger who learns the address cannot spend the shop's RFQ allowance or
  AI budget, and spoofed mail is only an inbox item a person looks at.
- **Refusals** (a permanent SMTP error with the reason, via `setReject`): no such address (one
  answer for unknown, replaced and turned-off addresses, so the reply reveals nothing), larger than
  25 MB, 50 emailed RFQs in the last 24 hours (a flood guard, counted from `rfqs`), no text and no
  readable attachment, a sender not on the shop's allowlist (below). Logs carry ids and counts,
  never addresses or text.
- **Sender allowlist** (`src/shared/sender-allowlist.ts`, 2026-11-25, migration 0021). Admins can
  list who may email RFQs in, on the RFQs page ("Limit senders"; `PUT /inbound-email/senders`
  `{ senders }`, the whole list replaced; every member sees `allowedSenders` on
  `GET /inbound-email`). An entry is an address (`buyer@acme.example`) or a domain (`@acme.example`, or a
  bare `acme.example`, covering its subdomains); entries are lowercased and de-duplicated, and one that
  is neither is a 400 that saves nothing. Empty (the default) accepts anyone. Mail passes when the
  envelope sender or the From header's address is covered, so a shop's own mailbox forwarding a
  customer's RFQ passes when the shop's domain is listed, and a customer's mail relayed by a list
  server passes on its From header. Other mail is refused with "This shop takes RFQs by email only
  from senders it has listed; contact the shop", after the size and daily checks and before
  anything is stored. Both addresses can be forged, so a match must also pass the sender checks
  (next item); the random token stays the first secret and an RFQ is still only an inbox item until
  a person reads it.
  The last 10 refused senders (From header, else envelope; one row per address, newest first) are
  kept on `shop_settings.inbound_refused_senders` and shown under the list with an "Allow" button,
  so a real customer who bounced is one click from getting through; saving a list drops the entries
  it now covers, and an empty list clears them. Logs say only `inbound.refused_sender` and the
  list's length, never the address.
- **Sender checks** (`src/shared/sender-auth.ts`, 2026-11-25; no migration). Cloudflare Email
  Routing checks SPF, DKIM and DMARC before it calls the worker and prepends one
  `Authentication-Results` header (RFC 8601) with authserv-id `mx.cloudflare.net`. Cloudflare's docs
  say to read the *first* such header and trust it only with that id, since any other may come from
  the sender (cloudflare-docs `src/content/docs/email-service/api/route-emails/email-handler.mdx`,
  "Authentication results", read 2026-11-25). The handler passes `message.headers.get(...)` (the
  runtime joins repeats with ", "; only the part before the second header is read) and falls back
  to the first such header in the raw message. With a non-empty list, a listed address counts only
  when the results back it: the **From header** when `dmarc=pass` (with `header.from`, if given,
  equal to its domain) or a passing DKIM signature whose `header.d` is the From domain or a
  parent/subdomain of it (for domains that publish no DMARC policy); the **envelope sender** when
  `spf=pass` (with `smtp.mailfrom`, if given, on its domain). Mail that claims a listed sender
  without that is refused with "This shop takes RFQs by email only from listed senders whose mail
  passes SPF, DKIM or DMARC; your message did not, so contact the shop", remembered with
  `why: "unverified"` and shown without an "Allow" button (the address is already listed; the
  sender's mail setup or a forgery is the cause). It fails closed: no trusted header means not
  verified. Logs say `inbound.refused_unverified` with the list length and the three results
  (`pass`, `fail`, ...), never the address. With no list, mail is accepted as before, and a
  `dmarc=fail` adds an intake note warning the estimator that the From address may be forged.
  The alignment check compares domains without a public-suffix list (one equal to, or a subdomain
  of, the other), stricter than DMARC's organisational domain; `dmarc=pass` covers the rest.
- **Off by default.** With `INBOUND_EMAIL_DOMAIN` empty the RFQs page shows nothing, the API answers
  `available: false` and turning it on is a 503. To turn it on: set the deploy variable
  `JOBSHOP_INBOUND_EMAIL=on` and the `CLOUDFLARE_EMAIL_ROUTING_TOKEN` secret; the deploy applies
  `email-routing.json` and sets `INBOUND_EMAIL_DOMAIN` once that worked ("Routing as code", below).

### RFQ arrival emails (`services/inbound/notify.ts`, 2026-11-25)

Each member chooses "Email me when an RFQ arrives" for themselves on the RFQs page
(`PUT /inbound-email/notify` `{ notify }`, any role; `notifyMe` on `GET /inbound-email`; table
`member_notifications`, migration 0010). Off by default; nobody can set it for someone else.

- **When:** once per new emailed RFQ, after it is stored. A redelivery of the same Message-ID, a
  refused message and a manually pasted RFQ send nothing.
- **To whom:** current members of that shop with it on (a removed member's row is ignored), one
  message each with only their own address in To, at most 25 per RFQ. Where sign-in needs a confirmed
  address, unconfirmed addresses are skipped. The 50-a-day inbound limit caps the volume.
- **What:** a notice, not the RFQ: `New RFQ by email: <subject>`, the sender the email claims
  (marked "not verified"), how many files were stored and intake notes made, and a link to the RFQ.
  No body text and no attachments, so the inbound address cannot relay a stranger's message through
  our sending domain. Subject and sender are cut to one line of 120 characters and their host names
  defanged (`example[.]com`, `https[:]//`), so mail clients do not make them links; the only link is
  the app's. It says nothing has been read by AI yet, and how to turn the notices off.
- **Failure:** a send error is logged (`inbound.notify_failed`, ids only, any address replaced by
  `[address]`) and never refuses or undoes the RFQ.

Tests: `src/shared/mime.test.ts` (headers, encodings, multiparts, forwarded mail, malformed input),
`test/worker/inbound-email.test.ts` (roles, cross-shop isolation, duplicates, refusals, the RFQ
through extraction, arrival emails: own setting only, opted-in current members only, none on a
redelivery, a failed send keeps the RFQ, defanged text).


### Routing as code (`email-routing.json`, `scripts/email-routing.mjs`, 2026-11-26)

Cloudflare's catch-all rule exists only for a zone's apex ("Catch-all rules are only available for
the apex domain", cloudflare-docs `email-service/configuration/subdomains.mdx`, read 2026-11-26),
and `marisstella.app`'s apex already routes the portfolio's own addresses. Literal rules cannot
list random per-shop tokens. So the token rides in a subaddress (RFC 5233): shops get
`rfq+{token}@rfq.marisstella.app`, and one literal rule `rfq@rfq.marisstella.app` → the
`jobshop-quote` worker matches them all once the zone honours subaddressing (the `+token` part is
kept in `message.to`). The older `rfq-{token}@` form is still read, for a domain routed by an apex
catch-all.

`scripts/email-routing.mjs` makes the zone match `email-routing.json`, dry run unless `APPLY=1`:
Email Routing on for the zone and the subdomain (`POST /zones/{id}/email/routing/dns {name}`, which
writes and locks the MX and SPF records), `support_subaddress: true` (`PATCH .../email/routing`; a
zone setting, so `support+x@marisstella.app` also reaches the `support@` rule, which loses nothing),
and the rule, named `as-code jobshop-quote: rfq@...` so a hand-made rule is never edited (one for
the same address is reported). The deploy runs it with `JOBSHOP_INBOUND_EMAIL=on` and sets
`INBOUND_EMAIL_DOMAIN` only when it succeeded, so the app never shows an address mail cannot reach.
API shapes from Cloudflare's published OpenAPI schema; not yet run against the live zone. Check at
launch: one message to a shop's address arrives, and its `Authentication-Results` (below) parse.

## Quotes about to expire (`services/quotes/expiry-reminders.ts`)

- **When:** the daily cron (11:17 UTC), right after sent quotes past their valid-until day are
  marked expired. Every sent quote valid until today or tomorrow on its shop's calendar
  (`shop_settings.time_zone`, UTC when unset) that has not been reminded is claimed
  (`quotes.expiry_reminded_at`, set in an UPDATE that only takes unclaimed rows), then mailed. With
  the cron at 11:17 UTC, a shop east of UTC+12:43 is already on the next day, and one at UTC-11 or
  UTC-12 still on the day before; its "today" and "tomorrow" in the email are its own. A second run, the
  same day or the next, never mails a quote again; a revision is a new quote with its own date.
- **To whom:** the quote's author (`quotes.created_by`) only, while still a member of that shop,
  with a confirmed address where sign-in needs one. On by default (it is about their own work);
  each member turns it off for themselves under the quote log (`GET|PUT
  /notifications/quote-expiry`, `member_notifications.quote_expiry`). Quotes of someone who left,
  opted out or is unconfirmed are claimed and skipped (counted as `skipped` in the log).
- **What:** plain text, one email per estimator per shop listing up to 30 quotes (the rest
  counted): label, customer and contact, the smallest-quantity total, the date ("today" or
  "tomorrow") and a link to each, then what to do (follow up, or Revise for a new date) and how to
  turn the email off. Customer text is put on one line. From: EMAIL_FROM as "Job Shop Quote";
  no Reply-To.
- **Failures:** a failed send is logged with counts (addresses replaced by `[address]`) and not
  retried; the quote page still shows the date.

Tests: `test/worker/quote-expiry-reminder.test.ts`.

## Quotes due for a follow-up (`services/quotes/follow-ups.ts`, `src/shared/follow-up.ts`)

- **The day:** sending a quote sets `quotes.follow_up_on` to the shop's today plus
  `shop_settings.follow_up_days`, a Saturday or Sunday moved to the Monday (3 by default; an admin changes it on the quote log's "Follow up"
  card, 0 turns it off). Each follow-up an estimator logs (`POST /quotes/:id/follow-ups`, a note and
  the next day, or "no more") moves it; only sent quotes are ever due, so won, lost, expired and
  superseded quotes drop off by status.
- **When:** the daily cron, right after the expiry emails. Every sent quote whose follow-up day has
  come on its shop's calendar, and that was not yet mailed for that day, is claimed
  (`quotes.follow_up_reminded_for` set to the day, in an UPDATE that only takes rows where it
  differs), then mailed. A second run the same day mails nothing; a quote whose day an estimator
  moved is mailed again when the new day comes. A quote valid until today or tomorrow is left to the
  expiry email, so nobody gets both about one quote.
- **To whom:** the quote's author only, while still a member, with a confirmed address where
  sign-in needs one; on by default, each member turns it off for themselves on the quote log
  (`GET|PUT /notifications/quote-follow-up`, `member_notifications.quote_follow_up`).
- **What it says:** one message per estimator per shop: each quote's label, customer, contact,
  smallest-quantity total, sent day and "due today" / "N days overdue", the last logged note (one
  line, 160 characters), and a link; at most 30, the rest counted. Customer text is kept on one
  line. Notes are the shop's own records and go only to that shop's member.

## When verification is required

`requiresEmailVerification(env)`: always on production or any HTTPS `APP_URL`. Off in `APP_ENV=test`
(tests opt in per request with the `x-test-require-email-verification: 1` header) and in the local
plain-http offline demo (`FAKE_EXTERNALS=true`, `pnpm demo`), where mail goes to an in-memory fake
nobody can open.

Accounts created before this change have `emailVerified = false`. The app has no production deploy
yet (ROADMAP item 3), so no real account is affected; on a deploy that had users, they would confirm
through "Forgot password?" (a reset marks the address verified) or the resend link.

## Throttles

- Durable per-IP limits on every auth POST, and per-account limits on failed sign-ins (10 per 15
  minutes from any number of IPs), counted in the `verification` table (`throttle:auth:*`). Over the
  limit: 429 with `Retry-After`. A D1 error fails open (logged). On wherever the deploy is hardened.
- Better Auth's in-memory limiter (per isolate, HTTPS only): sign-in 10/min, sign-up 5/min,
  send-verification-email 3/min, request-password-reset 3/min, reset-password 10/min.
- Durable per-user windows (`throttle:<kind>:<userId>`): 3 confirmation and 3 reset emails per 15
  minutes, 1 "already have an account" email per hour. A throttled or failed send is logged
  (`auth.email_throttled`, `auth.email_failed`, user id only) and never changes the HTTP answer.

## Provider (`src/worker/ports/email.ts`, `createEmailSender`)

| Setting | Mail goes to |
| --- | --- |
| `APP_ENV=test`, or `FAKE_EXTERNALS=true` outside production | `FakeEmailSender` (memory) |
| `EMAIL` binding present and `EMAIL_FROM` set | Cloudflare Email Service (`CloudflareEmailSender`) |
| anything else | `LogEmailSender`: logs `email.not_sent_no_provider` with the recipient count and subject |

The `EMAIL` binding is `send_email` in `wrangler.jsonc`; `wrangler dev` only simulates sends.
Pricing, limits, SPF/DKIM and the beta caveat were checked for apps/grants on 2026-11-24:
`apps/grants/docs/EMAIL.md`.

Extra headers are limited to `ALLOWED_HEADERS`: `List-Unsubscribe`, `List-Unsubscribe-Post`,
`In-Reply-To` and `References`, each flattened to one line. The adapter refuses any recipient that
is not one bare address, flattens the subject to one line,
refuses an `EMAIL_FROM` that is not one safe address, and keeps the provider's error code in the
thrown message. Logs never carry an address, link or token.

## Turning it on (with the deploy, ROADMAP item 3)

1. The sender domain must be onboarded to Cloudflare Email Service. `marisstella.app` already is, for
   apps/grants (`apps/grants/email-sending.json`).
2. Set `EMAIL_FROM`, for example `Job Shop Quote <no-reply@marisstella.app>`, as a deploy var.
3. After the deploy, `GET /api/health` must answer `"email": true`. With `false`, verification is still
   required on HTTPS, so nobody can finish signing up: treat it as a failed deploy.
