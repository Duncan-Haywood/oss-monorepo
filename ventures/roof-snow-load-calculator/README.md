# Roof Snow Load Calculator

A free browser tool for contractors, framers, solar and HVAC installers and students: **type the ground snow
load and describe the roof, and get every ASCE 7-16 Chapter 7 roof snow load: flat and sloped roof loads, the
minimum load, rain-on-snow, the unbalanced gable load, the drift on a lower roof at a step (leeward and
windward), the drift at a parapet or rooftop unit, sliding snow and the eave ice-dam load, each tied to its
section, with the step drift drawn to scale.** Nothing is uploaded.

**Live tool:** https://marisstella.app/roof-snow-load-calculator/ ·
**Guide:** [snow drift at a roof step, worked through](snow-drift-at-a-roof-step.html)

After using this, you can **see the load on the framing against a taller wall, not only the open-roof load**:
in the built-in example (a 6/12 two-storey house, pg 40 psf, stepping down 9 ft onto a 22 ft wing) the open
roof carries 28.0 psf but the wing carries 65.9 psf at the wall, tapering over 7.9 ft, and the house's leeward
slope takes 40 psf unbalanced.

## Model (`calc.mjs`)

ASCE/SEI 7-16 Chapter 7 (adopted by IBC 2018 and 2021):

- pf = 0.7 Ce Ct Is pg (Eq. 7.3-1); Ce Table 7.3-1, Ct Table 7.3-2, Is Table 1.5-2.
- ps = Cs pf, Cs from the three panels of Fig. 7.4-1 by Ct and surface; the slippery curve on a warm roof
  only with the Section 7.4.1 insulation.
- Minimum load pm (7.3.4, slopes under 15°), rain-on-snow 5 psf (7.10, pg ≤ 20, slope < W/50).
- Unbalanced hip/gable (7.6.1, Fig. 7.6-2) between 1/2 and 7 on 12: Is pg leeward for W ≤ 20 ft with
  prismatic members, else 0.3 ps windward and ps plus hd γ/√S over 8√S hd/3.
- Drift height hd = 0.43 ∛lu ∜(pg+10) − 1.5 (Fig. 7.6-1, lu ≥ 20 ft); γ = 0.13 pg + 14 ≤ 30 (Eq. 7.7-1).
- Step (7.7.1): leeward from the upper roof length, windward 0.75 hd from the lower; hc/hb < 0.2 needs
  none; hd > hc gives hd = hc and w = 4hd²/hc ≤ 8hc; truncated at the far edge.
- Parapets and rooftop units (7.8): 0.75 hd from the upwind length; none for a side under 15 ft.
- Sliding (7.9): 0.4 pf W per ft over 15 ft, reduced for a narrower lower roof. Ice dams (7.4.5): 2pf.

Not modelled: looking up pg, ASCE 7-22 (IBC 2024), partial loads (7.5), curved/sawtooth/dome roofs,
separated buildings (7.7.2), ponding, a lower roof with its own slope or Ct (taken as low slope, same
factors), load combinations.

**Spec sources:** ASCE/SEI 7-16, *Minimum Design Loads and Associated Criteria for Buildings and Other
Structures*, Chapter 7 and Table 1.5-2; the professional who would sign it off is a licensed structural
engineer. **Unverified:** every equation is checked against a hand calculation written out in
`calc.test.mjs`, not against a commercial structural program or a sealed calculation.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call roof-snow-load-calculator analyze --input '{"pg":"50","pitch":"4","W":"24","stepHeight":""}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, legal or code-compliance advice, and it does not replace a licensed
engineer, the truss designer or your building official. **You are responsible for reviewing and verifying
its output before relying on it.** To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

Independent of ASCE, the ICC, standards bodies, manufacturers and software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`loads_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free to use and source available (FSL-1.1-MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
