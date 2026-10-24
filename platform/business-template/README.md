# Business template: an AI-run business repository for scheduled Claude Code runs

**Describe a business idea in a sentence; get a repository that hourly
Claude Code runs build and operate**: product and website, marketing and SEO,
sales pipeline, double-entry books, legal drafts and customer support. The
owner steps in only for what a person must do (money, identity, signatures,
accounts), and every such step waits in one checklist, prepared so it takes
minutes. Open source (MIT), standard-library Python, no service to sign up
for beyond your own Claude Code and GitHub.

```
python3 platform/business-template/new_business.py --interactive --out ../my-business
```

or, non-interactively:

```
python3 platform/business-template/new_business.py \
  --name "Tidy Gutters" --type local-service \
  --idea "Gutter cleaning in Leeds with instant online quotes." \
  --answer area="Leeds and Bradford" \
  --out ../tidy-gutters
```

Then follow the generated `SETUP.md`: push it to GitHub and schedule
"Read ./prompt.md and follow it." hourly in Claude Code on the web, with cron
on your own machine, or on GitHub Actions.

## What the generated repository does

| Piece | What it is |
|---|---|
| `prompt.md` | The master prompt every run follows: route, do one finished thing, land it (PR, CI, self-merge), record the run. |
| `ops/route.py` | Picks this run's business function by the stage's weights, so parallel hourly runs spread out; `--skip` avoids a function another open PR holds. Routes to `intake` until the brief is complete, and to `review` every 24 runs. |
| `functions/*.md` | One brief per function: intake, product, marketing, sales, finance, legal, support, review. |
| `BUSINESS.md` | The brief: the idea, offer, customer, stack, intake questions with defaults, and the plan. |
| `OWNER.md` | The owner checklist: only the human-only steps, deduplicated. |
| `GUARDRAILS.md` | What no run may do: move money, act under the owner's identity, fabricate, send unsolicited messages, commit secrets or personal data, give advice as fact. |
| `ops/books.py` | Plain-text double-entry bookkeeping over `finance/ledger.csv`: balance check, P&L by month, balances. |
| `ops/check.py` | The CI gate: structure, routing weights, open intake questions, duplicate owner asks, run records, balanced books, unfilled placeholders. |
| `ops/record.py` | One JSON record per run; the review function reads them to steer the business and fix instructions that caused friction. |

## How it gets to market with little intervention

1. **Intake.** The first run researches competitors and customers, sharpens
   the questions (each has a default), and opens one issue asking the owner.
   After a day, unanswered questions take their default, marked as
   assumptions the owner can change, so the business never idles waiting.
2. **Build → launch → grow.** Stages change the routing weights: build is
   mostly product, launch shifts to marketing and sales, grow balances all
   of them with finance. The review function moves the stage on against a
   measured signal written in the plan.
3. **The owner's part** is the checklist: register an entity if wanted, open
   a bank account, create the payment account and paste its key as a secret,
   buy the domain, send the drafted sales follow-ups. Payment code ships off
   and switches on with the owner's key.

## Presets

`--type` picks the questions, the owner steps, the default stack and the
function weights per stage: `saas`, `local-service`, `ecommerce`, `content`,
`services` (`presets/*.json`; add one by copying a file).

## Limits, plainly

The runs do real work, but they do not replace judgment about whether the
idea is worth pursuing, and they cannot take any step that needs a person's
identity, signature or card. Legal and finance output are drafts and
bookkeeping, not professional advice. Running hourly sessions costs Claude
plan usage or API budget; start with one or two runs an hour.

## Tests

```
python3 -m unittest discover -s platform/business-template -v
```

Generates a repository for every preset and runs that repository's own check
and tests (`.github/workflows/business-template-ci.yml`).

The prompt structure (route, work, record, review) is distilled from this
monorepo's own [`prompt.md`](../../prompt.md) and
[`prompts/`](../../prompts/README.md), which run hundreds of scheduled
sessions a week.
