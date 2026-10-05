# Making this repository public (MIT)

Last checked 2026-10-05: **`Duncan-Haywood/fp-monorepo` is still private**
(GitHub API, `"visibility": "private"`). Changing visibility is yours:
Settings → General → Danger Zone → *Change repository visibility*. This file
lists what is already done in the tree and what only the owner can do.

A companion PR, #6143 (opened 2026-10-01, not merged), does the rest of the
go-public work: it folds `oss-research-monorepo` into `research/` and retires
the deleted Hetzner servers. **It is blocked on one owner decision:** this
repository disallows merge commits, and a merge commit is what keeps the
research repo's history. Either allow merge commits for that merge
(Settings → General → Pull Requests) or tell it to squash. The two PRs touch
different lines and merge cleanly in either order. Their review-bot gate is
byte-identical (below).

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
- **No personal email address in the tree.** The owner's Gmail address was
  in 20 files. It's gone, with no `ventures/` file left naming it:
  - `ai-first-markets` reads its allowlist from an `ALLOWED_EMAIL` secret and
    lets nobody in without it. Set it with `npx wrangler secret put
    ALLOWED_EMAIL` before the next deploy; `scripts/deploy-cloudflare.sh` now
    requires it.
  - `quick-pick-survey`'s privacy and terms pages take
    `NEXT_PUBLIC_CONTACT_EMAIL` from Vercel. Without it they point at the
    issue tracker.
  - `real-estate-agent-photo-app` builds booking and payment messages from
    `LISTING_LENS_CONTACT_EMAIL`. Without it, they carry an undeliverable
    `.invalid` placeholder.
  - Templates, docs and log entries are redacted.
