# Retail Pilot Intel

Privacy-first retail analytics for small-format pilot stores (initial target: ~10 m² leather boutique, Italy).

## What this is

An edge-first system that combines **door/aisle computer vision** (aggregate footfall and engagement, no customer identity) with **point-of-sale (POS) transaction data** to power business intelligence, experimentation, and profit-oriented recommendations.

## Documentation

Open the HTML docs in a browser (start at [`docs/index.html`](docs/index.html)):

| Doc | Topic |
|-----|--------|
| [Vision](docs/vision.html) | Product goals and pilot context |
| [Architecture](docs/architecture.html) | On-device pipeline, POS bridge, analytics |
| [Metrics](docs/metrics.html) | Funnel definitions (look → touch → buy) |
| [Privacy & GDPR](docs/privacy-gdpr.html) | Italy/EU constraints and technical controls |
| [Roadmap](docs/roadmap.html) | Phased delivery |

## Repository layout

```
docs/           # Product & compliance documentation (HTML)
edge/           # On-device CV & aggregation (planned)
pos/            # POS connector & normalized sales events
analytics/      # Aggregates, experiments, recommendations
dashboard/      # Operator UI (static prototype)
```

## Phase 1 (current focus)

- Indoor door camera → **aggregate** counts (entries, bounces, dwell bands)
- POS ingest → line items, baskets, timestamps (no payment PAN)
- Join aggregates with sales for **looked-at vs sold** style insights

## Status

Early scaffolding — specifications and structure; implementation in `edge/`, `pos/`, and `analytics/` to follow.

## License

Private repository — all rights reserved unless otherwise agreed with store operators.
