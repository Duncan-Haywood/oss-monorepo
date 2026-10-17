# Security Questionnaire Answer Matcher

**Paste a customer's security questionnaire and your past answers; get the filled sheet.** Each question is matched to your closest saved answer with a confidence level. Matches that could be wrong (a different number of hours, a flipped yes/no) are flagged, and questions with no saved answer are listed by topic so you know what to write once.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/security-questionnaire-matcher/

After using this, you can answer most of a 150-row vendor security questionnaire by reviewing reused answers, which used to mean retyping the same encryption, MFA and incident-response answers into every customer's spreadsheet.

First visitor: a SaaS founder or security lead at a small company selling to larger buyers. Compliance-automation platforms (Vanta, Drata, Conveyor and similar) bundle questionnaire answering into per-seat or per-year contracts; this is the free, private, library-in-a-CSV version.

## Run it

Browser: open `index.html` (or serve this directory with `python3 -m http.server`), paste the library and the questionnaire, press **Match answers**, download the CSV.

Command line, no dependencies, Node 18+:

```
node cli.mjs questions.csv --library answers.csv > filled.csv
node cli.mjs questions.txt --library answers.csv --format md
```

Library format: a CSV with `question,answer` columns (optional `tags`). Questionnaire: one question per line, or a CSV with a `Question` column (and optional `ID`).

Tests: `node --test`.

## How it matches

Questions and saved questions are normalised (MFA, 2FA and multi-factor fold to one term; so do pen test / penetration test, staff / employees, notify / tell us), stop words are dropped, and each saved question is scored by TF-IDF cosine similarity. Scores of 0.62 and above are Strong, 0.34 to 0.62 Review, below that No match. A strong match is downgraded to Review when the figures differ from the saved answer or one question is negated and the other is not. Repeated questions in one sheet are flagged. Every exported row has status Review or Write answer; nothing is marked done.

## What it does not do

It writes no new answers, judges no answer true, and makes no compliance claim. It is a heuristic over wording. Whether an answer is current, in scope and safe to promise is yours to decide.

## Roadmap (not built)

XLSX and portal import, a team library with owners and review dates, and an optional model pass behind your own API key to draft answers for gaps from your policies. This repository ships none of these and no payment code.

## Privacy and usage

Everything runs in your browser or on your machine. The questionnaire and library are never uploaded; there are no accounts, cookies or analytics vendors. The library is stored in your browser only if you press Save library on this device. The optional counter stores aggregate feature counts in your own browser storage, honors Do Not Track and Global Privacy Control, and can be switched off on the page.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, security or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licensed. Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
