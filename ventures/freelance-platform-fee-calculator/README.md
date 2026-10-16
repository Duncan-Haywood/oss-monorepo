# Upwork vs. Fiverr Fee Calculator

A free browser calculator that runs the same job price through Upwork's and
Fiverr's payout math side by side, so a freelancer deciding where to post a
job — or how to price one already posted — sees **what actually lands in the
bank from each platform**, not just a headline percentage. It also solves
backwards: pick a platform and a take-home goal, and it reports the price
needed to clear it after that platform's fee, an optional withdrawal fee,
and a tax reserve.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/freelance-platform-fee-calculator/

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts.

```bash
# Serve it locally
npx http-server ventures/freelance-platform-fee-calculator -p 8080
# Run the tests
cd ventures/freelance-platform-fee-calculator && node --test
```

**Value:** After using this, you can see whether a $500 job actually nets
more posted on Upwork at your quoted fee or on Fiverr's flat 20% — instead
of opening two tabs, retyping the numbers twice, and comparing by hand.

## The problem it solves

Fiverr charges every seller a flat 20% commission, no tiers — that figure is
public and has not changed in years. Upwork is different: **since May 1,
2025 it retired its old 20%/10%/5% lifetime-billing tiers for a variable
0–15% fee set per contract**, shown to the freelancer only at proposal time,
with no public formula anyone can compute it from. A lot of existing
calculators and blog posts still describe Upwork's old, retired tiers as
current — see [`how-much-does-upwork-take.html`](how-much-does-upwork-take.html)
for what actually changed.

That leaves a freelancer with two different kinds of number to compare: a
fixed, known rate on one side and a variable, freelancer-specific rate on
the other. This page takes the freelancer's own quoted Upwork percentage as
an input rather than guessing at a formula, and runs it against Fiverr's
known rate for the same job price.

## How it works

1. **The job.** One job price — what the client pays, before either
   platform's cut.
2. **Upwork.** Your own quoted freelancer service fee (0–15%, shown to you
   at proposal time — see the guide above for why this can't be computed),
   plus an optional flat withdrawal fee.
3. **Fiverr.** The flat 20% seller commission (overridable if Fiverr changes
   its published rate), plus an optional flat withdrawal fee.
4. **Tax reserve.** Nothing withholds for a self-employed freelancer on
   either platform. Enter the share of after-fee proceeds you set aside for
   self-employment and income tax, and both sides account for it. Leave it
   at 0 and every figure behaves as if no reserve existed.
5. **Comparison.** Which platform nets more for this exact job price, and by
   how much.
6. **Target take-home.** Pick a platform and a take-home goal; the page
   solves backwards through that platform's fee, its withdrawal fee, and the
   tax reserve to the job price that would clear it.

**Copy comparison** turns the result into plain text. **Copy share link**
puts the same inputs in a URL fragment so a co-founder or future-you can
reopen the exact comparison — nothing is sent to a server either way.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency; see [`calc.test.mjs`](calc.test.mjs).

## Opportunity and evidence

The target user is an Upwork or Fiverr freelancer pricing a job or deciding
which platform to post it on. This is a well-populated question on r/Upwork,
r/fiverr, and r/freelance — recurring threads comparing the two platforms'
take-home — and in search phrases like "upwork vs fiverr fees", "how much
does upwork take", and "how much does fiverr take". Several existing pages
answer each platform's fee in isolation (including one from Upwork's own
tools page); this page is the side-by-side, and it is current on Upwork's
May 2025 fee-structure change, which several existing pages still describe
incorrectly as the old fixed tiers. This is not yet validated by a real
visitor — see `kill_criteria` in `VENTURE.yaml`.

This is a different job from
[`freelance-retainer-calculator`](../freelance-retainer-calculator), which
prices a monthly retainer from income goals and capacity rather than a
platform's cut on a single job, and from
[`marketplace-fee-compare`](../marketplace-fee-compare), which compares six
e-commerce selling channels rather than two service-freelancing platforms.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are
no accounts, tracking cookies, or analytics vendors. The product counts only
aggregate local `comparison_calculated`, `tax_reserve_set`, `target_solved`,
`summary_copied`, `share_link_copied`, and `shared_link_opened` events, never
people, IPs, content, or cross-site identifiers. A shareable link encodes
the comparison's inputs in the URL hash; it is not sent to a server. The
checkbox in the footer turns counting off; clearing browser storage removes
the local count. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

## Limitations

- **The Upwork fee is your own quoted percentage, not a computed one.**
  Upwork's post-May-2025 fee has no public formula; this page cannot look it
  up for you, only run the number you already have.
- **The tax reserve is arithmetic on a percentage you supply, not a tax
  calculation.** It does not know your filing status, state, deductions,
  other income, or quarterly-estimate schedule. Ask a tax preparer for your
  number.
- One job at a time — it does not track a running total across multiple
  contracts or gigs.
- Single currency.
- Starting figures are an illustrative example, not a benchmark or a claim
  about what either platform pays.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or legal advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any tax obligation it helps you prepare for. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

Not affiliated with, endorsed by, or sponsored by Upwork or Fiverr. Upwork is
a trademark of Upwork Inc.; Fiverr is a trademark of Fiverr International
Ltd. Both are named here only to describe what this calculator compares.

MIT licensed — see [`LICENSE`](LICENSE).
