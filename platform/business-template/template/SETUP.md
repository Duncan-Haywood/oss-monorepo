# Setup: connect {{BUSINESS_NAME}} to hourly Claude Code runs

About ten minutes, once. After this, runs build and operate the business on
their own and come to you only through [`OWNER.md`](OWNER.md).

## 1. Put this repository on GitHub

```
git init && git add -A && git commit -m "Start {{BUSINESS_NAME}}"
git branch -M main
git remote add origin git@github.com:<you>/{{BUSINESS_SLUG}}.git
git push -u origin main
```

A private repository is the safer default: run records, the pipeline and the
books describe your business. The public website deploys from it either way.

In the repository's settings, allow squash merging and, under branch
protection for `main`, require the `ci` check. Runs merge their own pull
requests once that check passes, so the check is your quality gate.

## 2. Schedule the runs

Pick one. Each option runs the same instruction: **"Read ./prompt.md and
follow it."**

### A. Claude Code on the web (scheduled tasks)

At [claude.ai/code](https://claude.ai/code), connect GitHub and give Claude
access to this repository. Create an environment for it, then a scheduled
task on this repository with the prompt above and an hourly schedule. Create
the same task several times (or at staggered minutes) for more parallel runs:
`ops/route.py` spreads them across functions, and `--skip` stops two runs
from taking the same one. Start with one or two an hour; add more when
`ops/reviews/` shows runs are shipping, not colliding. Documentation:
<https://code.claude.com/docs/en/claude-code-on-the-web>.

Usage counts against your Claude plan. Each run is a full session.

### B. Your own machine (cron)

With [Claude Code](https://code.claude.com/docs) installed and signed in:

```
# crontab -e: every hour at minute 7
7 * * * * cd /path/to/{{BUSINESS_SLUG}} && git pull -q && claude -p "Read ./prompt.md and follow it." >> ops/cron.log 2>&1
```

Runs need permission to edit files, run the scripts and use `git`/`gh`;
configure that in `.claude/settings.json` rather than skipping permission
checks.

### C. GitHub Actions

`.github/workflows/claude-run.yml` runs one session on demand. It needs an
`ANTHROPIC_API_KEY` (paid API usage) or `CLAUDE_CODE_OAUTH_TOKEN` repository
secret. Its hourly schedule ships commented out: uncomment it only once you
have decided what that may spend.

## 3. Answer the intake questions (optional)

The first run opens an issue, "Intake: questions for the owner". Answer what
you can. Anything you skip is filled with the stated default after a day,
marked as an assumption you can change later in [`BUSINESS.md`](BUSINESS.md).

## 4. Check in weekly

Read the newest file in `ops/reviews/` and work through [`OWNER.md`](OWNER.md),
top first. That is the whole job.
