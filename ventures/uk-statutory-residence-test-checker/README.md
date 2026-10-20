# UK Statutory Residence Test Checker

Free, private browser tool that runs the UK Statutory Residence Test (the rules HMRC uses to decide whether you are UK tax resident for a tax year). Enter your UK stays and a few answers about your home, work and family, and it shows which test decided (automatic overseas, automatic UK, or sufficient ties), each step's outcome, the ties against the number needed, and how many more UK days you can spend before the answer changes.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uk-statutory-residence-test-checker/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - the rules engine: midnight-based day counting with overlap merging and tax-year clipping, the three automatic overseas tests, the three automatic UK tests, the leaver and arriver ties tables, the five ties, and a sweep that finds the day count where the answer flips (`assess`, `verdictForDays`, `TIE_TABLE`).
- `uk-statutory-residence-test-ties-table.html` - guide with both ties tables generated from the engine and a worked example the test suite recomputes.

## What you use today, and what this does differently

- **HMRC's own residence, domicile and remittance basis tool and the RDR3 guidance:** authoritative, but a questionnaire that gives a verdict without showing the day count that would change it, and RDR3 is a 100+ page PDF.
- **Accountants' and relocation firms' SRT calculators:** usually a lead form first, and often a yes/no with no explanation of which test fired.
- **Travel trackers:** count days but do not apply the tests.
- **A spreadsheet:** free and private, but the ties table, the automatic test order and leaver/arriver rules are yours to get right.
- **What this adds:** the order of tests as HMRC sets it out, the reason for the answer, headroom in days, a text summary to keep, and no signup or upload. It is not tax advice and does not model split-year treatment or the deeming rule.

## Host your own copy

It is a static site: the server only hands out files and never sees a date you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080>.
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy`.
- **Render:** deploy from your fork with `render.yaml`.
- Nothing runs on the author's accounts. The Docker image was not built in the session that added these files; build it once and open the page before relying on it.

**No warranty.** Free and as-is; not tax advice. Verify against HMRC's RDR3 guidance. See `VENTURE.yaml`.
