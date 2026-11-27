---
kind: agent-doc
subjects: [payapps, products-to-public-repo]
---
# Pre-publication audit: PayApps, its site, packages/ and the trust and legal docs

Step 3 of task `products-to-public-repo` (`portfolio/work/tasks.yaml`): an
audit script, run on each private app before it is copied into this public
repository. PayApps (bet #1) is first because it is launch-approved but cannot
deploy: `private-monorepo`'s Actions start no jobs (decision queue row
`private-actions-billing`), and this repository's runners do.

## The tool

`platform/security/prepub_audit.py ROOT PATH...` reads every tracked file
under the paths (git ls-files, so `node_modules` and build output are never
read) and prints path, line, rule and a redacted match, so the report can be
committed. `block` findings exit 1; `review` findings need a decision in the
move PR; `prepub-audit: ok <reason>` on a line clears it. It covers what
`security-scan` (gitleaks, semgrep) does not: personal data (emails outside
example domains, phone and SSN shapes, personal paths, the source repo's
commit-author emails, an optional terms file kept outside the tree for client
names), internal hostnames and private IPs, AWS and cloud account ids, open
security notes, confidentiality markers, files that never move (`.dev.vars`,
`.env`, keys, tfstate, secret inventories), data files and large binaries. It
re-checks secrets with `risk_review.py`'s own patterns. Tests:
`cd platform/security && python3 -m unittest test_prepub_audit` (15).

Tuned against the whole private repo before this run: the textbook SSN
`123-45-6789`, PDF and RFC clause numbers (`§7.9.2.2`, `section-7.4.1.2`),
`Chrome/119.0.0.0`, `$1.120.223.00`, DFARS `252.204-7012` as a phone, JS
property access (`cfg.local`) as a `.local` host, and the French "exploitable"
(usable) were all false positives and are now quiet. SSRF denylists and their
tests (`metadata.google.internal`, `10.0.0.1`) are `review`, not `block`.

## PayApps result (private-monorepo `c5a7d57`, 2026-11-26)

Paths: `apps/payapps apps/payapps-site packages docs/trust docs/legal`.
1,023 files, 35 binary. **Block: 0. Review: 55**, each read:

| rule | count | decision |
|---|---|---|
| email outside example domains | 27 | Made-up addresses in UI placeholders (`ap@builder.com`, 6, `supplier.com`, 1) and test fixtures (`harborbuilders.com`, `sierra.com`, `peakgc.com`). Not personal data, but they are real registrable domains: switch them to `*.example` in the move PR. |
| names private-monorepo | 24 | Package READMEs, `package.json` repository fields, BILLING.md, `plans.ts`, a trust-page test. Rewrite to the public paths in the move PR. |
| confidentiality marker | 4 | Terms and privacy text promising to treat customer content as confidential, and a "do not distribute" in a third-party licence summary (cad-features STEP.md). Keep. |

Read by hand, not by rule:

- **Binaries** (24 in `apps/payapps/test/fixtures`, 7 OCCT fixtures in
  `packages/cad-features`): the PDFs are generated (`Example Electric LLC`,
  `Acme Drywall Inc.`, `Riverside Clinic`), sources in `pdf-sources/`. The
  EXIF photos carry a GPS block written by `pdf-sources/exif-photo-pillow.py`
  (40°26'46" N, the stock example coordinate, maker `ExampleMaker`). Fine.
- **`docs/trust/OWNER-CONFIRM.md`** is an owner-confirmation checklist. The
  plan keeps those in `private-monorepo`: leave it out of the copy.
- **`docs/security/secrets-inventory.yaml`** (top-level `docs/`, not in the
  paths above) is blocked by the never-move rule, as planned.
- **`apps/grants`** was audited only to tune the rules, locally; its output is
  not recorded here. It stays private (client material).

So PayApps, payapps-site and packages/ are clear to copy once the two rewrites
above are made, under the all-rights-reserved notice (PR #19560). Re-run the
script on the commit actually copied: the private repo moves several times a
day.

## Other apps (counts only, same date)

| app | block | review | note |
|---|---|---|---|
| jobshop-quote | 0 | 52 | fixture emails |
| cmmc | 0 | 13 | 8 phone shapes to read (regulation tables or fixtures) |
| einvoice-preflight | 0 | 63 | fixture emails, 2 public IPs to read |
| seller-books | 0 | 2 | |
| admin | 0 | 1 | |
| wall-framing-takeoff | 0 | 3 | |

## Next

Step 4 for PayApps: copy `apps/payapps`, `apps/payapps-site` and the
`packages/` it uses into this tree in one PR with the audit output, CI ported
and the private copy removed. PR #19220 (opened 2026-11-26) tried all apps at
once at `cded6ea` under FSL; it predates the all-rights-reserved decision and
the private repo has moved on, so a fresh per-app copy is cleaner than
reviving it.
