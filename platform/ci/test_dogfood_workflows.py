import tempfile
import unittest
from pathlib import Path

import dogfood_workflows as d


def make_repo(workflow):
    root = Path(tempfile.mkdtemp())
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / ".github" / "workflows" / "ci.yml").write_text(workflow)
    for slug in d.CHECKERS:
        (root / "ventures" / slug).mkdir(parents=True)
        (root / "ventures" / slug / "check.py").write_text(
            (d.ROOT / "ventures" / slug / "check.py").read_text()
        )
    return root


BAD = "on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"
GOOD = BAD.replace("    steps:", "    timeout-minutes: 10\n    steps:")


class Dogfood(unittest.TestCase):
    def test_repo_workflows_have_no_unaccepted_findings(self):
        new, stale = d.audit()
        self.assertEqual(new, [], "new finding from our own checkers; fix the workflow or add it to ACCEPTED with a reason")
        self.assertEqual(stale, [])

    def test_a_job_without_timeout_is_caught(self):
        new, _ = d.audit(root=make_repo(BAD), accepted={})
        self.assertEqual([f["type"] for f in new], ["job-missing-timeout"])

    def test_clean_workflow_passes(self):
        new, stale = d.audit(root=make_repo(GOOD), accepted={})
        self.assertEqual((new, stale), ([], []))

    def test_accepted_finding_is_silenced_and_stale_entry_reported(self):
        root = make_repo(BAD)
        key = ("actions-timeout-check", ".github/workflows/ci.yml", "job-missing-timeout")
        self.assertEqual(d.audit(root=root, accepted={key: "x"}), ([], []))
        _, stale = d.audit(root=make_repo(GOOD), accepted={key: "x"})
        self.assertEqual(stale, [key])


if __name__ == "__main__":
    unittest.main()
