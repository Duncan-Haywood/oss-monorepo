# Terms and Conditions Draft Notes

This is a working product/legal draft for review by counsel before any public launch. It is intentionally plain-language so the product can be designed around the risk model.

## Media ownership

- Customers retain ownership of all uploaded, imported, or generated media.
- ShootFlow should only request the permissions needed to copy, organize, analyze, grade, and export deliverables.
- Any model-training use of customer media should be opt-in, explicit, and separately revocable.

## File handling and deletion

- The product is designed to copy source media, not delete it.
- Source deletion, card formatting, destructive overwrite, and archive cleanup are excluded from early product scope.
- Generated deliverables should be written through safe output paths and should not overwrite user/editor-created files unless the product can prove the existing bytes match the intended output or the user explicitly approves replacement.
- If destructive actions are ever added, they must require explicit confirmation, visible manifest review, and a recoverable holding period where technically possible.
- Drive detection and import suggestions should be treated as recommendations until the user reviews the source and destination. The legal terms should avoid promising that the product can identify every SD card, SSD, corrupt file, or unsafe path perfectly.
- Mounted-volume discovery should be framed as advisory scanning of user/system-provided locations. Skipping symlinks, files, inaccessible paths, or unusual devices is a safety feature, not a guarantee that every connected device will be detected.
- Generated manifests, render status files, and scheduler reports should be presented as operational records, not as a substitute for independent backups or professional media archive practices.

## Customer responsibilities

Customers are responsible for:

- Maintaining independent backups of original media.
- Confirming they have rights to process and publish people, music, trademarks, locations, and client materials in their shoots.
- Reviewing AI-generated edits, captions, selections, and exports before publishing.
- Complying with platform rules for Instagram, TikTok, YouTube, and other distribution channels.

## AI output disclaimer

ShootFlow may use computer vision, VLMs, LLMs, and automated editing models to suggest selects, grades, reel variants, captions, and publishing packages. Outputs may be inaccurate, incomplete, off-brand, duplicative, or unsuitable for a specific client. Customers must review outputs before client delivery or publication.

## Indemnification concept

Customers should indemnify and hold harmless the company, its affiliates, employees, contractors, and service providers from claims arising out of:

- Customer media, including rights of publicity, privacy, copyright, trademark, music, venue restrictions, and client contractual restrictions.
- Customer publication, client delivery, paid advertising, or distribution of generated content.
- Customer misuse of the service, including attempts to process unlawful, infringing, or non-consensual content.
- Customer failure to maintain backups before ingest or editing workflows.
- Customer instructions, prompts, presets, reference images, brand assets, music, captions, and publishing metadata supplied to the service.

The company should indemnify customers only for narrow claims that the hosted software, as provided by the company and used according to the terms, infringes third-party intellectual property rights, subject to standard exclusions for customer media, modifications, unsupported workflows, and third-party services.

## Draft clause language (for counsel refinement)

The following is intentionally non-final and should be reviewed by counsel
before launch.

### Customer indemnification (draft)

"You will defend, indemnify, and hold harmless Company, its affiliates, and
their respective officers, directors, employees, contractors, and agents from
and against any third-party claims, liabilities, damages, losses, and expenses
(including reasonable attorneys' fees) arising out of or related to: (a) Your
Media; (b) Your use of the Services in violation of applicable law, platform
terms, or third-party rights; (c) Your instructions, prompts, presets, metadata,
or publication decisions; or (d) Your failure to maintain independent backups of
source media."

### Company indemnification (draft)

"Company will defend You against third-party claims alleging that the Services,
as provided by Company and used by You in accordance with this Agreement,
infringe such third party's intellectual property rights, and will indemnify You
for resulting damages and settlement amounts, subject to exclusions for
customer-provided media/content, customer modifications, combinations not
provided by Company, and use of unsupported third-party systems."

### File safety and deletion boundary (draft)

"Unless expressly enabled in a separately documented feature with explicit user
confirmation, the Services are designed to copy and organize media, not delete
source media. You acknowledge that device detection, route recommendations, and
automation suggestions are advisory, may be incomplete, and do not replace Your
independent verification and backup practices."

## Limitation of liability concept

- Exclude liability for lost profits, lost business, reputational harm, lost data, corrupted media, platform account penalties, and indirect damages to the maximum extent allowed by law.
- Cap direct damages at fees paid during a recent lookback period or a fixed amount for free users.
- Avoid representing that automated edits will increase revenue, engagement, quality, or client satisfaction.

## Privacy and safety principles

- Encrypt customer media in transit and at rest.
- Separate customer workspaces and access controls.
- Keep audit logs for ingest, export, and destructive-intent actions.
- Provide deletion/export rights for account data while preserving legal and abuse-prevention records where required.
- Make subprocessors and AI providers visible before launch.

## Product copy constraints

Marketing should say the product saves time, increases throughput, and produces reviewable drafts. It should not promise guaranteed viral content, guaranteed client acceptance, or perfect color fidelity without human review.
