# Window Tinting Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/window-tinting-bid-calculator/>

Free browser-local bid calculator for independent auto window tinting
installers (a one-to-two-person shop or mobile installer, not a
dealership-scale tint department) quoting a vehicle film job. After using
this, you can now price a tint job from what actually drives the cost —
which windows are actually being tinted, film tier, cutting waste, and
whether old tint has to come off first — which used to take a flat
per-vehicle price copied from a posted list.

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. Run the tests with:

```
node --test ventures/window-tinting-bid-calculator/*.test.mjs
```

## Why pane count and film tier, not vehicle size class

The trade's own shorthand for pricing this work is a flat rate by vehicle
size class — "$180 sedan / $220 SUV / $250 truck" — posted on a price list.
That number is what a customer expects to hear, and it is wrong for the
three things that actually move the job's real cost: how many windows are
actually being tinted (a "front two only" privacy job is a fraction of a
full seven-window kit), which film tier the customer picked (ceramic film
can run several times dyed film's cost per square foot), and whether
existing tint has to be stripped first (removal is slow, separate work —
especially on a rear windshield, where the defroster grid means the old
film has to come off with a heat gun and patience instead of a fast peel).
A "front two only" dyed-film job and a full ceramic kit with removal on
every pane can both roll up to a shop calling it "one sedan," and a flat
per-vehicle price cannot see the difference between them. The calculator
prices the job both ways and shows the gap: how much a flat per-vehicle
price would have left on the table, or overcharged, on the exact job you
just priced.

## Privacy and usage

Everything runs in your browser. Your vehicle details, rates, and price are
never uploaded, there is no account, and nothing leaves the page. We count
anonymous local feature events only (`bid_calculated`, `reset`,
`sponsor_link_clicked`), with a visible opt-out. Do Not Track and Global
Privacy Control disable counting automatically. No vehicle, price, or
customer figures are ever recorded, and the counter is not sent to the
maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, safety, or automotive advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from
its use.

This is a pricing worksheet based on your own assumptions. It does not
check your state's window tint darkness (VLT%) law, medical-exemption
rules, reflectivity limits, or any other film-legality requirement, and it
does not replace your own judgment about scope or warranty terms.

MIT licensed. See `LICENSE`.
