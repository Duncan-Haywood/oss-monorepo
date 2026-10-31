# Cloudflare analytics into the repo (2026-10-31)

What a later session needs to know about `platform/counter/pull-cloudflare.mjs`.

- **Runs** daily in `.github/workflows/site-usage-pull.yml`, after the beacon,
  feedback and GitHub-traffic pulls, and commits
  `portfolio/usage/cloudflare-analytics.json`.
- **Token.** It tries `secrets.CLOUDFLARE_ANALYTICS_TOKEN` first, then the
  deploy token. The deploy token was made for `wrangler deploy` and probably
  cannot read analytics. The owner was asked on 2026-10-31 to create a token
  with Account → Account Analytics: Read, Zone → Analytics: Read and
  Zone → Zone: Read (on `marisstella.app`), saved as
  `CLOUDFLARE_ANALYTICS_TOKEN`. Setting `vars.CLOUDFLARE_ZONE_ID` removes the
  need for Zone: Read.
- **Not verified live.** No session holds a Cloudflare token, so the GraphQL
  queries were written from Cloudflare's documented schema and checked only
  by unit tests on recorded shapes. The first run's `last_pull.errors` will
  name any dataset or field the plan or token refuses. Read it and fix the
  query; don't assume the file is complete. `httpRequestsAdaptiveGroups` on a
  free zone is the likeliest to refuse a dimension (`userAgent`,
  `clientRequestPath`). Since 2026-10-02 Cloudflare keeps 31 days of adaptive
  data on every plan.
- **Privacy.** Browser strings are reduced to a class (`botClass` in
  `core.mjs`, plus `browser`, `no-ua`, `probe`) and dropped. No IPs are
  written, only the `unique_ips` count. Pages are listed only for 200/304
  answers. Keep it that way; the repository is public.
- **What the owner's dashboard showed** (pasted into the session, all
  domains, the period up to 2026-10-31): 31.96k requests, 922 visits,
  415.24 MB; US 30.27k, CA 668, QA 559, CH 558, SE 553, RU 368; content type
  "Empty" 27.53k, html 2.47k; 4xx 2.05k (6.42%), 5xx 0; cached requests
  5.99%. The top named clients were YandexBot and curl. The beacon counted
  11 browser page loads and 4,409 headless-browser beacons on 2026-10-30. The
  headless client is not identified yet. Nothing in this repo's workflows
  renders the live site in a browser (`verify-live.sh` uses curl), so it is
  probably an outside crawler.
- **Cache rate is low (6%).** Static assets served from Workers Static
  Assets may be reported as uncached. Check before "fixing" it.
