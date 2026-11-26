// Grant Autopilot (apps/grants): live at https://marisstella.app/grants (apps/grants/docs/DEPLOY.md).
// Every claim below was checked against the cited files on the reviewedOn date. When the app changes,
// update the claim and the date in the same PR (docs/trust/README.md, "Keeping this true").

import {
  ANTHROPIC_BASE,
  CLOUDFLARE_BASE,
  GITHUB_ACTIONS_BASE,
  GOOGLE_SIGNIN_BASE,
  PADDLE_BASE,
  RESEND_BASE,
} from "../subprocessors.ts";
import type { TrustProfile } from "../types.ts";

const G = "apps/grants";

export const grantsProfile: TrustProfile = {
  product: "Grant Autopilot",
  operator: "Mary Stella Labs, LLC (New Mexico, USA)",
  lifecycle: "live",
  reviewedOn: "2026-11-24",
  securityContact: null,
  sections: {
    data_location: [
      {
        text: "Your organization's records, uploaded files and search index are stored on Cloudflare (D1 database, R2 file storage, Vectorize index) in the Cloudflare account that runs the app.",
        status: "in_place",
        sources: [`${G}/wrangler.jsonc`, `${G}/docs/DATA_POLICY.md`],
      },
      {
        text: "No storage region or data-residency jurisdiction is pinned in the configuration, so Cloudflare chooses where the database and file bucket live. The region in use is being confirmed.",
        status: "owner_to_confirm",
        sources: [`${G}/wrangler.jsonc`, "docs/trust/OWNER-CONFIRM.md"],
      },
      {
        text: "To draft applications, run interviews and extract facts, passages of your documents and answers are sent to Anthropic's API per request. Facts you mark as restricted are never sent for drafting.",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`, `${G}/src/worker/ports/anthropic-llm.ts`],
      },
    ],
    encryption: [
      {
        text: "All traffic uses HTTPS. API responses carry a Strict-Transport-Security header (one year).",
        status: "in_place",
        sources: [`${G}/src/worker/middleware/security.ts`],
      },
      {
        text: "Data at rest in the database and file storage is encrypted by Cloudflare. We rely on Cloudflare's published documentation for this and are confirming its exact scope.",
        status: "owner_to_confirm",
        sources: [
          "https://developers.cloudflare.com/d1/platform/data-security/",
          "https://developers.cloudflare.com/r2/reference/data-security/",
        ],
      },
      {
        text: "Slack and Teams webhook URLs you connect are additionally encrypted by the app (AES-256-GCM, key derived with HKDF-SHA-256) and bound to your organization.",
        status: "in_place",
        sources: [`${G}/src/worker/services/integrations/crypto.ts`, `${G}/docs/INTEGRATIONS.md`],
      },
      {
        text: "Passwords are stored only as salted PBKDF2-SHA-256 hashes (100,000 iterations). IP addresses are stored only as salted SHA-256 hashes.",
        status: "in_place",
        sources: [
          `${G}/src/worker/services/auth/password.ts`,
          `${G}/src/worker/services/privacy/consents.ts`,
        ],
      },
    ],
    access: [
      {
        text: "Every database query on organization data is filtered by your organization; files are stored under your organization's own prefix and the search index is separated per organization. Automated tests check that one organization cannot read another's data.",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`, `${G}/test/worker/tenant.test.ts`],
      },
      {
        text: "Inside your organization, access follows roles you assign: owner, admin, editor, reviewer and viewer.",
        status: "in_place",
        sources: [`${G}/src/shared/enums.ts`],
      },
      {
        text: "Sign-in requires a verified email address in production; passwords must be at least 10 characters; sessions expire after 14 days; a password reset signs out every session.",
        status: "in_place",
        sources: [`${G}/src/worker/services/auth/auth.ts`],
      },
      {
        text: "Two-factor authentication for customer accounts is not offered yet.",
        status: "not_in_place",
        sources: [`${G}/src/worker/services/auth/auth.ts`],
      },
      {
        text: "Consequential actions (uploads, approvals, submissions, exports, deletions, integration changes) are written to an append-only audit log.",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`, `${G}/docs/INTEGRATIONS.md`],
      },
      {
        text: "Our staff look at your data only when you ask for support, or when needed to keep the service secure or to comply with the law.",
        status: "in_place",
        sources: [`${G}/docs/legal/data-use.md`, "docs/trust/policies/access-control.md"],
      },
      {
        text: "The platform admin console is protected by Cloudflare Access in addition to an admin allow-list, and the bot check on sign-in forms is switched on.",
        status: "owner_to_confirm",
        sources: [
          `${G}/src/worker/middleware/cloudflare-access.ts`,
          `${G}/src/worker/services/auth/turnstile.ts`,
          `${G}/docs/AUTH.md`,
        ],
      },
    ],
    backups: [
      {
        text: "The database can be restored to any minute in the last 30 days (Cloudflare D1 Time Travel).",
        status: "owner_to_confirm",
        sources: [`${G}/docs/RUNBOOK.md#12-backups-and-the-restore-drill`],
      },
      {
        text: "A nightly export of the database to object storage is set up, keeping the newest 30 copies; a monthly restore drill is documented.",
        status: "owner_to_confirm",
        sources: [".github/workflows/grants-backup.yml", `${G}/docs/RUNBOOK.md`],
      },
      {
        text: "Uploaded original files have no separate backup copy. If one were lost, the text extracted from it is still in the database, and we would ask you to upload the file again.",
        status: "not_in_place",
        sources: [`${G}/docs/RUNBOOK.md#7-accidental-deletion`],
      },
    ],
    deletion: [
      {
        text: "Owners and admins can download a full export of the organization's data (records as JSON plus original files). Exports are deleted after 7 days.",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`],
      },
      {
        text: "An owner can delete the organization. This deletes its files, search-index entries and every database record, keeping only a minimal record that the deletion happened.",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`, `${G}/src/worker/services/privacy/deletion.ts`],
      },
      {
        text: "Each person can delete their own account after signing in again; an account that is the last owner of an organization must hand over or delete that organization first.",
        status: "in_place",
        sources: [`${G}/src/worker/services/auth/account.ts`],
      },
      {
        text: "Deleted data can remain in database backups for up to 30 days, then rolls off.",
        status: "in_place",
        sources: [`${G}/docs/RUNBOOK.md#12-backups-and-the-restore-drill`],
      },
      {
        text: "Organizations can set a retention period after which original uploaded files are deleted (the extracted text is kept).",
        status: "in_place",
        sources: [`${G}/docs/DATA_POLICY.md`],
      },
    ],
    incident: [
      {
        text: "A written incident runbook covers outages, leaked credentials and suspected exposure between organizations, with severity levels and evidence preservation.",
        status: "in_place",
        sources: [`${G}/docs/RUNBOOK.md`, "docs/trust/policies/incident-response.md"],
      },
      {
        text: "If an incident affects your data we notify your organization's owners as the law requires; our internal target for a confirmed exposure between organizations is 72 hours.",
        status: "in_place",
        sources: [
          `${G}/docs/legal/privacy.md`,
          `${G}/docs/RUNBOOK.md#9-suspected-cross-tenant-exposure`,
        ],
      },
    ],
    development: [
      {
        text: "Every change goes through a pull request; automated checks (lint, type checks, unit and integration tests, build) run on it, and production deploys from the main branch through a workflow.",
        status: "partial",
        sources: [".github/workflows/grants-ci.yml", ".github/workflows/grants-deploy.yml"],
      },
      {
        text: "Requiring the checks to pass before merge, and review rules on the main branch, are repository settings being confirmed.",
        status: "owner_to_confirm",
        sources: ["docs/trust/OWNER-CONFIRM.md"],
      },
      {
        text: "Application logs record the route, status and ids only; document contents, request bodies and raw IP addresses are not logged.",
        status: "in_place",
        sources: [`${G}/docs/OPERATIONS.md`, `${G}/docs/DATA_POLICY.md`],
      },
      {
        text: "Automated dependency vulnerability scanning is not set up yet.",
        status: "not_in_place",
        sources: [".github/workflows/grants-ci.yml"],
      },
    ],
  },
  subprocessors: [
    {
      ...CLOUDFLARE_BASE,
      purpose:
        "Hosting, database, file storage, search index, background jobs, logs, email delivery and the AI models for document conversion, embeddings and speech-to-text",
      data: "All customer data the product stores or processes",
      sources: [`${G}/wrangler.jsonc`, `${G}/src/worker/ports/workers-ai.ts`],
    },
    {
      ...ANTHROPIC_BASE,
      purpose: "Large language model for drafting, interviews and fact extraction",
      data: "Document passages, interview answers and confirmed facts (never restricted facts), per request",
      sources: [`${G}/src/worker/ports/anthropic-llm.ts`],
    },
    {
      ...PADDLE_BASE,
      purpose: "Checkout, payments, invoicing and sales tax as merchant of record",
      data: "Billing contact email, and what you enter in Paddle's checkout; card details go to Paddle, not to us",
      condition: "you buy a paid plan",
      sources: [`${G}/src/worker/ports/billing/paddle.ts`],
    },
    {
      ...RESEND_BASE,
      purpose: "Email delivery",
      data: "Recipient addresses and email content",
      condition:
        "a Resend key is configured (newsletter email, or transactional email before the switch to Cloudflare)",
      sources: [`${G}/src/worker/ports/resend-email.ts`, `${G}/docs/EMAIL.md`],
    },
    {
      ...GITHUB_ACTIONS_BASE,
      purpose:
        "Runs the nightly database backup job: the export passes through a short-lived runner on its way to Cloudflare storage and is deleted from the runner",
      data: "A compressed copy of the whole database, in transit only",
      condition: "the nightly backup job is enabled",
      sources: [".github/workflows/grants-backup.yml", "apps/grants/scripts/ops/d1-backup.mjs"],
    },
    {
      ...GOOGLE_SIGNIN_BASE,
      purpose: "Sign in with Google",
      data: "Your Google account name and email, when you choose Google sign-in",
      condition: "Google sign-in is configured and you choose it",
      sources: [`${G}/src/worker/services/auth/auth.ts`],
    },
  ],
};
