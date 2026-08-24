# Resistor Color Code & Ohm's Law Calculator

What is this 4-band or 5-band resistor actually worth, and what happens to the
current if I change the resistance? Two calculators, one page, no signup:
decode a resistor's color bands into ohms and tolerance, and solve Ohm's law /
power (V, I, R, P) from any two known values.

Built as the first hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track — a small,
genuinely useful tool a student or hobbyist can use today, independent of
the rest of the curriculum.

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/resistor-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- "I have a resistor with yellow-violet-red-gold bands — what's its value?"
  → 4.7 kΩ, ±5%.
- "I have 12V across a 4Ω load — what's the current and power dissipated?"
  → 3A, 36W.
- 5-band and 6-band (with temperature coefficient) resistors are supported
  too.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace checking a
component's real datasheet or measuring it with a multimeter. **You are
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

- [`calc.mjs`](calc.mjs) — the resistor-decoding and Ohm's-law math, unit
  tested and reused unchanged by the browser UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

## License

[MIT](LICENSE).
