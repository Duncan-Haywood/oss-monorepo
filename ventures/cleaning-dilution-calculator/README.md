# Cleaning Dilution Cost Calculator

Calculate commercial cleaning chemical cost per ready-to-use gallon, bucket,
or job from the concentrate label and supplier price. The calculator includes
optional mixing labor and waste allowance, so an operator can use the result in
a purchasing decision or a janitorial bid.

Open [`index.html`](index.html) directly or serve this directory statically.
It is a zero-dependency browser app: no account, network request, or paid API.

```bash
cd ventures/cleaning-dilution-calculator
node --test
```

## Why it exists

Chemical is often entered in a bid as a vague percentage or priced from the
concentrate sticker price. That hides dilution, mixing time, and product waste.
This tool answers the specific question: **what does the ready-to-use gallon I
will actually pour cost?** A user can now price a bucket or recurring job in
seconds, which used to require a spreadsheet or mental arithmetic.

## Privacy and usage

Everything runs in the browser and no inputs leave the device. There are no
accounts, cookies, or analytics vendors. An anonymous local tally records only
that the calculator was used, never the product, price, ratio, or job details.
Use the opt-out checkbox to disable it. Do Not Track and Global Privacy Control
also disable counting. The implementation is in [`usage.mjs`](usage.mjs).

## Safety and disclaimer

Follow the product label and Safety Data Sheet. Never mix chemicals unless the
manufacturer explicitly permits it. This tool does not determine safe handling,
PPE, storage, compatibility, or regulatory requirements.

**No warranty.** This free tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, engineering, or
safety advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising
from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

MIT licensed. See [`LICENSE`](LICENSE).
