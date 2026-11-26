# Email: providers and how sending is chosen

Grant Autopilot sends two kinds of email:

- **Transactional:** sign-up verification, password reset, invitations, review and submission
  notifications, follow-up reminders, digests, support-letter requests, application submissions to
  funders, and the newsletter's double opt-in confirmation (a direct reply to someone's request).
- **Marketing:** the newsletter welcome/nurture sequence (`services/marketing`, `category: "marketing"`),
  off by default (`MARKETING_EMAIL_ENABLED`, docs/EMAIL_MARKETING.md).

Since 2026-11-24 transactional mail can go through **Cloudflare Email Service** (owner, 2026-11-24:
consolidate providers onto Cloudflare where it does not raise cost much or lower quality). Marketing
mail cannot, so it stays on Resend while that is wanted.

## How the sender is chosen (`context.ts`, `createEmailSender`)

| `EMAIL_PROVIDER` (deploy var, default `auto`) | Transactional mail | Marketing mail |
| --- | --- | --- |
| `auto` | Resend while `RESEND_API_KEY` is set, else Cloudflare (`EMAIL` binding) | Resend if its key is set, else fails |
| `cloudflare` | Cloudflare | Resend if its key is set, else fails |
| `resend` | Resend (logged only without the key) | Resend if its key is set, else fails |
| `ses` | Amazon SES | Amazon SES |
| `ses-with-fallback` | SES; on a definite SES refusal, what `auto` would use | SES; on a definite refusal, Resend if its key is set |

`ses` and `ses-with-fallback` need `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` (or
`SES_REGION`); without them the `auto` row applies and `email.ses_not_configured` is logged.

With no provider at all every email is only logged, as before. "Fails" means `NoMarketingProviderSender`
throws, so the nurture run releases its claim and nothing is recorded as sent. `auto` keeps a working
Resend setup working until the owner switches; deleting `RESEND_API_KEY` alone moves transactional mail to
Cloudflare. Tests and the demo use `FakeEmailSender` whatever the setting.

The adapters: `ports/cloudflare-email.ts` (binding `EMAIL`, `send_email` in `wrangler.jsonc`),
`ports/resend-email.ts` and `ports/ses-email.ts` (wired in `ports/provider-switch.ts`). All three apply the same header safety (`ports/email.ts`): one bare address per
recipient, single-line header values, allowlisted custom headers only.

## Why Cloudflare holds up for transactional mail

Checked 2026-11-24 against Cloudflare's docs source (github.com/cloudflare/cloudflare-docs, branch
`production`, `src/content/docs/email-service/`) and the Cloudflare API schema
(github.com/cloudflare/api-schemas). The developers.cloudflare.com pages themselves were not reachable
from the session, so these are the files those pages are built from.

| Question | Answer | Source file |
| --- | --- | --- |
| Availability | Email Sending is in **beta** (public beta since 2026-04-16) | `index.mdx` ("Email Sending <Badge text="Beta" />"); changelog 2026-04-16 |
| Plan and price | Workers Paid: **3,000 emails a month included, then $0.35 per 1,000**. Workers Free sends only to verified addresses in the account. Grant Autopilot already needs Workers Paid (Queues, Workflows; docs/DEPLOY.md), so this adds **$0** at today's volume. | `platform/pricing.mdx` |
| Limits | 50 recipients per email; 25 MiB per message with attachments; a daily quota that starts conservative and grows with reputation (`E_DAILY_LIMIT_EXCEEDED` past it) | `platform/limits.mdx`, `api/send-emails/workers-api.mdx` |
| SPF / DKIM / DMARC | Set up automatically on onboarding: SPF, DKIM and MX on `cf-bounce.<domain>`; `_dmarc` with `p=reject` **only if the domain has none** | `configuration/domains.mdx` |
| Bounces and complaints | Suppression list (hard bounces, complaints); per-domain "drop suppressed recipients"; events via Queues subscriptions | `concepts/suppressions.mdx`, `platform/event-subscriptions.mdx` |
| Unsubscribe headers | `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) are on the header allowlist; `X-` headers allowed | `reference/headers.mdx` |
| Marketing mail | **Not allowed:** "Can I use Email Service for marketing emails? No. Email Service supports transactional email only." | `reference/faq.mdx` |
| Domain as code | `POST /zones/{zone_id}/email/sending/subdomains` (`{ name }`), `PATCH .../{tag}`, `GET .../{tag}/dns/status`; token group "Email Sending Write" | API schema `openapi.json` |

Resend for comparison: the free plan is 3,000 emails a month and 100 a day; marketing/broadcast mail is
allowed on its plans. Resend's provider-side `Idempotency-Key` has no Cloudflare equivalent. Every caller
already claims a database row before it sends (submission row, `marketing_email_log`, attachment nonce),
so that key was a second guard and is dropped by the Cloudflare adapter.

**Risks taken:** the service is beta (APIs "may change before general availability"), and a new
account's daily quota is not published. `EMAIL_PROVIDER=resend` is the one-line rollback while the Resend
key exists.

## Amazon SES (owner, 2026-11-24: one provider, AWS, for our own LLM and email traffic)

`SesEmailSender` calls SES v2 `SendEmail` (`POST https://email.{region}.amazonaws.com/v2/email/outbound-emails`)
over HTTPS, SigV4-signed (service `ses`) with WebCrypto (`ports/aws-sigv4.ts`), so no AWS SDK is bundled
into the Worker. Request shape, checked against botocore's `sesv2` service model: `Content.Simple` with
`Subject`, `Body.Text`/`Body.Html`, `Headers` (allowlisted by `safeCustomHeaders`; SES takes up to 15)
and `Attachments` (base64 `RawContent`, `ContentDisposition: ATTACHMENT`), `ReplyToAddresses`,
`ConfigurationSetName` from `SES_CONFIGURATION_SET`, and an `EmailTags` entry `category` =
`transactional`/`marketing`. SES allows marketing mail, so with `ses` the newsletter sequence goes there
too (it still needs `MARKETING_EMAIL_ENABLED` and the postal address; docs/EMAIL_MARKETING.md).

