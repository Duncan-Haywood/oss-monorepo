# Public-Record Watch

Compare two customer-supplied public-register snapshots and get a source-linked
change report. It is designed for credentialing teams and specialist recruiters
who need to notice that a public license record was added, removed, or changed
without turning a register entry into a ranking of people.

After using this, you can now review what changed between two dated register
exports, which used to require manually scanning every row. The tool is local,
offline, free, and requires no account, API key, or hosted service.

## Run

```bash
python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m public_record_watch.cli \
  --before examples/before.json --after examples/after.json --format markdown
PYTHONPATH=src python3 -m public_record_watch.cli \
  --before before.json --after after.json --format json --output report.json \
  --usage-file usage.json
```

Run `PYTHONPATH=src python3 -m public_record_watch.cli --help` for the same
limitation notice shown at the command line.

Each input must be a customer-authorized JSON snapshot with `authorized: true`,
a register name, a source URL, and a `records` list. Every record needs a stable
`id`; all other fields are carried into the report and compared deterministically.
The source URL is retained so a reviewer can open the original public record.

## Boundaries

This product does not scrape registers, create personal profiles, rank people,
decide suitability, or claim that a person is compliant, safe, or eligible. It
only compares snapshots that the customer is authorized to supply. A removed
record may mean an export changed or a source was incomplete; inspect the source
before acting.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, medical, or
engineering advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising
from its use.

## Privacy and usage

Everything runs locally. Your snapshots are never uploaded and the CLI makes no
network calls. With `--usage-file`, it records only an aggregate
`snapshot_compared` count. It never records IDs, URLs, record fields, or people;
omit the flag for no usage file.

## Opportunity assessment

This is a narrow vertical slice of the public-record watch candidate in
`portfolio/pipeline/candidates/public-record-watch.md`. The target buyer has a
recurring, expensive-if-missed review task; public source links contain the
liability boundary; and local comparison has zero per-user hosting or inference
cost. Existing alternatives are register email alerts and general monitoring
tools. The differentiation to test is portable, reviewable before/after
evidence for fragmented registers. Distribution is unproven and is the main
launch risk; the next experiment is ten credentialing conversations and a
second-snapshot return-use test. A later hosted scheduler would require a
customer-selected source, rate-limit compliance, retention controls, and a
future paid pilot, none of which is enabled here.

See [LICENSE](LICENSE) for terms.
