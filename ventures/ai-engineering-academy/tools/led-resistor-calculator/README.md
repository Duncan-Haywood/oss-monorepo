# LED Series Resistor Calculator

What resistor keeps this LED from burning out, and how close can I actually
get with resistors I can buy? Enter a supply voltage, an LED's forward
voltage and current, and how many are wired in series — get the exact
resistor value, the nearest standard (E24) resistor, and the power rating it
needs to survive.

Built as the second hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track, alongside
the [resistor color code & Ohm's law
calculator](../resistor-calculator/) — another small, genuinely useful tool
independent of the rest of the curriculum.

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/led-resistor-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- "9V supply, a standard red LED (2V, 20mA) — what resistor do I need?"
  → 350 Ω exactly; the nearest resistor you can actually buy is 360 Ω,
  which runs the LED at about 19.4 mA.
- "I'm wiring three red LEDs in series off a 12V rail — same question."
  → 300 Ω, which happens to be an exact standard value.
- Also reports the resistor's power dissipation and a recommended power
  rating (0.125 W, 0.25 W, 0.5 W, 1 W, ...), derated by 2× for reliability.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace checking
your LED's real datasheet or measuring the built circuit. **You are
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

- [`calc.mjs`](calc.mjs) — the resistor math (including snapping to the
  nearest E24 standard value and a power-rating recommendation), unit
  tested and reused unchanged by the browser UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

## License

[MIT](LICENSE).
