# Privacy Policy

**Version 2026-11-26** · Maris Stella Labs LLC

This policy explains what information the e-invoice workspace and API (the "Service", operated by Maris Stella Labs LLC, "we") collects, why, who processes it, and the choices you have. The early-access list on the marketing website has its own privacy page.

## What we collect

- **Account:** the firm or practice name you sign up with, your plan, the date the account was created, and which version of the Terms you accepted. There is no password on the account.
- **Sign-in email (optional):** if you add one in the workspace, the email address and when you confirmed it, so you can sign in with a one-time link if you lose your API key. We use it only to send the confirmation and sign-in links you ask for, never for newsletters or marketing. For each link we keep the address it went to, when it was sent, when it expires and whether it was used (to limit how many links an address receives), and the link itself only as a SHA-256 hash; link records are deleted about a day after they expire. Removing the address in the workspace deletes it from the account and stops links already sent from working.
- **API keys:** each key's name, its first 12 characters (so you can tell keys apart), when it was created, last used and revoked. The key itself is stored only as a SHA-256 hash.
- **Client companies:** the name, country, VAT identifier and your own reference for each client you add.
- **Check history:** for each batch, the time, the language and rule set chosen, and for each file its name, size, SHA-256 hash, pass or fail, the rule ids it failed and the ids of the fixes applied. **Invoice contents are not stored**: each invoice is read in memory, and the corrected file and diff are returned to you, not kept.
- **Usage:** per account and calendar month, the number of invoices checked and explained, and the SHA-256 hash of each invoice counted (so the same file is not counted twice).
- **Billing:** your subscription's plan, status, billing period, price and the merchant of record's customer and subscription identifiers, from its signed notifications, with a log of those notifications (event id, type, outcome) and of each checkout started (plan, time). The email address you give at checkout goes to the merchant of record; we do not store it or any card details.
- **Technical data:** the IP address of each sign-up or sign-in-link request, held only in the server's memory to limit requests per address (never written to the database, gone when the server restarts); and error logs, which record a short error message, never an API key, and which our hosting provider keeps for up to 7 days. The hosting provider's per-request logs are switched off.

## Why we use it

- To provide the Service: check invoices, explain findings, propose fixes and show your history.
- To apply plan limits and bill you.
- To secure the Service and prevent abuse.
- To support you when you ask us to, and to meet legal obligations.

## Subprocessors

| Subprocessor | Purpose |
| --- | --- |
| Cloudflare, Inc. | Hosting: runs the Service on its Workers platform, holds its database (Cloudflare D1, stored in the European Union) and keeps its error logs |
| Anthropic, PBC | AI model that writes some plain-language explanations |
| Paddle (merchant of record) | Checkout, payments, invoicing and VAT or sales tax |
| Resend, Inc. (only if email sign-in is turned on) | Delivers the confirmation and sign-in link emails; it receives the address and the message |

**What the AI model sees.** Most findings have a built-in explanation and nothing is sent. For a finding without one, we send Anthropic the rule id, the finding's message (which can quote the value the rule is about, such as a date, a code or an identifier from the invoice), the proposed fix text and the language, never the invoice file. The explanation is cached by rule, message and language. We do not use your data to train AI models.

We will update this list before adding a new subprocessor.

## Your clients' data

When you add a client company or check its invoices, you decide what is processed and we process it on your behalf, as your processor. Our **Data Processing Agreement** (GDPR Article 28, with the EU Standard Contractual Clauses), published at /app/dpa, is part of the Terms of Service and covers that processing; ask us if you want a copy signed by both parties. This policy covers the account, billing and usage data for which we are the controller.

## What we do not do

- We do **not sell** personal information or company data.
- We do **not use your data for advertising**.
- We do **not share your clients, history or results with other customers**.

## Retention

- Account data is kept while the account is active. Deleting a client in the workspace deletes its history.
- When you ask us to close your account, we delete its data from our database. The database's point-in-time history, which lets us restore it after an incident, keeps earlier states for 30 days and then drops them.
- We keep billing records the merchant of record or the law requires.

## Security

- Encryption in transit (HTTPS).
- API keys and sign-in links stored only as hashes; every request is checked against the account that owns the data.
- Operator access: the people who run the Service can see account names, plans, sign-up dates, subscription status and usage counts across accounts. Each such view is logged. These tools do not show your clients, your history or your sign-in email.

No system is perfectly secure. We will notify affected customers of a security incident involving their data as required by law.

## Your rights and choices

- **Correction and deletion:** delete clients, revoke keys and change or remove the sign-in email in the workspace at any time; contact us to close your account.
- Depending on where you are, you may have further rights (in the EU, under the GDPR: access, rectification, erasure, restriction, portability and objection, and a complaint to your data protection authority). Contact us to exercise them.

## Changes

We will post updates with a new version date and tell you in the workspace about material changes.

## Contact

Maris Stella Labs LLC, Colorado, USA · hello@marisstella.app
