# Insurance Denial Appeal Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/insurance-denial-appeal-builder/>

A free browser tool for patients: **paste a health insurance denial letter and get the likely
denial reason, your appeal deadline, a draft appeal letter, a checklist of what to gather and a
calendar file with reminders.** The text is read in the browser. Nothing is uploaded and no
account is needed.

After using this, you can **appeal a denied claim with the right deadline, the right attachments
for that kind of denial and a letter that asks for the plan's criteria and claim file**, which
used to mean reading a dense notice, guessing the window and writing the letter from scratch.

## What it does

- **Reads the denial.** Adjustment reason codes (CO-50, CO-197, CO-96, CO-18 and others) and
  phrases ("not medically necessary", "prior authorization", "out of network", "investigational")
  are scored. The best match is suggested with the evidence for it; the user can change it. It
  also picks up the notice date, a stated appeal window, claim number, member ID and urgency.
- **Computes deadlines** from plan type and the date the notice was received: 180 days for employer
  and individual plans, 60 for Medicare Advantage, 120 for Original Medicare; Medicaid varies by
  state, so the days from the notice are entered. A number stated in the notice always wins. Shows
  days left, whether the window is closing or passed, the usual decision time and the next level.
- **Drafts the letter** per reason: argument, the specific things to ask the plan for, and the
  documents to enclose, with plan-specific wording, an urgent-appeal request and a late-appeal
  request when they apply. Missing facts are shown as `[placeholders]`, never invented.
- **Lists what to do first.** For billing, authorization and filing problems it says to call the
  provider before appealing, since a corrected claim is often quicker.
- **Exports** the letter as text and the deadline plus two reminders as an `.ics` file.

Not checked: whether the plan covers the service, whether the denial is right, state-specific
rules, plan deadlines shorter than the rule of thumb. The reason-code list and phrase matches come
from public references and are **unverified against real denial letters from many insurers**.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not medical, legal, tax, or financial advice, and it does not replace your provider,
your insurer or a qualified professional. **You are responsible for reviewing and verifying its
output before relying on it**, before sending an appeal, and before missing or assuming any
deadline. A drafted letter is a starting point, not a guarantee of any outcome. To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its
use.

Independent of any insurer, health plan, hospital, clinic or government agency.

**Privacy.** Nothing is uploaded; a denial letter contains health information and stays in the
browser. Anonymous feature counts (`denial_read`, `appeal_built`, `letter_copied`,
`example_loaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
