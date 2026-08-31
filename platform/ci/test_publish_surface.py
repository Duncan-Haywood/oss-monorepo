#!/usr/bin/env python3
"""Tests for publish_surface.py.

The point of the tool is that removing a gate turns CI red, so most of these
assert on the boundary between `gated` and `live` rather than on the happy path.
"""

import contextlib
import io
import sys
import unittest
import unittest.mock

import yaml

import publish_surface as ps


def wf(text):
    return yaml.load(text, Loader=ps._StrictLoader)


class PushReachability(unittest.TestCase):
    def test_push_to_main_is_reachable(self):
        self.assertTrue(pushes(wf("on:\n  push:\n    branches: [main]\njobs: {}\n")))

    def test_push_with_no_branch_filter_matches_main(self):
        self.assertTrue(pushes(wf("on:\n  push:\n    paths: ['a/**']\njobs: {}\n")))

    def test_push_to_other_branches_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  push:\n    branches: [release]\njobs: {}\n")))

    def test_workflow_dispatch_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  workflow_dispatch:\njobs: {}\n")))

    def test_pull_request_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  pull_request:\njobs: {}\n")))

    def test_unquoted_on_resolving_to_true_is_still_read(self):
        # YAML 1.1 resolves a bare `on:` key to the boolean True. Every
        # workflow in this repo is written that way, so reading only the
        # string key would report the whole repo as unreachable.
        data = wf("on:\n  push:\n    branches: [main]\njobs: {}\n")
        self.assertNotIn("on", data)
        self.assertTrue(pushes(data))

    def test_bare_string_and_list_trigger_forms(self):
        self.assertTrue(pushes(wf("on: push\njobs: {}\n")))
        self.assertTrue(pushes(wf("on: [push, pull_request]\njobs: {}\n")))
        self.assertFalse(pushes(wf("on: [pull_request]\njobs: {}\n")))


def pushes(data):
    return ps.pushes_to_default_branch(data)


class Detection(unittest.TestCase):
    def test_publishing_action_matches_through_a_sha_pin(self):
        step = {"uses": "cloudflare/wrangler-action@9acf94ace14e7dc412b076f2c5c20b8ce93c79cd"}
        self.assertEqual(ps.publish_marker(step), "uses cloudflare/wrangler-action")

    def test_publishing_command_matches_inside_a_multiline_run(self):
        step = {"run": "set -e\nnpm ci\nnpm publish --access public\n"}
        self.assertEqual(ps.publish_marker(step), "runs 'npm publish'")

    def test_build_and_test_steps_are_not_publishing(self):
        for step in ({"run": "npm run build"}, {"run": "pytest -q"}, {"uses": "actions/checkout@v4"}):
            self.assertIsNone(ps.publish_marker(step))

    def test_uploading_a_pages_artifact_is_not_publishing(self):
        # upload-pages-artifact hands a tarball to the Actions artifact store;
        # actions/deploy-pages is what makes it public. Counting the upload
        # would mark retail-pilot-intel live on a run whose deploy job skipped.
        self.assertIsNone(ps.publish_marker({"uses": "actions/upload-pages-artifact@v3"}))


GATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    if: ${{ vars.PAGES_ENABLED == 'true' }}
    steps:
      - uses: actions/deploy-pages@v4
"""

UNGATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - uses: actions/deploy-pages@v4
"""

STEP_GATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - uses: cloudflare/wrangler-action@v3
        if: env.CLOUDFLARE_API_TOKEN != ''
"""

MIXED = """
on:
  push:
    branches: [main]
jobs:
  gated:
    if: ${{ vars.PAGES_ENABLED == 'true' }}
    steps:
      - uses: actions/deploy-pages@v4
  ungated:
    steps:
      - run: npm publish
