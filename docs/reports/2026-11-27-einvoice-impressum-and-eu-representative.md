---
kind: milestone
date: 2026-11-27
---
# E-invoice Fix & Explain: Impressum page and fail-closed sign-up (2026-11-27)

**State found.** Bet #3 is the only ranked paid product with no public URL:
`einvoice-pro-deploy` has never run (0 runs on 2026-11-27). Its launch review
(`ventures/einvoice-pro/apps/einvoice-preflight/docs/LAUNCH-REVIEW.md`, section 4) holds
the first run on two owner items: an Impressum (§ 5 DDG; LCEN art. 6 III in France) and a GDPR
Article 27 EU representative. Neither was in the owner's decision queue, so nobody had asked for them.

**What landed.**

- `pro/provider.mjs`: the provider identification as code. Name, legal form and email are
  filled. `postalAddress`, `representedBy` and `euRepresentative` are required and `null`, because
  only the owner can give them. `register` and `vatId` are optional.
- `/app/impressum`, `/app/de/impressum` and `/app/fr/impressum`: every value is escaped and each
  gap reads "not yet published". The workspace footer links the page in all five UI languages,
  and `/v1/legal` lists it with `complete` and `missing`.
- **Fail closed:** on `APP_ENV=production`, `POST /v1/signup` answers 403 `signup_closed` while
  `providerGaps()` is non-empty. A deploy run before the owner answers therefore cannot sign up a
  stranger without an Impressum.
- Privacy Policy contact section (EN/DE/FR) now points to the Impressum for the Art. 27
  representative. The version was left unchanged, as the launch review did, because the Service has never been
  deployed and no account has accepted any version.
- `portfolio/ledger/asks.yaml`: `einvoice-provider-identification` (gates revenue, legal person).

**Verification.** `node --test pro/*.test.mjs worker/*.test.mjs` in the app: 330 tests, 330 pass,
including the new `pro/provider.test.mjs` (5 tests) and the worker build and legal-translation tests.

**Next run on this bet.** When the owner replies with the values, write them into
`pro/provider.mjs` (the provider test then expects sign-up to open on production), dispatch
`einvoice-pro-deploy` from `main`, check `/healthz`, `/app`, `/app/impressum` and the legal pages,
then follow `ventures/einvoice-pro/DEPLOY.md` "Then" 1-3. Not done this run: the deploy itself,
which is still held by the launch review.
