# RC / RL Filter Cutoff Frequency Calculator

What's the cutoff frequency of this filter — and, working the other way,
what part do I need to hit a cutoff I've already picked? Enter a resistor and
a capacitor (or inductor) to get the −3 dB cutoff frequency and time
constant, or switch to design mode: give a target cutoff and one component
and get the other, snapped to a value you can actually buy.

Built as the fourth hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track, alongside
the [resistor color code & Ohm's law calculator](../resistor-calculator/),
the [LED series resistor calculator](../led-resistor-calculator/), and the
[voltage divider calculator](../voltage-divider-calculator/) — another
small, genuinely useful tool independent of the rest of the curriculum.

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/rc-filter-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- **Find the cutoff.** "10 kΩ and 100 nF in an RC low-pass — where's the
  cutoff?" → 159.15 Hz, time constant 1 ms.
- **Design for a cutoff.** "I want a 1 kHz RC low-pass and I've got a 10 kΩ
  resistor — what capacitor?" → 15.9 nF exactly; the nearest stocked value
  is 15 nF, which lands the cutoff at about 1.06 kHz.
- Handles all four first-order topologies — RC low-pass, RC high-pass, RL
  low-pass, RL high-pass — and reports the −3 dB cutoff, the angular cutoff
  ω_c, and the time constant τ for each.

The formulas: RC filter `f_c = 1 / (2·π·R·C)`, `τ = R·C`; RL filter
`f_c = R / (2·π·L)`, `τ = L / R`. Low-pass vs. high-pass only changes where
the output is taken, so the cutoff and time constant are the same either way.

This covers the ideal first-order passive filter only. It does not model
higher-order filters, component tolerances, source/load impedance loading,
or parasitics — treat its numbers as the textbook design point and verify
against your real parts.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace checking
your components' real datasheets or measuring the built circuit. **You are
responsible for reviewing and verifying its output before relying on it**,
including for anything safety-critical. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

## Privacy

Everything runs in your browser. Your inputs are never uploaded, and there
are no accounts, tracking cookies, or analytics vendor. The page counts
anonymous, local feature-use events (e.g. "a calculation was run") in your
own browser's `localStorage`, purely so this project's maintainers can tell
whether the tool gets used at all — nothing leaves your device, and it's
switched off automatically if your browser sends Do Not Track or Global
Privacy Control. There's also an in-page toggle to turn it off by hand.

## Development

Pure ES modules, zero dependencies, zero build step:

- [`calc.mjs`](calc.mjs) — the filter math (cutoff from components, a design
  mode that solves for the missing component and snaps it to a standard
  preferred value, and unit-prefix formatters), unit tested and reused
  unchanged by the browser UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

## License

[MIT](LICENSE).
