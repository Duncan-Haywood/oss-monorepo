# Construction Daily Log Evidence Pack

A free, browser-local construction daily log and change-order documentation tool for small contractors. Record observable work, site conditions, crew, delays, and scope changes, then download a dated JSON evidence pack before details disappear into texts and memory.

**After using this, you can now** hand a project manager or customer a dated record of what was entered and what still needs review, **which used to take** reconstructing a site day from scattered messages.

## Run it

Open [`index.html`](index.html), or run `python3 -m http.server 8080` in this directory and visit `http://localhost:8080/`. No account, build step, API key, or paid dependency is required.

The tool is intentionally evidence-only. It does not certify work, determine entitlement, file a claim, or promise payment. JSON exports are records of what the user entered and should be backed up by the user.

## Opportunity and differentiation

The target user is a small general contractor or subcontractor searching for a construction daily log template or change-order documentation workflow. The painful alternative is a lost or disputed record assembled after the fact. Project-management suites provide broader workflows but require accounts, setup, and recurring cost; this tool is a fast private capture-and-export path. It can later support optional customer-supplied AI for summarization without making inference a dependency.

## Privacy and usage

Everything runs in the browser. Project data is never uploaded and there is no account, cookie, IP collection, or analytics vendor. Local counting is opt-in and records only aggregate event names (`daily_log_created`, `evidence_pack_downloaded`, `summary_copied`), never the log contents. Do Not Track and Global Privacy Control disable counting automatically.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## License

MIT. See [`LICENSE`](LICENSE).
