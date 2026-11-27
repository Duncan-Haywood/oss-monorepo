// Seller Books (apps/seller-books): built, not deployed (no deploy workflow; the paid path is dark,
// apps/seller-books/docs/ARCHITECTURE.md). Checked against the cited files on reviewedOn.

import { CLOUDFLARE_BASE } from "../subprocessors.ts";
import type { TrustProfile } from "../types.ts";

const S = "apps/seller-books";

export const sellerBooksProfile: TrustProfile = {
  product: "Seller Books",
  operator: "Maris Stella Labs LLC (Colorado, USA)",
  lifecycle: "pre_launch",
  reviewedOn: "2026-11-24",
  securityContact: null,
  sections: {
    data_location: [
      {
        text: "Your books (imported marketplace reports, sales, fees, inventory, mileage) are stored in one Cloudflare D1 database. No other service receives them: the product makes no AI calls and sends no email.",
        status: "in_place",
        sources: [`${S}/wrangler.jsonc`, `${S}/docs/ARCHITECTURE.md`],
      },
      {
        text: "No storage region is pinned in the configuration, so Cloudflare chooses where the database lives. The region will be confirmed at launch.",
        status: "owner_to_confirm",
        sources: [`${S}/wrangler.jsonc`, "docs/trust/OWNER-CONFIRM.md"],
      },
    ],
    encryption: [
      {
        text: "All traffic uses HTTPS. API responses carry a Strict-Transport-Security header (one year).",
        status: "in_place",
        sources: [`${S}/src/worker/middleware/security.ts`],
      },
      {
        text: "Data at rest in the database is encrypted by Cloudflare. We rely on Cloudflare's published documentation for this and are confirming its exact scope.",
        status: "owner_to_confirm",
        sources: ["https://developers.cloudflare.com/d1/platform/data-security/"],
      },
      {
        text: "Passwords are stored only as salted PBKDF2-SHA-256 hashes (100,000 iterations).",
        status: "in_place",
        sources: [`${S}/src/worker/services/auth/password.ts`],
      },
    ],
    access: [
      {
        text: "Every query is filtered by your selling business (organization), and an automated test checks that a member of one organization can neither read nor change another's books.",
        status: "in_place",
        sources: [`${S}/docs/ARCHITECTURE.md`, `${S}/test/worker/books.test.ts`],
      },
      {
        text: "Inside your organization, access follows roles: owner, admin, editor and viewer.",
        status: "in_place",
        sources: [`${S}/src/shared/enums.ts`],
      },
      {
        text: "Passwords must be at least 10 characters and sessions expire after 14 days.",
        status: "in_place",
        sources: [`${S}/src/worker/services/auth/auth.ts`],
      },
      {
        text: "Email address verification, two-factor authentication and an audit log of account actions are not built yet.",
        status: "not_in_place",
        sources: [`${S}/src/worker/services/auth/auth.ts`, `${S}/src/worker/db/schema/books.ts`],
      },
    ],
    backups: [
      {
        text: "The database can be restored to any minute in the last 30 days (Cloudflare D1 Time Travel), depending on the Cloudflare plan at launch.",
        status: "owner_to_confirm",
        sources: ["docs/trust/policies/backup-and-recovery.md"],
      },
      {
        text: "No scheduled export of the database to separate storage is set up yet.",
        status: "not_in_place",
        sources: [".github/workflows/apps-seller-books-ci.yml"],
      },
    ],
    deletion: [
      {
        text: "You can delete individual imports, lots, items, expenses and mileage entries. Every record is tied to its organization in the database, so deleting the organization removes all of it.",
        status: "partial",
        sources: [`${S}/src/worker/routes/org/imports.ts`, `${S}/src/worker/db/schema/books.ts`],
      },
      {
        text: "A self-service button to export everything or delete the whole organization is not built yet; until it is, we do it on request.",
        status: "not_in_place",
        sources: [
          `${S}/src/worker/routes/orgs.ts`,
          "docs/trust/policies/data-retention-and-deletion.md",
        ],
      },
      {
        text: "The Schedule C worksheet can be downloaded as CSV.",
        status: "in_place",
        sources: [`${S}/src/worker/routes/org/reports.ts`],
      },
    ],
    incident: [
      {
        text: "Incidents follow the company incident response policy: contain, preserve evidence, scope, then notify affected customers as the law requires.",
        status: "in_place",
        sources: ["docs/trust/policies/incident-response.md"],
      },
    ],
    development: [
      {
        text: "Every change goes through a pull request with automated checks (lint, type checks, unit and integration tests).",
        status: "partial",
        sources: [".github/workflows/apps-seller-books-ci.yml"],
      },
      {
        text: "Automated dependency vulnerability scanning is not set up yet.",
        status: "not_in_place",
        sources: [".github/workflows/apps-seller-books-ci.yml"],
      },
    ],
  },
  subprocessors: [
    {
      ...CLOUDFLARE_BASE,
      purpose: "Hosting and the database",
      data: "All customer data the product stores",
      sources: [`${S}/wrangler.jsonc`],
    },
  ],
};
