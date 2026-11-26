# Privacy Policy

**Version 2026-11-26** · Maris Stella Labs LLC

This policy explains what information Job Shop Quote (operated by Maris Stella Labs LLC, "we") collects, why, who processes it, and the choices you have.

## What we collect

- **Account information:** name, email address, whether the address is verified, sign-in sessions (passwords are stored only as secure hashes), shop memberships and roles, and invitations addressed to an email address (only a hash of each invitation link is stored).
- **Your shop's rate card and settings:** shop name, machines and hourly rates, materials and prices, finishing operations, markups, minimums, routing templates and quote defaults.
- **RFQs:** the text of each request for quotation you paste or that arrives at your shop's RFQ email address (including the sender's name and email address, the subject and the message body), the customer details found in it, and the part details your estimators confirm. If your shop limits who can email RFQs in, we keep the list you enter and, for mail it refused, the sender's email address, the time and whether the mail failed its sender domain's SPF, DKIM or DMARC check (the last 10 only, so you can let a real customer through); the message itself is not stored.
- **Files you upload or that arrive with an RFQ:** drawings (PDF and images), text files and CAD files (STEP, IGES, STL, DXF), with their file names and sizes, stored privately for your shop, plus the text and geometry read from them.
- **Quotes:** each quote's lines, inputs, prices, the rate rows used, its status and won/lost outcome, the PDF as sent, and the quote emails sent from the app (recipients, subject, message and whether each was sent).
- **AI usage records:** for each AI request, which shop it was for, its purpose, the model, the number of tokens and its cost. These records do not contain the RFQ text.
- **Billing:** your plan, subscription status, and payment events from the merchant of record. We do not receive or store card numbers.
- **Technical data:** the IP address and browser user-agent of each sign-in session (used to secure your account), short-lived counters of sign-in, sign-up and password-reset attempts per IP address and per account (an account is counted by a hash of its address, never the address itself), and security logs.
- **Acceptance records:** which version of these policies each user accepted, and when.

## Why we use it

- To provide the Service: read RFQs, price quotes from your rate card, produce quote PDFs, and send the quote emails your estimators send.
- To send account emails: confirming your address and resetting your password. We do not send marketing email from the app.
- To secure the Service, prevent abuse, and keep AI spending within each plan's limits.
- To bill you and apply plan limits.
- To support you when you ask us to.
- To meet legal obligations.

## Subprocessors

We share data only with service providers that process it on our behalf to run the Service:

| Subprocessor | Purpose |
| --- | --- |
| Cloudflare, Inc. | Hosting, database, file storage, receiving RFQ email, sending email, and reading text from uploaded PDFs and images (Workers AI) |
| Anthropic, PBC | AI model that reads an RFQ when an estimator asks it to, and drafts cover notes |
| Paddle (merchant of record) | Checkout, payments, invoicing and sales tax |

**What the AI model sees.** When an estimator presses "Extract with AI", we send Anthropic the RFQ's text and the text read from its attached files, so the model can find the part details. To draft a cover note we send the quote's customer-facing facts (shop and customer name, quote number, part numbers and descriptions, quantities, prices, lead time, notes, and the names of the material, operations and finishing a price includes), never your rates, costs or markups. An RFQ that arrives by email is not sent to the AI model until someone in your shop asks for it. We do not use your data to train AI models.

We will update this list before adding a new subprocessor.

## What we do not do

- We do **not sell** personal information or company data.
- We do **not use your data for advertising**.
- We do **not share your RFQs, drawings, rates or quotes with other customers**, or with anyone else, except the people you email a quote to.

## Retention

- Your data is kept while your shop's account is active.
- When you ask us to close your shop's account, we delete its data, including uploaded files and quote PDFs, from our database and file storage. Provider backups and logs roll off on their normal schedules.
- We keep billing records the merchant of record or the law requires.

## Security

- Encryption in transit (HTTPS) and at rest (provider-managed storage encryption).
- Tenant isolation: every record and file belongs to one shop and is checked against your membership on every request.
- Role-based access within each shop (owner, admin, estimator, viewer).
- Operator access: our platform administrators (the people who run the service) can see account data across shops: shop names, account owners' names and email addresses, sign-up dates, plan, subscription status and the price billed. Each such view is logged. These operator tools do not show your RFQs, drawings, quotes or rate card.
- Sent quotes are frozen: the PDF your customer received is kept unchanged with its checksum.

No system is perfectly secure. We will notify affected customers of a security incident involving their data as required by law.

## Your rights and choices

- **Access and export:** download any quote PDF at any time.
- **Correction:** edit your name, rate card, RFQ parts and draft quotes at any time. Sent quotes are kept as sent; revise a quote to change it.
- **Deletion:** contact us to delete your account or your shop's data.
- Depending on where you live, you may have additional rights. Contact us to exercise them.

## Children

The Service is for businesses and is not directed to children under 13.

## Changes

We will post updates with a new version date and ask you to accept material changes the next time you sign in.

## Contact

Maris Stella Labs LLC, Colorado, USA · hello@marisstella.app
