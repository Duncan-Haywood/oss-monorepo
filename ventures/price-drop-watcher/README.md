# Price Drop Watcher

Free price drop and back-in-stock alerts for any product page. You copy a small
watcher into your own GitHub repository; it checks your pages every six hours on
your own Actions minutes and pushes an alert to your phone (ntfy) or Discord.
There is no account and no shared server, so nobody else holds your watch list.

**Live tool and setup guide:** https://duncan-haywood.github.io/monorepo-projects/price-drop-watcher/

## Why use this

| You use today | Catch |
|---|---|
| CamelCamelCamel, Keepa, Honey | Fixed set of big retailers; affiliate links or subscriptions |
| Visualping, Distill | Any page, but the free tier is capped and your list lives on their service |
| Refreshing the page | Costs your evening |

This watches any shop you choose, runs in your repository, adds no tracking
links, and is free. It has no price-history charts and no shared price database.

## How it reads a page

In order: schema.org `Product`/`Offer` JSON-LD (what most shops publish for
Google), Open Graph / `product:price` meta tags, then `itemprop` microdata. If a
page has none, set `priceRegex` (one capture group around the number) and
optionally `stockRegex` for that item. Paste a page's source into the live tester
to see which it finds.

## Use

```bash
cp template/watch.example.json watch.json      # then edit
node watch.mjs --dry-run                       # print what it sees, send nothing
node watch.mjs                                 # check, alert, update state.json
```

Rules per item: `targetPrice` (alert when it first crosses at or below),
`minDropPercent`, `alertOnRise`, `priceRegex`, `stockRegex`. Alerts go to
`NTFY_TOPIC` (+ optional `NTFY_SERVER`), `DISCORD_WEBHOOK` or `WEBHOOK_URL` from
the environment. `template/price-watch.yml` is the scheduled workflow.

## Behaviour and limits

- Identifies itself, reads `robots.txt` first and skips pages it disallows, one
  request every two seconds, 50 items per run. For watching a handful of pages
  for yourself; check each shop's terms.
- Pages that render the price only with JavaScript need a `priceRegex` on data in
  the HTML, or are not supported. No login-gated pages.
- A shop can change its markup; the run then reports "could not check" rather
  than guessing.
- Not financial advice. Verify the price on the shop's own page before buying.

## Files

`extract.mjs` (engine, shared by page and watcher), `watch.mjs`, `index.html`,
`usage.mjs` (opt-out local counters), `template/`. Tests:
`node --test ventures/price-drop-watcher/*.test.mjs`.

MIT licensed. Free; support via GitHub Sponsors is optional.
