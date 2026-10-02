# Making this repository public (MIT)

Prepared 2026-10-02. **The repository is still private.** Changing visibility
is yours: Settings → General → Danger Zone → *Change repository visibility*.
Everything below is either already done in the tree or is a setting only the
owner can change.

## Already done in the tree

- **License.** [`LICENSE`](../LICENSE) (MIT, Copyright (c) 2026 Duncan
  Haywood) at the root covers the whole repository. Every directory under
  `ventures/` also carries its own MIT `LICENSE`, so a venture extracted with
  `git filter-repo` keeps its grant. The two research harness manifests that
  said `"license": "UNLICENSED"` now say `MIT`, and
  `ventures/einvoice-preflight/LICENSE` names its copyright holder. No vendored
  third-party source under a conflicting licence was found. Lockfiles list
  dependency licences; those packages are installed, not redistributed.
- **Secret scan, clean.** gitleaks 8.21.2 found no live credential in the
  working tree, in `main`'s history (6,889 commits scanned), or in the 8,110
  commits reachable only from the 1,122 other branches and 5,817
  `refs/pull/*` heads (closed PRs become public too). Every hit is one of:
  - deliberate fixtures: the fake AWS keys, JWT and private key in
    `ventures/terraform-plan-secret-exposure-check/*.test.mjs`, the dummy
    OpenSSH key in `gitops/tests/test_load_secrets.py`, the demo token in
    `ventures/jwt-security-check/index.html`, the placeholder Stripe/Resend
    values in `ventures/local-site-studio` tests, and the sequential
    `sk_live_51Nabcdefgh…`/`sk_test_51Mz987…` keys in `ventures/print-atelier`
    tests (also in agent worktree copies committed under `.claude/worktrees/`
    on a few old branches);
  - `localStorage` key names (`saveKey` in `ventures/3pl-quote-normalizer`);
  - `INDEXNOW_KEY` in `platform/pages/build.mjs`, which is public by design
    (IndexNow verifies ownership by fetching it from the site);
  - a JWT inside third-party registry data saved under `portfolio/research/`;
  - Next.js preview-mode keys in a `.next/` build directory committed once in
    early history. They are per-build random values with no deployment behind
    them.
- **Bots never merge a fork PR.** `platform/ci/agent_review/review.py`
  approves and auto-merges on mechanical checks (CI green, validators pass).
  That only stands in for judgment while every author has push access. Fork PRs
  are now skipped by the reviewers and refused by `merge_eligible`, like
  `ventures/*` merges.
- **Self-hosted runners refuse a public repository.** Both registration paths
  (`gitops/ci/runner-entrypoint.sh` for the cluster, `gitops/ci/host/register-and-run.sh`
  for a runner installed directly on a box) now ask the API for the repository
  and will only start if it confirms `"private": true`. If the check fails or
  can't be read, the runner doesn't start.

## Before you flip

1. **No self-hosted runner may be registered.** Settings → Actions → Runners
   should list none, and the `CI_RUNNER` repository variable should be unset.
   A `pull_request` workflow from a fork runs **the fork's own copy** of the
   workflow file, `runs-on:` included. So a stranger can request
   `self-hosted` by name, whatever `vars.CI_RUNNER` says, and run their code on
   the Hetzner box. GitHub's guidance is to use self-hosted runners only with
   private repositories. The guard above stops a runner from registering or
   restarting. It can't stop a host-mode runner that is already running, so
   stop that one by hand: `systemctl disable --now github-runner` on the box.
   You don't need the self-hosted runners anyway (see below).
2. **Decide on the personal email addresses.** Your personal Gmail address
   appears in 20 tracked files. These are deliberate uses, not leaks: the
   contact line on `quick-pick-survey`'s privacy and terms pages, payment
   instructions in `ventures/real-estate-agent-photo-app/process/`, Cloudflare
   Access allowlists for `ai-first-markets` and the photo app's docs site, and
   the User-Agent of `portfolio/research/publish-endpoint-reachability`. Two
   personal addresses are also author emails on about 80 commits. History
   keeps all of these, so editing the current tree doesn't make them private.
   Accept that, or rewrite history before the flip (`git filter-repo
   --mailmap` / `--replace-text`, then force-push every branch). A rewrite
   breaks every open PR and every session's clone.
3. **Everything here becomes readable,** not just code: `CLAUDE.md`,
   `portfolio/ledger/` (decisions, asks, revenue notes), `portfolio/research/`,
   `infra/` (the Hetzner IPs and the box layout), and every closed PR's
   discussion. Nothing in it is a credential (see the scan above). Whether
   the strategy notes should be public is your call.
4. **Agent apps.** On a public repository anyone can open issues and comment.
   Check that the Claude, Cursor and Kilo GitHub Apps only respond to
   collaborators, so a stranger's `@mention` can't spend your agent budget.
   No workflow in `.github/workflows/` triggers on `issues` or
   `issue_comment`. The only `pull_request_target` workflow,
   `branch-cleanup.yml`, never checks out PR code.

## Settings to turn on at the flip

- Settings → Actions → General → **Approval for running fork pull request
  workflows from contributors** → *Require approval for all external
  contributors*. Read the workflow diff before you approve one.
- Settings → Code security → **Secret scanning** and **Push protection** (free
  on public repositories), **Private vulnerability reporting** (the route
  [`SECURITY.md`](../SECURITY.md) points reporters to), and **Dependabot
  alerts**.

## What gets better the day it flips

- **Actions minutes stop being metered.** Standard GitHub-hosted runners are
  free for public repositories. That ends the `runner_id: 0` starvation that
  `CLAUDE.md`, `gitops/ci/README.md` and the decision queue spend pages on, and
  with it the reason the self-hosted runner stack and `CI_RUNNER` exist.
- **GitHub Pages from a public repository** is on the free plan
  (`portfolio/hosting/README.md` records the private-repo limit).
- **The clone tokens become unnecessary.** Argo CD and the `portfolio-site`
  fetch container can clone a public repository anonymously, so
  `ARGOCD_REPO_TOKEN` and the `portfolio-site-repo` seal stop being needed.
  Making that real takes a small follow-up: `gitops/prod/portfolio-site.yaml`
  still requires the Secret (`secretKeyRef` without `optional: true`).

After the flip, the sentences that say "this repository is private" go stale:
`CLAUDE.md`'s runner section, `gitops/ci/README.md`,
`infra/OWNER_CHECKLIST.md`, `portfolio/hosting/README.md` and the cost note in
`.github/workflows/claude-routine-trigger.yml`. They are true until then, so
they were left alone.

## Re-running the secret scan

```
curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz | tar xz gitleaks
git fetch --unshallow origin main
git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/pr/*'
./gitleaks dir --redact .                                       # working tree
./gitleaks git --redact --log-opts="origin/main" .              # main's history
./gitleaks git --redact --log-opts="--all --not origin/main" .  # branches and PR refs
```

Expect only the fixtures listed above. Anything else needs revoking first
and investigating second.
