# Shipping Box Size Optimizer

Free, browser-only tool for online sellers who pack their own orders. List your
products (packed size, weight, orders per month) and the cartons you could buy.
It solves which 1 to 10 box sizes to stock so every order ships in its cheapest
fitting box, counting dimensional weight, the box itself and void fill, and
shows what each extra size saves a month, which box each product goes in, and
how far today's boxes are from the best set. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/shipping-box-size-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, fit check, billable weight and landed cost, custom size
  candidates, and the solver: exact enumeration of every K-size set when that
  is small enough, otherwise greedy plus multi-start one-swap (Teitz-Bart)
  local search on the p-median objective.
- `whatIf` in `calc.mjs` - type a carrier's new DIM divisor or postage and it re-solves, prices
  the boxes you would keep under the new rates, and says whether to change them.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-many-box-sizes-to-stock.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; arithmetic and optimization on figures you
type, not legal, tax, financial or shipping advice. It does not pack several
products into one box, price carrier surcharges or zones, or model box minimum
order quantities. Unverified against a real warehouse's invoices: tested on
hand-calculated examples and against exhaustive search.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

## Host your own copy

It is a static site: the server only hands out files and never sees a figure you type, so you can serve it from an
address you control.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
