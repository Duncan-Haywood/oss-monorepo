# The site on Cloudflare

Since 2026-10-29 the public site is served by Cloudflare at
https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/ (owner:
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

## A custom domain

The domain must be in the Cloudflare account. The token needs Zone → DNS →
Edit and Zone → Workers Routes → Edit, scoped to that zone only. With those
in place:

1. add `routes = [{ pattern = "<domain>", custom_domain = true }]` to
   `wrangler.toml`;
2. set the repository variable `PAGES_BASE_URL` to `https://<domain>/`;
3. add the new origin to `platform/edge/wrangler.toml`'s `ALLOWED_ORIGIN`.

The next build then names that origin in every canonical link and sitemap.
