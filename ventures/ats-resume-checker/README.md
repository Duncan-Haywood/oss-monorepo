# ATS Resume Checker

A free tool that runs the "copy-paste test" career coaches already
recommend by hand: copy the text out of your resume file, paste it here,
and see the specific, well-documented formatting problems that break
applicant-tracking-system (ATS) parsing — icon-font bullet characters,
corrupted text, missing standard section headings, buried or missing
contact info, missing dates, and signs of a collapsed multi-column layout.
Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ats-resume-checker/

After using this, you can now **see exactly which formatting artifacts
would break an ATS parser reading your resume, in one paste**, which used
to take manually eyeballing a text dump or paying for an account-gated
scanner that uploads your resume to someone else's server.

## Wording suggestions on your own AI key (optional)

After the posting match, a box offers wording changes. With no key it names,
for each missing term, the resume line closest to how the posting uses it,
and says to add the term only if it is true. With your own key (Anthropic,
OpenAI, Gemini, or any OpenAI-compatible endpoint, via
`platform/llm/byok.mjs`) a model rewrites up to five of your existing lines;
the page flags any number in a suggestion that your resume does not contain.
The key is never stored; the only request the page can make goes to the
provider you pick. Engine: `tailor.mjs` (tests: `tailor.test.mjs`).

## Why this exists

An applicant tracking system extracts a resume's text mechanically — the
same way a plain "select all, copy" does — before any human ever opens it.
A resume built with a visually polished template (icon-font bullets,
multi-column layout, a header with your contact info) can look perfect on
screen and extract as a scrambled or incomplete mess, and the candidate
never finds out why they stopped hearing back.

The existing tools in this space (Jobscan, ResyMatch, Rezi, TopResume,
VMock, and others) mostly require an account, often a paid tier or
credits, and usually a server-side upload of the resume's content to match
it against a job description. This does the two checks that need no server:
the format check, and a plain-wording keyword match against one posting you
paste — with nothing to sign up for and nothing sent anywhere.

## Try it

Open [`index.html`](index.html), paste the text copied out of your resume
file (never retyped — that defeats the test), and click **Check my
resume**. See [`what-is-the-ats-copy-paste-test.html`](what-is-the-ats-copy-paste-test.html)
for why the technique works and what it can't tell you, or
[`vs-jobscan.html`](vs-jobscan.html) for how this differs from a
keyword-matching scanner like Jobscan.

## Keyword match against a job posting

[`match.mjs`](match.mjs) (`matchPosting(resume, posting)`) reads one posting and
reports which of its skills and phrases the resume covers and which it never
mentions, most important first. How it works, so you can judge it:

- Terms are words and 2-3 word phrases compared on a light stem, so
  `dashboards` matches `dashboard`. A small alias list treats `k8s` as
  `kubernetes`, `js` as `javascript`, `ML` as `machine learning`, and so on.
- A term weighs more when the posting repeats it, puts it in the title or a
  requirements section, or says *required / proficient / must*; it weighs less
  under "nice to have". Known hard skills count double, soft skills half.
  Boilerplate ("team", "ability to") is dropped.
- The headline percentage is the weighted share of terms the resume covers. It
  is this tool's own figure, **not** an ATS score and not a prediction.
- Years-of-experience and degree requirements are reported separately, since
  they are not keywords you can add.

Limits: no semantic matching beyond the alias list (`inventory counts` does not
match `inventory management`), English only, and the skill lists are small and
tilted to software, analytics, finance and operations. Every "missing" term is
a prompt to check whether you have that experience and say so truthfully, not
an instruction to paste words in. Tests use invented postings and resumes.

## What it checks

All in [`checker.mjs`](checker.mjs), one pure function (`analyze`) with no
dependencies:

| Finding | Severity | Why it matters |
|---|---|---|
| Very little text pasted | high | Content likely trapped in an image, text box, or table that didn't copy as text |
| Icon-font (private-use-area) characters | high | Decorative bullet/icon fonts that paste as unreadable characters — and parse the same way in an ATS |
| Unicode replacement character (`�`) | high | Proof a prior extraction step (a bad PDF export, an OCR pass) already lost information |
| No email or phone found anywhere | high | Contact info likely lives somewhere a parser skips |
| No standard section heading recognized | medium | Parsers key off headings like "Experience," "Education," "Skills" |
| Contact info found only deep in the text | medium | Common symptom of a header/footer/sidebar that collapses out of position |
| No recognizable year | medium | Timeline parsers key off dates |
| Repeated mid-line whitespace gaps | low | Common artifact of a multi-column or table layout flattening to one line |

Every finding is evidence, never a verdict: it names what pattern was
found and why it matters, and never claims the resume will or won't pass
any specific employer's system.

## Disclaimers

This is not career, legal, or any other professional advice, and it is not
a guarantee about any specific applicant tracking system — ATS products
differ in how they extract and score text, and this tool only reads the
text you paste. Verify its output before relying on it, the same as any
free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy

Everything runs in your browser. The text you paste is **never uploaded**
— there is no server component at all. Anonymous feature events
(`check_run`, `example_loaded`) are counted in `localStorage` only, never
transmitted, never tied to your resume's content. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test checker.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checker logic and
its 17-case test suite are done and exercised against both clean and
artifact-laden example resumes; no external user contact has happened yet
— see `kill_criteria` in `VENTURE.yaml`.
