# email-ops: inbound support mail, consent and suppression, the SES sender

The half of the email move that `stacks/email` (PR #18749, `platform/aws/stacks/email/`) does
not cover. That stack owns the SES identities, Easy DKIM, MAIL FROM, DMARC,
one configuration set per purpose and the SES → SNS → SQS event feed. This
one adds, in the same **apps** account and **us-east-1**:

- **inbound receiving** for support@, hello@ and accounts@, replacing
  Cloudflare Email Routing;
- **one suppression and consent table** every sender checks, filled from
  that event feed and from a one-click unsubscribe endpoint;
- the **sending code** (`sender/`): the policy, the consent store and the SES
  adapter behind the ventures' existing `send()` port.

Nothing here has been applied; there is no AWS account yet.

## Three streams, three reputations

| Stream | Domain | Who may receive it |
|---|---|---|
| `transactional` | `stacks/email` default: the apex | anyone the product owes a message (receipts, resets, alerts); blocked only by a hard bounce or a complaint |
| `marketing` | `stacks/email` default: `news.marisstella.app` | only addresses with a recorded opt-in (source, time, wording version) |
| `cold` | a **separately registered** domain: one more entry in `stacks/email`'s `domains` once the owner buys it | business addresses only, with a country; EU/EEA/UK/CH recipients only with a legitimate-interest assessment id |

The configuration-set names in `stacks/email` are the stream names, which is
what `SES_STREAM` and `SES_CONFIGURATION_SET` use. Cold outreach is on its own
domain so its complaints can never pause receipts.

The rules are code, not convention: `sender/policy.mjs` (`maySend`) decides,
and `sender/ses-sender.mjs` refuses to call SES when it says no. For marketing
and cold mail the adapter itself appends the sender's name and postal address
and sets `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058 one-click,
which Gmail and Yahoo require of bulk senders); a caller cannot remove them.
That covers CAN-SPAM (identification, postal address, working opt-out) and
the GDPR/PECR opt-in rule for marketing (`prompts/goals.md`, pivot point 7).
Honest subject lines stay the writer's job.

## The consent and suppression table

`email-consent` (DynamoDB, KMS, PITR, deletion protection). Keys are an HMAC
of the normalised address with a pepper in Secrets Manager, so the table does
not list who is on it. Rows: `SUPPRESS#all` (hard bounce, complaint),
`SUPPRESS#<stream>`, `SUPPRESS#unsubscribed`, `CONSENT#marketing` (proof of
opt-in). Suppression rows never expire; an unsubscribe also deletes the
consent row, and code cannot re-opt-in an address that unsubscribed.

Fed by:
- **SES events**: the `email-ops` function reads `stacks/email`'s
  `ses-events` queue (an SQS event source with partial-batch failures). A
  permanent bounce or a complaint suppresses the address for every stream. A
  record it fails on is retried, then kept in `ses-events-dlq`; it is never
  dropped. A lost complaint would mean mailing someone who objected. The
  `email-ops-errors` alarm fires on any failure.
- **One-click unsubscribe**: the same function's URL (`unsubscribe_url`
  output). GET shows one button, so link scanners unsubscribe no one; POST,
  from the button or a mail client, records the unsubscribe at once.

## The sender port

There is no shared `EmailSender` class in this repository: each venture takes
a `send({to, subject, text, html?, headers?})` function (`resendSender` in
`ventures/drip-keeper/server.mjs`, the providers in
`ventures/dunning-engine/mail.mjs`). `sesSender(...)` returns that function.
`senderFromEnv(env, { consent })` builds it when `MAIL_PROVIDER=ses` and
returns `null` otherwise, the same environment switch the private
repository's Grant Autopilot uses. Moving a venture is one line where it
builds `send`, done per product in `aws-move-products`.

