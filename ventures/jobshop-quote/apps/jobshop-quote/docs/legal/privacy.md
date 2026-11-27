# Privacy Policy

**Version 2026-11-27** · Maris Stella Labs LLC

This policy explains what information Job Shop Quote (operated by Maris Stella Labs LLC, "we") collects, why, who processes it, and the choices you have.

## What we collect

- **Account information:** name, email address, whether the address is verified, sign-in sessions (passwords are stored only as secure hashes), shop memberships and roles, and invitations addressed to an email address (only a hash of each invitation link is stored).
- **Your shop's rate card and settings:** shop name, machines and hourly rates, cut speeds, removal rates and drill feeds, materials and prices (with the history of each price change: who made it and, for an imported supplier sheet, the supplier and the sheet's date), finishing operations, markups, minimums, routing templates and quote defaults.
- **RFQs:** the text of each request for quotation you paste or that arrives at your shop's RFQ email address (including the sender's name and email address, the subject and the message body), the customer details found in it, and the part details your estimators confirm. If your shop limits who can email RFQs in, we keep the list you enter and, for mail it refused, the sender's email address, the time and whether the mail failed its sender domain's SPF, DKIM or DMARC check (the last 10 only, so you can let a real customer through); the message itself is not stored.
- **Files you upload or that arrive with an RFQ:** drawings (PDF and images), text files and CAD files (STEP, IGES, STL, DXF), with their file names and sizes, stored privately for your shop, plus the text and geometry read from them.
- **Quotes:** each quote's lines, inputs, prices, the rate rows used, its status and won/lost outcome, the PDF as sent, the quote emails sent from the app (recipients, subject, message and whether each was sent), and the follow-ups your estimators log on sent quotes (what they wrote, who logged it, when, and the next follow-up day).
- **Customer links and answers:** when your shop makes a customer link to a sent quote (on its own or in a quote email), we store only a hash of the link, who made it, and when it was last opened. Anyone with the link can read the quote's customer-facing details (your shop's name and contact details, the customer, part numbers, descriptions, quantities and prices, lead time, notes and terms) and download the PDF as sent, but never your rates, costs or markups. When the customer accepts or declines through the link, we store what they typed (name, optional email address, PO number, the quantities chosen and an optional note or reason) and email it to the estimators who made or emailed the quote. Your shop is responsible for sending the link only to its customer and for having a basis to process the customer's details; you can turn a quote's links off at any time.
- **QuickBooks Online connection (only if your admin connects it):** the QuickBooks company ID and the access and refresh tokens Intuit issues, stored encrypted, plus a record of which won quotes were sent and as which invoice (its number, total and the lines billed).
- **AI usage records:** for each AI request, which shop it was for, its purpose, the model, the number of tokens and its cost. These records do not contain the RFQ text.
- **Billing:** your plan, subscription status, and payment events from the merchant of record. We do not receive or store card numbers.
- **Technical data:** the IP address and browser user-agent of each sign-in session (used to secure your account), short-lived counters of sign-in, sign-up and password-reset attempts per IP address and per account (an account is counted by a hash of its address, never the address itself), and security logs.
- **Acceptance records:** which version of these policies each user accepted, and when.

## Why we use it

- To provide the Service: read RFQs, price quotes from your rate card, produce quote PDFs, send the quote emails your estimators send, remind each estimator by email of their own quotes that are about to expire or are due for a follow-up (each member can turn these off), email the members who ask for it when an RFQ arrives at the shop's address (a notice with the subject, the sender and a link, never the message or its files), and email the shop's owners and admins once when the month's RFQ count reaches 80% and 100% of the plan's allowance.
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

**Services you connect.** If an admin of your shop connects QuickBooks Online, we send Intuit, at your direction, the invoices your estimators choose to send: the customer's company name, the quote number, the PO number, and each part's number, revision, description, quantity and price. Your rates, costs and markups are never sent. Intuit handles that data under its own terms and privacy statement as your provider, not as ours. Disconnecting stops any further sending and deletes the stored tokens; invoices already in QuickBooks stay there.

## What we do not do

- We do **not sell** personal information or company data.
- We do **not use your data for advertising**.
- We do **not share your RFQs, drawings, rates or quotes with other customers**, or with anyone else, except the people you email a quote to, anyone you give a quote's customer link to, and your own QuickBooks Online company when you send a quote to it.

## Retention

- Your data is kept while your shop's account is active.
- When you ask us to close your shop's account, we delete its data, including uploaded files and quote PDFs, from our database and file storage. Provider backups and logs roll off on their normal schedules.
- We keep billing records the merchant of record or the law requires.

## Security

- Encryption in transit (HTTPS) and at rest (provider-managed storage encryption).
- Tenant isolation: every record and file belongs to one shop and is checked against your membership on every request.
- Role-based access within each shop (owner, admin, estimator, viewer).
- Operator access: our platform administrators (the people who run the service) can see account data across shops: shop names, account owners' names and email addresses, sign-up dates, plan, subscription status and the price billed. Each such view is logged. These operator tools do not show your RFQs, drawings, quotes or rate card. If the operator turns it on, the platform administrators also get an email when a shop starts a paid subscription, with the shop's name, the plan and price, and the shop owner's name and email address.
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
