# Trust and security documentation

Free, agent-maintainable alternatives to a paid SOC 2 (owner's decision, 2026-11-24: no SOC 2 until
revenue justifies it). Everything here describes what the code and infrastructure in this repository
actually do, and says plainly what is missing.

**Honest status: Mary Stella Labs, LLC holds no security certification, attestation or audit report
(no SOC 2, no ISO 27001, no CSA STAR listing).** Nothing here has been submitted to any registry or
outside service. Infrastructure providers publish their own security reports; those cover the
provider, never our products, and no document here may say otherwise.

## Contents

| Path | What | Status |
| --- | --- | --- |
| [policies/](policies/) | Eight short policies for a one-owner, agent-built company: [access control](policies/access-control.md), [incident response](policies/incident-response.md), [backup and recovery](policies/backup-and-recovery.md), [change management](policies/change-management.md), [vendor management](policies/vendor-management.md), [data retention and deletion](policies/data-retention-and-deletion.md), [secure development](policies/secure-development.md), [vulnerability disclosure](policies/vulnerability-disclosure.md) | Adopted 2026-11-24, except the disclosure policy (needs a contact first) |
| [subprocessors.md](subprocessors.md) | Every outside service that receives customer personal data, from the code that calls it | Reviewed 2026-11-24 |
| [caiq/](caiq/) | CAIQ answer bank for a possible CSA STAR Level 1 self-assessment | Draft; owner decides on submission |
| [dpa/DPA-template.md](dpa/DPA-template.md) | DPA built on the EU Standard Contractual Clauses, Annexes filled from the real data flows | **Needs a lawyer's review before use** |
| [cis-ig1-self-assessment.md](cis-ig1-self-assessment.md) | CIS Controls IG1 self-assessment (56 safeguards) | Self-assessment |
| [OWNER-CONFIRM.md](OWNER-CONFIRM.md) | Everything the repository cannot prove (MFA, devices, access, dashboards, backups running, legal) | Open checklist |
| `packages/trust-page` | Per-product security page renderer + `security.txt` generator ([README](../../packages/trust-page/README.md)) | Profiles for grants and seller-books |

## Rules for these documents

1. **Every statement is true of the code or infrastructure today, and cites where it comes from**
   (a file path, or the provider's own page). If it is a plan, it says "not in place".
2. **Anything the repository cannot show goes on OWNER-CONFIRM.md**, never stated as fact. In the
   trust-page profiles that is status `owner_to_confirm`, rendered as "Being confirmed".
3. **No certification language.** `packages/trust-page` refuses profile text that names SOC, ISO,
   PCI, HIPAA, STAR or says certified/audited/compliant (`src/guard.ts`).
4. **Provider links only after a person checked them.** The research step for this work could not
   reach provider pages, CSA, CIS, EUR-Lex or the RFC editor (network policy). Every external fact is
   marked as unverified where it is used, with the candidate URL.
5. **Legal text is a template.** The DPA and the customer-facing policies in `apps/grants/docs/legal/`
   need counsel before anyone signs or relies on them.

## Keeping this true

- A PR that changes what a product stores, where it sends data, how it authenticates, backs up or
  deletes, must update the matching profile in `packages/trust-page/src/profiles/`, `subprocessors.md`
  and, if affected, the policy, in the same PR. Set the profile's `reviewedOn`.
- `packages/trust-page` tests fail if a cited path disappears, a subprocessor is missing from
  `subprocessors.md`, or a product has no section in OWNER-CONFIRM.md.
- Review every policy by its "next review" date. Re-run the CIS and CAIQ assessments yearly.

## Follow-ups (not done in this PR)

Out of scope here (other sessions own `apps/*`) or blocked on the owner:

| # | Follow-up | Where | Blocked on |
| --- | --- | --- | --- |
| 1 | Publish a `/security` page for Grant Autopilot: render `renderTrustSection(grantsProfile)` into the prerendered marketing pages, and link it from the footer | `apps/grants` (`scripts/prerender.mjs`, public pages) | Security contact (OWNER-CONFIRM §7), so the page is not published with "being set up" |
| 2 | Serve `/.well-known/security.txt` from `securityTxtForProfile` (at the host root `marisstella.app`, which the catalogue serves, not under `/grants`) | Catalogue site (oss-monorepo `platform/pages`) or a Worker route | Security contact; then regenerate before `Expires` (at most a year) |
| 3 | Seller Books site: add a `/seller-books/security` page from `sellerBooksProfile` and a footer link | `apps/seller-books-site` (`src/pages.mjs`, `build.mjs`) | Product launch (the profile says "not yet serving customers") |
| 4 | Seller Books before launch: email verification, audit log, self-service export and org deletion, nightly D1 backup job | `apps/seller-books`, `.github/workflows/` | Product work |
| 5 | Trust-page profiles for the other products: payapps (landed on `main` while this PR was open; needs its own read of the code), and jobshop-quote, cmmc, einvoice-preflight and wall-framing-takeoff's paid path once they land | `packages/trust-page/src/profiles/` | Reading payapps; the others landing on `main` |
| 6 | cmmc-site: trust page once the CMMC app exists. Note: a CMMC product's own page must not imply our company is CMMC-assessed; the guard refuses "CMMC" in profile text, so that profile will need a reviewed exception for describing the product's features | `apps/cmmc-site`, `packages/trust-page/src/guard.ts` | The CMMC app |
| 7 | Dependabot alerts, secret scanning, push protection (settings); pin GitHub Actions to commit SHAs (workflow PR) | GitHub settings, `.github/workflows/` | Owner (settings) |
| 8 | Customer MFA (Better Auth two-factor) | `apps/grants` | Product decision |
| 9 | Dedicated backup bucket with lifecycle rule; consider a copy outside the Cloudflare account (CIS 11.4) | Cloudflare, `grants-backup.yml` | Owner |
| 10 | Fill the official CAIQ spreadsheet from `caiq/answers.md` and decide on STAR Level 1 | CSA | Owner (licence, version, fee) |

No app was linked to a trust page in this PR: none of the merged sites has a published security page
to link to yet (follow-ups 1–3), and a link to a page that does not exist would be worse than none.
