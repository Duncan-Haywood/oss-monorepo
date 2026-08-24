# AI Engineering Academy

An AI-mentored, project-first engineering education platform. The goal:
help motivated learners become world-class engineers by building real
products, not by sitting through lectures and exams.

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the founding vision and
philosophy — the seed document every future contributor (human or AI)
should build toward.

## The Constitution

[docs/00-overview.md](docs/00-overview.md) is the entry point to the full
constitution: first-principles philosophy, product vision, learning science
and mastery model, AI mentor architecture, knowledge graph design,
curriculum progression, assessment philosophy, portfolio system, simulation
architecture, hardware integration, technical architecture, industry
partnerships, credentialing strategy, business model, go-to-market
strategy, competitive analysis, and a 10-year roadmap.

## Status

Early-stage / pre-product. Vision and constitution drafted; curriculum and
platform design not yet started. `site/` is a static build (`npm run build`)
that renders the constitution's markdown into a browsable HTML site
(`docs/00-overview.md` and friends) and assembles the `tools/` calculators
into it under `dist/tools/`.

Three learner-facing artifacts now exist, all free, zero-dependency,
client-side static pages (LICENSE, disclaimer, privacy line, local-first
usage counting, unit tested):

- [`tools/resistor-calculator/`](tools/resistor-calculator/) — a resistor
  color code decoder and Ohm's law solver (21 passing unit tests).
- [`tools/led-resistor-calculator/`](tools/led-resistor-calculator/) — an
  LED current-limiting resistor calculator that also snaps to the nearest
  standard (E24) resistor value and recommends a power rating (16 passing
  unit tests).
- [`tools/voltage-divider-calculator/`](tools/voltage-divider-calculator/) —
  a voltage divider calculator with a load-loading correction (the sag a
  real load causes that the textbook formula ignores) and a target-output
  design mode that snaps R2 to a buyable E24 value (14 passing unit tests).

All three are deliberately narrower than "the MVP": small, self-contained
tools for the Circuits corner of the planned EE track, not a curriculum.

`npm run build` in `site/` now assembles them into the site alongside the
constitution, so the venture has a single deployable artifact with one front
door for the calculators:

- **`dist/tools/`** — a hub page listing every calculator, generated from
  each tool's own `<title>` and `<meta name="description">`. There is no
  second copy of that text to keep in sync: add a tool directory and it
  appears on the hub automatically.
- **Sidebar link** — "Free Calculators" is a permanent entry in the site
  nav, so a reader who arrives at the constitution can reach the tools.
- **Cross-links** — the build injects a nav strip into each tool's built
  copy (back to the hub, across to its siblings). The tool *sources* are
  never modified, so each one still works opened straight off disk.
- **`robots.txt`, `sitemap.xml`, and JSON-LD `ItemList`** so the tools are
  crawlable and machine-enumerable. Set `SITE_BASE_URL` at build time to
  emit absolute URLs; unset, the sitemap is skipped rather than filled with
  a hostname that doesn't serve the site.

None is yet deployed to a live URL — publishing under the portfolio's name
is owner-gated per `portfolio/DIRECTION.md`; the built site is ready to
deploy once that gate opens.

## Next steps

- Review, argue with, and revise the constitution in `docs/` — it's a v1
  draft meant to be tightened, not treated as settled.
- Add more small, self-contained EE tools in `tools/` (e.g. a capacitor
  charge/discharge time calculator, an RC/RL filter cutoff-frequency
  calculator) as further seeds of the Circuits track, each shippable and
  testable independently of the full curriculum design.
- Prototype the fuller MVP scope: Electrical Engineering track (Circuits,
  Electronics, Embedded Systems) with 30–50 projects, AI tutoring, and
  portfolio generation.
