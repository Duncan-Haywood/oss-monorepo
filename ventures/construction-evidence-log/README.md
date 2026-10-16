# Construction Daily Log Evidence Pack

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/construction-evidence-log/>

A free, browser-local construction daily log and change-order documentation tool for small contractors. Record observable work, site conditions, crew, delays, and scope changes, then download a dated JSON evidence pack before details disappear into texts and memory. Each entry is saved in your browser, so at the end of a job you can pull one combined, multi-day pack instead of hunting down a week of separate downloads.

**After using this, you can now** hand a project manager or customer a dated record spanning the whole job — every day, in order, with review notes carried through — **which used to take** reconstructing a site day from scattered messages, one download at a time, with nothing tying the days together.

## Run it

Open [`index.html`](index.html), or run `python3 -m http.server 8080` in this directory and visit `http://localhost:8080/`. No account, build step, API key, or paid dependency is required.

The tool is intentionally evidence-only. It does not certify work, determine entitlement, file a claim, or promise payment. JSON exports are records of what the user entered and should be backed up by the user.

## Opportunity and differentiation

The target user is a small general contractor or subcontractor searching for a construction daily log template or change-order documentation workflow. The painful alternative is a lost or disputed record assembled after the fact. Project-management suites provide broader workflows but require accounts, setup, and recurring cost; this tool is a fast private capture-and-export path. It can later support optional customer-supplied AI for summarization without making inference a dependency.

## Layout

| File | What it holds |
|---|---|
| `record.mjs` | Per-day record building, review-note findings, and `buildEvidencePack` / `packSummary`, which combine several saved days into one dated, sorted evidence pack. Imported by the page; unit-tested directly. |
| `record.test.mjs` | Behavioural tests for a single day's record and for combining multiple days into a pack. |
| `app.js` | Page wiring: the form, local persistence of every submitted entry, the saved-entries history list (filterable by project), and the combined-pack / per-entry-delete / clear-all actions. |
| `index.html` | The page markup, disclaimer, privacy notice, and FAQ. |
| `page.test.mjs` | Checks the page and script stay wired together — every id `app.js` looks up exists in the markup, and the FAQ text matches its JSON-LD. |

Run `node --test` in this directory.

## Privacy and usage

Everything runs in the browser. Project data is never uploaded and there is no account, cookie, IP collection, or analytics vendor. Each entry you submit is saved in this browser's local storage — not to any server — so you can build a combined pack across days; delete a single entry or clear everything at any time from the project log history section, or by clearing the browser's site data. Local usage counting is a separate, opt-in signal that records only aggregate event names (`daily_log_created`, `entry_saved`, `entry_deleted`, `all_entries_cleared`, `combined_pack_downloaded`, `evidence_pack_downloaded`, `summary_copied`), never the log contents. Do Not Track and Global Privacy Control disable counting automatically.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## License

MIT. See [`LICENSE`](LICENSE).
