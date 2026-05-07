# Terms and Conditions Draft Notes

This is a product drafting aid, not legal advice. A qualified attorney should
review any customer-facing terms before launch.

## Intended Terms Posture

ShootFlow handles valuable original media. The terms must be direct about what
the software does, what the customer remains responsible for, and where the
product intentionally refuses destructive operations.

## Key Clauses to Include

### Customer Media Ownership

- Customers retain ownership of all uploaded, imported, copied, analyzed, and
  exported media.
- ShootFlow receives only the limited rights needed to process media, generate
  previews, create edits, and provide support at the customer's request.
- Customer media should not be used for model training without a separate,
  explicit opt-in.

### Backups and File Responsibility

- Customers are responsible for keeping independent backups of source media.
- ShootFlow is designed to copy and organize media, not to be the sole archive
  of record.
- The app should present backup and destination warnings before large imports.

### No Destructive Source Operations in Early Scope

- The initial product should not delete source card files, format cards, or
  erase customer archives.
- Any future deletion or card-format capability must require explicit opt-in,
  strong confirmations, recent verified backup evidence, and audit logs.
- Automated cleanup should apply only to generated intermediates unless the
  customer has separately enabled destructive workflows.

### AI Output Review

- AI-generated color grades, reels, captions, carousels, and selects are
  recommendations or generated drafts.
- Customers remain responsible for reviewing exports before publication.
- Terms should disclaim guarantees of platform performance, engagement,
  likeness approval, brand fit, and factual caption accuracy.

### Indemnification

Consider requiring customers to indemnify and hold the company harmless for
claims arising from:

- Customer-provided media, including privacy, publicity, copyright, trademark,
  and contract disputes.
- Customer publication or commercial use of generated edits, captions, music
  selections, templates, or other outputs.
- Customer failure to maintain backups or misuse of any destructive workflow
  they explicitly enable in the future.
- Customer violation of social platform rules or third-party licensing terms.

The company should also provide reciprocal protection for claims that the
unmodified ShootFlow software itself infringes third-party IP, subject to
standard exclusions.

### Liability Limits

- Cap liability to fees paid over a defined lookback period where enforceable.
- Exclude indirect, incidental, consequential, special, exemplary, and lost
  profit damages.
- Call out lost or corrupted media as a high-value risk customers must mitigate
  with backups and review.

### Beta and Personal Tool Phase

- If distributed before production hardening, label the product as beta or
  experimental.
- Explain that output quality may vary by input media, hardware, model
  availability, and selected workflow settings.
- Reserve the right to change model providers, workflow internals, and
  platform-specific export presets.

## Product Requirements Implied by Terms

- The application must surface clear backup and non-deletion behavior in UX.
- Manifest logs should be easy to export for customer support and dispute
  resolution.
- Any future destructive feature should be isolated behind a separate
  capability flag and designed with attorney-reviewed language.
