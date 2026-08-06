# What this app knows about a person

Quick pick asks two people to tell it things they would not say out loud to
each other. Goal 5 is that it should be *safe to hand to someone you love*.
That is only checkable if there is one place saying exactly what is stored,
so this is that place.

**Rule: a change to what is collected edits this file, the privacy policy,
and the copy next to the field, in the same commit.** All three or none. The
reason for the rule is at the bottom — it has already been broken once.

## Collected

| What | Where it is entered | Where it is stored | Who can see it |
| --- | --- | --- | --- |
| Email, first name, password | Signup form (`AuthView`) | `User.email`, `User.firstName`, `User.passwordHash` (bcrypt) | The person, and the admin portal |
| First name for a session | Nothing — set from the account name, or the literal `"Anonymous"` | `Participant.firstName` | The person, and the admin portal |
| Which option was picked, when it was shown, browser-observed decision time, and whether it was chosen by swipe, card tap, button, or tie | Every comparison | `Trial`, `FinancialTrial` | The person and admin analysis. A linked partner sees **aggregate comparisons only** |
| Fitted ratings and model coefficients | Derived from the above | `ParticipantItemRating`, `SurveyFit` | Same as answers |
| Bugs, confusing experiences, questionable content, ideas, impact, current mode, and optionally an email | Feedback widget | `UserReport` | The admin portal |
| Was an insight useful, why it missed, was swiping enjoyable, optional free text, current mode, page, answer count, a retry-safe random feedback id, and the same one-way browser-session digest used by usage events | Feedback widget, after an insight and periodically | `InsightFeedback` | The admin portal |
| Browser user-agent and the page it was sent from | Attached to a bug report | `UserReport.userAgent`, `UserReport.path` | The admin portal |
| Keyed IP digest | Every write to an anonymous route, and every sign-in attempt | `AnonRequestLog`, `LoginAttempt`, `AdminLoginAttempt` for at most 30 days (anonymous-write events are retained for at most 24 hours) | Nobody; used only for rate limiting. The raw IP is not stored |
| First-party usage event (including when a feedback prompt is shown or skipped, when insights are reached, when an insight or invite is shared, and when an invite is created or entered), page, self/partner mode, topic or feedback subject, operation duration, success/failure, HTTP status when available, event order, and client-observed time | Automatically while navigating and using core survey actions | `UsageEvent`, linked to a random browser-session digest and retained for at most 30 days | Admin analysis only |
| Invite code linking two accounts | Couple screen | `Couple` | Both partners |

## Not collected

Age, sex, ethnicity, country, last name, and any email attached to an
anonymous session. There is no form for any of them and `POST
/api/session/start` rejects them if sent —
`src/app/api/session/start/route.test.ts` is the check that keeps that true.

No third-party analytics or advertising trackers. Usage collection accepts only
a fixed event vocabulary and bounded operational fields—never arbitrary page
content, card answers, free text, email, or a raw browser-session identifier.
Pending events are kept only in browser session storage until acknowledged;
client-generated event ids make network retries idempotent.
Structured feedback uses the same pattern, so a retry cannot create a second
rating and can be joined to the session funnel without storing the raw random
session key.
There is one cookie: the
sign-in session.

## The columns that still exist

`Participant` still has `lastName`, `email`, `sex`, `age`, `ethnicity` and
`countryOfResidence`. Nothing writes them and nothing reads them outside the
admin export. They are kept because deleting a column deletes whatever is in
it, and if anything was ever entered on the old intro form, that deletion is
the account owner's decision to make, not a migration's side effect.

Two things would close this out, in either order:

1. Check whether any row has a non-null value in any of the six columns.
2. If not, drop them and remove them from the admin export. If so, decide
   what the person who entered them would want, then drop them.

## What a partner can see

This is the promise most worth not breaking, because the app's sharpest
output is built from the thing people would least like leaked.

A linked partner sees: how closely two rankings correlate, which items align
or diverge most, and where one person is wrong about what the other wants.
A linked partner never sees: an individual pick, a response time, or anything
in the account.

The boundary is `src/lib/couples.ts`. Anything added there that returns a
single answer rather than an aggregate breaks the promise, and no test will
catch it for you — it is a review question.

## Why this file exists

The intro form used to collect name, email, sex, age, ethnicity and country.
It was deleted, correctly, in the branch consolidation. What did not happen
is the rest of it: the privacy policy went on describing the fields as
"optional profile details you choose to enter" and explaining how ethnicity
and sex were handled, for a form nobody could reach. `POST
/api/session/start` went on parsing all six and writing them to the database
— an unauthenticated endpoint that accepted special-category data, serving no
screen at all.

Nothing was leaked, because nothing was sent. But the app's public statement
about its own data handling was wrong for as long as it took someone to check
it against the code, and the only reason it was checked is that a session
happened to look. That is the failure this file is a fix for: the definition
of done already said "every document the change made wrong is corrected in
the same commit", and a policy page is easy not to think of as one of the
documents. It is the most important one.

## The second time, which this file did not prevent

`InsightFeedback` — a subject, two 1–5 ratings, and up to a thousand
characters of free text — was missing from the table above from the day this
document was written until the day the admin portal got its first test. So
were the user-agent and page path attached to every bug report.

That is the same failure as the one above, at one remove: this file was
written to be the single place that says what is stored, and it was incomplete
on arrival, because it was assembled by reading the *screens* rather than the
schema. A screen shows the fields someone fills in. It does not show what the
handler attaches on the way past, which is exactly where a user-agent string
comes from.

**So the check is against `prisma/schema.prisma`, not against the UI.** Every
model that holds something a person typed, or something their browser
disclosed, needs a row here. Reading the forms will miss the same category of
field a second time.

## The third time, and it points the other way

2026-08-06. Seven of the twenty-one names in the usage vocabulary
(`src/lib/usage.ts`) had no caller anywhere in the application, so the row
above described collection that had never once happened: reaching insights,
sharing an insight, sharing a card, creating an invite, joining one. The
schema check this file ends on does not catch that. `UsageEvent.event` is a
string, and the schema cannot say which of its values are ever written.

This one favoured the reader — less was collected than described — which is
why it survived. But it is the same defect as an undisclosed field with the
sign flipped, and it cost more elsewhere: the operator dashboard drew a funnel
step and a median that were structurally zero, and the referral loop this
venture's couples tier depends on had no denominator at all.

**So the check has a second half: for the vocabulary, against the emitters.**
`src/lib/usageVocabulary.test.ts` fails when a declared event has no caller
and no registered reason, when a registration outlives the situation that
justified it, and when the dashboard displays a step nothing can populate.
