# RC Charge and Discharge Time Calculator

Calculate how long a capacitor takes to charge or discharge to a chosen voltage, rather than assuming that one `RC` time constant means “full.” The inverse is also here: given R, C, and a delay, what voltage is on the capacitor. It also works backwards from a target time and snaps the missing resistor or capacitor to a preferred value you can buy.

Open [`index.html`](index.html) directly, or serve this directory with `python3 -m http.server`. It is static, dependency-free, and all calculations stay in the browser.

The charge formula is `t = -RC ln(1 - V/Vs)` and discharge is `t = -RC ln(V/V0)`. Voltage after a delay is the inverse: `V = Vs (1 - e^{-t/RC})` on charge and `V = V0 e^{-t/RC}` on discharge. The design mode reports the exact value, the preferred E24 resistor or E12 capacitor, and the timing that the snapped part actually produces.

This models an ideal first-order RC circuit. It does not model leakage, source resistance, load current, capacitor tolerance, or comparator hysteresis.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering advice, and it does not replace checking your components' real datasheets or measuring the built circuit. **You are responsible for reviewing and verifying its output before relying on it**, including for anything safety-critical. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Privacy

Inputs never leave the browser. Anonymous feature-use events are counted locally in `localStorage`, never sent to an analytics vendor, and counting respects Do Not Track, Global Privacy Control, and the in-page opt-out.

## Test

```sh
node --test
```

MIT licensed; see [`LICENSE`](LICENSE).
