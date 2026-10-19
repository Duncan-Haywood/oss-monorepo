# S-Corp Shareholder Basis Tracker

Free, browser-only S corporation basis calculator. Type each year's K-1 figures
(contributions, loans, income, distributions, nondeductible expenses, losses) and it
carries **stock basis**, **debt basis** and **suspended losses** forward in the order
Form 7203 uses, flags **distributions that exceed basis**, restores debt basis
before stock basis after a loss year, and shows how much added basis would unlock a
suspended loss. Exports a CSV and a printable worksheet. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/s-corp-basis-tracker/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - `step` (one year), `run` (roll forward), tolerant `parseYears` /
  `parseMoney`, `csv`, `packetHtml`.
- `parseBatch` / `runBatch` / `batchSummary` / `batchCsv` / `batchPacketHtml` - the
  preparer view: paste many shareholders at once (a `shareholder` column, plus an
  `opening` row for starting figures), get one summary with the shareholders needing
  attention first, a combined CSV and one printable file with a worksheet each.
- `form-7203-basis-order.html` - the order basis is adjusted in, with a three-year
  worked example the test suite recomputes.
- `s-corp-distributions-over-basis.html` - when a distribution becomes taxable, three
  cases recomputed by the test suite.
- `usage.mjs` - local-only feature counters with an opt-out.

The tests include a 4,000-year random check that basis is conserved on every step
and never goes negative.

## Host your own copy

Basis figures are financial detail, so you can serve the page from an address you control. It is a static site: the
server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.

## What you use today, and what this does differently

- **A spreadsheet:** free, but the ordering (income, then distributions, then
  nondeductible expenses, then losses; debt basis restored before stock) is yours to
  get right, and nothing flags suspended losses.
- **Tax-software basis modules:** complete, but bundled with paid preparer software.
- **What this adds:** the roll-forward in Form 7203 order, suspended-loss and
  excess-distribution flags, and a worksheet to hand to a preparer, with no signup
  and no upload.

**No warranty.** Free and as-is; an organising aid, not tax or legal advice and not a
filed form. At-risk and passive-activity limits, the excess business loss limit, QBI,
AAA and earnings and profits from C corporation years, stock sales and state rules
are not modelled. Check every figure against your K-1 and the Form 7203 instructions.
MIT licensed.
