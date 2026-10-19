# Weekly Production Mix Optimizer

Free, browser-only tool for bakeries, workshops and small makers. List what you
make (price, unit cost, minimum, maximum, batch size) and how much of each
limited resource (oven hours, labour, machine time) a unit uses. It finds the
most profitable weekly mix in whole batches with optional overtime, shows what
one more unit of each bottleneck is worth and for how long, charges each
product for the production it crowds out, and compares the plan with two
rule-of-thumb plans. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/production-mix-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, a two-phase simplex (Bland's rule), branch and bound on
  whole batches, shadow prices and their range by re-solving, opportunity cost
  per unit, and the greedy comparison plans.
- `usage.mjs` - local-only feature counters with an opt-out.
- `why-your-best-margin-product-may-not-be-your-best-product.html` - guide with
  a worked example that the test suite recomputes.

## Host your own copy

Your products, prices and costs are business detail, so you can serve the page from an address you control. It is a
static site: the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal, tax
or financial advice. Usage and cost are assumed constant per unit; setup times,
shelf life and sequencing are not modelled. Example data is invented.
Unverified against a real business: tested on hand-solved problems,
brute-force comparison and duality checks.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
