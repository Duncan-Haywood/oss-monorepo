# Psychrometric Calculator

A free browser tool for HVAC technicians, mechanical engineers, energy auditors and students: **fix a point of
moist air by any two of dry bulb, wet bulb, dew point, relative humidity, humidity ratio or enthalpy, at any
altitude, and get every other property; then mix two airstreams, read a cooling coil's load, sensible heat
ratio, apparatus dew point and bypass factor, heat the air, or send it through an evaporative cooler, all
plotted on a psychrometric chart drawn for that pressure.** Nothing is uploaded.

**Live tool:** https://marisstella.app/psychrometric-calculator/ ·
**Guide:** [reading a cooling coil on the psychrometric chart](reading-a-cooling-coil.html)

After using this, you can **turn two thermometer readings across a coil into its load, SHR, ADP and bypass
factor**: in the built-in example (80/67 °F entering, 55/54 leaving, 1,200 cfm at sea level) the coil removes
46,178 Btu/h (3.85 tons) at an SHR of 0.69, with an ADP of 52.5 °F and a bypass factor of 0.09. The same
readings at 5,280 ft mean 99.9 gr/lb entering instead of 78.2 and an SHR of 0.61.

## Model (`calc.mjs`)

- ASHRAE Handbook, Fundamentals, Chapter 1: Hyland-Wexler saturation pressure over ice (below 0 °C) and water;
  W = 0.621945 pw / (p − pw); h = 1.006 t + W (2501 + 1.86 t); v = 0.287042 (t + 273.15)(1 + 1.607858 W) / p;
  thermodynamic wet bulb from the adiabatic-saturation balance (the ice form below 0 °C); standard atmosphere
  for pressure from altitude. IP enthalpy on the IP datum, h = 0.240 t + W (1061 + 0.444 t).
- Any two properties: with the dry bulb, the other gives W directly; without it, a scan from −60 to 100 °C
  with bisection finds the dry bulb where both match. Humidity ratio with dew point, and enthalpy with wet
  bulb, are refused as degenerate.
- Processes: mixing by dry-air mass (flows converted at each stream's own specific volume) with fog
  detection; coil load = m Δh, latent = m ΔW × 2501 kJ/kg, ADP where the coil line extended meets
  saturation, bypass factor in dry bulb; the ADP mode mixes saturated ADP air with bypassed air by mass;
  sensible heating at constant W; evaporative cooling at constant wet bulb with an effectiveness.
- `chartSvg()` draws the chart (saturation, 10 to 90% RH, wet-bulb lines) for the actual pressure.

Not modelled: fan and duct heat, condensate enthalpy, coil performance at other airflows, psychrometer
errors, states beyond saturation (fog is flagged and shown at saturation).
**Unverified:** checked against published saturation pressures (IAPWS, water and ice), the ASHRAE
standard-atmosphere table, hand calculations and round trips over every property pair in `calc.test.mjs`,
not against a commercial psychrometric program.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call psychrometric-calculator analyze --input '{"process":"none","k1":"t","v1":"75","k2":"rh","v2":"50"}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, legal or code-compliance advice, and it does not replace a qualified
professional or the equipment maker's data. **You are responsible for reviewing and verifying its
output before relying on it.** To the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

Independent of equipment manufacturers, standards bodies and software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`point_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
