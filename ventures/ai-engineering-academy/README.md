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

The first learner-facing artifact now exists:
[`tools/resistor-calculator/`](tools/resistor-calculator/) — a free,
zero-dependency, client-side resistor color code decoder and Ohm's law
solver, shipped as a standalone static page (LICENSE, disclaimer, privacy
line, local-first usage counting, 19 passing unit tests). It is deliberately
narrower than "the MVP": one useful, self-contained tool for the Circuits
corner of the planned EE track, not a curriculum. Not yet deployed to a live
URL — publishing under the portfolio's name is owner-gated per
`portfolio/DIRECTION.md`; the artifact is ready to deploy once that gate
opens.

## Next steps

- Review, argue with, and revise the constitution in `docs/` — it's a v1
  draft meant to be tightened, not treated as settled.
- Add more small, self-contained EE tools in `tools/` (e.g. voltage divider,
  LED series-resistor calculator) as further seeds of the Circuits track,
  each shippable and testable independently of the full curriculum design.
- Prototype the fuller MVP scope: Electrical Engineering track (Circuits,
  Electronics, Embedded Systems) with 30–50 projects, AI tutoring, and
  portfolio generation.
