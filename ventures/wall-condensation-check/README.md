# Wall Condensation Check

A free browser tool for builders, designers, energy raters and owner-builders: **list a wall's layers inside
to outside with their R-values and perm ratings, give twelve months of indoor and outdoor conditions, and see
where water vapour condenses, how much builds up over the winter, whether it dries out by summer, and the
indoor humidity at which the wall first gets wet.** Nothing is uploaded.

**Live tool:** https://marisstella.app/wall-condensation-check/ ·
**Guide:** [will my wall condense? A worked example](will-my-wall-condense.html)

After using this, you can **compare wall assemblies for winter condensation risk before you build one**: in
the built-in example (2x6, R-21 batt, painted drywall, 7/16 in OSB, an invented cold-climate year) the OSB face
collects 744 g/m² by March and dries by June; 1 in of exterior XPS cuts the peak to 316 g/m², 2 in to 61 g/m²,
and polyethylene on the warm side removes it.

## Model (`calc.mjs`)

- Steady state, month by month, in the manner of ISO 13788's interstitial method (Glaser).
- Temperature falls linearly in thermal resistance, with Rsi 0.13 and Rse 0.04 m²K/W. Saturation pressure from
  the ISO 13788 formulas, over water at or above 0 C and over ice below.
- Vapour pressure falls linearly in vapour resistance (1 / permeance). Where it would exceed saturation, the
  profile is the taut string from indoor to outdoor vapour pressure under the saturation curve, found by gift
  wrapping over the interfaces; each touching interface condenses at flux in minus flux out.
- Condensed water is carried forward. A wet interface is held at saturation, so in warm months it dries (the
  rate goes negative) until it is empty. The year starts in the first month that condenses after a dry month,
  and runs twice, so a wall that does not dry shows a larger total in the second year.
- Safe indoor RH: bisection on a constant indoor RH for the highest value with no condensation anywhere.
- Inside-surface RH with Rsi 0.25 against the 80% mould threshold ISO 13788 uses.

Not modelled: air leakage, rain, wet cladding and solar-driven inward vapour, built-in moisture, moisture
storage and sorption, liquid transport, permeance that changes with humidity, condensation inside a layer
rather than at an interface. The layer library holds typical rounded values, not any product's data.
**Unverified:** checked by a hand calculation (in `calc.test.mjs`) and unit tests only, not against WUFI, a
field measurement or the standard's own worked examples. The research version of the same physics is
[`research/house-dewpoint`](../../research/house-dewpoint/).

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call wall-condensation-check analyze --input '{"layers":"gypsum, 0.45, 50\npoly, 0, 0.06\nbatt, 21, 20\nOSB, 0.62, 1.5"}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, architectural, legal or code-compliance advice, and it does not replace a
qualified professional or a hygrothermal analysis. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of building-material manufacturers, standards bodies and software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`wall_checked`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
