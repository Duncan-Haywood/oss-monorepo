# Job search agent

**Answer one long interview. Then stop typing the same answers into every
application.** Free, MIT, runs entirely in the browser.

1. **Intake interview** — about 60 questions in nine sections: basics,
   eligibility (work authorization, sponsorship, notice), what you want and
   will not accept, pay (walk-away and target), experience and skills with
   years, education, interview stories tagged by theme, voluntary
   self-identification (defaults to declining), references. Saved locally;
   download/upload as JSON.
2. **Triage postings in bulk** — paste any number of job descriptions
   separated by `---`. Each gets apply / maybe / skip, a 0-100 fit score, and
   the reasons: target title, skill overlap, must-haves, and hard blockers
   (a deal-breaker word, pay entirely below your walk-away, "no
   sponsorship" when you need it, not remote when you need remote).
3. **Fill an application** — paste the form's questions; about 40 common
   question types (names, contact, work authorization, sponsorship, years
   with a named skill, salary in the style you chose, start date,
   relocation, remote/hybrid, EEO, "how did you hear") are answered from the
   profile. A skill you did not list is never guessed. Open-ended questions
   ("why us?") go to the AI drafter.
4. **AI drafting, optional, your own key** — via the shared
   [`platform/llm/byok.mjs`](../../platform/llm/README.md) (Anthropic,
   OpenAI, Gemini, any OpenAI-compatible endpoint). The prompt carries
   profile facts only, never contact details, self-ID or the walk-away
   number. `checkDraft` flags every number and employer name in a draft that
   is not in the profile or the job text.
5. **Interview prep** — common behavioural questions, each paired with the
   story whose tags fit (spread so one story is not reused everywhere), plus
   questions about each of your skills the job mentions, and the gaps.
6. **Negotiate** — a single counter number (about 12% above the offer and at
   least your target; your target when the offer is below your walk-away)
   and the email asking for it, with your next priorities as the fallback.
   The walk-away number is never written into the email.

## What it deliberately does not do

- **Submit applications.** You paste and press submit. LinkedIn, Indeed and
  most boards forbid automated applying in their terms, and an unreviewed
  application can say something untrue in your name. A browser extension
  that fills ATS forms (Greenhouse, Lever, Ashby, Workday) from the same
  profile, with the person pressing Submit, is the next step; see the
  candidate write-up.
- **Take interviews as you.** Software posing as the candidate in a live
  interview misleads the employer. It prepares you instead.

## Run

Open `index.html` from any static server (`python3 -m http.server`), or use
the published page. Tests: `node --test 'ventures/job-search-agent/**/*.test.mjs'`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not career, legal, immigration or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for the truth of everything you submit. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

## Usage counting

Anonymous feature counts (`interview_saved`, `triage_run`, `answers_filled`,
`ai_draft`, `prep_built`, `negotiation_planned`, `example_loaded`) are kept
only in the visitor's local storage, honour Do Not Track and Global Privacy
Control, and can be turned off from the footer. See
[`portfolio/usage/`](../../portfolio/usage/README.md).
