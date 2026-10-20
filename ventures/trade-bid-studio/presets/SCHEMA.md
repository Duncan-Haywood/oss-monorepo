# Trade profile schema

One JSON file per trade, named `<specialist-slug-without--bid-calculator>.json`
(e.g. `asphalt-sealcoat.json` for `ventures/asphalt-sealcoat-bid-calculator`).
`node build-presets.mjs` folds them into `presets.mjs`.

A profile turns a specialist calculator into an editable takeoff for the
studio (`takeoff.mjs`), whose totals feed the studio's bid engine. **Every number must trace to the
specialist's own `calc.mjs` constants/presets or to a default `value=` in its
`index.html`.** Nothing is invented: where the specialist has no figure for a
field, omit it (the engine falls back to a neutral default) or use 0 and say
so in `source`.

```json
{
  "slug": "asphalt-sealcoat-bid-calculator",
  "name": "Asphalt sealcoating",
  "group": "Paving, concrete & masonry",
  "summary": "Driveways and lots priced from square feet, coats, crack fill and oil spots.",
  "fit": "good",
  "crewSize": 2,
  "setupHours": 0.5,
  "minOnSiteHours": 2,
  "hourlyWage": 22,
  "burdenRate": 18,
  "overheadRate": 15,
  "targetMargin": 30,
  "milesOneWay": 12,
  "tripFee": 0,
  "items": [
    {
      "label": "Seal driveway, 2 coats",
      "unit": "sq ft",
      "qty": 1200,
      "hoursPerUnit": 0.00222,
      "materialPerUnit": 0.1069,
      "source": "2 coats / 900 sq ft per crew-hour (METHOD_PRESETS.squeegee); sealer $5.50/gal (index.html) at 90 then 120 sq ft/gal (SURFACE_PRESETS.driveway)"
    }
  ],
  "specialistModels": "Pavement-condition coverage multipliers, squeegee vs spray, sand additive, striping by stall, and a printable proposal."
}
```

Fields:

- `slug` (required): the specialist venture directory name.
- `name` (required): the trade in plain words, sentence case.
- `group` (required): exactly one of
  `Cleaning & janitorial`, `Exterior & roofing`, `Paving, concrete & masonry`,
  `Landscaping & outdoor`, `Interior & finishes`,
  `Mechanical, electrical & plumbing`, `Specialty & remediation`,
  `Vehicles & mobile`, `Events & other services`.
- `summary` (required): one line, at most 120 characters.
- `fit` (required): `good` when the specialist's price really is line items
  of hours + materials; `partial` when it also leans on something line items
  can only approximate (named in `specialistModels`).
- `crewSize`: people on the crew. Labor cost = crew hours x crewSize x loaded
  wage. If the specialist multiplies hours by a single wage, use 1.
- `setupHours`, `minOnSiteHours`, `hourlyWage`, `burdenRate` (%),
  `overheadRate` (% of direct cost), `targetMargin` (% of price),
  `milesOneWay`, `tripFee`: the specialist's defaults, when it has them.
- `items` (required, 1-8): the work for the specialist's default example job.
  `hoursPerUnit` is **crew** hours per unit (elapsed time with the whole crew).
  `materialPerUnit` is dollars per unit. `unit` is a short noun (`sq ft`,
  `linear ft`, `room`, `fixture`, `each`, `job`, `hour`...). `source` says where
  each figure came from in the specialist's files.
- `specialistModels` (required): one sentence on what the specialist does that
  plain line items do not, so the suite can send people there for it.
