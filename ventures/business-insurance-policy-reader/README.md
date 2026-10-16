# Business Insurance Policy Reader

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/business-insurance-policy-reader/>

Free, private browser tool: paste a general liability, professional liability or BOP policy (declarations page and wording) and get the limits, deductible, premium and claims-made or occurrence trigger with the sentence each came from, a pass or fail against the limits your client contract requires, a renewal calendar (downloads as `.ics` with a 14-day alarm, including the tail-coverage deadline on claims-made policies), and the questions to put to your broker: defense costs inside the limit, professional services, subcontractor, contractual liability and other exclusions, actual cash value, coinsurance and waiting periods.

Open `index.html`. Tests: `node --test 'ventures/business-insurance-policy-reader/**/*.test.mjs'`.

Not insurance, legal or coverage advice. It reads wording with fixed rules, can miss or mis-read terms, and does not decide what a claim would pay. See `VENTURE.yaml`.
