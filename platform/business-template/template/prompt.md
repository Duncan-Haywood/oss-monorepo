# Master prompt

Every scheduled run on this repository follows this file. The scheduled task
says "Read ./prompt.md and follow it." Several runs may start in the same
hour. Each one does one useful piece of work for **{{BUSINESS_NAME}}**, lands it
on `main`, and records what happened. Read [`BUSINESS.md`](BUSINESS.md) (what
the business is) and [`GUARDRAILS.md`](GUARDRAILS.md) (what no run may do)
before anything else. They are short.

## 1. Route

Check open pull requests first. Each run's PR title starts with its function
(`marketing: ...`). Pass `--skip <function>` for every function that already
has an open PR less than three hours old, so parallel runs do not collide.

```
python3 ops/route.py --skip <function> ...
```

It prints the function to work on and its brief in `functions/`. Read that
brief and follow it for the rest of the run. If the message that started the
run names a task, use `--function <name>` instead.

## 2. Do one thing, and land it

- **Ship one finished, useful change**: a page, a feature, a fix, a set of
  books brought up to date, a drafted contract, a researched answer with
  sources. Small and finished beats large and half-done. A run that ends with
  nothing on `main` wasted its budget.
- **Blocked on the owner?** Add one item to [`OWNER.md`](OWNER.md) (format
  is at the top of that file; extend an existing item rather than adding a
  duplicate), then do the most useful thing that does *not* need the owner.
  Being blocked is never a reason to stop.
- **Branch, commit, push, open a pull request** titled
  `<function>: <what is now true>`. Add the trailer `route.py` printed
  (`Business-Function: <function>`) to each commit.
- **Verify**: `python3 ops/check.py` and `python3 -m unittest discover -s ops`
  must pass, plus any tests the change touches. CI runs the same.
- **Merge it yourself** once CI is green (squash). Nobody else will. A
  conflict is not a reason to stop: merge `main` into the branch and resolve.

## 3. Record the run, before the merge

```
python3 ops/record.py --function <f> --outcome shipped|partial|blocked \
  --summary "<what is now true>" --pr <url> [--owner-ask <id>] [--friction "<file: what was wrong>"]
```

Commit the record as the last commit on the branch, so it lands with the work.
`--friction` is how these instructions improve: name any line in this
repository's instructions that was wrong, stale or cost you time. The review
function reads every record and fixes what they point at.

## 4. Finish

End the reply with the merged pull request's link, and any new `OWNER.md`
items in one line each.

## Judgment

Everything here except [`GUARDRAILS.md`](GUARDRAILS.md) is a default written
before anyone could see your situation. When a default clearly does not fit,
do what better serves the business and say why in the PR. The guardrails do
not bend.
