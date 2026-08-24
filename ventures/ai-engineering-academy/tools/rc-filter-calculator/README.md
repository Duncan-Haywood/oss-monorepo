# RC Filter Calculator

Where does a one-resistor, one-capacitor filter actually roll off — and what
does it do to a signal at the frequency you care about? Two calculators, one
page, no signup: compute a first-order RC filter's cutoff frequency plus the
real gain, attenuation and phase shift at any frequency (low-pass or
high-pass), and solve for the resistor you need to hit a target cutoff with a
capacitor you already have.

Built as the fourth hands-on artifact for [AI Engineering
Academy](../../README.md)'s planned Electrical Engineering track, alongside
the [resistor color code & Ohm's law calculator](../resistor-calculator/),
the [LED series resistor calculator](../led-resistor-calculator/) and the
[voltage divider calculator](../voltage-divider-calculator/). It is the first
of the four to leave the DC/resistive world for the frequency domain.

## Use it

Open [`index.html`](index.html) in a browser — it is a static page with no
build step and no server. To try it locally:

```sh
cd ventures/ai-engineering-academy/tools/rc-filter-calculator
python3 -m http.server 8000
# open http://localhost:8000
```

## What it answers

- "1 kΩ and 100 nF — where's the cutoff?" → 1.592 kHz, with a 100 µs time
  constant.
- "What does that filter actually do to a 1 kHz tone?" → −1.45 dB, so 84.67%
  of the amplitude still gets through, shifted by −32.14°.
- "I need a 1 kHz corner and I have 100 nF in the drawer — what resistor?" →
  1.592 kΩ exactly, nearest buyable E24 value 1.6 kΩ, which really gives
  994.7 Hz (−0.53% off target).
- "Is my signal gone above the cutoff?" → the response table across the
  corner says no, in numbers: 10× above the corner is still −20 dB (9.95% of
  the amplitude), not silence.

## The correction it exists to make

The formula everyone memorises — f<sub>c</sub> = 1 / (2πRC) — is the easy
part. The part that catches people is what "cutoff" means. At exactly
f<sub>c</sub> a first-order RC filter still passes **70.7%** of the amplitude
(that is what −3 dB *is*) and has already rotated the phase by **45°**. Past
the corner it falls off at only about **20 dB per decade**.

So the tool reports gain *and* phase together, flags when you are sitting on
the corner, and renders a short sweep from 0.01× to 100× f<sub>c</sub> so the
gentleness of a single-pole roll-off is visible as numbers rather than
assumed away. If you need a signal genuinely gone rather than merely reduced,
one RC stage will not do it, and the page says so.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace measuring
the built circuit. It models an ideal first-order RC filter driven by an
ideal source into an infinite-impedance load: real source resistance, load
impedance, capacitor tolerance (often ±10% or worse) and dielectric
behaviour all move the result. **You are responsible for reviewing and
verifying its output before relying on it**, including for anything
safety-critical. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

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

- [`calc.mjs`](calc.mjs) — the filter math (cutoff frequency, time constant,
  gain/phase at an arbitrary frequency for both arrangements, and E24/E6
  standard-value snapping), unit tested and reused unchanged by the browser
  UI.
- [`usage.mjs`](usage.mjs) — the local-first usage counter described above.
- [`index.html`](index.html) — the UI; imports both modules directly.

```sh
node --test
```

19 tests: 15 covering the filter math — including the −3.01 dB / 45° identity
at the corner, the 20 dB/decade asymptote, a high-pass blocking DC outright,
and the structural check that |H<sub>lp</sub>|² + |H<sub>hp</sub>|² = 1 at
every frequency — plus 4 covering usage counting.

## License

[MIT](LICENSE).
