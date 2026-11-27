---
kind: note
subjects: [security, einvoice-preflight]
---
# Pre-publication audit: einvoice-preflight and einvoice-site, moved here

Step 4 of task `products-to-public-repo` (`portfolio/work/tasks.yaml`) for bet #3,
E-invoice fix-and-explain. Like PayApps (PR #19571), the app cannot deploy from the private
repository, whose Actions start no jobs (decision queue row `private-actions-billing`), and
Germany's issuing mandate for prior-year turnover above €800k starts on 1 January 2027.

## What moved

`git archive` of private `0c4bf8e8` (the commit PR #19571 copied), tracked files only:
`apps/einvoice-preflight` (1,102 files) and `apps/einvoice-site` (21 files), at the same paths,
so `../../packages/billing` and `../../packages/admin-metrics` resolve once PR #19571's
`packages/` is on `main`. Each app's `LICENSE` is the all-rights-reserved template;
einvoice-preflight's adds a paragraph naming the MIT baseline it was imported from
(`ventures/einvoice-preflight` at `8e9e26d5`). Not moved: the deploy workflow (it needs
Cloudflare credentials, so it gets its own reviewed `priv-` workflow here) and nothing outside
the two app directories.

## Audit

`python3 platform/security/prepub_audit.py <private clone> apps/einvoice-preflight apps/einvoice-site`
on `0c4bf8e8`: 1,123 files (21 binary). **Block: 0. Review: 67.**

Most of the 67 are in files already public: the app began as a copy of this repository's
`ventures/einvoice-preflight`, so each flagged file was compared byte for byte with the public
copy. 23 of the 28 flagged files are identical (the nfelib and sped-nfe NF-e corpora, the
FNFE-MPE examples, the Hungarian NAV samples, `xmldsig.mjs`); publishing them again exposes
nothing. The 5 new or changed ones, each read:

| file | finding | decision |
|---|---|---|
| `apps/einvoice-site/test/worker.test.mjs` | `anna@kanzlei.de` (4 lines) | a real registrable domain: now `kanzlei.example` |
| `fixtures/fr-fnfe/basicwl-f20260024-fx-cii.xml` | `masociete.fr`, `seller.com`, `buyer.com` | the FNFE-MPE's own published example (README line 10), kept byte for byte like its siblings already in `ventures/` |
| `verifactu-response.mjs:55` | `verifactu@correo.aeat.es` | the Spanish tax agency's published support address in its error-code text, the same line as the public copy |
| `pro/legal/terms.md:44`, `pro/legal/dpa.md:71` | "confidential" | the Terms' and DPA's promise to treat customer content as confidential: keep |

The 2 "public IPv4" hits are X.509 attribute OIDs (`2.5.4.3`, `2.5.4.10`) in `xmldsig.mjs`.
Read by hand as well: no `private-monorepo` references outside provenance text (which now names
`ventures/einvoice-preflight`), no secrets (the deploy config is generated at deploy time and
ignored, `.gitignore`), and the 21 binaries are fonts and generated PDF fixtures already listed
in `PROVENANCE.md`.

## Verification (local, this tree plus PR #19571's packages/billing and admin-metrics)

- `node --test pro/*.test.mjs`: 263 of 263 pass.
- `node --test worker/*.test.mjs`: 9 of 9 pass.
- `node --test --test-concurrency=4 *.test.mjs`: 2,231 pass, 149 skipped (the official route
  without slimdom and fontoxpath installed), 1 fails: `repair-facturx.test.mjs` "poppler opens
  the repaired PDF", because this cloud container's `pdfdetach` is a wrapper that refuses to save
  attachments. Not a code defect; CI's runner has no poppler and skips it.
- einvoice-site: `node build.mjs` ok, `node --test test/*.test.mjs` 35 of 35, `biome ci` (2.6.8,
  PR #19571's root `biome.json`) clean.

## Next

1. Merge after PR #19571 (it brings `packages/` and the root workspace these apps use).
2. A `priv-einvoice-pro-deploy.yml` from the private `einvoice-preflight-deploy.yml`, with
   CODEOWNERS for `apps/einvoice-preflight`, then run it: the paid layer on Workers + D1.
3. Port private commits after `0c4bf8e8` (`git diff 0c4bf8e8..HEAD -- apps/einvoice-*`), then
   remove the private copy, and add the two rows to `apps/README.md`.
