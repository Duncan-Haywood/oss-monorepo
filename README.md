# usage-data

Written daily by `.github/workflows/site-usage-pull.yml` on main. Holds only
generated, aggregate files; never merged as a branch, never edited by hand.
Read: `node platform/counter/usage-data.mjs show` (from a main checkout).
Google Search Console, per page and query: search-console.json.
Engagement reports, daily and weekly: reports/README.md.
Land on main: `node platform/counter/usage-data.mjs sync`, then a PR.
See portfolio/usage/README.md, "Where the daily pull lands".
