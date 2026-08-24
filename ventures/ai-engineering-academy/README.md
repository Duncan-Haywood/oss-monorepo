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
(`docs/00-overview.md` and friends).

Two learner-facing artifacts now exist, both free, zero-dependency,
client-side static pages (LICENSE, disclaimer, privacy line, local-first
usage counting, unit tested):

- [`tools/resistor-calculator/`](tools/resistor-calculator/) — a resistor
  color code decoder and Ohm's law solver (21 passing unit tests).
- [`tools/led-resistor-calculator/`](tools/led-resistor-calculator/) — an
  LED current-limiting resistor calculator that also snaps to the nearest
  standard (E24) resistor value and recommends a power rating (12 passing
  unit tests).

Both are deliberately narrower than "the MVP": small, self-contained tools
for the Circuits corner of the planned EE track, not a curriculum. Neither
is yet deployed to a live URL — publishing under the portfolio's name is
owner-gated per `portfolio/DIRECTION.md`; both are ready to deploy once that
gate opens.

## Next steps

- Review, argue with, and revise the constitution in `docs/` — it's a v1
  draft meant to be tightened, not treated as settled.
- Add more small, self-contained EE tools in `tools/` (e.g. a voltage
  divider calculator, a capacitor charge/discharge time calculator) as
  further seeds of the Circuits track, each shippable and testable
  independently of the full curriculum design.
- Prototype the fuller MVP scope: Electrical Engineering track (Circuits,
  Electronics, Embedded Systems) with 30–50 projects, AI tutoring, and
  portfolio generation.