"""


class Classification(unittest.TestCase):
    def test_job_level_gate_is_gated(self):
        self.assertEqual(ps.classify(wf(GATED))[0], "gated")

    def test_step_level_gate_is_gated(self):
        self.assertEqual(ps.classify(wf(STEP_GATED))[0], "gated")

    def test_removing_the_gate_flips_gated_to_live(self):
        self.assertEqual(ps.classify(wf(UNGATED))[0], "live")

    def test_one_ungated_publish_makes_the_whole_workflow_live(self):
        # The conservative direction: a workflow is only `gated` when *every*
        # publish step is behind an `if:`.
        self.assertEqual(ps.classify(wf(MIXED))[0], "live")

    def test_dispatch_only_publisher_is_not_live(self):
        data = wf("on:\n  workflow_dispatch:\njobs:\n  d:\n    steps:\n      - run: npm run deploy\n")
        self.assertEqual(ps.classify(data)[0], "dispatch")

    def test_workflow_with_no_publish_step_is_none(self):
        data = wf("on:\n  push:\n    branches: [main]\njobs:\n  t:\n    steps:\n      - run: pytest\n")
        self.assertEqual(ps.classify(data)[0], "none")

    def test_gates_are_recorded_so_changing_one_is_visible(self):
        steps = ps.classify(wf(GATED))[1]
        self.assertEqual(steps[0]["gates"], ["${{ vars.PAGES_ENABLED == 'true' }}"])


class DuplicateKeys(unittest.TestCase):
    def test_a_repeated_if_key_is_rejected_rather_than_silently_replaced(self):
        # PyYAML keeps the last of a repeated key, so a second `if:` would
        # replace the gate this tool reads without anything complaining.
        text = "on:\n  push:\njobs:\n  d:\n    if: false\n    if: true\n    steps: []\n"
        with self.assertRaises(ps.DuplicateKeyError):
            wf(text)


class SinglePagesDeployer(unittest.TestCase):
    """
    A guard that only ever passes proves nothing, so each case here builds the
    conflict it is meant to catch.
    """

    @staticmethod
    def row(name, gate, action="actions/deploy-pages"):
        step = {"job": "deploy", "step": f"uses {action}"}
        if gate is not None:
            step["gates"] = [gate]
        return {"workflow": name, "classification": "gated", "publishes": [step]}

    def test_two_workflows_behind_the_same_variable_conflict(self):
        # The incident: pages.yml and portfolio-pages.yml, same flip, one origin.
        rows = [
            self.row("a.yml", "github.event_name != 'pull_request' && vars.GITHUB_PAGES_ENABLED == 'true'"),
            self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])
        self.assertIn("a.yml", problems[0])
        self.assertIn("b.yml", problems[0])

    def test_different_variables_are_a_deliberate_either_or(self):
        # retail-pilot-intel is gated on its own variable precisely so the
        # portfolio flip does not publish it. That must stay legal.
        rows = [
            self.row("portfolio.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
            self.row("docs.yml", "${{ vars.RETAIL_PILOT_INTEL_PAGES == 'true' }}"),
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_a_single_deployer_is_fine_however_it_is_gated(self):
        self.assertEqual(ps.check_single_pages_deployer([self.row("only.yml", None)]), [])

    def test_an_ungated_deployer_alongside_another_is_flagged(self):
        rows = [self.row("open.yml", None), self.row("gated.yml", "${{ vars.X == 'true' }}")]
        problems = ps.check_single_pages_deployer(rows)
        self.assertTrue(any("no owner-set variable" in p for p in problems))

    def test_bracket_syntax_names_the_same_variable(self):
        rows = [
            self.row("a.yml", "${{ vars['GITHUB_PAGES_ENABLED'] == 'true' }}"),
            self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
        ]
        self.assertEqual(len(ps.check_single_pages_deployer(rows)), 1)

    def test_workflows_that_do_not_deploy_pages_are_ignored(self):
        rows = [
            {"workflow": "npm.yml", "classification": "gated",
             "publishes": [{"job": "p", "step": "runs 'npm publish'", "gates": ["${{ vars.G == 'true' }}"]}]},
            {"workflow": "quiet.yml", "classification": "none", "publishes": []},
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_a_pages_deploy_by_another_action_is_still_a_pages_deploy(self):
        # The hole this closes: the invariant matched only
        # `actions/deploy-pages`, so switching one of two racing workflows to
        # `peaceiris/actions-gh-pages` -- the same one Pages site, reached by a
        # different name, and already listed in PUBLISH_ACTIONS -- silently
        # brought the race back with nothing turning red.
        for action in ("peaceiris/actions-gh-pages", "JamesIves/github-pages-deploy-action"):
            with self.subTest(action=action):
                rows = [
                    self.row("a.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
                    self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}", action=action),
                ]
                problems = ps.check_single_pages_deployer(rows)
                self.assertEqual(len(problems), 1)
                self.assertIn("GITHUB_PAGES_ENABLED", problems[0])

    def test_every_pages_action_the_surface_recognises_is_covered(self):
        # PAGES_DEPLOY_ACTIONS is a subset of PUBLISH_ACTIONS and has to stay
        # one: an action this tool already knows publishes to Pages, but the
        # invariant does not check, is exactly the blind spot above.
        for action in ps.PAGES_DEPLOY_ACTIONS:
            self.assertIn(action, ps.PUBLISH_ACTIONS, action)
        for action in ps.PUBLISH_ACTIONS:
            if "pages" in action.lower() or "gh-pages" in action.lower():
                self.assertIn(action, ps.PAGES_DEPLOY_ACTIONS, action)

    def test_a_shared_secret_arms_two_deployments_just_as_a_variable_does(self):
        # Reading only `vars.` called these ungated, which is the right verdict
        # for the wrong reason: the message then told the reader to add a gate
        # both workflows already had.
        rows = [
            self.row("a.yml", "${{ secrets.PAGES_TOKEN != '' }}"),
            self.row("b.yml", "${{ secrets.PAGES_TOKEN != '' }}"),
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("PAGES_TOKEN", problems[0])
        self.assertNotIn("no owner-set variable", problems[0])

    def test_a_secret_and_a_variable_are_still_distinct_switches(self):
        rows = [
            self.row("a.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
            self.row("b.yml", "${{ secrets.DOCS_PAGES_TOKEN != '' }}"),
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])


class Snapshot(unittest.TestCase):
    def test_committed_snapshot_matches_the_live_workflows(self):
        rows, errors = ps.survey()
        self.assertEqual(errors, [])
        self.assertEqual(ps.check(rows), [])

    def test_check_reports_a_classification_that_moved(self):
        rows, _ = ps.survey()
        tampered = [dict(r) for r in rows]
        tampered[0]["classification"] = "live"
        problems = ps.check(tampered)
        self.assertTrue(any("classification changed" in p for p in problems))

    def test_check_reports_an_unlisted_new_workflow(self):
        rows, _ = ps.survey()
        problems = ps.check(rows + [{"workflow": "new.yml", "classification": "live", "publishes": []}])
        self.assertTrue(any("new.yml" in p for p in problems))

    def test_one_variable_never_arms_two_pages_deployments(self):
        # The live invariant: GitHub serves one Pages site, so no single owner
        # flip may arm two workflows that replace it.
        rows, _ = ps.survey()
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_no_workflow_publishes_on_a_merge_to_main(self):
        # Pin: a merge to main currently reaches no live audience. If this
        # fails, a product merge also publishes. Still merge product PRs;
        # the live surface is now a fact to handle, not a reason to wait.
        rows, _ = ps.survey()
        live = [r["workflow"] for r in rows if r["classification"] == "live"]
        self.assertEqual(live, [])


if __name__ == "__main__":
    unittest.main()


class OneOriginPerGate(unittest.TestCase):
    """Cases carried over from #1776's `check_one_origin_per_gate`, which was a
    second implementation of the same invariant; the two were consolidated into
    `check_single_pages_deployer`. Kept because they cover shapes the other
    class does not: a gate naming two variables, and non-Pages publishers.

    GitHub serves one Pages site per repository, so two deployments behind one
    owner variable is a race, not redundancy.

    This is the shape of the 2026-08-26 near-miss: two sessions independently
    built "publish the portfolio to Pages", both reused `GITHUB_PAGES_ENABLED`
    so as not to open a second owner ask, and both merged. Individually valid,
    correctly snapshotted as gated, and invisible until the owner set the
    variable -- at which point the live site would have flapped between two
    different builds rather than failing outright.
    """

    @staticmethod
    def _pages_row(workflow, variable):
        return {
            "workflow": workflow,
            "classification": "gated",
            "publishes": [
                {
                    "job": "deploy",
                    "step": "uses actions/deploy-pages",
                    "gates": [f"github.event_name != 'pull_request' && vars.{variable} == 'true'"],
                }
            ],
        }

    def test_two_pages_deploys_on_one_variable_is_reported(self):
        problems = ps.check_single_pages_deployer([
            self._pages_row("pages.yml", "GITHUB_PAGES_ENABLED"),
            self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
        ])
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])
        self.assertIn("pages.yml", problems[0])
        self.assertIn("portfolio-pages.yml", problems[0])

    def test_separate_variables_are_fine(self):
        self.assertEqual(
            ps.check_single_pages_deployer([
                self._pages_row("pages.yml", "PAGES_PYTHON_BUILDER"),
                self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
            ]),
            [],
        )

    def test_one_workflow_on_one_variable_is_fine(self):
        self.assertEqual(
            ps.check_single_pages_deployer([self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED")]),
            [],
        )

    def test_a_gate_naming_two_variables_still_collides_on_the_shared_one(self):
        # `vars.A == 'true' && vars.B == 'true'` shares the origin with anything
        # gated on A alone: setting A and B fires both.
        rows = [
            self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
            {
                "workflow": "other.yml",
                "classification": "gated",
                "publishes": [
                    {
                        "job": "deploy",
                        "step": "uses actions/deploy-pages",
                        "gates": ["vars.GITHUB_PAGES_ENABLED == 'true' && vars.EXTRA == 'true'"],
                    }
                ],
            },
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])

    def test_non_pages_publishers_do_not_collide(self):
        # Vercel and Cloudflare have their own destinations; two of them behind
        # one variable is not an origin race.
        rows = [
            {
                "workflow": "a.yml",
                "classification": "gated",
                "publishes": [
                    {"job": "d", "step": "uses amondnet/vercel-action", "gates": ["vars.SHARED == 'true'"]}
                ],
            },
            {
                "workflow": "b.yml",
                "classification": "gated",
                "publishes": [
                    {"job": "d", "step": "uses cloudflare/wrangler-action", "gates": ["vars.SHARED == 'true'"]}
                ],
            },
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_write_cannot_bless_a_conflict(self):
        # The check used to sit inside main()'s `--check` branch, below an
        # early-returning `if args.write:` -- so `--write` never ran it, while
        # its own comment claimed re-running with --write must not be able to
        # bless a conflict. A conflicting surface has to fail whichever flag
        # asked, or the snapshot becomes the way to launder it.
        conflicting = [
            self._pages_row("a.yml", "GITHUB_PAGES_ENABLED"),
            self._pages_row("b.yml", "GITHUB_PAGES_ENABLED"),
        ]
        wrote = []
        with unittest.mock.patch.object(ps, "survey", return_value=(conflicting, [])), \
             unittest.mock.patch.object(ps, "write_snapshot", side_effect=lambda r: wrote.append(r)), \
             unittest.mock.patch.object(sys, "argv", ["publish_surface.py", "--write"]):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                code = ps.main()

        self.assertEqual(code, 1, "--write must refuse a conflicting surface")
        self.assertEqual(wrote, [], "the snapshot must not be rewritten over a conflict")
        self.assertIn("GITHUB_PAGES_ENABLED", err.getvalue())

    def test_the_live_repository_has_at_most_one_pages_deploy_per_gate(self):
        # The check above proves the logic; this proves the repository.
        rows, errors = ps.survey()
        self.assertEqual(errors, [], 'every workflow must be readable for this to mean anything')
        self.assertEqual(ps.check_single_pages_deployer(rows), [])


def app(text):
    """An Argo Application manifest."""
    return yaml.safe_load(text)


AUTOMATED = """
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prod
spec:
  source:
    repoURL: https://github.com/Duncan-Haywood/monorepo-projects.git
    targetRevision: main
    path: gitops/prod
  syncPolicy:
    automated:
      prune: true
