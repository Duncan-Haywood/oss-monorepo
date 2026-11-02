# usage-data

Written daily by `.github/workflows/site-usage-pull.yml` on main. Holds only
generated, aggregate files; never merged as a branch, never edited by hand.
Read: `node platform/counter/usage-data.mjs show` (from a main checkout).
Land on main: `node platform/counter/usage-data.mjs sync`, then a PR.
See portfolio/usage/README.md, "Where the daily pull lands".
