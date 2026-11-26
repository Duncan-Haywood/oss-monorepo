---
kind: milestone
date: 2026-11-26
---
# CMMC workspace: external service providers (private PR 299)

Bet #4 (`portfolio/monetization/bets.md`). In `private-monorepo/apps/cmmc` there is now a Providers tab (migration 0009,
`service_provider`; `src/shared/service-providers.ts`):

- Each provider is scoped by table 4 to 32 CFR 170.19(c)(2)(i): what it holds (CUI / Security Protection Data / neither)
  and whether it is a cloud provider. The tab shows the rule's cell verbatim. The quotes are hash-pinned in
  `service-providers.test.ts`.
- It records services, the FedRAMP basis (for a cloud provider holding CUI), where the service description and the CRM
  are kept, and which Level 2 requirements the CRM assigns to the provider or shares.
- The Level 2 SSP prints a provider table under the boundary and an "External service providers: carried by X; shared
  with Y" line on each requirement those providers carry.

## Things the next run should know

- **eCFR answers from a cloud session if the request allows compression.** A plain `curl` of the versioner API gets
  HTTP 406 ("This endpoint requires response compression"); `curl --compressed` gets 200. The 170.19 file read on
  2026-11-26 has the same sha256 as the 2026-11-25 copy (`69465e2b…f197`). Earlier records that say "eCFR unreachable"
  probably hit the 406.
- Next, listed in the cmmc ROADMAP: link the service description and the CRM to evidence files (they are typed
  references today), import a provider's CRM spreadsheet into the requirement marks, and show the shared requirements on
  the Controls page.
- The customer post `docs/posts/2026-11-25-cmmc-level-1-self-assessment-checklist.md` now has a section on providers.
