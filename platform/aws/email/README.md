# email: SES sending, inbound support mail, consent and suppression

All of the portfolio's email on Amazon SES, replacing Resend (ventures) and
Cloudflare Email Routing / Email Service (support inbox, Grant Autopilot).

Account: **shared-infra**. Region: **us-east-1**. Nothing here has been
applied; there is no AWS account yet.

## Three streams, three reputations

| Stream | Domain (default) | Who may receive it |
|---|---|---|
| `transactional` | `mail.marisstella.app` | anyone the product owes a message (receipts, resets, alerts); blocked only by a hard bounce or a complaint |
| `marketing` | `news.marisstella.app` | only addresses with a recorded opt-in (source, time, wording version) |
| `cold` | a **separately registered** domain (`cold_domain`) | business addresses only, with a country; EU/EEA/UK/CH recipients only with a legitimate-interest assessment id |

Each stream has its own SES configuration set (TLS required, reputation
metrics, SES's account suppression for bounces and complaints) and its own
identity with Easy DKIM (2048-bit), a custom MAIL FROM (`bounce.<domain>`,
SPF `-all`), an SPF record and DMARC (`p=quarantine`, strict DKIM alignment;
move to `reject` once reports are clean). The cold domain is separate so its
complaints can never pause mail from the main domain. Until the owner
registers it, no cold identity exists.

The rules are code, not convention: `sender/policy.mjs` (`maySend`) decides,
and `sender/ses-sender.mjs` refuses to call SES when it says no. For marketing
and cold mail the adapter itself appends the sender's name and postal address
and sets `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058 one-click,
which Gmail and Yahoo require of bulk senders); a caller cannot remove them.
That covers CAN-SPAM (identification, postal address, working opt-out) and
the GDPR/PECR opt-in rule for marketing (`prompts/goals.md`, pivot point 7).
Honest subject lines stay the writer's job.

## One consent and suppression table

`email-consent` (DynamoDB, KMS, PITR, deletion protection). Keys are an HMAC
of the normalised address with a pepper in Secrets Manager, so the table does
not list who is on it. Rows: `SUPPRESS#all` (hard bounce, complaint),
`SUPPRESS#<stream>`, `SUPPRESS#unsubscribed`, `CONSENT#marketing` (proof of
opt-in). Suppression rows never expire; an unsubscribe also deletes the
consent row, and an address that unsubscribed cannot be re-opted-in by code.

Fed by:
- **SES events**: every configuration set sends bounces and complaints to
  EventBridge, then the `email-events` function. Failed deliveries to the
  function retry for a day, then wait in an encrypted dead-letter queue with
  an alarm. A lost complaint would mean mailing someone who objected.
- **One-click unsubscribe**: the same function's URL (`unsubscribe_url`
  output). GET shows one button (link scanners unsubscribe no one); POST, from
  the button or a mail client, records it at once.

## The sender port

There is no shared `EmailSender` class in this repository: each venture takes
a `send({to, subject, text, html?, headers?})` function (`resendSender` in
`ventures/drip-keeper/server.mjs`, the providers in
`ventures/dunning-engine/mail.mjs`). `sesSender(...)` returns that function,
and `senderFromEnv(env, { consent })` builds it when `MAIL_PROVIDER=ses`,
returning `null` otherwise, the same environment-switch shape the private
repository's Grant Autopilot uses. Moving a venture is one line where it
builds `send`, done per product in `aws-move-products`.

| Variable | From |
|---|---|
| `MAIL_PROVIDER=ses`, `SES_STREAM` | the venture's choice |
| `MAIL_FROM` | an address on `sending_domains[stream]` |
| `SES_CONFIGURATION_SET` | `configuration_sets[stream]` |
| `UNSUBSCRIBE_URL` | `unsubscribe_url` |
| `UNSUBSCRIBE_SECRET`, pepper | read from `unsubscribe_secret_arn`, `pepper_secret_arn` at start-up |
| `SENDER_NAME`, `POSTAL_ADDRESS` | the owner's (see below) |

Products in other accounts (apps, sandbox) are listed in `sender_role_arns`:
they get sending authorization on the identities, the consent table through
its resource policy, the two secrets, and the KMS key through those services.

## Inbound: support@, hello@, accounts@

The addresses come from `platform/pages/cloudflare/email-routing.json`, the
file Cloudflare Email Routing is applied from, so both paths always agree. A
receipt rule (spam and virus scan on, TLS required) writes each message to the
edge-api stack's inbox bucket, then invokes the edge-api function, which
stores it in the same table, with the same caps and 90-day retention as the
Worker (`platform/edge/inbox.mjs`). Nothing is forwarded anywhere.

The apex MX record is created only when `receive_mail = true`. That is the
cutover. While it is false, Cloudflare keeps delivering to the Worker. The
`aws-route53-zone` stack must leave the apex MX (and, after cutover, the apex
SPF, which becomes `v=spf1 include:amazonses.com -all`) to this stack.

## Apply order

1. Foundation (owner's account steps, then bootstrap/OIDC), the
   `aws-route53-zone` stack (gives `zone_id`), the `edge-api` stack.
2. This stack: `tofu init -backend-config=backend.hcl && tofu apply` with
   `deploy_role_arn`, `state_bucket` and `zone_id`. DKIM verifies once DNS
   is served by Route 53.
3. **Owner:** request SES production access (out of the sandbox) in the
   shared-infra account. AWS asks how mail is collected and how bounces and
   complaints are handled; this README is the answer. Until then SES sends
   only to verified addresses.
4. **Owner:** the postal address for `POSTAL_ADDRESS` (CAN-SPAM requires a
   real one: a PO box or a registered mail-forwarding address works) and
   registration of the cold-outreach domain. Then set `cold_domain` and
   `cold_zone_id`.
5. Cutover of inbound: `receive_mail = true`; send a test to each address;
   check `GET /_edge/inbox`.
6. Ventures switch one at a time (`aws-move-products`); Resend and Cloudflare
   Email Service are retired after the last one (`retire-cloudflare`).

## Verify locally

```sh
node --test 'platform/aws/email/sender/*.test.mjs'
cd platform/aws/email
tofu fmt -check -recursive && tofu init -backend=false && tofu validate && tofu test
checkov -d . --framework terraform
```

`tofu test` checks: two streams until a cold domain exists and the cold
stream's DNS stays in its own zone; nine DKIM CNAMEs; strict SPF and DMARC on
every sending domain; TLS and suppression on every configuration set; bounces
and complaints reaching EventBridge; inbound recipients equal to the routing
file; MX off by default; the consent table encrypted and protected; no
wildcard IAM; no cross-account access unless roles are named; wildcard
sender roles refused.

CI: the sender tests are not under a glob CI runs yet (`portfolio-validate.yml`
runs `platform/edge/*.test.mjs`); the IaC scanning workflow (security-first
direction) should add `node --test 'platform/aws/**/*.test.mjs'` with the
`tofu test` steps.

## Rotating secrets

The pepper is never rotated: every table key is derived from it, so a new one
would orphan every suppression row (and mail people who had objected). If it
leaks, the table still reveals nothing without a candidate address list. The
unsubscribe key can be rotated by hand, keeping links already sent working by
accepting both keys for 60 days (a code change in `unsubscribe-token.mjs`).

## Cost

SES: $0.10 per 1,000 messages, inbound $0.10 per 1,000 plus 256 KB chunks;
DynamoDB and Lambda on demand (cents); KMS $1 a month; two secrets $0.80 a
month.
