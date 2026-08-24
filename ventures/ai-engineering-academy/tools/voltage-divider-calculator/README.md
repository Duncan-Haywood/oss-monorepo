# Voltage Divider Calculator

What does R1/R2 actually give you at V<sub>out</sub> — and how much does a
real load pull that down? Two calculators, one page, no signup: compute a
divider's output (with an optional load resistance for the loading
correction beginners usually miss), and design a divider for a target
output voltage with a resistor value you can actually buy.

Built as the third hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track, alongside
the [resistor color code & Ohm's law
calculator](../resistor-calculator/) and the [LED series resistor
calculator](../led-resistor-calculator/).

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/voltage-divider-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- "12V supply, two 10k resistors — what's Vout?" → 6V exactly, unloaded.
- "Same divider, but I'm feeding a 1k load — what does Vout actually
  become?" → the load pulls it down; the tool shows both numbers and the
  percentage sag, plus the power each resistor and the load dissipate.
- "I need roughly 3.3V from a 12V rail and I'm starting from a 10k R1 —
  what R2?" → the exact value, the nearest resistor you can actually buy
  (E24 series), and the real output voltage and error that gives you.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace measuring
the built circuit. A resistive divider is a poor voltage regulator under a
varying load — for anything beyond a light, roughly-constant load, use a
proper regulator. **You are responsible for reviewing and verifying its
output before relying on it**, including for anything safety-critical. To
the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

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

- [`calc.mjs`](calc.mjs) — the divider math (including the load-loading
  correction and E24 resistor snapping), unit tested and reused unchanged
  by the browser UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

## License

[MIT](LICENSE).
