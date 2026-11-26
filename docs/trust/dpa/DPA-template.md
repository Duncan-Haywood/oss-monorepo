# Data Processing Addendum (template)

> **Not legal advice. Template for a lawyer's review before anyone signs it** (OWNER-CONFIRM.md §7).
> Written by an AI agent from the product's code and the public EU Standard Contractual Clauses.
> The SCC text itself was not reachable from the session that wrote this; every clause number below
> must be checked against the official text:
> Commission Implementing Decision (EU) 2021/914 of 4 June 2021, https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj
>
> **Choices for the lawyer** (marked `[[…]]` below):
> 1. Governing law and courts for the SCCs (Clause 17 / 18): an EU Member State whose law allows
>    third-party beneficiary rights; the customer's Member State is the usual choice.
> 2. Sub-processor authorisation: this template uses **general written authorisation** with advance
>    notice (Clause 9, Option 2). Notice period proposed: 30 days.
> 3. Whether to include the optional docking clause (Clause 7). Proposed: yes.
> 4. Whether to include the optional redress wording in Clause 11. Proposed: no.
> 5. UK transfers: attach the ICO International Data Transfer Addendum (version B1.0) to these SCCs,
>    or use the UK IDTA. Swiss transfers: the FDPIC's adaptations.
> 6. Liability cap and its relationship to the main Terms (`apps/grants/docs/legal/terms.md`).
> 7. Breach-notice deadline (proposed "without undue delay, and in any case within 72 hours of becoming
>    aware"); check it is achievable for a one-person company.
> 8. We are **not** certified under the EU-US Data Privacy Framework; do not rely on it.

---

This Data Processing Addendum ("**DPA**") forms part of the agreement between **[[Customer legal
name]]** ("**Customer**") and **Maris Stella Labs LLC**, a Colorado limited liability company
("**Provider**"), for the use of **Grant Autopilot** (the "**Service**") (the "**Agreement**").

## 1. Roles and scope

1.1 For Customer Personal Data, Customer is the controller (or a processor acting for its own
controller) and Provider is the processor (or sub-processor).

1.2 "**Customer Personal Data**" means personal data that Provider processes for Customer in providing
the Service, as described in Annex I.B. "**Data Protection Law**" means Regulation (EU) 2016/679
("GDPR"), the UK GDPR and Data Protection Act 2018, and any other data protection law that applies to
the processing.

1.3 Provider processes Customer Personal Data only on Customer's documented instructions. The Agreement,
this DPA and Customer's use and configuration of the Service (for example the consents for website
crawling, voice recording and autopilot submission, and the raw-file retention setting) are those
instructions. Provider tells Customer if, in its opinion, an instruction breaches Data Protection Law.

## 2. Provider's obligations (GDPR Article 28(3))

Provider shall:

(a) keep Customer Personal Data confidential, and ensure anyone it authorises to process it is bound by
confidentiality;

(b) implement the technical and organisational measures in Annex II;

(c) engage sub-processors only as set out in section 3;

(d) assist Customer, taking into account the nature of the processing, in responding to data subject
requests. The Service provides self-service export, correction and deletion; other requests are
handled under section 5;

(e) assist Customer with security, breach notification, data protection impact assessments and prior
consultation, taking into account the information available to Provider;

(f) at the end of the Agreement, delete Customer Personal Data or, at Customer's choice, let Customer
export it first (section 6);

(g) make available the information needed to demonstrate compliance with this DPA, and allow audits
under section 7.

## 3. Sub-processors

3.1 Customer gives Provider general written authorisation to engage the sub-processors listed in
Annex III.

3.2 Provider will notify Customer of any intended addition or replacement at least **[[30]] days** in
advance, by email to Customer's account owners and by updating its published list. Customer may object
on reasonable data protection grounds within that period; the parties will discuss in good faith, and
if they cannot resolve the objection Customer may terminate the affected part of the Service and
receive a pro-rata refund of prepaid fees.

3.3 Provider imposes on each sub-processor data protection obligations no less protective than this
DPA, and remains liable to Customer for its sub-processors' performance.

## 4. Security incidents

4.1 Provider will notify Customer of a personal data breach affecting Customer Personal Data **without
undue delay** after becoming aware of it [[and in any case within 72 hours]], with the information
then available: what happened, the categories and approximate number of data subjects and records
concerned, likely consequences, and the measures taken or proposed. Provider supplements the
information as it becomes available.

4.2 Provider's notification is not an acknowledgement of fault.

## 5. Assistance and requests

5.1 If a data subject or authority contacts Provider about Customer Personal Data, Provider will
refer them to Customer (unless the law prohibits it) and will not respond on the merits itself
without Customer's instruction.

