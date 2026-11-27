# Privacy Policy

**Version 2026-11-27** · Maris Stella Labs LLC

This policy explains what information CMMC Workspace (operated by Maris Stella Labs LLC, "we") collects, why, who processes it, and the choices you have.

## What we collect

- **Account information:** name, email address, sign-in sessions (passwords are stored only as secure hashes), organization memberships and roles.
- **Your organization's profile:** company and legal name, the CMMC level you are preparing for, and the system name, description, boundary, environment and connections you enter for the SSP.
- **Your assessment records:** each requirement's status, owner, notes, objective results, AI drafts and accepted implementation statements, your POA&M items with their due dates, and the SPRS affirmations you record (the date, level, CMMC status and its date, the score you entered and the affirming official's name, title and contact information), and your ISO 9001 checklist answers (each clause's status, owner and notes, and which of your evidence files you linked to it), your asset inventory (each asset's name, scoping category, type, location, provider, owner and notes, and which of your evidence files is its network diagram; describe assets only, never CUI), and your external service providers (each one's name, what it holds, whether it is a cloud provider, its services, its FedRAMP basis, where its service description and customer responsibility matrix are kept, notes, and which requirements it carries), and your written security policies (each family's title, text, owner and review interval, each approved version's text with who approved or reviewed it and when, and any unreviewed AI drafts of a requirement's procedure with who asked for them and when), and your personnel and training records (each person's name, job title, optional email, whether they have access to systems containing CUI or carry security duties and which, when and how they were screened (the method, never the result), when access was granted, when they last took each security training, and when they left or transferred and their access was removed, with notes; record names, roles and dates only, never background check results or other sensitive personnel details), and your subcontractors and suppliers (each one's business name, what it supplies, what your order sends it (FCI, CUI or neither), whether it is for off-the-shelf items, the CMMC level you flow down, the CMMC status and status date you recorded for it, its latest affirmation date and CMMC UIDs, whether your subcontract carries the DFARS clause and its reference, when you checked its status and awarded the order, where your proof is kept, and notes; record business facts only, never CUI), and your controlled-document master list (each document's number, title, type, whether it is yours or issued by a customer or other party and who issued it, its revision, status, owner, where its controlled copy is kept, review interval and review date, notes, and each release, review and withdrawal with its date, summary and who approved or recorded it; the document files themselves stay where you keep them), and your internal audits and corrective actions (each audit's title, the ISO 9001 clauses or process in scope, its planned and completed dates, the auditor's name, a summary, and its findings with what was seen; each corrective action's reference, source, clause, the nonconformity, the immediate correction, root cause, action, owner, due and completion dates, and the effectiveness check with its date, result, notes and who recorded it; describe the problem and the process, never CUI). The Service only stores these; it does not submit anything to SPRS.
- **Evidence files you upload:** the file, its title, name, type and size, a SHA-256 checksum, the requirement it supports and who uploaded it. Every upload requires the uploader to confirm the file contains no CUI. Files are stored privately for your organization.
- **Spreadsheet imports:** a control, POA&M, asset, personnel or other spreadsheet you import is read in your browser and its rows are sent to us as text to preview and apply. Only the records you apply are kept, as listed above, with an audit entry giving the number of changes; the file itself is not stored.
- **Audit log:** who changed what in your organization and when (for example a status change, a draft, an upload or a member change).
- **Billing:** your plan, subscription status, and payment events from the merchant of record. We do not receive or store card numbers.
- **Technical data:** the IP address and browser user-agent of each sign-in session (used to secure your account), short-lived in-memory counters of sign-in and sign-up attempts, and security logs.
- **Acceptance records:** which version of these policies each user accepted, and when.

## Why we use it

- To provide the Service: keep your assessment records, compute your score, and generate your SSP and POA&M.
- To secure the Service and prevent abuse.
- To bill you and apply plan limits.
- To support you when you ask us to.
- To meet legal obligations.

