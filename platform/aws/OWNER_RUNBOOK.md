# Owner runbook: see docs/runbooks/aws-cutover.md

The steps only the owner can take to reach the AWS turnover point live in
one place: the **Owner checklist** at the top of
[`docs/runbooks/aws-cutover.md`](../../docs/runbooks/aws-cutover.md). They
cover the account (card and root MFA), billing access and AWS's own spend
limit, the CloudShell bootstrap, GitHub environments and the alert address,
your Identity Center login, Claude Platform on AWS, SES production access,
the DNS move, and retiring Cloudflare. After those, CI applies everything
under `platform/aws/` on each merge, and agents do the rest.

This file exists so the path the AWS tasks named still leads somewhere. Do
not copy steps into it: edit the runbook.

The decision queue carries all of it as one row, `aws-turnover`
(`python3 portfolio/ledger/decision_queue.py`).
