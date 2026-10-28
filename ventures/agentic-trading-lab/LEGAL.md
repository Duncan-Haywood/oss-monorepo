# Why this is a tool for your own account, not a fund

*General information, not legal advice. Rules differ by country and state and
change over time. If you plan anything beyond trading your own money, talk to
a securities lawyer first.*

The idea this project started from was "an automated agentic fund, maybe
through Robinhood." The software is built for something narrower on purpose:
**one person researching and, if they choose, trading their own account.**
That line is where the legal and financial risk changes, and it explains most
of the design.

## Managing other people's money is regulated

In the United States, as a rough guide:

- **Advising others for pay** on securities generally makes you an investment
  adviser under the Investment Advisers Act of 1940, registered with the SEC
  or your state, unless an exemption applies.
- **Pooling money from others** into one vehicle that invests in securities
  can make that vehicle an investment company under the Investment Company Act
  of 1940, unless it fits an exemption (private funds usually rely on section
  3(c)(1) or 3(c)(7)). Selling interests in it is a securities offering under
  the Securities Act of 1933, usually made under Regulation D, with limits on
  who may invest and how it may be marketed.
- **Futures or other commodity interests** in a pool bring in the CFTC and the
  NFA (commodity pool operator and commodity trading advisor rules).
- Marketing past performance, backtested results included, to prospective
  clients is restricted (for registered advisers, the SEC Marketing Rule,
  Rule 206(4)-1, treats hypothetical performance strictly).

None of that applies to trading your own money. All of it can apply the moment
someone else's money is involved, including friends and family.

## Publishing software and research

This repository publishes code, data-driven research and general,
impersonal information that is the same for every reader. It does not know
who you are, does not give individual recommendations and takes no fee for
advice. The US Supreme Court held in *Lowe v. SEC*, 472 U.S. 181 (1985), that
bona fide publications of general, impersonal investment commentary fall
outside the Advisers Act's definition of an adviser. Keep it that way if you
fork it: a hosted service that sends personalised trade signals to paying
subscribers is a different thing.

## Robinhood

- Robinhood publishes an official **Crypto Trading API** (crypto only). The
  `robinhood-crypto` broker here uses it, with keys the account holder creates
  and registers, read from that person's environment.
- There is **no official Robinhood API for stocks or options**. Libraries that
  automate the mobile app's private endpoints are not supported here: they can
  break without notice, and automating access in ways the broker has not
  authorised may breach its customer agreement. For automated stock and ETF
  trading this project supports **Alpaca**, which publishes a trading API with
  a free paper-trading account.
- A brokerage account is for its holder. Trading other people's money through
  your personal account is outside what retail customer agreements allow, and
  it brings in every rule above.

## Other things that bite real accounts

- **Taxes.** Monthly rebalancing in a taxable account realises short-term
  gains, taxed as ordinary income in the US, and wash-sale rules can defer
  losses. Every backtest here ignores taxes. A tax-advantaged account changes
  the arithmetic.
- **Pattern day trading.** FINRA Rule 4210 sets a minimum equity for margin
  accounts that day trade frequently. The strategies here rebalance monthly
  (equities) or daily at most (crypto, which FINRA's rule does not cover), but
  check the current rule before changing the cadence.
- **Spreads and fees are not fixed.** Robinhood prices crypto through a spread
  that varies. The study sweeps costs from 0 to 150 bps for that reason, and
  the fast crypto rules stop working at around 25 to 50 bps.

## What this means for the code

- Dry run is the default. Paper trading is the next step. Live trading needs
  `--live`, the exact phrase in `TRADELAB_LIVE_CONFIRM`, no kill-switch file,
  and a research report that passed the gate (or an explicit override).
- Credentials come only from the environment of whoever runs it. Nothing here
  holds, stores or sends anyone's keys, and the maintainers run no hosted
  service that could.
- Per-order and per-run limits are enforced. Orders that break them are
  refused, never quietly resized.
