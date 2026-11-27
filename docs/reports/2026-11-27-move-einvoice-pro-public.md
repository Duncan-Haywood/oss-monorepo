---
kind: note
subjects: [security, einvoice-pro]
---
# E-invoice Fix & Explain moved into this repository (part 1 of `move-einvoice-pro-public`)

Step 4 of task `products-to-public-repo` for bet #3 (`portfolio/monetization/bets.md`). The paid
edition of the e-invoice checker, its marketing site and the two packages they import as source now
live in [`ventures/einvoice-pro/`](../../ventures/einvoice-pro/README.md) under the all-rights-reserved
notice. Why: `private-monorepo`'s Actions start no jobs, so the app's deploy (ROADMAP "Next" 1) could
never run there, and Germany's first issuing mandate starts on 1 January 2027.

## Why a third attempt

PRs #19574 and #19575 (both 2026-11-27, about 02:45 UTC) moved the same code to top-level `apps/` and
`packages/`, the layout PR #19571 proposed for PayApps. PayApps instead landed as a self-contained
`ventures/payapps/` (PR #19586), so top-level `apps/` does not exist on main and #19575 waits on a PR
that will not merge. #19574 was green except the CodeQL gate (41 findings on moved lines, because
alerts are keyed by path). Neither branch had moved for over two hours when this run started. This PR
does the move in main's layout and fixes the CodeQL findings in the code instead of waiting for a
dismissal; the two older PRs can close with a pointer here.

## What was copied

`git archive` of `private-monorepo` commit `a1531806` (2026-11-26 22:51 -0700, newer than the
`0c4bf8e8` the older PRs copied, so it includes the metered-API parts 1 to 2b and Dutch parts 1 and 2):
`apps/einvoice-preflight` (1,161 files), `apps/einvoice-site`, `packages/billing` and
`packages/admin-metrics`, 1,167 files in all. The layout under `ventures/einvoice-pro/` matches the
private root, so `pro/`'s `../../../packages/billing/src/index.ts` imports resolve unchanged. Nothing
has npm dependencies (billing and admin-metrics are TypeScript run through Node 22's type stripping),
so there is no workspace, lockfile or install step. Not copied: the deploy workflow, `infra/`, the
private repo's docs.

## Changes made in the copy

- **Test email domain.** `kanzlei.de` is a real domain; the site's worker test uses
  `anna@kanzlei.example` instead (RFC 2606).
- **Package scope** `@private-monorepo/*` renamed `@einvoice-pro/*`. Nothing imports by package name.
- **The app LICENSE** said "see the repository's root LICENSE", which in this repository is MIT. It
  now points at `ventures/einvoice-pro/LICENSE` (the all-rights-reserved template, as PayApps').
- **CodeQL, JavaScript.** The fixes from branch `cq-einvoice` (commit `748a7de4`, written on
  2026-11-26 for PR #19220's earlier move of this code and never merged) applied cleanly at the new
  path: a lexical `stripXmlNoise` in place of repeated comment regexes, exact namespace comparisons
  (`declaresNamespace`), one-pass entity decoding, escaped backslashes, a bounded ReDoS fixture, and
  four identity replacements removed (`xml-text.mjs` plus its 68-line test are new). Not covered by that
  branch and fixed here: `apps/einvoice-site/test/build.test.mjs`'s `text()` helper (script blocks
  matched in any case, with attributes and unclosed; entities decoded in one pass so `&amp;quot;`
  stays `&quot;`).
- **CodeQL, Python.** Three CLI tests (`test_bic.py`, `test_iban.py`, `test_remittance.py`) wrote a
  synthetic invoice with an IBAN to a temporary file (`py/clear-text-storage-sensitive-data`, the
  free edition's triaged alerts #2 to #4). They now feed the invoice to the CLI on stdin (`-`, which
  the CLI supports), so no file is written and the assertions are unchanged. The fourth Python
  finding (`cli.py` printing the user's own report, triaged #34 on the free edition) is the product
  working; if the gate still flags it, the PR records what it said.

Whatever the CodeQL gate still reports after these is in the PR and the run record.

## Verification (this session, Node 22.23.5, Python 3)

| suite | result |
| --- | --- |
| `pro/*.test.mjs` (paid layer) | 278 pass |
| `worker/*.test.mjs` | 9 pass |
| checker suite `*.test.mjs` | 2,390 tests: 2,240 pass, 149 skipped, 1 fail (`repair-facturx.test.mjs`: this container's `pdfdetach` refuses to save attachments, by policy; the older PRs saw the same) |
| Python CLI `unittest discover -s tests` | 445 OK (after the stdin change) |
| einvoice-site build + `test/*.test.mjs` | build ok, 37 pass (after the `text()` change) |
| packages/billing + admin-metrics | 102 pass |
| `check_third_party.py` | 84 signals, all covered (the free edition's five entries now list the copied paths too) |
| `publish_surface.py --check` | matches (the new CI workflow publishes nothing) |

CI runs the same from `.github/workflows/einvoice-pro-ci.yml` (three jobs: app, site, packages;
read-only, no secrets, SHA-pinned actions, sparse checkout of `ventures/einvoice-pro`).

## Pre-publication audit

On the source paths at `a1531806`: **block 0, review 75**. On `ventures/einvoice-pro` as committed:
files 1,174 (21 binary, listed not read), **block 0, review 75**: 2 confidentiality markers, 59 email
addresses, 12 `private-monorepo` mentions, 2 IPv4-shaped strings.

Each read:

- **Emails.** 23 of the 28 flagged source files are byte-identical to files already public in
  `ventures/einvoice-preflight` (checked with `cmp` this session): the NF-e sample corpora (MIT and
  "LGPL or MIT"), the NAV samples and the like, published upstream with those addresses. Of the five
  new files: `kanzlei.de` rewritten (above); `fixtures/fr-fnfe/basicwl-f20260024-fx-cii.xml` is
  FNFE-MPE's published Factur-X example with its placeholder addresses (`masociete.fr`, `seller.com`,
  `buyer.com`), kept as published; `verifactu-response.mjs` names the Spanish tax agency's public
  support address, kept.
- **Confidentiality markers.** The Terms and the DPA promising to keep customer content
  confidential. Keep.
- **`private-monorepo` mentions.** The new README, DEPLOY.md, VENTURE.yaml, task notes and the sync
  script describing the move. Keep.
- **IPv4.** `xmldsig.mjs:189` holds X.509 attribute OIDs (`2.5.4.x`), not addresses.

## Next

1. `priv-einvoice-pro-deploy.yml` in its own PR (control-plane tier), split like
   `priv-payapps-deploy.yml`; then run it once and point einvoice-site's CTA at `/app`.
2. Close #19574 and #19575 with a pointer here; delete branch `cq-einvoice` once this merges.
3. Repoint `bets.md` row 3, `models.yaml` and `roadmap_claim.py`; remove the private copy.
