# Terms, Indemnification, and Risk Notes Draft

This is a product-planning draft, not legal advice. Have qualified counsel review
before using it with customers.

## Scope of service

Mediaflow helps users copy, organize, color grade, and generate social-media
deliverables from user-provided photo and video files. Users remain responsible
for maintaining their own backups, preserving original media, and reviewing all
AI-generated edits before publication.

## User responsibilities

- Keep at least one independent backup of all source media before running the
  app.
- Confirm destination drives have adequate capacity and are healthy.
- Review ingest plans before enabling source cleanup.
- Confirm the user owns, licenses, or has permission to use source footage,
  music, likenesses, logos, and locations included in generated outputs.
- Review exports for model mistakes, hallucinated captions, incorrect people or
  brands, unsafe content, or platform policy issues before publishing.

## File safety commitments

- The default product mode is copy-and-verify, not move-and-delete.
- Source deletion should be disabled unless:
  1. primary copy completes,
  2. primary checksum verification passes,
  3. backup copy completes,
  4. backup checksum verification passes,
  5. the user explicitly confirms deletion for that ingest batch.
- The app should retain an immutable manifest for each ingest job with source
  path, destination path, checksum, byte size, timestamp, and user confirmation.
- Destructive operations should use trash/quarantine first when the platform
  supports it.

## Indemnification draft

To the maximum extent permitted by law, the user agrees to indemnify and hold
the product owner, maintainers, employees, contractors, and affiliates harmless
from claims, damages, liabilities, losses, and expenses, including reasonable
attorneys' fees, arising from:

- media, music, trademarks, likenesses, or other content supplied by the user;
- publication or distribution of generated deliverables;
- the user's failure to maintain independent backups;
- use of generated outputs in advertising, client delivery, or commercial work;
- violation of platform rules, privacy rights, publicity rights, copyright,
  trademark, contract terms, or applicable law.

## Limitation of liability draft

The product should disclaim liability for indirect, incidental, consequential,
special, punitive, or lost-profit damages, including loss of media files, loss of
client revenue, missed publishing windows, or reputational harm. Any liability
cap should be reviewed by counsel and aligned with the commercial model.

## Product implementation implications

- Show plain-language warnings at first run and before destructive actions.
- Require explicit consent before source deletion.
- Store signed/accepted terms version locally and in any account backend.
- Keep audit logs for ingest and deletion decisions.
- Offer a dry-run mode that produces an ingest manifest without copying files.
