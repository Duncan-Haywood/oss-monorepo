# Legal Terms Draft

This is a product-planning draft, not legal advice. Review with qualified
counsel before distributing the app, taking payment, or publishing terms.

## Media safety disclosure

The app is designed to preserve source media and to avoid automatic destructive
operations. Users remain responsible for maintaining independent backups of all
photos, videos, audio, project files, drives, memory cards, and exported media.

Recommended public-facing language:

> You should keep at least one independent backup of all source media before
> using the app. The app can help copy, organize, verify, grade, and export
> media, but it is not a backup service and should not be your only copy of any
> file.

## No automatic deletion

Recommended product policy:

> The app does not automatically delete files from source cards or drives. If a
> workflow includes moving files, the app treats the workflow as copy, verify,
> and review. Any deletion or formatting of a card or drive must be initiated by
> the user outside the automated plan or through a separate explicit confirmation
> flow.

If future versions add deletion features, require:

- independent backup confirmation
- checksum verification
- explicit per-volume confirmation
- clear display of affected files
- undo/archive strategy where feasible
- audit log entry

## Indemnification draft

Potential terms language:

> To the maximum extent permitted by law, you agree to indemnify, defend, and
> hold harmless the company, its owners, employees, contractors, and affiliates
> from and against any claims, damages, liabilities, losses, costs, and expenses,
> including reasonable attorneys' fees, arising out of or related to your use of
> the app, your media, your exports, your publication of content, your violation
> of these terms, or your violation of any third-party rights.

## Limitation of liability draft

Potential terms language:

> To the maximum extent permitted by law, the app is provided "as is" and "as
> available." The company will not be liable for indirect, incidental, special,
> consequential, exemplary, or punitive damages, or for lost profits, lost
> revenue, lost data, lost media, business interruption, or replacement costs,
> even if advised of the possibility of such damages.

## AI output disclosure

Potential terms language:

> AI-generated grades, edits, captions, selections, and recommendations may be
> inaccurate, incomplete, or unsuitable for a particular client, brand, platform,
> or legal context. Users are responsible for reviewing outputs before delivery,
> publication, or commercial use.

## Rights and permissions

Potential terms language:

> You represent that you have the rights, licenses, consents, and permissions
> needed to upload, process, edit, export, and publish any media you use with the
> app. This includes rights related to music, people, trademarks, locations,
> products, clients, and third-party creative works.

## Privacy posture

Recommended product policy:

- Default to local processing when possible.
- Clearly mark any action that sends media, metadata, thumbnails, embeddings, or
  captions to a cloud model or third-party service.
- Provide per-project controls for cloud processing.
- Do not train shared models on user media without explicit opt-in.

## Open legal questions

- Whether a consumer, prosumer, or professional license model needs different
  liability caps.
- Whether cloud processing requires data processing agreements for studio users.
- Whether bundled FFmpeg, codecs, LUTs, or music templates create licensing
  obligations.
- Whether app store policies require additional disclosures for AI-generated
  content.