"""

MANUAL = AUTOMATED.replace("  syncPolicy:\n    automated:\n      prune: true\n", "")

# Serves content: routes to the `site` workload, which needs a clone token.
CONTENT_INGRESS = app(
    """
kind: Ingress
metadata:
  name: content
spec:
  tls:
    - secretName: site-tls
  rules:
    - host: tools.example.dev
      http:
        paths:
          - path: /
            backend:
              service:
                name: site
"""
)

# Annotation-only 301. Names the same backend Service on purpose -- the real
# apex manifest does, so that dropping the annotation degrades to serving the
# site rather than to a 503 -- which is exactly why matching on the backend
# alone would misclassify it.
REDIRECT_INGRESS = app(
    """
kind: Ingress
metadata:
  name: apex
  annotations:
    nginx.ingress.kubernetes.io/permanent-redirect: https://tools.example.dev/
spec:
  rules:
    - host: example.dev
      http:
        paths:
          - path: /
            backend:
              service:
                name: site
"""
)

SITE_WORKLOAD = app(
    """
kind: Deployment
metadata:
  name: site
spec:
  template:
    spec:
      initContainers:
        - name: fetch
          env:
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: site-repo
                  key: token
"""
)

SEALED = app("kind: SealedSecret\nmetadata:\n  name: site-repo\n")


def hosts_by_name(detail):
    return {h["host"]: h for h in detail["hosts"]}


class GitOpsClassification(unittest.TestCase):
    """The four words, applied to an Argo Application instead of a workflow."""

    def test_an_unsealed_secret_blocks_the_host_that_serves_content(self):
        # The live case as of 2026-08-31: the site's `fetch` init container
        # mounts a clone token git does not hold, so Argo syncs the manifest and
        # the pod never starts. Reporting that host as live would claim a public
        # URL that serves nothing.
        _, detail = ps.classify_application(
            app(AUTOMATED), [CONTENT_INGRESS, SITE_WORKLOAD]
        )
        self.assertEqual(
            hosts_by_name(detail)["tools.example.dev"]["unmet_secrets"], ["site-repo"]
        )

    def test_an_application_whose_only_host_is_blocked_is_gated(self):
        classification, _ = ps.classify_application(
            app(AUTOMATED), [CONTENT_INGRESS, SITE_WORKLOAD]
        )
        self.assertEqual(classification, "gated")

    def test_sealing_the_secret_makes_it_live(self):
        # The single transition this section exists to catch. Committing the
        # SealedSecret is the owner's one action and it must move the
        # classification without anyone editing prose.
        classification, detail = ps.classify_application(
            app(AUTOMATED), [CONTENT_INGRESS, SITE_WORKLOAD, SEALED]
        )
        self.assertEqual(classification, "live")
        self.assertEqual(detail["unmet_secrets"], [])

    def test_a_redirect_host_needs_no_workload_secret(self):
        # The bug this replaced: classifying per Application reported the apex
        # 301 as blocked on the content pod's token. ingress-nginx answers the
        # redirect itself, so the backend -- and whatever it mounts -- is never
        # reached.
        _, detail = ps.classify_application(
            app(AUTOMATED), [CONTENT_INGRESS, REDIRECT_INGRESS, SITE_WORKLOAD]
        )
        by_host = hosts_by_name(detail)
        self.assertEqual(by_host["example.dev"]["serves"], "redirect")
        self.assertEqual(by_host["example.dev"]["unmet_secrets"], [])
        self.assertEqual(by_host["tools.example.dev"]["unmet_secrets"], ["site-repo"])

    def test_one_answering_host_makes_the_application_live(self):
        classification, _ = ps.classify_application(
            app(AUTOMATED), [CONTENT_INGRESS, REDIRECT_INGRESS, SITE_WORKLOAD]
        )
        self.assertEqual(classification, "live")

    def test_a_tls_secret_is_not_an_unmet_gate(self):
        # cert-manager mints the Ingress's `tls.secretName` when the Ingress is
        # admitted, so it is correctly absent from git. Counting it would pin
        # every public Application at `gated` forever and the tool could never
        # report a live site.
        _, detail = ps.classify_application(app(AUTOMATED), [CONTENT_INGRESS, SEALED, SITE_WORKLOAD])
        self.assertEqual(detail["unmet_secrets"], [])

    def test_a_manual_sync_policy_is_dispatch(self):
        classification, _ = ps.classify_application(app(MANUAL), [REDIRECT_INGRESS])
        self.assertEqual(classification, "dispatch")

    def test_an_application_with_no_ingress_publishes_nothing(self):
        classification, _ = ps.classify_application(app(AUTOMATED), [SITE_WORKLOAD])
        self.assertEqual(classification, "none")


class DeadEndRedirects(unittest.TestCase):
    """A 301 that answers is not a public surface if its target does not."""

    def _rows(self, docs):
        classification, detail = ps.classify_application(app(AUTOMATED), docs)
        return [
            {
                "application": "prod",
                "classification": classification,
                "hosts": detail["hosts"],
                "redirects": detail["redirects"],
            }
        ]

    def test_a_redirect_to_a_blocked_host_is_reported(self):
        # Without this, the table says two of three hosts are live and a reader
        # concludes the portfolio has a public URL. Both of those hosts 301 to
        # the one that serves nothing.
        problems = ps.dead_end_redirects(
            self._rows([CONTENT_INGRESS, REDIRECT_INGRESS, SITE_WORKLOAD])
        )
        self.assertEqual(len(problems), 1)
        self.assertIn("example.dev", problems[0])
        self.assertIn("site-repo", problems[0])

    def test_sealing_the_target_clears_the_dead_end(self):
        problems = ps.dead_end_redirects(
            self._rows([CONTENT_INGRESS, REDIRECT_INGRESS, SITE_WORKLOAD, SEALED])
        )
        self.assertEqual(problems, [])

    def test_a_redirect_to_a_host_that_serves_is_not_a_dead_end(self):
        problems = ps.dead_end_redirects(self._rows([REDIRECT_INGRESS]))
        self.assertEqual(problems, [], "an off-site redirect target is not ours to judge")


class GitOpsRemoteMatching(unittest.TestCase):
    def test_the_repository_matches_however_the_url_is_spelled(self):
        for url in (
            "https://github.com/Duncan-Haywood/monorepo-projects.git",
            "https://github.com/duncan-haywood/monorepo-projects",
            "git@github.com:Duncan-Haywood/monorepo-projects.git",
        ):
            self.assertEqual(ps._normalise_remote(url), ps.REPO_REMOTE, url)

    def test_a_third_party_chart_is_not_this_repository(self):
        # ingress-nginx and cert-manager sync from upstream Helm repos. A merge
        # here publishes nothing through them, so they must not appear at all.
        self.assertNotEqual(
            ps._normalise_remote("https://kubernetes.github.io/ingress-nginx"), ps.REPO_REMOTE
        )


class GitOpsSecretProvenance(unittest.TestCase):
    def test_a_committed_template_does_not_count_as_provided(self):
        # `gitops/prod/secrets/portfolio-repo-token.template.yaml` is committed
        # and deliberately left out of the kustomization, so nothing it names
        # exists in the cluster. Reading the directory rather than the resource
        # list would report the site as live while it serves nothing.
        names = {p.name for p in ps._kustomize_resources(ps.GITOPS / "prod")}
        self.assertNotIn("portfolio-repo-token.template.yaml", names)
        self.assertIn("portfolio-site.yaml", names)


class GitOpsLiveRepository(unittest.TestCase):
    """Assertions about this repository, not about the logic."""

    def test_the_survey_reads_every_application_without_error(self):
        rows, errors = ps.gitops_survey()
        self.assertEqual(errors, [])
        self.assertTrue(rows, "gitops/ must contain at least one Application for this repo")

    def test_the_public_site_is_derived_not_asserted(self):
        # The regression this guards: `publish_surface.py` reported "nothing
        # publishes on a push to main" while gitops/prod carried three public
        # hostnames, because it read only .github/workflows/. DIRECTION.md gates
        # "deploy beats another build" on this tool's answer, so the blindness
        # kept that gate shut by construction.
        rows, _ = ps.gitops_survey()
        prod = next((r for r in rows if r["application"] == "prod"), None)
        self.assertIsNotNone(prod, "the prod Application must be surveyed")
        self.assertIn("tools.marisstella.dev", [h["host"] for h in prod["hosts"]])

    def test_the_content_host_is_still_waiting_on_the_clone_token(self):
        # Not a permanent truth -- it is the fact that makes the portfolio dark,
        # and when the owner seals the token this test is the one that should
        # fail and be updated, deliberately, in the same change.
        rows, _ = ps.gitops_survey()
        prod = next(r for r in rows if r["application"] == "prod")
        content = next(h for h in prod["hosts"] if h["host"] == "tools.marisstella.dev")
        self.assertEqual(content["unmet_secrets"], ["portfolio-site-repo"])
        self.assertTrue(ps.dead_end_redirects(rows), "the apex 301s to a host serving nothing")

    def test_the_snapshot_pins_the_gitops_surface(self):
        rows, _ = ps.gitops_survey()
        snapshot = ps.load_snapshot()
        self.assertIn("gitops", snapshot, "run --write to pin the Argo surface")
        self.assertEqual(ps.check_gitops(rows, snapshot), [])

    def test_a_snapshot_without_the_section_is_reported_not_ignored(self):
        # A snapshot written before this reader existed has no `gitops:` key.
        # Treating that as "no Application publishes" would silently restore
        # exactly the blindness this section removes.
        problems = ps.check_gitops([], {"workflows": []})
        self.assertEqual(len(problems), 1)
        self.assertIn("predates the GitOps section", problems[0])