**Idempotency.** SES has no idempotency key; `idempotencyKey` is dropped, as with Cloudflare. Every caller
claims a database row before it sends, which stays the guard against duplicates.

**Failover without double sends (`ses-with-fallback`).** `FallbackEmailSender` hands a message to the
old provider only when SES refused for a reason about our account or setup, not the message: any 429
or 403 (throttling, credentials, IAM), `LimitExceededException`, `SendingPausedException`,
`AccountSuspendedException`, `MailFromDomainNotVerifiedException`, an unknown configuration set
(`NotFoundException`); the list is `PROVIDER_SIDE_REFUSALS` in `fallback-email.ts`. SES refused those
requests, so nothing was queued. `MessageRejected` and `BadRequestException` never fail over: they are
about this message or recipient (an address on the suppression list after a bounce or complaint, bad
content), and re-sending through Resend would mail someone SES refused for a reason. They fail like any
send error. It does **not** fall back on a 5xx or when no response arrived (network error, timeout): SES may have
accepted the message, and a second provider could deliver it twice. Those errors propagate like any
send failure today: the caller releases its claim and retries later on the same path. Without a
provider-side idempotency key that later retry can, rarely, repeat a message SES had in fact accepted;
the same was true of Cloudflare. Fallbacks are logged as `email.provider_fallback` (provider names,
status, SES error code and category; no addresses).

Before switching: verify the sending domain in SES (Easy DKIM CNAMEs; a custom MAIL FROM domain if
SPF alignment is wanted), leave the SES sandbox (production access request), and, for bounces and
complaints, a configuration set with an event destination. Steps: docs/DEPLOY.md, "Moving LLM and
email to AWS". SES pricing and quotas were not checked in this change; read them from AWS's SES
pricing page before the flip.

## Sending domain as code

`email-sending.json` lists the sending domain(s); `scripts/email-sending.mjs` makes Cloudflare match
(dry run unless `APPLY=1`; the dry run prints the DNS records Cloudflare would add), and
`.github/workflows/grants-email-sending.yml` runs it on demand. Cloudflare writes the DNS records
itself, so nothing in this repository edits DNS directly. Tests: `node --test scripts/email-sending.test.mjs`.

The domain is `marisstella.app`, matching the deploy's default `EMAIL_FROM`
(`Grant Autopilot <no-reply@marisstella.app>`). The zone already receives mail through Email Routing
(oss-monorepo `platform/pages/cloudflare/email-routing.json`); sending records live on `cf-bounce.` and do
not touch the routing MX records. If the zone has no DMARC record, onboarding adds `p=reject`. That is
what a domain that only sends through Cloudflare wants, but check that nothing else sends as
`@marisstella.app` first.

## Switching over (owner)

1. Give a Cloudflare API token the zone permission **Email Sending Write** (and Zone Read), saved as the
   secret `CLOUDFLARE_EMAIL_SENDING_TOKEN` (or add the permission to the deploy token).
2. Run **grants-email-sending** with "apply" unticked, read the plan and DNS records, then run it ticked.
3. Set the repository variable `EMAIL_PROVIDER=cloudflare` and deploy (or delete `RESEND_API_KEY`, and
   `auto` picks Cloudflare).
4. Check: sign up with a new address and receive the verification email; the message shows
   `spf=pass dkim=pass dmarc=pass` in its headers.
5. Resend: keep it only if the newsletter nurture sequence is to be turned on; otherwise delete the
   `RESEND_API_KEY` secret (GitHub and the Worker) and close the account.
