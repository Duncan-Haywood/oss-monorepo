# @private-monorepo/trust-page

A per-product security page and `security.txt`, generated from a typed profile in which every claim
has an honest status and a source. Zero runtime dependencies; runs in Workers, Node ≥ 22 and build
scripts. Background and rules: [docs/trust/README.md](../../docs/trust/README.md).

## Model

A `TrustProfile` (`src/types.ts`) has seven sections (data location, encryption, access, backups,
deletion, incident, development) of `Claim`s, plus its subprocessors.

| Claim status | Rendered as | Use when |
| --- | --- | --- |
| `in_place` | In place | The cited code/config shows it |
| `partial` | Partly in place | Some of it; the text says what is missing |
| `not_in_place` | Not in place | A gap customers should know about |
| `owner_to_confirm` | Being confirmed | Depends on dashboards or practice the repo cannot show (docs/trust/OWNER-CONFIRM.md) |

Guards (`src/guard.ts`), run on every render:
- profile text may not name SOC/ISO/PCI/HIPAA/STAR/CMMC or say certified, audited, compliant, "bank-grade",
  "100% secure"; the page always shows a fixed "we hold no certification" note;
- every claim needs a source: a monorepo path (tests check it exists) or an https URL;
- a provider's trust page is linked only once `trustUrlCheckedOn` records that a person checked it.

## Use

```ts
import { grantsProfile, renderTrustSection, securityTxtForProfile } from "@private-monorepo/trust-page";

// Inside a site's own page shell (no scripts, so it fits `script-src 'none'`):
const html = renderTrustSection(grantsProfile, { headingLevel: 1 });

// Or a standalone page: renderTrustDocument(grantsProfile, { canonicalUrl: "https://…/security" })

// /.well-known/security.txt: throws while the profile has no securityContact.
const txt = securityTxtForProfile(grantsProfile, {
  expires: new Date(Date.now() + 180 * 86_400_000), // at most 365 days ahead
  canonicalUrl: "https://marisstella.app/.well-known/security.txt",
});
```

Plain-ESM sites (`apps/*-site`, `.mjs`) can import the `.ts` sources from a Node ≥ 22.18 build script
(type stripping is on by default there) and write the HTML into `dist/`.

Pass `sourceBaseUrl` only if the sources should be public; the repository is private, so by default
paths are not shown.

## Adding a product

1. `src/profiles/<app>.ts`, with `<app>` the directory under `apps/`; read the app's code, cite
   files, use `owner_to_confirm` for anything the repo cannot show.
2. Add it to `PROFILES` in `src/index.ts`.
3. Add its subprocessors (by `id`) to `docs/trust/subprocessors.md` and a `` `<app>` `` section to
   `docs/trust/OWNER-CONFIRM.md`. The tests enforce both.

## Commands

```bash
cd packages/trust-page
pnpm test        # node --test with type stripping
pnpm typecheck
```

`security.txt` follows RFC 9116 (Contact and Expires required; Expires at most a year ahead; https
URIs). The RFC was not reachable from the session that wrote this; re-check against
https://www.rfc-editor.org/rfc/rfc9116 when changing the rules.
