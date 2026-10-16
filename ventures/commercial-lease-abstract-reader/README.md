# Commercial Lease Abstract Reader

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/commercial-lease-abstract-reader/>

Free, private browser tool: paste a commercial lease and get the key terms with the sentence each came from, a deadline calendar (renewal-notice date, rent step-ups; downloads as `.ics`), the year-by-year base-rent schedule, and the clauses to negotiate (personal guaranty, NNN pass-throughs without a cap, holdover rent, relocation, assignment consent, acceleration).

Open `index.html`. Tests: `node --test 'ventures/commercial-lease-abstract-reader/**/*.test.mjs'`.

Not legal advice. It reads wording with fixed rules, can miss or mis-read terms, and does not decide fairness or enforceability. See `VENTURE.yaml`.
