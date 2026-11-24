---
kind: note
date: 2026-11-24
subjects: [retail-pilot-intel]
topics: [hosting]
---
# Consolidating providers onto Cloudflare (2026-11-24)

Owner, 2026-11-24: move providers onto Cloudflare where it does not raise cost much or lower
quality. Paddle (merchant of record), Anthropic, PyPI/npm/Homebrew and the social accounts stay.
Two moves were in scope: Resend to Cloudflare email sending (Grant Autopilot, private repository)
and Vercel to Cloudflare (retail-pilot-intel's docs, this repository).

## What was found

- **Vercel never published anything from this repository.** `deploy-vercel` in
  `.github/workflows/retail-pilot-intel-deploy-docs.yml` runs only when `vars.VERCEL_DEPLOY == 'true'`.
  The latest run (45374351301, 2026-11-24) and the four before it all show the job `skipped`, so
  there is no Vercel URL to keep or redirect.
- **Cloudflare Email Service fits transactional mail, not marketing mail.** Read from Cloudflare's
  docs source (github.com/cloudflare/cloudflare-docs, `src/content/docs/email-service/`;
  developers.cloudflare.com itself was blocked by the session proxy):
  - It is in beta (`index.mdx`; public beta since 2026-04-16).
  - Workers Paid includes 3,000 emails a month, then $0.35 per 1,000 (`platform/pricing.mdx`).
    Grant Autopilot already pays for Workers Paid, so this adds $0 at today's volume.
  - Cloudflare sets up SPF, DKIM and DMARC automatically and keeps a suppression list
    (`configuration/domains.mdx`).
  - List-Unsubscribe and one-click unsubscribe headers are allowed (`reference/headers.mdx`).
  - The FAQ says: "Can I use Email Service for marketing emails? No. Email Service supports
    transactional email only." (`reference/faq.mdx`).
  - Sending domains can be managed by API: `/zones/{zone_id}/email/sending/subdomains`, token
    group "Email Sending Write" (github.com/cloudflare/api-schemas).

## What changed

- **retail-pilot-intel docs** (this repository):
  - `apps/docs/wrangler.toml`: a static-assets Worker of its own, `retail-pilot-intel-docs`, on the
    free plan. It runs no code, so its requests are never metered.
  - `apps/docs/public/_headers`: the headers `vercel.json` used to send.
  - `vercel.json` and `vercel.docs.json` are removed.
  - In the workflow, a `deploy-cloudflare` job replaces `deploy-vercel`. It is control-plane, so it
    goes in its own PR, which waits for the owner. It deploys on a manual run, or on every docs push
    once `RETAIL_PILOT_INTEL_DOCS_CLOUDFLARE=true`.
  - Verified locally:
    - `wrangler@4.145.0 deploy --dry-run` passes.
    - `wrangler dev` serves `/` with 200 and the `X-Robots-Tag`/`X-Frame-Options` headers.
    - Unknown paths return 404.
    - `/_headers` itself is not served.
- **Grant Autopilot email** (private repository; full write-up in its `apps/grants/docs/EMAIL.md`):
  - A `CloudflareEmailSender` adapter behind the existing `EmailSender` port, using a `send_email`
    binding named `EMAIL`.
  - Marketing mail (the newsletter sequence) is tagged `category: "marketing"` and always routed to
    Resend. With no Resend key it fails and retries, and is never sent through Cloudflare.
  - `EMAIL_PROVIDER` chooses the provider: `auto`, `cloudflare` or `resend`. `auto` keeps a working
    Resend setup until the key is removed.
  - The sending domain is managed as code: `email-sending.json`, `scripts/email-sending.mjs` (a dry
    run unless `APPLY=1`) and a manual workflow.

## Owner's closing steps

Do these in order. Each step depends on the one before it having worked.

### Vercel → Cloudflare (retail-pilot-intel docs)

1. Approve and merge the workflow PR (it is control-plane, so CODEOWNERS needs your approval).
2. Run **Deploy retail-pilot-intel docs** by hand (Actions → Run workflow). Then open
   `https://retail-pilot-intel-docs.duncan-andrew-haywood.workers.dev/` and check two things:
   - the passcode gate appears;
   - `curl -sI` shows `x-robots-tag: noindex, nofollow, noarchive`.
3. Optional: set the repository variable `RETAIL_PILOT_INTEL_DOCS_CLOUDFLARE=true` to deploy on every
   docs push.
4. Optional: put a Cloudflare Access application on that host for a real login. The passcode gate
   runs only in the browser, and the docs' source is public in this repository anyway.
5. Delete these GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. If
   `VERCEL_DEPLOY` exists as a variable, delete it too. No workflow reads any of them after the PR.
6. In Vercel:
   - revoke the token;
   - delete the project;
   - close the account. Nothing in either repository uses Vercel any more; the only mentions left
     are in ADRs that explain why it was not chosen.

### Resend → Cloudflare Email Service (Grant Autopilot)

1. Give a Cloudflare API token the zone permission **Email Sending Write** (plus Zone Read). Save it
   in the private repository as `CLOUDFLARE_EMAIL_SENDING_TOKEN`, or add the permission to the
   deploy token.
2. Run **grants-email-sending** once unticked (a dry run that prints the DNS records), then once
   ticked. Onboarding adds `_dmarc` with `p=reject` only if `marisstella.app` has no DMARC record.
   Check that nothing else sends as `@marisstella.app` first.
3. Set the variable `EMAIL_PROVIDER=cloudflare` and deploy grants.
4. Sign up with a new address and check two things:
   - the verification email arrives;
   - its headers show `spf=pass dkim=pass dmarc=pass`.
5. Resend:
   - **If the newsletter nurture sequence will stay off**, delete `RESEND_API_KEY` (the GitHub secret
     and the Worker secret: `wrangler secret delete RESEND_API_KEY`) and close the Resend account.
   - **If you want it on**, keep Resend for marketing mail only. Cloudflare does not allow marketing
     mail. Any other marketing-capable provider would be a new account.
