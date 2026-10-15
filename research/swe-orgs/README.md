# Which engineering-organisation practices could help an agent loop? A cited catalogue, first batch (preliminary)

Pure Python standard library. Milestone 7 (`swe-orgs`) of track 10, the software-engineering loop, in `PROJECTS.md`, a standing milestone: **this is the first batch of sources, not the finished catalogue.** Produced with AI assistance (Claude). All numbers below come from `experiments/results.txt`, and the sources and practices are the two CSV files in `data/`. No lab's work is built on and no company or author is affiliated with or endorses this project.

## Question

Companies that ship software have written down how they review, release, organise teams and handle reliability. Which of those practices map onto this repository's loop (`prompt.md`, CI, review, landing), which assumptions behind them do not hold for a fleet of agent sessions, and does the run ledger show a failure big enough to be worth a change?

## Method

- `data/sources.csv`: 12 sources, with the year, a link, and a `checked` field that says exactly what was and was not verified. Verification this run was by web search for authors, venue, year, pages and DOI; Crossref and arXiv were unreachable from the container, and no paper was read in full. Five sources (Singer, Graham, Beyer et al., Spotify, Tricorder) are marked as only partly checked, and `Accelerate` is taken from `PROJECTS.md`.
- `data/practices.csv`: 12 practices, one row each, with the source, company stage, evidence type, what it claims to improve, the loop element it maps to, the failure class it targets, whether it transfers to agents (`yes`, `partial`, `no`), its status here, and the assumption that does not carry over.
- `experiments/run.py` reads `prompts/runs.jsonl` (265 rows), counts the rows whose self-reported `errors` text matches a keyword class (coordination, unlanded work, unverified claims, tooling, rework, duplicate work), and sets each practice's **ceiling** to the share of runs that reported its target class. Priority is ceiling times a transfer weight (1, 0.5, 0). A ceiling bounds what removing a failure could save; it is not a forecast of a gain.
- `tests/` checks that every practice cites a known source, evidence and transfer values are from the allowed sets, and that the scoring and Wilson interval behave.

## Results

- **Evidence is thin.** Of 12 practices, 2 rest on measurement (Google's review log of about 9 million changes; the DORA survey in Accelerate), 1 on a survey and interviews, 4 on case studies, 2 on practitioner accounts or books, and 3 on opinion, a framework or a description of a structure. Spotify's squad model (2012) comes with no outcome data at all.
- **Few practices transfer cleanly.** 5 transfer as `yes`, 6 as `partial`, 1 as `no` (doing things that do not scale, which assumes scarce founder time). Most of the assumptions that fail are about people: knowledge transfer, headcount, co-location, on-call, reviewer latency and satisfaction.
- **The ledger shows small failure classes.** Of 265 runs, 103 reported any error. By class: tooling 6.0% (Wilson 3.8 to 9.6%), duplicate work 5.7% (3.5 to 9.1%), coordination 3.4%, unlanded work 3.0%, rework 3.0%, unverified claims 1.9%. These are keyword matches over free text that each run wrote about itself, so they undercount, overlap, and say nothing about silent failures.
- **No new proposal.** With the rule "transfers as yes, not already adopted, ceiling at least 5%" the list is empty. Practices that transfer as yes and rank highest (continuous small batches, a circuit breaker on scope) are already in `prompt.md`; the unadopted ones (static checks on citations and numbers, an integrity budget gating promotion) have ceilings under 2%, though that class is the most likely to be undercounted because it is about what no one noticed. This is a negative result, not evidence that the practices are useless.

![Share of runs reporting each failure class](experiments/failure_classes.svg)

## Limitations

The catalogue has 12 rows, mostly from Google, Microsoft and Facebook; early-stage and non-US sources are underrepresented (Basecamp and a seed-stage essay are the only small-company sources), and none comes from a postmortem or investor writing. The 5% cutoff is arbitrary. The keyword classes were written by the author before the counts and not validated against a hand-labelled sample. Ceilings use self-reported errors and ignore the cost of each failure, so a rare, expensive failure is under-ranked. Evidence labels follow the author's reading of search summaries, not of the papers.

## Next steps

Add sources by stage: seed to Series B first (founder essays, YC writing, small-team postmortems), then growth-stage and large organisations in other sectors and countries; read the papers in full and re-check each citation once Crossref is reachable; hand-label a sample of ledger errors to validate the keyword classes and weight failures by tokens lost, once the ledger records tokens; re-score after `swe-audit` has a defect rate; and send any practice that clears the bar through `prompt.md`'s experiment process.

## Owner steps

None.

## Builds on

The sources in `data/sources.csv`, each cited there with a link. Wilson (1927), "Probable inference, the law of succession, and statistical inference", *JASA* 22(158): 209&ndash;212, for the interval.

## Outside dependencies

None; the container could not fetch the sources themselves, so they are not vendored.
