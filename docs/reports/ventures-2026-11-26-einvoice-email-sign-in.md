---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): a lost API key no longer means a lost account

2026-11-26, private PR 255 (merged). Part of item 2 under "Next" in
`private-monorepo/apps/einvoice-preflight/ROADMAP.md` (claim `workspace-email-sign-in`).

## Why

The workspace (private PR 218) signs in with an API key alone. A firm that lost its only key
lost its account and every client's history, and the only way back was a new trial. An
accounting practice paying €19–49 a month will not put up with that, so this sat between the bet
and a paying customer.

## What landed

- **Sign-in email (optional, per account).** A signed-in firm adds an address and a confirmation
  link (24 h) goes to it. Pressing the link's button makes it the sign-in email. One account per
  address.
- **"Lost your key?"** on the signed-out page. The server always answers `202`, so no one learns
  whether an address has an account. A one-time link (15 min) goes only to a confirmed address.
  Pressing its button issues a new key named `email sign-in`, shown once. At the plan's key limit
  it replaces the oldest earlier `email sign-in` key, or with none it is the one key allowed over
  the limit, so recovery always works.
- **Mail port** `pro/email.mjs`: Resend (the API apps/grants already uses) or an in-memory fake.
  **Off until the owner sets** `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` and
  `APP_URL`. Until then the page shows API-key sign-in only.
- **Safety choices:** tokens are 32 random bytes, stored only as SHA-256 and used once. The token
  rides in the URL fragment, which the page strips from the address bar, and only a button's
  `POST` uses it, so a mail scanner can't burn it. Removing the address cancels links already
  sent. Caps are 10 requests per IP an hour, plus 3 links an hour and 10 a day per address.
  Links are built from `APP_URL`, never the Host header.
- The privacy policy now covers the address, the link records and Resend (named "only if email
  sign-in is turned on").

## Verified

- `node --test pro/*.test.mjs`: 146/146 (was 134). The new `pro/email-signin.test.mjs` covers the
  flow on a socket, expiry, caps, the key limit, a taken address and the off switch. A store
  contract test runs on all four stores (memory, file, node:sqlite, D1 shim), plus an
  old-database upgrade.
- Chromium against a real server with the fake mailer: sign up, add the email, confirm it, sign
  out, ask for a link, sign in with it, then reuse the link (refused). No page errors.
- `run_workflow_locally.py einvoice-preflight-ci`: the paid-layer job passes. The imported
  checker suite fails one poppler extraction test (`repair-facturx.test.mjs:115`) because this
  container allows only `pdfdetach -list`. That file is untouched by the PR.

## Next run should know

- Turning it on is an owner step: a Resend account with a verified sending domain, or a
  Cloudflare Email Service route once the Node host is picked (item 1).
- Not native-checked: the German and French email and page wording.
- Still open in item 2: German and French legal pages, a GDPR Art. 28 DPA, naming the host.
