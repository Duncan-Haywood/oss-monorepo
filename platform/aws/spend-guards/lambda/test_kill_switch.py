"""Unit tests for kill_switch.py. No network, no boto3.

    python3 -m unittest discover -s platform/aws/spend-guards/lambda -v
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kill_switch as ks  # noqa: E402

BUDGET_MESSAGE = """AWS Budget Notification November 24, 2026
AWS Account 000000000000

Dear AWS Customer,

You requested that we alert you when the ACTUAL Cost associated with your spend-apps-monthly budget is greater than $100.00 for the current month.

Budget Name: spend-apps-monthly
Budget Type: Cost
Budgeted Amount: $100.00
Alert Type: ACTUAL
Alert Threshold: > $100.00
ACTUAL Amount: $101.17
"""


class Paginator:
    def __init__(self, pages):
        self._pages = pages

    def paginate(self, **_kwargs):
        return self._pages


class Fake:
    """Records every mutating call; serves canned pages for listing calls."""

    def __init__(self, pages=None, **responses):
        self.pages = pages or {}
        self.responses = responses
        self.calls = []

    def get_paginator(self, op):
        return Paginator(self.pages.get(op, [{}]))

    def __getattr__(self, name):
        def call(**kwargs):
            self.calls.append((name, kwargs))
            resp = self.responses.get(name)
            if isinstance(resp, Exception):
                raise resp
            if callable(resp):
                return resp(**kwargs)
            return resp or {}
        return call

    def names(self):
        return [c[0] for c in self.calls]


def cfg(**kw):
    base = dict(
        accounts={"apps": {"id": "111111111111", "kill_switch": True},
                  "shared-infra": {"id": "222222222222", "kill_switch": False}},
        regions=("us-east-1",),
        role_name="spend-kill-switch",
        dry_run=False,
    )
    base.update(kw)
    return ks.Config(**base)


def factory_from(clients):
    seen_accounts = []

    def clients_for(account_id):
        seen_accounts.append(account_id)
        return lambda service, region: clients.get(service) or Fake()

    clients_for.seen = seen_accounts
    return clients_for


class ParseEvent(unittest.TestCase):
    def test_budget_notification_names_the_account(self):
        reqs = ks.parse_event({"Records": [{"Sns": {"Message": BUDGET_MESSAGE}}]})
        self.assertEqual(len(reqs), 1)
        self.assertEqual((reqs[0].account, reqs[0].operation, reqs[0].source), ("apps", "stop", "budget"))

    def test_hyphenated_account_name(self):
        msg = "Budget Name: spend-shared-infra-monthly\n"
        self.assertEqual(ks.parse_event({"Records": [{"Sns": {"Message": msg}}]})[0].account, "shared-infra")

    def test_unrelated_message_is_ignored(self):
        self.assertEqual(ks.parse_event({"Records": [{"Sns": {"Message": "hello"}}]}), [])

    def test_json_message_on_topic_is_manual(self):
        msg = json.dumps({"operation": "resume", "account": "apps", "stacks": "saas", "dry_run": True})
        req = ks.parse_event({"Records": [{"Sns": {"Message": msg}}]})[0]
        self.assertEqual((req.operation, req.stacks, req.dry_run, req.source), ("resume", ("saas",), True, "manual"))

    def test_direct_invoke(self):
        req = ks.parse_event({"account": "apps"})[0]
        self.assertEqual((req.operation, req.stacks, req.dry_run), ("stop", (), None))

    def test_bad_operation_rejected(self):
        with self.assertRaises(ValueError):
            ks.parse_event({"account": "apps", "operation": "delete"})

    def test_dry_run_must_be_bool(self):
        with self.assertRaises(ValueError):
            ks.parse_event({"account": "apps", "dry_run": "yes"})


class ConfigFromEnv(unittest.TestCase):
    def test_parses(self):
        c = ks.Config.from_env({"ACCOUNTS": '{"apps": {"id": "1", "kill_switch": true}}',
                                "REGIONS": "us-east-1,us-west-2", "MODE": "dry_run"})
        self.assertEqual(c.regions, ("us-east-1", "us-west-2"))
        self.assertTrue(c.dry_run)

    def test_bad_mode(self):
        with self.assertRaises(ValueError):
            ks.Config.from_env({"MODE": "yolo"})


class Selection(unittest.TestCase):
    def test_keep_tag_always_wins(self):
        self.assertFalse(ks.selected({"spend_guard": "keep", "stack": "a"}, ("a",)))

    def test_untagged_selected_without_filter(self):
        self.assertTrue(ks.selected({}, ()))

    def test_stack_filter(self):
        self.assertTrue(ks.selected({"stack": "a"}, ("a", "b")))
        self.assertFalse(ks.selected({"stack": "c"}, ("a",)))
        self.assertFalse(ks.selected({}, ("a",)))

    def test_tag_shapes(self):
        self.assertEqual(ks.tags_to_dict([{"Key": "a", "Value": "1"}]), {"a": "1"})
        self.assertEqual(ks.tags_to_dict([{"key": "a", "value": "1"}]), {"a": "1"})
        self.assertEqual(ks.tags_to_dict({"a": "1"}), {"a": "1"})
        self.assertEqual(ks.tags_to_dict(None), {})


def ec2_fake(state="running", tags=None, lifecycle=None):
    inst = {"InstanceId": "i-1", "Tags": tags or []}
    if lifecycle:
        inst["InstanceLifecycle"] = lifecycle
    kept = {"InstanceId": "i-keep", "Tags": [{"Key": "spend_guard", "Value": "keep"}]}
    return Fake(pages={"describe_instances": [{"Reservations": [{"Instances": [inst, kept]}]}]})


class Ec2(unittest.TestCase):
    def test_stop_tags_then_stops_and_skips_keep(self):
        ec2 = ec2_fake()
        rep = ks.run(ks.Request("stop", "apps", source="budget"), cfg(), factory_from({"ec2": ec2}))
        self.assertEqual(ec2.names(), ["create_tags", "stop_instances"])
        self.assertEqual(ec2.calls[1][1], {"InstanceIds": ["i-1"]})
        self.assertIn({"region": "us-east-1", "kind": "ec2:instance", "id": "i-1", "action": "stop"}, rep.actions)
        self.assertFalse(any(a["id"] == "i-keep" for a in rep.actions))

    def test_spot_is_reported_not_terminated(self):
        ec2 = ec2_fake(lifecycle="spot")
        rep = ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"ec2": ec2}))
        self.assertEqual(ec2.names(), [])
        self.assertEqual(rep.reported[0]["id"], "i-1")

    def test_resume_starts_only_what_was_tripped(self):
        ec2 = Fake(pages={"describe_instances": [{"Reservations": [{"Instances": [
            {"InstanceId": "i-tripped", "Tags": [{"Key": "spend_guard_prev", "Value": "tripped"}]},
            {"InstanceId": "i-was-off", "Tags": []},
        ]}]}]})
        ks.run(ks.Request("resume", "apps"), cfg(), factory_from({"ec2": ec2}))
        self.assertEqual(ec2.calls[0], ("start_instances", {"InstanceIds": ["i-tripped"]}))
        self.assertEqual(len([c for c in ec2.calls if c[0] == "start_instances"]), 1)


class AutoScaling(unittest.TestCase):
    def group(self, tags=None, lo=1, hi=4, want=2):
        return {"AutoScalingGroupName": "web", "MinSize": lo, "MaxSize": hi, "DesiredCapacity": want, "Tags": tags or []}

    def test_scale_to_zero_remembers_previous(self):
        asg = Fake(pages={"describe_auto_scaling_groups": [{"AutoScalingGroups": [self.group()]}]})
        ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"autoscaling": asg}))
        self.assertEqual(asg.calls[0][1]["Tags"][0]["Value"], "1/4/2")
        self.assertEqual(asg.calls[1], ("update_auto_scaling_group",
                                        {"AutoScalingGroupName": "web", "MinSize": 0, "MaxSize": 0, "DesiredCapacity": 0}))

    def test_resume_restores(self):
        g = self.group(tags=[{"Key": "spend_guard_prev", "Value": "1/4/2"}], lo=0, hi=0, want=0)
        asg = Fake(pages={"describe_auto_scaling_groups": [{"AutoScalingGroups": [g]}]})
        ks.run(ks.Request("resume", "apps"), cfg(), factory_from({"autoscaling": asg}))
        self.assertEqual(asg.calls[0][1], {"AutoScalingGroupName": "web", "MinSize": 1, "MaxSize": 4, "DesiredCapacity": 2})

    def test_already_zero_untouched(self):
        asg = Fake(pages={"describe_auto_scaling_groups": [{"AutoScalingGroups": [self.group(lo=0, hi=0, want=0)]}]})
        ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"autoscaling": asg}))
        self.assertEqual(asg.calls, [])


class Ecs(unittest.TestCase):
    def fake(self, desired=3, tags=None):
        svc = {"serviceArn": "arn:svc/web", "desiredCount": desired, "tags": tags or [{"key": "stack", "value": "saas"}]}
        return Fake(
            pages={"list_clusters": [{"clusterArns": ["arn:cluster/c"]}],
                   "list_services": [{"serviceArns": ["arn:svc/web"]}]},
            describe_services={"services": [svc]},
        )

    def test_stop_with_stack_filter(self):
        ecs = self.fake()
        ks.run(ks.Request("stop", "apps", stacks=("saas",)), cfg(), factory_from({"ecs": ecs}))
        self.assertIn(("update_service", {"cluster": "arn:cluster/c", "service": "arn:svc/web", "desiredCount": 0}), ecs.calls)
        self.assertIn(("tag_resource", {"resourceArn": "arn:svc/web", "tags": [{"key": "spend_guard_prev", "value": "3"}]}), ecs.calls)

    def test_other_stack_left_alone(self):
        ecs = self.fake()
        ks.run(ks.Request("stop", "apps", stacks=("other",)), cfg(), factory_from({"ecs": ecs}))
        self.assertNotIn("update_service", ecs.names())

    def test_resume(self):
        ecs = self.fake(desired=0, tags=[{"key": "spend_guard_prev", "value": "3"}])
        ks.run(ks.Request("resume", "apps"), cfg(), factory_from({"ecs": ecs}))
        self.assertIn(("update_service", {"cluster": "arn:cluster/c", "service": "arn:svc/web", "desiredCount": 3}), ecs.calls)


class Lambda(unittest.TestCase):
    def fake(self, reserved=None, tags=None, mapping_state="Enabled"):
        return Fake(
            pages={"list_functions": [{"Functions": [{"FunctionArn": "arn:fn:api"}]}],
                   "list_event_source_mappings": [{"EventSourceMappings": [{"UUID": "m1", "State": mapping_state}]}]},
            list_tags={"Tags": tags or {}},
            get_function_concurrency={} if reserved is None else {"ReservedConcurrentExecutions": reserved},
        )

    def test_throttle_and_detach(self):
        lam = self.fake()
        rep = ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"lambda": lam}))
        self.assertIn(("tag_resource", {"Resource": "arn:fn:api", "Tags": {"spend_guard_prev": "none"}}), lam.calls)
        self.assertIn(("put_function_concurrency", {"FunctionName": "arn:fn:api", "ReservedConcurrentExecutions": 0}), lam.calls)
        self.assertIn(("update_event_source_mapping", {"UUID": "m1", "Enabled": False}), lam.calls)
        self.assertEqual(rep.errors, [])

    def test_resume_unreserved_deletes_concurrency(self):
        lam = self.fake(reserved=0, tags={"spend_guard_prev": "none"}, mapping_state="Disabled")
        ks.run(ks.Request("resume", "apps"), cfg(), factory_from({"lambda": lam}))
        self.assertIn(("delete_function_concurrency", {"FunctionName": "arn:fn:api"}), lam.calls)
        self.assertIn(("update_event_source_mapping", {"UUID": "m1", "Enabled": True}), lam.calls)

    def test_resume_reserved_value(self):
        lam = self.fake(reserved=0, tags={"spend_guard_prev": "7"})
        ks.run(ks.Request("resume", "apps"), cfg(), factory_from({"lambda": lam}))
        self.assertIn(("put_function_concurrency", {"FunctionName": "arn:fn:api", "ReservedConcurrentExecutions": 7}), lam.calls)

    def test_self_is_skipped(self):
        lam = self.fake()
        ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"lambda": lam}), self_arn="arn:fn:api")
        self.assertEqual(lam.calls, [])


class Rds(unittest.TestCase):
    def test_cluster_stops_once_and_members_skipped(self):
        rds = Fake(pages={
            "describe_db_clusters": [{"DBClusters": [{"DBClusterIdentifier": "c1", "DBClusterArn": "arn:c1", "Status": "available",
                                                      "DBClusterMembers": [{"DBInstanceIdentifier": "c1-a"}], "TagList": []}]}],
            "describe_db_instances": [{"DBInstances": [
                {"DBInstanceIdentifier": "c1-a", "DBInstanceArn": "arn:c1-a", "DBInstanceStatus": "available", "TagList": []},
                {"DBInstanceIdentifier": "solo", "DBInstanceArn": "arn:solo", "DBInstanceStatus": "available", "TagList": []},
            ]}],
        })
        ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"rds": rds}))
        self.assertIn(("stop_db_cluster", {"DBClusterIdentifier": "c1"}), rds.calls)
        self.assertIn(("stop_db_instance", {"DBInstanceIdentifier": "solo"}), rds.calls)
        self.assertNotIn(("stop_db_instance", {"DBInstanceIdentifier": "c1-a"}), rds.calls)


class SageMaker(unittest.TestCase):
    def test_endpoints_reported_never_deleted(self):
        sm = Fake(pages={"list_endpoints": [{"Endpoints": [{"EndpointName": "ep", "EndpointStatus": "InService"}]}]})
        rep = ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"sagemaker": sm}))
        self.assertEqual(sm.calls, [])
        self.assertEqual(rep.reported[0]["id"], "ep")


class Orchestration(unittest.TestCase):
    def test_dry_run_changes_nothing(self):
        ec2 = ec2_fake()
        asg = Fake(pages={"describe_auto_scaling_groups": [{"AutoScalingGroups": [
            {"AutoScalingGroupName": "w", "MinSize": 1, "MaxSize": 2, "DesiredCapacity": 1, "Tags": []}]}]})
        rep = ks.run(ks.Request("stop", "apps", dry_run=True), cfg(), factory_from({"ec2": ec2, "autoscaling": asg}))
        self.assertEqual(ec2.calls + asg.calls, [])
        self.assertTrue(rep.dry_run)
        self.assertEqual(len(rep.actions), 2)

    def test_configured_dry_run_applies_to_budget_events(self):
        ec2 = ec2_fake()
        ks.run(ks.Request("stop", "apps", source="budget"), cfg(dry_run=True), factory_from({"ec2": ec2}))
        self.assertEqual(ec2.calls, [])

    def test_account_with_kill_switch_off_is_alert_only_for_budgets(self):
        cf = factory_from({})
        rep = ks.run(ks.Request("stop", "shared-infra", source="budget"), cfg(), cf)
        self.assertEqual(cf.seen, [])  # never even assumed the role
        self.assertIn("alert only", rep.reported[0]["note"])

    def test_manual_request_can_act_on_kill_switch_off_account(self):
        cf = factory_from({})
        ks.run(ks.Request("stop", "shared-infra"), cfg(), cf)
        self.assertEqual(cf.seen, ["222222222222"])

    def test_unknown_account(self):
        rep = ks.run(ks.Request("stop", "nope"), cfg(), factory_from({}))
        self.assertEqual(rep.actions, [])
        self.assertIn("not in ACCOUNTS", rep.reported[0]["note"])

    def test_one_failure_does_not_stop_the_sweep(self):
        ec2 = ec2_fake()
        ec2.responses["stop_instances"] = RuntimeError("throttled")
        asg = Fake(pages={"describe_auto_scaling_groups": [{"AutoScalingGroups": [
            {"AutoScalingGroupName": "w", "MinSize": 1, "MaxSize": 2, "DesiredCapacity": 1, "Tags": []}]}]})
        rep = ks.run(ks.Request("stop", "apps"), cfg(), factory_from({"ec2": ec2, "autoscaling": asg}))
        self.assertEqual(rep.errors[0]["id"], "i-1")
        self.assertIn("update_auto_scaling_group", asg.names())

    def test_every_region_swept(self):
        seen = []

        def clients_for(_acct):
            def make(service, region):
                seen.append((service, region))
                return Fake()
            return make

        ks.run(ks.Request("stop", "apps"), cfg(regions=("us-east-1", "us-west-2")), clients_for)
        self.assertEqual({r for _, r in seen}, {"us-east-1", "us-west-2"})
        self.assertEqual({s for s, _ in seen}, {s for s, _ in ks.SWEEPS})

    def test_never_calls_delete_or_terminate(self):
        # The whole point: reversible only. Scan the module for destructive verbs.
        src = Path(ks.__file__).read_text(encoding="utf-8")
        for verb in ("terminate_instances", "delete_db", "delete_service", "delete_function(",
                     "delete_auto_scaling_group", "delete_endpoint", "delete_bucket", "delete_object"):
            self.assertNotIn(verb, src)


if __name__ == "__main__":
    unittest.main()
