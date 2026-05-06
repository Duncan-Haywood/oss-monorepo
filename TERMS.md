# Draft Terms and Conditions

This document is a product draft, not legal advice. Have qualified counsel review before public launch.

## Safe handling of customer media

- The app should default to copy-only ingest from SD cards, cameras, phones, and external drives.
- A "move" workflow must mean copy, checksum verification, and source quarantine. It must not delete originals automatically.
- Permanent deletion must require an explicit, separate user action outside the normal ingest pipeline.
- The app should write a manifest for every import with source path, destination path, checksum, file size, and timestamp.
- The user remains responsible for maintaining independent backups of all source and edited media.

## AI and editorial output

- The app uses automated analysis, color matching, selection, and assembly to propose edits and social deliverables.
- Automated output is not guaranteed to match a user's taste, client requirements, brand rules, legal restrictions, music licensing obligations, or platform policies.
- Users must review deliverables before publishing or delivering client work.

## Indemnification

To the maximum extent permitted by law, users agree to indemnify, defend, and hold harmless the product owner, contributors, affiliates, and service providers from claims, damages, losses, liabilities, costs, and expenses arising from:

1. media imported, processed, edited, published, sold, or distributed using the app;
2. infringement or alleged infringement of copyright, trademark, publicity, privacy, music, talent, location, or other third-party rights;
3. user deletion, loss, corruption, misplacement, or disclosure of files;
4. user publication of AI-generated or AI-assisted edits, captions, reels, carousels, photos, or metadata;
5. violation of platform rules, client agreements, employment agreements, event contracts, or applicable law; and
6. misuse of credentials, storage devices, cloud services, or connected accounts.

## Limitation of liability

The app should be provided "as is" and "as available" during private beta. To the maximum extent permitted by law, the product owner should disclaim liability for indirect, incidental, special, consequential, exemplary, or punitive damages, including lost profits, lost revenue, lost goodwill, lost data, or lost business opportunity.

## User responsibilities

Users are responsible for:

- confirming they have rights to process and publish all media;
- reviewing AI output before use;
- maintaining at least two independent backups before clearing cards or drives;
- complying with client, agency, platform, music, talent, and location obligations;
- verifying destination drives have enough space and are healthy; and
- keeping credentials and connected accounts secure.

## Product design implications

These terms imply product requirements:

- show preflight warnings before any high-volume operation;
- make copy/checksum/quarantine status visible;
- keep audit manifests and edit decision logs;
- expose "review before publish" checkpoints;
- avoid automated permanent deletion;
- require explicit connection and permission for social accounts; and
- keep model/provider decisions traceable per exported deliverable.
