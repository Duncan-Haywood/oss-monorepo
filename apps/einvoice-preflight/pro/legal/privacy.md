# Privacy Policy

**Version 2026-11-26** · Maris Stella Labs LLC

This policy explains what information the e-invoice workspace and API (the "Service", operated by Maris Stella Labs LLC, "we") collects, why, who processes it, and the choices you have. The early-access list on the marketing website has its own privacy page.

## What we collect

- **Account:** the firm or practice name you sign up with, your plan, the date the account was created, and which version of the Terms you accepted. There is no email address or password on the account.
- **API keys:** each key's name, its first 12 characters (so you can tell keys apart), when it was created, last used and revoked. The key itself is stored only as a SHA-256 hash.
- **Client companies:** the name, country, VAT identifier and your own reference for each client you add.
- **Check history:** for each batch, the time, the language and rule set chosen, and for each file its name, size, SHA-256 hash, pass or fail, the rule ids it failed and the ids of the fixes applied. **Invoice contents are not stored**: each invoice is read in memory, and the corrected file and diff are returned to you, not kept.
- **Usage:** per account and calendar month, the number of invoices checked and explained, and the SHA-256 hash of each invoice counted (so the same file is not counted twice).
- **Billing:** your subscription's plan, status, billing period, price and the merchant of record's customer and subscription identifiers, from its signed notifications, with a log of those notifications (event id, type, outcome) and of each checkout started (plan, time). The email address you give at checkout goes to the merchant of record; we do not store it or any card details.
- **Technical data:** the IP address of each sign-up request, held only in the server's memory to limit sign-ups per address (never written to the database, gone when the server restarts); and error logs, which record a short error message, never an API key.

## Why we use it

- To provide the Service: check invoices, explain findings, propose fixes and show your history.
- To apply plan limits and bill you.
- To secure the Service and prevent abuse.
- To support you when you ask us to, and to meet legal obligations.

## Subprocessors

| Subprocessor | Purpose |
| --- | --- |
| Hosting provider (not chosen yet; named here before the Service opens to the public) | Runs the Service and holds its database |
| Anthropic, PBC | AI model that writes some plain-language explanations |
| Paddle (merchant of record) | Checkout, payments, invoicing and VAT or sales tax |

**What the AI model sees.** Most findings have a built-in explanation and nothing is sent. For a finding without one, we send Anthropic the rule id, the finding's message (which can quote the value the rule is about, such as a date, a code or an identifier from the invoice), the proposed fix text and the language, never the invoice file. The explanation is cached by rule, message and language. We do not use your data to train AI models.

We will update this list before adding a new subprocessor.

## Your clients' data

When you add a client company or check its invoices, you decide what is processed and we process it on your behalf. If you are subject to the EU GDPR and need a data processing agreement, contact us.

## What we do not do

- We do **not sell** personal information or company data.
- We do **not use your data for advertising**.
- We do **not share your clients, history or results with other customers**.

## Retention

- Account data is kept while the account is active. Deleting a client in the workspace deletes its history.
- When you ask us to close your account, we delete its data from our database. Backups roll off on their normal schedule.
- We keep billing records the merchant of record or the law requires.

## Security

- Encryption in transit (HTTPS).
- API keys stored only as hashes; every request is checked against the account that owns the data.
- Operator access: the people who run the Service can see account names, plans, sign-up dates, subscription status and usage counts across accounts. Each such view is logged. These tools do not show your clients or your history.

No system is perfectly secure. We will notify affected customers of a security incident involving their data as required by law.

## Your rights and choices

- **Correction and deletion:** delete clients and revoke keys in the workspace at any time; contact us to close your account.
- Depending on where you are, you may have further rights (in the EU, under the GDPR: access, rectification, erasure, restriction, portability and objection, and a complaint to your data protection authority). Contact us to exercise them.

## Changes

We will post updates with a new version date and tell you in the workspace about material changes.

## Contact

Maris Stella Labs LLC, Colorado, USA · hello@marisstella.app