5.2 If Provider receives a legally binding request from a public authority for Customer Personal Data,
it will notify Customer (unless prohibited), review the legality of the request, and disclose only
the minimum required.

## 6. Return and deletion

6.1 During the Agreement, Customer can export its organization's data at any time (JSON for every
table plus original files) and delete its organization in the Service.

6.2 Within **30 days** after the Agreement ends, Provider will delete Customer Personal Data from the
Service. Copies in database backups are overwritten within a further 30 days. Provider keeps only a
record that the deletion happened (organization id, time and counts) and the billing records that law
or its merchant of record requires.

## 7. Audits

7.1 Provider holds no third-party security certification or audit report. On request (no more than
once a year, or after a personal data breach), Provider will answer a reasonable written security
questionnaire and provide its current security documentation (policies, subprocessor list, Annex II).

7.2 If that is not enough to demonstrate compliance, Customer may conduct an audit, at its own cost,
with at least 30 days' notice, during business hours, under confidentiality, without access to other
customers' data. [[Lawyer: align with SCC Clause 8.9 for restricted transfers.]]

## 8. Restricted transfers: EU Standard Contractual Clauses

8.1 To the extent Customer (as data exporter) transfers Customer Personal Data subject to the GDPR to
Provider (as data importer) in the United States, the standard contractual clauses annexed to
Commission Implementing Decision (EU) 2021/914 (the "**SCCs**") are incorporated by reference and
completed as follows:

| SCC item | Completion |
| --- | --- |
| Module | **Module Two** (controller to processor) where Customer is a controller; **Module Three** (processor to processor) where Customer is a processor |
| Clause 7 (docking clause) | [[Included]] |
| Clause 9 (sub-processors) | Option 2, general written authorisation; notice period as in section 3.2 |
| Clause 11 (redress) | Optional wording not included |
| Clause 13 (supervision) | The supervisory authority set out in Annex I.C |
| Clause 17 (governing law) | Option 1, the law of [[EU Member State]] |
| Clause 18 (forum) | The courts of [[EU Member State]] |
| Annex I, II, III | Annexes I, II and III of this DPA |

8.2 For transfers subject to the UK GDPR, the [[ICO International Data Transfer Addendum to the EU
Commission Standard Contractual Clauses]] applies, completed with the information in the Annexes of
this DPA. For transfers subject to Swiss law, the SCCs apply with the adaptations required by Swiss law.

8.3 If the SCCs conflict with this DPA or the Agreement, the SCCs prevail.

## 9. General

9.1 This DPA ends when Provider no longer processes Customer Personal Data.

9.2 If this DPA conflicts with the Agreement on data protection, this DPA prevails.

9.3 Liability under this DPA is subject to the limits in the Agreement [[lawyer: except where the SCCs
or Data Protection Law do not allow a limit]].

---

## Annex I

### A. List of parties

**Data exporter**

| | |
| --- | --- |
| Name | [[Customer legal name]] |
| Address | [[address]] |
| Contact person | [[name, position, email]] |
| Activities relevant to the transfer | Use of Grant Autopilot to prepare and manage grant applications |
| Role | Controller [[or processor]] |
| Signature and date | |

**Data importer**

| | |
| --- | --- |
| Name | Maris Stella Labs LLC |
| Address | [[registered address]], Colorado, USA |
| Contact person | [[name]], owner, [[contact email, to be confirmed: OWNER-CONFIRM.md §7]] |
| Activities relevant to the transfer | Hosting and operating Grant Autopilot for the exporter |
| Role | Processor [[or sub-processor]] |
| Signature and date | |

### B. Description of the processing and transfer

Source for every row: the product's code and `apps/grants/docs/DATA_POLICY.md`.

