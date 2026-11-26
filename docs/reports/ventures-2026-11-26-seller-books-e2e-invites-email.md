---
kind: milestone
date: 2026-11-26
---
# Seller Books e2e: invitations, account email, sourcing sheet (2026-11-26)

Bet #5 (Seller Books), private-monorepo PR 320, claim `seller-books/e2e-invites-email-sourcing`.

## What landed

Three Playwright specs in `apps/seller-books/test/e2e/`, closing the gaps listed in the app's
`docs/ARCHITECTURE.md` ("Not yet in it"):

- `05-invitations`: Free refuses an invitation with the reason. Business is confirmed through the fake
  provider's signed webhook. Then the spec creates a viewer link, checks that a different signed-in
  address is refused, and has the invitee sign up from the link and join. The viewer can read but gets
  a 403 on writes; the same write from the owner is accepted, which shows the 403 comes from the role.
  The link works only once, and after removal the shop answers 404.
- `06-account-email`: the reset token is read from the local D1 (`verification.identifier =
  reset-password:<token>`). The link works once. The old password and the other device's session are
  refused, and the reset marks the address confirmed. A second test builds the confirmation link with
  `signJWT` from `better-auth/crypto` and the e2e-only secret, and checks that a damaged token is explained.
- `07-sourcing-sheet`: the preview writes nothing. The import adds 6 items ($1,041.50) and links an
  earlier Etsy order by SKU. Importing the same sheet again adds nothing.

`confirmCheckout(page, baseURL, orgId, planKey)` in `helpers.ts` replaces spec 02's inline webhook code;
use it for any spec that needs a paid plan.

## What the next run should know

- **Terms acceptance is browser-only.** No server middleware checks `legal_acceptances`. An invitee who
  signs up from an invitation link accepts the invitation before seeing the terms, and the terms card
  appears when they first open the shop. This is now written in ARCHITECTURE.md. If the terms must bind
  before any API use, enforce them on the server (payapps likely has the same shape: check before
  porting).
- Offline mail goes to an in-memory fake nobody can read. Get tokens from D1, or sign them with
  `E2E_AUTH_SECRET`; don't add a test-only mailbox endpoint.
- Every bet's next real step is a production deploy. Private-monorepo Actions jobs get no runner
  (owner queue: `private-actions-billing`), so neither `jobshop-quote-deploy` nor `payapps-deploy` has
  ever run. OPERATOR.md lets agents run them once runners are back.
