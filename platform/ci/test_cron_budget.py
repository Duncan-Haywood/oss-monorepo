"""Unit tests for cron_budget.py: python3 -m unittest test_cron_budget (from platform/ci)."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cron_budget as cb  # noqa: E402

DEPLOY_WF = """name: d
jobs:
  deploy:
    defaults:
      run:
        working-directory: {wd}
    steps:
      - run: wrangler deploy
"""


class Repo:
    def __init__(self, limit=5):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.write("portfolio/hosting/cloudflare-plan.json",
                   json.dumps({"workers_plan": "free", "cron_triggers_per_account": limit}))

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def worker(self, d, crons, deployed=False, name=None):
        name = name or Path(d).name
        self.write(f"{d}/wrangler.jsonc",
                   '{\n  // a comment with "quotes"\n  "name": "%s",\n  "url": "https://x/y", /* block */\n'
                   '  "triggers": { "crons": %s },\n}\n' % (name, json.dumps(crons)))
        if deployed:
            self.write(f".github/workflows/{name}.yml", DEPLOY_WF.format(wd=d))

    def run(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = cb.main(["--root", str(self.root), *args])
        return code, buf.getvalue()


class CronBudget(unittest.TestCase):
    def test_jsonc_comments_and_trailing_commas(self):
        cfg = json.loads(cb.strip_jsonc('{"a": "http://x", // c\n "b": [1,2,], /* d */}'))
        self.assertEqual(cfg, {"a": "http://x", "b": [1, 2]})

    def test_under_limit_passes(self):
        r = Repo()
        r.worker("apps/a", ["0 * * * *"], deployed=True)
        code, out = r.run()
        self.assertEqual(code, 0)
        self.assertIn("1 deployed by a workflow, 1 configured", out)

    def test_configured_over_limit_warns_only(self):
        r = Repo(limit=2)
        r.worker("apps/a", ["0 * * * *"], deployed=True)
        r.worker("apps/b", ["1 * * * *", "2 * * * *"])
        code, out = r.run()
        self.assertEqual(code, 0)
        self.assertIn("::warning", out)
        self.assertEqual(r.run("--strict")[0], 1)

    def test_deployed_over_limit_fails(self):
        r = Repo(limit=2)
        r.worker("apps/a", ["0 * * * *", "5 * * * *"], deployed=True)
        r.worker("apps/b", ["1 * * * *"], deployed=True)
        code, out = r.run()
        self.assertEqual(code, 1)
        self.assertIn("::error title=Cron triggers over", out)

    def test_env_sections_and_test_configs(self):
        r = Repo()
        r.write("apps/c/wrangler.toml", 'name = "c"\n[triggers]\ncrons = ["0 1 * * *"]\n'
                '[env.staging]\nname = "c-staging"\n[env.staging.triggers]\ncrons = ["0 2 * * *"]\n')
        r.write("apps/c/wrangler.test.jsonc", '{"triggers": {"crons": ["9 9 * * *"]}}')
        rows = cb.scan(r.root)
        self.assertEqual(sorted((x["worker"], x["cron"]) for x in rows),
                         [("c", "0 1 * * *"), ("c-staging", "0 2 * * *")])

    def test_unreadable_config_fails(self):
        r = Repo()
        r.write("apps/d/wrangler.jsonc", "{ not json")
        self.assertEqual(r.run()[0], 1)



if __name__ == "__main__":
    unittest.main()