| | |
| --- | --- |
| Categories of data subjects | Customer's users (staff, board members, volunteers it invites); individuals named in documents Customer uploads (e.g. staff, board members, contacts, references, and — if Customer uploads them — clients or programme participants); contacts at funders; people who give letters of support |
| Categories of personal data | Account data: name, email, password hash, organization roles. Contact data in organization profiles and documents. Content of uploaded documents and extracted text. Interview answers; voice recordings and transcripts if voice is used. Application drafts, reviews and submissions. Audit log entries (user ids and actions). Hashed IP addresses and user-agent strings. Billing contact email |
| Sensitive data | Not required by the Service. Customer may upload documents containing special-category data (for example about clients it serves); the data use policy asks Customer not to unless needed. Safeguards: facts can be marked *restricted* and are then never sent to the language model for drafting; tenant isolation; no document content in logs; deletion on request |
| Frequency of transfer | Continuous, while Customer uses the Service |
| Nature of the processing | Storage; text extraction and conversion; splitting and indexing for search (embeddings); speech-to-text; extraction of proposed facts and drafting of applications with a large language model; matching to funding opportunities; sending notifications and (on Customer's instruction) submissions by email; export and deletion |
| Purpose | Providing the Service to Customer under the Agreement |
| Retention | While Customer's organization exists; originals of uploaded files and voice audio for the retention period Customer sets; exports 7 days; after termination, section 6 of this DPA |
| Transfers to sub-processors | As in Annex III: hosting and storage (Cloudflare); language model processing per request (Anthropic); payment (Paddle, billing data only); email delivery; nightly backup job (GitHub Actions, transient) |

### C. Competent supervisory authority

[[The supervisory authority of the Member State in which the data exporter is established, or, for
an exporter outside the EU subject to the GDPR under Article 3(2), of the Member State of its EU
representative (SCC Clause 13). Lawyer to complete per customer.]]

## Annex II: Technical and organisational measures

Each measure cites where it is implemented. Items marked *(being confirmed)* depend on account settings
the owner is checking (OWNER-CONFIRM.md) and must be confirmed or removed before signature.

| Measure | Implementation |
| --- | --- |
| Encryption in transit | HTTPS only; HSTS (`apps/grants/src/worker/middleware/security.ts`) |
| Encryption at rest | Provider-managed encryption of the database and file storage by Cloudflare *(being confirmed)*. Integration webhook URLs additionally encrypted with AES-256-GCM (`src/worker/services/integrations/crypto.ts`) |
| Pseudonymisation and minimisation | IP addresses stored only as salted SHA-256 hashes; no document content, interview answers or personal data in logs or queue messages (`docs/DATA_POLICY.md`) |
| Tenant isolation | Every query filtered by organization; files under a per-organization prefix; search index separated per organization; automated cross-tenant tests (`test/worker/tenant.test.ts`) |
| User access control | Roles per organization; verified email in production; minimum password length 10; PBKDF2-SHA-256 password hashing; 14-day sessions; rate limits and bot checks on sign-in *(bot check being confirmed)* (`src/worker/services/auth/`) |
| Operator access control | Access to customer data only for support Customer requests, security or legal duties; MFA on infrastructure accounts *(being confirmed)*; admin console behind an allow-list and Cloudflare Access *(being confirmed)* (`docs/trust/policies/access-control.md`) |
| Logging and audit | Append-only audit log of consequential actions; request logs with ids and status only (`docs/OPERATIONS.md`) |
| Availability and backups | Database point-in-time recovery for 30 days and nightly exports kept for 30 days *(being confirmed)*; documented restore drill. Uploaded files have no separate backup copy (`docs/trust/policies/backup-and-recovery.md`) |
| Incident response | Written policy and runbook with severity levels, evidence preservation and customer notification (`docs/trust/policies/incident-response.md`) |
| Secure development and change | Pull requests with automated tests including cross-tenant tests; infrastructure as code; rollback procedure (`docs/trust/policies/secure-development.md`, `change-management.md`) |
| Data retention and deletion | Organization deletion removes database rows, files and index entries; configurable raw-file retention; backups roll off within 30 days (`docs/trust/policies/data-retention-and-deletion.md`) |
| Sub-processor management | Assessment before onboarding, published list, advance notice of changes (`docs/trust/policies/vendor-management.md`) |
| Language model use | Customer content is sent to the model provider per request only to provide the Service; restricted facts are excluded from drafting; the provider's commercial terms say it does not train on this content *(wording being confirmed)* |
| Assistance to the controller | Self-service export, correction and deletion; questionnaire answers on request |

## Annex III: List of sub-processors

From `docs/trust/subprocessors.md` (built from the code; reviewed 2026-11-24). The exporter authorises
these sub-processors.

| Sub-processor | Processing | Location | Condition |
| --- | --- | --- | --- |
| Cloudflare, Inc. | Hosting, database, file storage, search index, background jobs, logs, AI models for document conversion, embeddings and speech-to-text, transactional email, bot checks | Global network; storage location chosen by Cloudflare [[region: OWNER-CONFIRM.md §5]] | Always |
| Anthropic, PBC | Language model processing (drafting, interviews, fact extraction) | [[confirm]] | Always |
| Paddle | Merchant of record for payments (billing contact data only) | [[confirm]] | When Customer buys a paid plan |
| Resend | Email delivery | [[confirm]] | [[Only if still configured: OWNER-CONFIRM.md §5; otherwise remove]] |
| GitHub, Inc. | Runs the nightly database backup job (database export passes through a short-lived runner) | [[confirm]] | When backups are enabled |
| Google | "Sign in with Google" for users who choose it | [[confirm]] | [[Only if enabled]] |
