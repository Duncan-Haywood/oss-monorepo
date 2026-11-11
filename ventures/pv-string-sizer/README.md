# PV String Sizer

A free browser tool for solar installers, designers and DIY builders: **enter the module and inverter datasheet
values and two site temperatures, and see how many modules can go in one string, how many strings each MPPT
input takes, and every layout that fits your module count.** Nothing is uploaded.

**Live tool:** https://marisstella.app/pv-string-sizer/ ·
**Guide:** [how many solar panels per string](how-many-solar-panels-per-string.html)

After using this, you can **size a string from the coldest morning and the hottest afternoon instead of
from the datasheet's 25 C values**: in the built-in example, 600 V / Voc says 12 modules, and at -20 C only 10 fit.

## Model

- Module voltage at cell temperature T = V_stc x (1 + beta x (T - 25)) for a coefficient in % per C, or
  V_stc + beta_mV / 1000 x (T - 25) for one in mV per C per module.
- Cold case: cell = coldest air temperature. Hot case: cell = hot-day air + (NOCT - 20) x 1000/800, or an
  entered rise. This is the temperature-coefficient method NEC 690.7 allows when the maker gives a coefficient.
- Longest string = floor(min(inverter max DC, module max system voltage, entered limit) / Voc_cold).
- Shortest string = ceil(MPPT min / Vmp_hot). Lengths whose cold Vmp passes the MPPT maximum are flagged
  (lost energy, not a safety limit).
- Strings per MPPT = floor(input max short-circuit current / (1.25 x Isc)) (NEC 690.8(A)(1)); conductor
  ampacity 1.25 x 1.25 x Isc (690.8(B)) before corrections. With three or more strings in parallel the
  back-feed (n - 1) x 1.25 x Isc is compared with the module series fuse rating (see 690.9).
- Layouts: whole strings of one length, split as evenly as possible over the MPPT inputs, ranked by modules
  left over, then cold MPPT tracking, then current clipping, then longer strings.

Not modelled: uneven string lengths per MPPT, optimisers and microinverters, bifacial gain, inverter start-up
voltage, Vmp ageing, voltage drop, conductor temperature and conduit-fill corrections, rapid shutdown.
**Unverified:** checked by hand arithmetic (in `calc.test.mjs`) and unit tests only, not against a
manufacturer's string tool or a real permitted design.

## Run

Open `index.html` through any static server. Tests: `node --test calc.test.mjs page.test.mjs usage.test.mjs`.
Agents: `node platform/agents/tools.mjs call pv-string-sizer analyze --input '{"tMin":-30}'` from the repo root.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, electrical, legal or code-compliance advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Independent of module and inverter makers, installers, utilities and code bodies; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`strings_sized`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
