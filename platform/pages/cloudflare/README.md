# The site on Cloudflare

Since 2026-10-29 the public site is served by Cloudflare, at
https://marisstella.app/ since 2026-10-30 (first at
https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/, which still
serves the same files; owner:
"we are moving from ghp to cloudflare"). The old GitHub Pages address
serves a redirect page for every URL (`../redirect-stubs.mjs`).

## Two Workers, because of the free plan's file limit

One Worker on the free plan may hold at most 20,000 static files. The site
had about 20,100 on the day it moved (14,818 without `research/`, `writing/`
and `dev/`). Paying $5 a month for Workers Paid raises the limit to 100,000.
Until someone decides to pay, the site is split in two:

| Worker | Serves | Config |
|---|---|---|
| `monorepo-projects-site` | everything except the directories below; has the public address | `wrangler.toml`, `router.mjs` |
| `monorepo-projects-site-shard` | `router.mjs`'s `SHARD_DIRS`: `research/`, `writing/`, `dev/`; no public address | `shard/wrangler.toml` |

Requests for static files are free and unmetered. Only requests under
`SHARD_DIRS` run `router.mjs`, which forwards them over a service binding.
Those runs count toward the free plan's 100,000 requests a day. Past that
limit, those pages fail until the next UTC day. Nothing is ever billed.

`split.mjs` moves `SHARD_DIRS` out of the build, then fails the deploy before
any upload if either half is over 20,000 files or holds a file over 25 MiB.
It warns at 90%. When that warning shows, add another top-level directory to
`SHARD_DIRS` and to `run_worker_first` in `wrangler.toml`; `split.test.mjs`
checks that the two lists agree.

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
canonical link, sitemap and feed names it. The workers.dev address keeps
serving the same files. `platform/edge/wrangler.toml`'s `ALLOWED_ORIGIN`
lists both.

To manage the domain from the repository instead, add
`routes = [{ pattern = "marisstella.app", custom_domain = true }]` to
`wrangler.toml`. The deploy token then needs Zone → Workers Routes → Edit on
that zone (Cloudflare's "Edit Cloudflare Workers" template); the attach API
itself lists Account → Workers Scripts → Edit.

## Email: support@ and hello@marisstella.app

Mail to the domain is Cloudflare Email Routing (free), kept as code like the
rest of this directory: `email-routing.json` lists the addresses,
`email-routing.mjs` makes Cloudflare match it (dry run unless `APPLY=1`),
and `.github/workflows/cloudflare-email.yml` runs it on demand. Every address
forwards to one inbox held in the `EMAIL_FORWARD_TO` secret, so the
repository names it but never contains it.

Owner setup, once: add the `EMAIL_FORWARD_TO` secret to the `cloudflare`
environment, give the deploy token the Email Routing permissions the
script's header lists (or add a second token), run the workflow with
"apply" ticked, and click the verification link Cloudflare sends that inbox.
Until then `marisstella.app` has no MX record and mail to it bounces
(checked 2026-10-31). Sending (`noreply@`) is not part of this: a product
that sends mail uses its own provider key (`ventures/local-site-studio`,
`EMAIL_FROM`).