The Service sends account email: a link to confirm your email address when you sign up, a password-reset link when you ask for one, and a notice if someone tries to create an account with your address. It also sends admins and owners of an organization a reminder 60 and 7 days before an affirmation or self-assessment date recorded in the Service falls due, and one notice if that date passes with no newer affirmation recorded; every reminder has a one-click link to stop it, and the Affirmations page has the same switch. We do not send marketing email from the app. An admin can also make a private calendar subscription link for these dates, for the next review date of each approved security policy, for training refresher dates, for the last day suppliers' CMMC status or affirmation stays current, and for ISO 9001 dates (controlled documents' review dates, planned internal audits, and corrective actions' due dates and effectiveness checks): anyone holding the link can read the due dates, their regulatory basis, which policy families are due for review, how many people are due for each training, how many suppliers' records run out on each date and how many documents, audits or corrective actions fall due on each date (no names of people or suppliers, contacts, scores, policy text, or document, audit or corrective-action titles or descriptions) until an admin resets or turns it off, and we keep only a fingerprint of the link and the time a calendar last fetched it.

## Subprocessors

We share data only with service providers that process it on our behalf to run the Service:

| Subprocessor | Purpose |
| --- | --- |
| Cloudflare, Inc. | Hosting, database, file storage and sending account email |
| Anthropic, PBC | AI model that drafts an implementation statement or a policy procedure when someone in your organization asks for one |
| Paddle (merchant of record) | Checkout, payments, invoicing and sales tax |

**What the AI model sees.** When someone presses "Draft with AI" on a requirement, we send Anthropic the requirement's text and assessment objectives, your organization's name, the system name, description, boundary, environment and connections from your profile, the status recorded for that requirement, its implementation notes, and the **titles** of the evidence attached to it. When someone presses "Draft with AI" for a procedure on the Policies tab, we send the requirement's text and assessment objectives, your organization's name, the system name, the status recorded for that requirement, its implementation notes, its accepted implementation statement, the **titles** of the evidence attached to it, the names of the external service providers you recorded as carrying it, and whether the policy has an owner (never the owner's name). We never send the contents of your evidence files. Nothing is sent to the AI model unless someone asks for a draft. We count drafts per organization and across the Service to apply plan limits and a daily spending cap; the count uses the audit log, not the drafts' content. We do not use your data to train AI models.

We will update this list before adding a new subprocessor.

## What we do not do

- We do **not sell** personal information or company data.
- We do **not use your data for advertising**.
- We do **not share your assessment records, evidence or score with other customers, the government, assessors or anyone else**. You decide what to share and with whom.

## Retention

- Your data is kept while your organization's account is active.
- When you ask us to close your organization's account, we delete its data, including evidence files, from our database and file storage. Provider backups and logs roll off on their normal schedules.
- We keep billing records the merchant of record or the law requires.

## Security

- Encryption in transit (HTTPS) and at rest (provider-managed storage encryption).
- Tenant isolation: every record and file belongs to one organization and is checked against your membership on every request.
- Role-based access within each organization (owner, admin, editor, viewer), with an audit log.
- Operator access: our platform administrators (the people who run the service) can see account data across organizations: organization names, account owners' names and email addresses, sign-up dates, plan, subscription status and the price billed. Each such view is logged. These operator tools do not show your SSP, POA&M, evidence, affirmations or quality records.
- Evidence downloads are served as attachments with a restrictive content policy.

No system is perfectly secure. The Service is not a CUI enclave: do not store CUI here. We will notify affected customers of a security incident involving their data as required by law.

## Your rights and choices

- **Access and export:** download your SSP, POA&M (CSV), asset inventory (CSV), personnel and training records (CSV), suppliers (CSV), the controlled-document master list (CSV), the corrective-action log (CSV), security policies (Markdown) and evidence files at any time.
- **Correction:** edit your answers, notes, statements, profile and POA&M at any time.
- **Deletion:** delete evidence files yourself, or contact us to delete your account or your organization's data.
- Depending on where you live, you may have additional rights. Contact us to exercise them.

## Children

The Service is for businesses and is not directed to children under 13.

## Changes

We will post updates with a new version date and ask you to accept material changes the next time you sign in.

## Contact

Maris Stella Labs LLC, Colorado, USA · hello@marisstella.app
