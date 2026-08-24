# 555 Timer Calculator

Astable (oscillator) and monostable (one-shot) 555 circuits, in both
directions on one page, no signup: analyse the components you already have,
or design from the frequency, duty cycle, or pulse width you want down to
the nearest resistors you can actually buy.

The part most 555 calculators leave out is the buildability check. The
timing equations happily hand you a design that a real chip can't run:

- a **duty cycle of 50% or below**, which a standard two-resistor astable
  cannot produce at all (charging goes through R1 + R2, discharging through
  R2 alone, so high time always exceeds low time);
- an **R1 small enough to over-current the discharge pin**, which sinks
  around 200 mA at most and is limited by R1 alone during discharge;
- **timing resistors past ~1 MΩ**, where a bipolar NE555's threshold-pin
  leakage stops being negligible and the real period drifts;
- an **electrolytic timing capacitor**, whose −20%/+80% tolerance makes the
  computed frequency a target rather than a specification.

This tool reports all four alongside the numbers, so the surprise happens
in the browser rather than on the bench.

Built as the fourth hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track, alongside
the [resistor color code & Ohm's law calculator](../resistor-calculator/),
the [LED series resistor calculator](../led-resistor-calculator/), and the
[voltage divider calculator](../voltage-divider-calculator/). All of them
are listed on the [tools index](../).

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/555-timer-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- "R1 = R2 = 4.7k, C = 100nF — what frequency and duty cycle do I get?" →
  1023 Hz at 66.67% duty, with the high and low times broken out.
- "I want 1 kHz at 60% duty and I have a 100nF cap — what resistors?" →
  exactly 2.885k and 5.771k; nearest buyable E24 pair 3k and 5.6k, which
  really gives 1016 Hz at 60.56% duty (+1.60% and +0.56 points).
- "Why can't I get 50% duty?" → the tool refuses the request and explains
  the diode-across-R2 workaround rather than returning a nonsense negative
  resistor.
- "100k and 10µF in a one-shot — how long is the pulse?" → ~1.1 s
  (ln(3) × R × C), plus the re-trigger constraint that catches people out.
- "I need a 1 second pulse from a 10µF cap — what R?" → exact, nearest E24,
  and the pulse that value actually gives.

## Formulas

| Quantity | Formula |
| --- | --- |
| Astable output-high time | ln(2) × (R1 + R2) × C |
| Astable output-low time | ln(2) × R2 × C |
| Astable period | ln(2) × (R1 + 2 × R2) × C |
| Astable frequency | 1.44 / ((R1 + 2 × R2) × C), i.e. 1 / ln(2) ≈ 1.44 |
| Astable duty cycle | (R1 + R2) / (R1 + 2 × R2) |
| Monostable pulse width | ln(3) × R × C, the usual "1.1 RC" |

Solving the astable backwards, with `K = 1 / (ln(2) × f × C)` and duty `D`,
collapses to `R1 = K × (2D − 1)` and `R2 = K × (1 − D)` — which is also the
algebraic reason `D = 0.5` drives R1 to zero.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace reading
your specific chip's datasheet or measuring the built circuit — 555 variants
differ, and the practical limits it checks against are rules of thumb for a
bipolar NE555. **You are responsible for reviewing and verifying its output
before relying on it**, including for anything safety-critical. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

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

- [`calc.mjs`](calc.mjs) — the astable/monostable math in both directions,
  E24 snapping, and the buildability checks, unit tested and reused
  unchanged by the browser UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

## License

[MIT](LICENSE).