| Variable | From |
|---|---|
| `MAIL_PROVIDER=ses`, `SES_STREAM` | the venture's choice |
| `MAIL_FROM` | an address on that stream's domain (`stacks/email` `identities`) |
| `SES_CONFIGURATION_SET` | `stacks/email` `configuration_sets[stream]` |
| `UNSUBSCRIBE_URL` | `unsubscribe_url` |
| `UNSUBSCRIBE_SECRET`, pepper | read from `unsubscribe_secret_arn`, `pepper_secret_arn` at start-up |
| `SENDER_NAME`, `POSTAL_ADDRESS` | the owner's (see below) |

Products in other accounts are listed in `sender_role_arns`. They get the
consent table through its resource policy, the two secrets, and the KMS key
through those services. Their SES sending authorization belongs on the
identities in `stacks/email`.

## Inbound: support@, hello@, accounts@

The addresses come from `platform/pages/cloudflare/email-routing.json`, the
file Cloudflare Email Routing is applied from, so both paths always agree. A
receipt rule (spam and virus scan on, TLS required) writes each message to the
edge-api stack's inbox bucket, then invokes the edge-api function. The
function stores the message in the same table, with the same caps and 90-day
retention as the Worker (`platform/edge/inbox.mjs`). Nothing is forwarded.
SES receives only for verified domains; `stacks/email`'s transactional
identity is the apex, in this account.

The apex MX record is the cutover: `inbound_mx_record` is output for the
Cloudflare DNS step, and is created in Route 53 only when `receive_mail = true`
and `route53_zone_id` is set. Until then Cloudflare keeps delivering to the
Worker. The `aws-route53-zone` stack must leave the apex MX to this stack.

## Apply order

1. Bootstrap and `org`, `baseline`, `spend`, `email` (#18749), then
   `edge-api` (this PR).
2. This stack: `tofu init -backend-config=backend.hcl && tofu apply -var
   state_bucket=...`. Pass `deploy_role_arn` (`gha-oss-monorepo-email-ops-apply`)
   and `permissions_boundary_arn` once the github-oidc stack exists. Roles it
   creates are named `email-ops-*`.
3. **Owner:** SES production access (the `ses-production-access` job in
   #18749's apply workflow), a postal address for `POSTAL_ADDRESS` (CAN-SPAM
   needs a real one: a PO box or a registered mail-forwarding address works),
   and registration of the cold-outreach domain.
4. Inbound cutover: publish the MX; send a test to each address; check
   `GET /_edge/inbox`.
5. Ventures switch one at a time (`aws-move-products`). Resend and Cloudflare
   Email Service are retired after the last one (`retire-cloudflare`).

## Verify locally

```sh
node --test 'platform/aws/stacks/email-ops/sender/*.test.mjs'
cd platform/aws/stacks/email-ops
tofu fmt -check -recursive && tofu init -backend=false && tofu validate && tofu test
checkov -d . --framework terraform
```

`tofu test` checks that inbound recipients equal the routing file, with
scanning and TLS on; that mail lands in the edge-api bucket under its prefix,
then reaches its function; that the MX is off by default and published only
with a Route 53 zone; that the consent table is encrypted and protected; that
the function reads the events queue with partial-batch retries; that IAM has
no wildcard actions; that roles are named `email-ops-*` with the boundary;
that cross-account access exists only for named roles; and that wildcard
sender roles are refused.

CI: the sender tests are not yet under any glob CI runs
(`portfolio-validate.yml` runs `platform/edge/*.test.mjs`). The IaC workflow
should add `node --test 'platform/aws/**/*.test.mjs'`.

## Rotating secrets

The pepper is never rotated: every table key is derived from it, so a new one
would orphan every suppression row (and mail people who had objected). If it
leaks, the table still reveals nothing without a candidate address list. The
unsubscribe key can be rotated by hand. To keep links already sent working,
accept both keys for 60 days (a code change in `unsubscribe-token.mjs`).

## Cost

SES inbound is $0.10 per 1,000 messages plus 256 KB chunks. DynamoDB and
Lambda on demand cost cents. KMS is $1 a month and the two secrets $0.80 a
month.
