# Twitch Payout Calculator

Twitch streamers can use this free browser-local calculator to find real monthly take-home from Tier 1/2/3 subscriptions and Bits — after their revenue split (50% default, or 60%/70% under the Plus Program) — plus any other income they supply, then check it against a monthly payout goal. **After using this, you can tell how many more Tier 1 subs close an income gap, instead of guessing from a dashboard total that doesn't show the split.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/twitch-payout-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why the dashboard number is the wrong one to plan from

"$414 in sub revenue this month" is not what lands in your bank account, and two common beliefs about the gap get the mechanics backwards:

- **The revenue split is real and does move payout.** Everyone starts at 50% of subscription revenue. Affiliates and Partners who sustain 100 Plus Points for three consecutive months move to 60% under Twitch's Plus Program, and those who reach 300 Plus Points move to 70%. This is the one lever that actually changes take-home per sub.
- **Purchase platform (web vs. the iOS/Android app) does not.** Twitch charges more for a mobile subscription specifically to absorb the app store's cut, so payout per sub is the same either way — see [`does-a-mobile-subscription-pay-me-less.html`](does-a-mobile-subscription-pay-me-less.html) for the worked explanation.
- **Bits are flat, not split.** A cheered Bit is worth $0.01 to the streamer regardless of the subscription split, because Twitch's cut is already built into what a viewer pays for the Bits bundle.

This tool deliberately does not estimate ad revenue — Twitch publishes no standard ad CPM a static calculator could model honestly — so any ad, sponsorship, or other income is a single figure the streamer supplies, never computed here.

## Privacy and usage

Everything runs in your browser. Your sub counts, split, Bits, and income figures are never uploaded, and there is no account. We count anonymous local feature events only (`month-priced`, `gap-checked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No sub counts, Bits totals, or income figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. It is also not an ad-revenue estimator, a payout tracker, or a substitute for your own Twitch dashboard and payout statements. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your payout history, confirm a deposit amount, or replace your own accountant. Twitch is a trademark of Twitch Interactive, Inc., named here only to describe what this tool calculates — this tool is not affiliated with, endorsed by, or sponsored by Twitch, and its subscription prices, split terms, and Bits pricing change over time; verify every figure against your own current Twitch dashboard.

MIT licensed. See `LICENSE`.
