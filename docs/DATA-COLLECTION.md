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
| Which option was picked, when it was shown, how long it took | Every swipe | `Trial`, `FinancialTrial` | The person. A linked partner sees **aggregate comparisons only** |
| Fitted ratings and model coefficients | Derived from the above | `ParticipantItemRating`, `SurveyFit` | Same as answers |
| Bug reports and ideas, optionally with an email | Feedback widget | `UserReport` | The admin portal |
| IP address | Every write to an anonymous route, and every sign-in attempt | `AnonRequestLog`, `LoginAttempt` | Nobody; used only for rate limiting |
| Invite code linking two accounts | Couple screen | `Couple` | Both partners |

## Not collected

Age, sex, ethnicity, country, last name, and any email attached to an
anonymous session. There is no form for any of them and `POST
/api/session/start` rejects them if sent —
`src/app/api/session/start/route.test.ts` is the check that keeps that true.

No third-party analytics, no advertising trackers, and one cookie: the
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
