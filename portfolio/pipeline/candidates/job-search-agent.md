# Candidate: Job search agent

**One line.** One extensive intake interview, then software does the
repetitive part of a job search on the person's behalf: triage postings in
bulk, fill applications, prepare interviews, draft the negotiation.

**Verdict: graduated 2026-10-16** to [`ventures/job-search-agent`](../../../ventures/job-search-agent/)
at the owner's request. First slice is a static, browser-only page with
optional AI on the user's own key.

Composite 7.0 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 7 | Open-ended answers, cover letters and story selection are model work; the form filling, triage and counter arithmetic are deterministic and carry the product without a key |
| Autonomous ops | 9 | Static page, no server, no accounts |
| Time to revenue | 6 | Read as time to first user: "auto apply jobs" and "AI job application" are heavily searched, and job seekers try tools quickly |
| Gross margin | 10 | Zero marginal cost; AI runs on the user's key |
| Defensibility | 4 | Crowded with paid auto-apply services. Mitigation: free, local, honest about scope, and one hop from three sibling job tools; the profile-plus-guard design is the difference, not a moat |
| Distribution | 7 | Established searches plus r/jobs, r/cscareerquestions, r/resumes; a browser-extension store listing is a natural later channel (`portfolio/distribution/`) |
| Liability containment | 6 | The person reviews and sends every answer; `checkDraft` flags numbers and employers the profile lacks |
| Ethical robustness | 5 → 7 with the scope below | The request as stated includes two things that fail this gate; the scope removes them |

## Scope decision: what "on someone's behalf" means here

The owner's brief: *bulk apply and go through interviews on someone's
behalf; one extensive interview to gather info, then an AI fills out
applications, takes interviews, negotiates, etc. automatically.*

Built as asked:

- **One extensive interview** — about 60 questions in nine sections.
- **AI fills out applications** — about 40 question types from the profile,
  open-ended answers drafted by the model under a fabrication check.
- **Bulk** — paste any number of postings; each is ranked with reasons, and
  one click carries a posting into the application filler.
- **Negotiates** — a counter number and the email, using the floor and
  target from the interview without ever revealing the floor.

Changed, and why:

- **"Takes interviews" became interview preparation.** An AI answering a
  live interview while presented as the candidate deceives the employer
  about who they are hiring, and the gap shows on day one. It would put the
  ethics gate below 5. What ships instead: likely questions mapped to the
  person's own stories, with gaps flagged.
- **"Automatically" stops before Submit.** LinkedIn's and Indeed's terms
  forbid automated applying, and the repo rule is never to break a
  platform's terms (`CLAUDE.md`, distribution direction). An unreviewed
  application can also misstate the person's work authorization or
  experience, which can void an offer. The human presses Submit.

## Roadmap (next slices, in order)

1. **Browser extension that fills ATS forms in place** (Greenhouse, Lever,
   Ashby, Workday, SmartRecruiters) from the same profile JSON, field by
   field, with the person pressing Submit. Public ATS application pages are
   the employer's own forms, so filling them in the user's own browser is
   the user acting, not a bot. This is where most of the time saving is.
2. **Resume and cover letter tailoring** per posting, under the same
   `checkDraft` guard; hand-off to `ats-resume-checker` for the format check.
3. **Push sent applications into `job-application-tracker`** (shared JSON),
   so follow-ups and reply rates by source come for free.
4. **Disclosed negotiation agent**: drafts each reply in an email thread with
   the recruiter, the person approves each send. Any message the agent sends
   itself is signed as assisted, never as the person typing.
5. **Mock interview** on the user's key: the model plays the interviewer
   from the job description and scores answers against the person's stories.

## First experiment

14 days, $0: publish the page, and see whether anyone completes the
interview and fills three applications (local `answers_filled` counts are
opt-in and on-device; engagement is read from issues, stars and mentions
until a visitor count exists).
