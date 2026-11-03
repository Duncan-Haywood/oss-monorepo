# Security and privacy programme

The owner asked on 2026-11-03 to build the portfolio "as close as possible to
SOC 2 specs" and "compliant with relevant security and privacy laws". This
folder is that programme.

**What it is not.** SOC 2 is an attestation report a licensed CPA firm
issues after testing controls (Type I: at a date; Type II: over a period,
usually 3 to 12 months). Nobody can self-certify. Until an auditor issues a
report, nothing the portfolio publishes may say "SOC 2 compliant" or
"SOC 2 certified"; "controls designed to the SOC 2 Trust Services Criteria,
self-assessed" is the accurate phrase.

## Where things are

| Piece | File |
|---|---|
| Control register (every control, its criteria, answer, evidence and gap) | [`soc2/controls.yaml`](soc2/controls.yaml) |
| Checker and score | `python3 platform/ci/soc2_controls.py` (uses `ventures/soc2-readiness-checker`, the portfolio's own public tool) |
| Policies | [`policies/`](policies/information-security.md) |
| Risk register | [`soc2/risk-register.md`](soc2/risk-register.md) |
| Vendors | [`soc2/vendors.md`](soc2/vendors.md) |
| Vulnerability reports | [`/SECURITY.md`](../../SECURITY.md) |
| Agent hardening (the control plane) | [`agent-hardening.md`](agent-hardening.md) |
| Privacy law baseline | [`../legal/privacy-baseline.md`](../legal/privacy-baseline.md) |

## Where it stands (2026-11-03)

`python3 platform/ci/soc2_controls.py`, scoped to Security, Availability,
Confidentiality and Privacy: **50.7% ready** on the checker's weighting,
across 32 applicable controls (7 done, 18 partial, 7 not started) and 6 not
applicable (no employees, no servers, no customer contracts). About 34
person-days of work remain. Processing Integrity is out of scope: the
products are calculators with published assumptions, not transaction
processors.

### What only the owner can do (the biggest gains first)

1. **Confirm MFA and a password manager** on GitHub, Cloudflare, npm, PyPI
   and the owner's own email, and fill the table in
   [`policies/access-control.md`](policies/access-control.md). Closes
   `ac-mfa` and `ac-passwords`.
2. **Finish [`agent-hardening.md`](agent-hardening.md)'s owner checklist**:
   separate agent identities, apply the ruleset, move secrets into
   Environments, turn on secret scanning push protection. Moves `ac-least`,
   `hr-offboard`, `cm-separation`, `dt-secrets`.
3. **Turn on private vulnerability reporting** (Settings → Code security), so
   `SECURITY.md`'s reporting link works.
4. **Approve the policies** by reviewing this folder and adding the first
   row to the yearly review table in
   [`policies/information-security.md`](policies/information-security.md).
5. **Download Cloudflare's and GitHub's SOC 2 reports** (both need an
   account) and note them in [`soc2/vendors.md`](soc2/vendors.md).
6. **Decide** on an independent penetration test and, eventually, an
   auditor. Both cost money. A Type I needs no observation window; a
   Type II needs the controls running for the whole window first.

### What agents do

- Keep `controls.yaml` true: when a gap closes, change the answer and add
  the evidence path in the same PR. The checker fails if evidence goes
  missing.
- Run the yearly tabletop (`policies/incident-response.md`), the restore
  test (`policies/business-continuity.md`) and the GitHub half of the
  quarterly access review (`policies/access-control.md`).
- Add a `.github/dependabot.yml` and wire `soc2_controls.py` into CI. Both
  are control-plane changes, so they go in their own small PR for the owner.

## Privacy law: what changed on 2026-11-03

The one gap with legal weight was the new support inbox
(`platform/edge/inbox.mjs`): it stored every email with no limit, and the
site's privacy copy did not mention it. GDPR's storage-limitation principle
(art. 5(1)(e)) and its notice duty (art. 13) both needed fixing. The inbox
now deletes mail after 90 days in code, offers a token-gated erasure route,
and the footer on every page says so, with the reader's rights.
