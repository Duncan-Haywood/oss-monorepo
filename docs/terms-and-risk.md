# Terms, Risk, and Indemnification Notes

This document is drafting guidance for future product/legal review. It is not a
substitute for counsel.

## User-facing safety commitments

MediaFlow should be explicit about how it handles originals:

- The default ingest mode copies files and leaves sources unchanged.
- Destructive source removal requires a separate, explicit confirmation.
- Removable media should be treated as read-only unless the user deliberately
  opts into removal after checksum verification.
- Users should be encouraged to keep at least two independent backups before
  formatting cards or deleting source folders.
- Generated edits, grades, reels, and carousels should be stored as derived
  assets with traceable lineage back to originals.

## Terms and conditions clauses to include

The shipped product should include terms covering:

1. **User responsibility for backups**: users remain responsible for maintaining
   backups of original media and verifying outputs before deleting any source.
2. **No guarantee of creative outcome**: AI-generated grades, selects, captions,
   reels, and carousels are assistive drafts unless explicitly reviewed.
3. **Limited liability for data loss**: liability should be limited to the fees
   paid for the service to the maximum extent permitted by law.
4. **Indemnification**: users indemnify the provider against claims arising from
   media they upload/process, rights violations, publication decisions, releases,
   likeness rights, music licensing, client disputes, or platform policy issues.
5. **Model/provider terms**: if cloud VLMs, LLMs, or rendering providers are used,
   users accept that third-party processing terms may apply.
6. **Privacy and local-first processing**: clearly distinguish local processing
   from any optional cloud analysis, rendering, backup, or sharing.
7. **Professional use disclaimer**: users must review commercial deliverables for
   brand, client, legal, and licensing requirements before publication.

## Operational risk checklist

Before any feature can delete, move, overwrite, or modify originals, require:

- dry-run preview;
- operation manifest;
- checksum verification;
- reversible or trash/quarantine path where possible;
- clear source/destination labels;
- user confirmation scoped to the exact operation;
- automated tests that prove source files survive default flows.

Future UI should make source removal a separate post-ingest cleanup action, not a
side effect of creative editing.
