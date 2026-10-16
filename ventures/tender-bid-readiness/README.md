# Tender Bid Readiness Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tender-bid-readiness/>

**Before you spend hours assembling a public-contract bid, find the requirements you still need to verify.** Paste a solicitation into the browser tool and it highlights common signals for deadlines, bonds, insurance, licenses, questions, addenda, and submission channels.

This is a local-first, deterministic checklist, not a tender monitor or bid-writing service. It does not fetch public portals, upload text, decide eligibility, or submit anything. It is distinct from the portfolio's bid calculators: those price work after a contractor decides to pursue it; this helps with the earlier go/no-go paperwork decision.

## Run it

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. Paste the notice and select **Check readiness**. Every finding retains a short evidence excerpt so you can return to the source and verify it.

The checker is intentionally heuristic. Read the original tender, every attachment, and every addendum. A missing phrase is not proof that a requirement is absent, and a found phrase is not proof that your business qualifies.

## Privacy and usage

Everything runs in your browser. Tender text is never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendors. The optional counter stores only aggregate feature counts in local storage, honors DNT/GPC, and is disabled with **count local usage**. No text, IP, user agent, or identifier is collected.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licensed. Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Public publishing remains separate from this repository build.
