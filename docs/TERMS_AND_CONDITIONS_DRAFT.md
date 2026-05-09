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
- Command-line ingest automation requires an explicit `--confirm` flag before any media is copied. Discovery and preview commands are advisory; they never copy files, never write a manifest, and never delete media. Even with `--confirm`, source media is not deleted, destination files are never overwritten with different bytes, and every copy is verified by SHA-256 before the manifest is written.
- The unified card-dump workflow follows the same boundary: without
  `--confirm-ingest` it only discovers routes, estimates source media, and
  previews checksums; with `--confirm-ingest` it performs the verified copy and
  then runs read-only production planning. It does not add source deletion,
  formatting, cleanup, or overwrite authority.
- Post-ingest production planning is read-only. The current `plan-production`
  command reloads and validates the manifest, summarizes planned work, and does
  not create analysis, graded, render-status, or deliverable files.
- Render workspace inspection is read-only. It reloads trusted render task/status
  manifests, verifies declared succeeded deliverables by checksum, and reports
  missing, mismatched, unsafe, unreadable, running, retryable, or failed work for
  review. It does not retry tasks, repair outputs, overwrite files, clean up
  temporary data, or delete media.

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

### Limitation of liability (draft)

"To the maximum extent permitted by law, neither party will be liable for any
indirect, incidental, special, consequential, exemplary, or punitive damages,
or for any loss of profits, revenue, goodwill, use, data, media, or business
interruption, arising out of or related to the Services, even if advised of the
possibility of those damages. Company's aggregate liability for all claims
arising out of or relating to the Services will not exceed the fees paid by You
for the Services during the twelve (12) months before the event giving rise to
the claim (or, for free-tier users, a nominal cap to be defined in final terms)."

### Customer backup and verification acknowledgment (draft)

"You acknowledge that You are solely responsible for maintaining independent
copies of source media and verifying successful import, backup, and export
results before deleting, formatting, or repurposing source devices. Operational
records produced by the Services (including manifests and status reports) are
provided as workflow aids and do not constitute a backup guarantee."

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