- **Pages URLs fixed.** See the Pages section below.
- **Open issues checked.** The three open issues (#139, #1925, #1969) hold no
  credential-shaped string, email address or IP address. Closed issues and the
  6,000+ PR threads were not read one by one.
- **The workflows pass the repo's own Actions checkers.** These ventures' CLIs
  were run over all 796 workflow files: `actions-injection-check`,
  `-permissions-check`, `-self-hosted-exposure-check`,
  `-artifact-poisoning-check`, `-cache-poisoning-check`,
  `-secrets-inherit-check` and `-secret-leak-check`. Their one finding was a
  repository-name interpolation in `pages.yml`. The repo name is
  owner-controlled, so it wasn't exploitable, but it now goes through `env:`.
  The one `pull_request_target` workflow (`branch-cleanup.yml`) never checks
  out PR code, and no workflow triggers on `issues` or `issue_comment`.
- **Bots never review or merge an outsider's PR.** The review bots in
  `platform/ci/agent_review/` approve and auto-merge on mechanical checks (CI
  green, validators pass). That only stands in for judgment while every author
  has push access. `untrusted_reason` in `review.py` now refuses PRs from forks
  and from authors who aren't the owner, a member or a collaborator.
- **Self-hosted runners refuse a public repository.** Both registration paths
  (`gitops/ci/runner-entrypoint.sh` for the cluster,
  `gitops/ci/host/register-and-run.sh` for a box) ask the API for the
  repository. They start only on a confirmed `"private": true`. #6143 also
  routes fork PRs to `ubuntu-latest` in every `runs-on:`. That covers a fork
  that leaves its workflow files alone, but a fork PR runs **its own copy** of
  the workflow file and can name `self-hosted` directly. So the runner-side
  check and an empty runner list are what actually protect a runner.

## Before you flip

1. **Delete or repoint the `marisstella.dev` DNS records. Do this first, even
   if the flip waits.** #6143 records that the Hetzner servers were deleted on
   2026-10-01. On 2026-10-05, `marisstella.dev`, `www.marisstella.dev` and
   `tools.marisstella.dev` still resolved to `89.167.29.39`. Once Hetzner hands that IP to another customer, they can
   serve whatever they like under your domain. That's a takeover risk whether
   or not the repo is public.
2. **No self-hosted runner may be registered.** Settings → Actions → Runners
   should be empty: remove any offline entries left by the deleted boxes.
   Keep the `CI_RUNNER` variable unset.
3. **Set the three contact variables** named above (`ALLOWED_EMAIL`,
   `NEXT_PUBLIC_CONTACT_EMAIL`, `LISTING_LENS_CONTACT_EMAIL`) wherever those
   apps deploy. Only the first one gates anything; without the other two the
   pages degrade rather than break.
4. **Choose how the email addresses in old commits are handled.** See
   "Personal email in old commits" below. The current tree is clean;
   history isn't.
5. **Everything here becomes readable,** not just code: `CLAUDE.md`,
   `prompt.md`, `portfolio/ledger/` (decisions, asks, revenue notes),
   `portfolio/research/`, `infra/`, the issue tracker and every closed PR's
   discussion. Nothing in it is a credential (see the scan above). Whether the
   strategy notes should be public is your call.
6. **Agent apps.** On a public repository anyone can open issues and comment.
   Check that the Claude, Cursor and Kilo GitHub Apps only respond to
   collaborators, so a stranger's `@mention` can't spend your agent budget.

## Settings to turn on at the flip

- Settings → Actions → General → **Approval for running fork pull request
  workflows from contributors** → *Require approval for all external
  contributors*. Read the workflow diff before you approve one.
- Settings → Code security → **Secret scanning** and **Push protection** (free
  on public repositories), **Private vulnerability reporting** (the route
  [`SECURITY.md`](../SECURITY.md) points reporters to), and **Dependabot
  alerts**.
- Settings → General → Features: **Wikis** and **Projects** are on but
  unused by anything in the tree. Turn the wiki off, or tick *Restrict editing
  to collaborators only*.

## What gets better the day it flips

- **Actions minutes stop being metered.** Standard GitHub-hosted runners are
  free for public repositories. That ends the `runner_id: 0` starvation that
  `CLAUDE.md`, `gitops/ci/README.md` and the decision queue spend pages on, and
  with it the reason the self-hosted runner stack and `CI_RUNNER` exist.
- **GitHub Pages from a public repository** is on the free plan
  (`portfolio/hosting/README.md` records the private-repo limit).

After the flip, the sentences that say "this repository is private" go stale:
`CLAUDE.md`'s runner section, `gitops/ci/README.md`,
`infra/OWNER_CHECKLIST.md`, `portfolio/hosting/README.md` and the cost note in
`.github/workflows/claude-routine-trigger.yml`. They are true until then, so
they were left alone.

## The Pages URL (fixed in the tree)

The repository was renamed from `monorepo-projects` to `fp-monorepo`, and
GitHub doesn't redirect a renamed repository's project site. Measured
2026-10-05: `duncan-haywood.github.io/monorepo-projects/` answers 404, and
`duncan-haywood.github.io/fp-monorepo/` answers 200. `build.mjs`'s
`DEFAULT_BASE_URL` and every canonical tag, sitemap, `live_url` and repo link
now name `/fp-monorepo/`. `FORMER_BASE_URLS` rewrites the old path at build
time, so a branch opened before the move still publishes correct URLs. **After
this merges, republish** (`CONFIRM=publish-pages-branch PUSH=1
./platform/pages/publish-branch.sh`). Until then the live `gh-pages` branch
still advertises the 404 path.

## Personal email in old commits

The current tree is clean. History isn't. On `main`, two personal Gmail
addresses are author or committer on 84 commits, and the address that
was in the 20 files is in their old versions. A rewritten copy of `main` was
prepared and verified with `git filter-repo`. It maps those addresses to
`49566815+Duncan-Haywood@users.noreply.github.com` (already the address on
5,190 commits) and redacts them from file contents and messages. **It has not
been pushed anywhere.** The constraint is that **rewriting this repository in
place can't hide the old commits.** GitHub keeps a read-only
`refs/pull/<n>/head` for each of its ~5,800 PRs, those keep every old commit
fetchable, and only GitHub Support can purge them. So the honest choices are:

- **Publish a fresh repository from the rewritten history.** Rename this one
  (for example to `fp-monorepo-private`) and keep it private with its PRs and
  issues. Create a new public `fp-monorepo` and push the rewritten `main` to
  it. The Pages URL stays `/fp-monorepo/`. Secrets, variables, Pages settings
  and app installs need setting up again on the new repo, and in-flight agent
  sessions must re-clone. A branch built on the old history would carry old
  commits back in.
- **Flip this repository and accept that old commits show the addresses.**
  Nothing needs migrating. The addresses stay findable by anyone reading
  history.
- **Rewrite in place, then ask GitHub Support to purge the PR refs and cached
  views.** That breaks every open PR and clone, and Support has to handle
  ~5,800 refs.

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
