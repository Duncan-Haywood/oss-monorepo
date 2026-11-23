# The site on Cloudflare

Since 2026-10-29 the public site is served by Cloudflare, at
https://marisstella.app/ since 2026-10-30 (first at
https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/; owner:
"we are moving from ghp to cloudflare"). The old GitHub Pages address
serves a redirect page for every URL (`../redirect-stubs.mjs`), and since
2026-10-31 the workers.dev address sends visitors to the domain too (owner:
"this should also redirect"). Static files there get a `_headers` rule that
`split.mjs` writes (`Refresh: 0; url=https://marisstella.app/<path>` and
`X-Robots-Tag: noindex`), because they never run code. Paths that do run
the router (`/research`, `/writing`, `/dev`) answer with a 301 (`router.mjs`).
A 301 on every path would need `run_worker_first = true`, which would meter
every file request against the free plan's 100,000 a day.

## Two Workers, because of the free plan's file limit

One Worker on the free plan may hold at most 20,000 static files. The site
had about 20,100 on the day it moved (14,818 without `research/`, `writing/`
and `dev/`). Paying $5 a month for Workers Paid raises the limit to 100,000.
Until someone decides to pay, the site is split in two:

| Worker | Serves | Config |
|---|---|---|
| `monorepo-projects-site` | everything except the directories below; has the public address | `wrangler.toml`, `router.mjs` |
| `monorepo-projects-site-shard` | `router.mjs`'s `SHARD_DIRS`: `research/`, `writing/`, `dev/`, `changepoint-detector/`, `hearth-and-horizon/`; no public address | `shard/wrangler.toml` |

Requests for static files are free and unmetered. Only requests under
`SHARD_DIRS` run `router.mjs`, which forwards them over a service binding.
Those runs count toward the free plan's 100,000 requests a day. Past that
limit, those pages fail until the next UTC day. Nothing is ever billed.

`split.mjs` moves `SHARD_DIRS` out of the build, then fails the deploy before
any upload if either half is over 20,000 files or holds a file over 25 MiB.
It warns at 90%. When that warning shows, add another top-level directory to
`SHARD_DIRS` and to `run_worker_first` in `wrangler.toml`; `split.test.mjs`
checks that the two lists agree.

**2026-11-20: both halves are nearly full.** The site Worker reached 20,071
files (the shard 17,399) and every deploy from commit e5b26c244 on failed at
`split.mjs` for about five hours. `changepoint-detector/` (835 files) and
`hearth-and-horizon/` (540) moved to the shard, which leaves roughly 18,700
in each, about 94 % of the limit. Together they hold about 37,500 of the
40,000 two free Workers allow, so moving directories only buys time. The
lasting fixes are Workers Paid ($5 a month, 100,000 files: an owner
decision) or a third Worker, which needs a deploy step in
`.github/workflows/portfolio-pages.yml` and so the owner's approval
(CODEOWNERS). Count a build with `find dist -type f | wc -l` per directory
to choose what to move; prefer low-traffic directories, since every request
under `SHARD_DIRS` counts toward the 100,000 a day.

**2026-11-23: share cards packed in the shard.** The shard had reached
19,635 files (the site Worker 19,183). About 8,500 of the shard's files were
`share-card.png`, one per directory page (`../share.mjs`), read only by
link-preview fetchers. `split.mjs` now packs them into 512 files under
`share-card-packs/` (`cardpack-build.mjs`), and `shard/worker.mjs` answers
each card URL from its pack (`cardpack.mjs`; a card's pack is a hash of its
path, so no index is needed). On the 2026-11-23 build the shard went from
19,453 files to 11,494 locally (without `dev/`, which CI adds later); URLs, `og:image` tags and the GitHub Pages
copy are unchanged. Card requests were already metered (they are under
`SHARD_DIRS`), so the request count does not change. The site Worker's own
~1,450 tool cards are not packed: that would need `run_worker_first` to
match `/*/share-card.png`, which no run has checked against Cloudflare yet
(`docs/reports/2026-11-23-share-card-packs.md`, "Next").

## Deploy

`.github/workflows/portfolio-pages.yml`, job `deploy-cloudflare`, on every
merge to `main`:

1. split the site;
2. `wrangler deploy` the shard, then the site Worker;
3. run `../verify-live.sh` against the public address;
4. announce the site to IndexNow.

The GitHub Pages redirect deploy waits for that job to succeed.

It uses the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets that
`platform/edge/` already uses. With them missing, the workflow keeps the
full site on GitHub Pages, as before.

## Checking it locally

```sh
node --test platform/pages/cloudflare/split.test.mjs
cd platform/pages/cloudflare && npx wrangler@4.145.0 deploy --dry-run
```

`wrangler dev -c wrangler.toml -c shard/wrangler.toml` serves the site Worker
correctly. It returns 500 for shard pages, though. In wrangler 4.145's
two-Worker dev mode, the shard reads its files from the first Worker's
directory: a page placed there was served instead. Run `wrangler dev` inside
`shard/` to check the shard alone.

## The custom domain: marisstella.app

Since 2026-10-30 the site Worker is attached to **https://marisstella.app/**
(the owner added the zone to this Cloudflare account and attached it in the
dashboard: Workers & Pages → `monorepo-projects-site` → Settings → Domains &
Routes → Custom domain). Cloudflare created the DNS record and certificate.
`wrangler.toml` has no `routes` key, so `wrangler deploy` leaves the
attachment alone and the deploy token needs no zone permissions. The workflow
builds for that origin (`CLOUDFLARE_BASE` in `portfolio-pages.yml`), so every
canonical link, sitemap and feed names it. The workers.dev address
forwards to it (above). `platform/edge/wrangler.toml`'s `ALLOWED_ORIGIN`
lists both.

To manage the domain from the repository instead, add
`routes = [{ pattern = "marisstella.app", custom_domain = true }]` to
`wrangler.toml`. The deploy token then needs Zone → Workers Routes → Edit on
that zone (Cloudflare's "Edit Cloudflare Workers" template); the attach API
itself lists Account → Workers Scripts → Edit.

## Email: support@, hello@ and accounts@marisstella.app

Mail to the domain is Cloudflare Email Routing (free), kept as code like the
rest of this directory: `email-routing.json` lists the addresses,
`email-routing.mjs` makes Cloudflare match it (dry run unless `APPLY=1`),
and `.github/workflows/cloudflare-email.yml` runs it on demand. Every address
is delivered to the edge Worker's agent-managed inbox
(`platform/edge/inbox.mjs`), not forwarded to anyone (owner, 2026-11-03:
"agent managed inbox not mine", "no forwarding"). The mail stays in the
Worker's D1 database and is never committed, because the repository is public.
`accounts@` is the sign-up address for the portfolio's platform accounts
(Bluesky, Mastodon, dev.to, npm, ...); the list of those accounts and their
setup steps is `portfolio/distribution/SETUP.md`.

Owner setup, once: give the deploy token the Email Routing permissions the
script's header lists (or add a second token), run the workflow with
"apply" ticked, and set the Worker's `INBOX_TOKEN` secret
(`platform/edge/README.md`, "Inbox"). There is no verification link: a
Worker destination needs none. Until then `marisstella.app` has no MX record
and mail to it bounces (checked 2026-10-31). Sending (`noreply@`) is not part of this: a product
that sends mail uses its own provider key (`ventures/local-site-studio`,
`EMAIL_FROM`).
