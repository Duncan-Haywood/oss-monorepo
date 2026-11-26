# Provenance

Copied from `Duncan-Haywood/private-monorepo` at commit
`f67ced85` ("grants: run on the AWS SaaS starter ...", #42) on 2026-11-26,
as a tree copy without that repository's git history (owner, 2026-11-26:
move the paid apps into the public repository so GitHub Actions can run
them and they deploy on merge).

- **Licence:** our own code here is under this repository's root licence,
  FSL-1.1-MIT (`../../LICENSE`). The private repository's "all rights
  reserved" notice was not copied. Third-party code and fixtures keep their
  own notices (for example `packages/cad-features/test/fixtures/public/`
  and the nfelib corpus under `apps/einvoice-preflight/eval/nfe-corpus/`,
  which was already public in `ventures/einvoice-preflight/`).
- **Scanned before publishing:** gitleaks v8.30.1 with
  `platform/security/gitleaks.toml` over the whole tree: 22 hits, all test
  fixtures or documented placeholders (Slack's sample signing secret,
  `T00000000/B00000000/XXXX` webhook URLs, `test-secret-...` values, a token
  alphabet constant). No key files, no `.env`/`.dev.vars`, no personal email
  addresses beyond `example`/`test` fixtures.
- **CI:** the private repository's workflows are kept, inert, under
  `ci-from-private/workflows/` as the source for porting into
  `.github/workflows/` (`priv-*.yml`, `platform/ci/ci_policy_check.py`,
  secrets read from AWS Secrets Manager through the GitHub OIDC role).
- **Not yet carried over:** private PRs merged after `f67ced85` (re-sync by
  path before cutting over) and open PRs there (for example #230, the owner
  console).
