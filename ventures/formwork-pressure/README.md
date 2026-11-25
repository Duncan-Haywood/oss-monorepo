# Formwork pressure calculator

Design lateral pressure of fresh concrete on wall and column forms, by the
ACI 347R equations, turned into the numbers a crew uses: the pressure
envelope, the force on the form, tie spacing, and the fastest pour rate a
form system's rating allows.

**Live:** https://marisstella.app/formwork-pressure/ ·
[Formwork pressure explained](https://marisstella.app/formwork-pressure/formwork-pressure-explained.html)

## Who it is for

Concrete contractors, formwork foremen and carpenters, and site engineers
deciding a pump rate or checking a tie layout before a wall or column pour.

## What it does

- Classifies the element (column: no plan dimension over 6.5 ft) and picks
  the ACI 347R equation: `150 + 9000R/T` for columns and walls under 7 ft/h
  up to 14 ft high; `150 + 43400/T + 2800R/T` for taller walls and walls at
  7 to 15 ft/h; full liquid head `w·h` above 15 ft/h or outside the
  equations' conditions (SCC, slump over 7 in, pumped from the base,
  external vibration, vibration deeper than 4 ft).
- Unit weight coefficient Cw and chemistry coefficient Cc; the `600·Cw`
  minimum and the `w·h` cap; says which of the three governs.
- Pressure envelope (liquid head down to where it meets the design pressure,
  constant below), resultant force per foot of form and its height.
- Tie spacing from a tie's safe working load; the fastest rate of placement
  for a form's rated pressure (piecewise across the 7 and 15 ft/h
  boundaries); rate of placement from the delivery rate and plan area.
- US or metric units (metric is converted to US, computed, and converted
  back; within 1% of the ACI SI equations).

```
node cli.mjs --wall --height 10 --rate 5 --temp 70 --tie 3000 --tie-across 2 --rated 1000
node cli.mjs --column --height 3.6 --rate 3 --temp 15 --si
node cli.mjs --example
```

## Files

- `pressure.mjs`: the engine (pure functions, no dependencies).
- `index.html`: the tool. `formwork-pressure-explained.html`: the marketing
  and explainer page with a worked example.
- `cli.mjs`: command line. `usage.mjs`: the anonymous local usage counter.
- Tests: `node --test pressure.test.mjs page.test.mjs`.

## Spec sources

American Concrete Institute, ACI 347R, *Guide to Formwork for Concrete*,
section 4.2 (lateral pressure of concrete), the equations also reproduced in
Hurd, *Formwork for Concrete* (ACI SP-4). The sign-off belongs to the
formwork designer or engineer of record. `pressure.test.mjs` checks the
headline outputs against hand calculations written in the tests (the 10 ft,
5 ft/h, 70 °F wall: 150 + 9000·5/70 = 792.9 psf; its resultant and tie
spacing worked by hand), not against the code's own output.

## Limits

- Pressure only. It does not design sheathing, studs, walers, ties, bracing
  or shores, and it uses the tie load you enter.
- No upper cap other than the full liquid head is applied.
- Self-consolidating concrete is given full liquid head; ACI 347R and ACI
  237R discuss lower design pressures when they are measured or tested.
- US practice. Other countries' standards (CIRIA Report 108, DIN 18218) give
  different pressures.

## Next

- Tie, waler and stud checks with supplier-entered capacities.
- A pour plan: lifts and pump rate over the day as the temperature changes.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, structural or construction
advice, and it does not replace a qualified professional, the formwork
designer, the form supplier's data or the engineer of record. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run
it yourself.

**Privacy.** Nothing leaves the browser. An anonymous counter in the
browser's local storage records that a calculation was run and the day; the
page's checkbox turns it off, and Do Not Track or Global Privacy Control is
honoured.

## License

FSL-1.1-MIT, see `LICENSE`.
