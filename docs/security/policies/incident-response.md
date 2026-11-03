# Incident response plan

Status: draft, 2026-11-03. Review yearly and after every Sev 1. SOC 2:
CC7.3, CC7.4, CC7.5, CC2.3; privacy P6.6.

An incident is anything that has, or may have, broken the confidentiality,
integrity or availability of the portfolio's systems or the data in them: a
leaked secret, an account taken over, a malicious merge, a defaced page,
personal data exposed, the site down.

## Roles

| Role | Who |
|---|---|
| Incident lead | The owner. An agent that finds an incident leads until the owner answers, and does only the containment steps below |
| Responders | Agent sessions the lead asks to help |
| Notifier | The owner (regulators and affected people are told in the owner's name, never by an unattended job) |

## Severity

| Sev | Meaning | Examples | Owner told |
|---|---|---|---|
| 1 | Personal data or a secret exposed, an account or the merge gate compromised, malicious code published | Token in a public log; inbox read by a stranger; a tampered npm release | At once, in the agent's reply and a file |
| 2 | Security control broken with no known exposure | Ruleset bypassed; a check silently disabled; a third-party action pinned to a hijacked tag | Same day |
| 3 | Availability or minor issue | Site down; a Worker over its free quota | In the next run record |

## Steps

1. **Contain** (anyone, at once): revoke or rotate the exposed secret; pause
   the affected workflow with its `vars.*_ENABLED` switch; take a page down by
   reverting the PR that added it. Agents may do these without asking; they
   are reversible. Do not delete evidence, and do not rewrite public history
   to hide a secret (it is already copied; rotate it instead).
2. **Record**: open `docs/history/<date>-incident-<slug>.md` with a timeline.
   For Sev 1 involving personal data, keep the personal details out of it
   (the repository is public): describe categories and counts only.
3. **Assess personal data** (owner): was personal data involved; whose
   (country matters); is there a risk to them?
4. **Notify** (owner), when the law requires it:
   - **GDPR / UK GDPR**: the lead supervisory authority within **72 hours** of
     becoming aware, unless the breach is unlikely to risk people's rights
     (art. 33); the people affected without undue delay when the risk is high
     (art. 34). Record every breach, notified or not (art. 33(5)) in the
     incident file.
   - **US states**: each state's breach law, triggered by specific data
     (names with SSNs, account credentials, and similar). The portfolio does
     not hold those data types today, so this is unlikely to trigger; check
     the state's law if it ever might.
   - **Platforms**: tell npm, PyPI or GitHub if a published package was
     tampered with, so they can pull it.
5. **Recover**: fix, redeploy from `main`, confirm with the checks.
6. **Review** within two weeks: what happened, why the controls did not stop
   it, what changes. The review is the evidence for `ir-exercise`.

## Notice template (people affected)

> Subject: A security incident affecting your message to marisstella.app
>
> On [date] we found that [what happened]. It affected [what data: e.g. the
> text and sender address of emails sent to support@marisstella.app between
> X and Y]. It did not affect [what was not involved]. We have [what was done].
> You may want to [practical step, if any]. You can ask what we hold about
> you, or have it deleted, by replying to this email, and you can complain
> to your data-protection authority. [Owner's name], marisstella.app

## Tabletop exercise

Once a year, an agent walks one scenario (start with "the `INBOX_TOKEN` was
pasted into a public PR") through these steps, notes what was unclear, and
fixes this file. Record it below.

| Date | Scenario | Run by | Changes made |
|---|---|---|---|
| | | | |
