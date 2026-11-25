"""Unit tests for the spend kill switch (no AWS, no boto3).

    python3 -m pytest platform/aws/stacks/spend/kill_switch -q
"""

from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import handler  # noqa: E402

ACCOUNTS = {"apps": "111111111111", "sandbox": "222222222222", "shared-infra": "333333333333"}


class Paginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **_):
        return iter(self.pages)


class FakeAWS:
    """One account's worth of EC2, Lambda, ECS, RDS, SES and IAM state."""

    def __init__(self):
        self.instances = {
            "i-run": {"InstanceId": "i-run", "State": "running", "Tags": []},
            "i-exempt": {"InstanceId": "i-exempt", "State": "running", "Tags": [{"Key": "spend-guard", "Value": "exempt"}]},
            "i-off": {"InstanceId": "i-off", "State": "stopped", "Tags": []},
        }
        self.functions = {
            "api": {"arn": "arn:fn:api", "concurrency": None, "tags": {}},
            "worker": {"arn": "arn:fn:worker", "concurrency": 5, "tags": {}},
            "spend-kill-switch": {"arn": "arn:fn:self", "concurrency": None, "tags": {}},
        }
        self.services = {"arn:svc:web": {"desiredCount": 2, "tags": {}}}
        self.dbs = {"db1": {"status": "available", "tags": {}}}
        self.clusters = {"aurora": {"status": "available", "tags": {}}}
        self.groups = {"web-asg": {"size": (1, 4, 2), "tags": {}}}
        self.mappings = {"m1": {"state": "Enabled", "fn": "api", "tags": {}}}
        self.endpoints = {"ep": "InService"}
        self.ses_enabled = True
        self.roles = {"app-llm": {"spend-guard": "deny-on-budget"}, "other": {}}
        self.users = {"transitional-worker": {"spend-guard": "deny-on-budget"}}
        self.inline = {}
        self.calls = []

    def factory(self, name):
        return {"ec2": EC2, "lambda": Lambda, "ecs": ECS, "rds": RDS, "sesv2": SES, "iam": IAM,
                "autoscaling": ASG, "sagemaker": SageMaker}[name](self)


class Svc:
    def __init__(self, s):
        self.s = s


class EC2(Svc):
    def get_paginator(self, _):
        def pages(Filters):
            state = Filters[0]["Values"][0]
            return [{"Reservations": [{"Instances": [
                {"InstanceId": i["InstanceId"], "Tags": i["Tags"], **({"InstanceLifecycle": "spot"} if i.get("spot") else {})}
                for i in self.s.instances.values() if i["State"] == state
            ]}]}]
        p = Paginator([])
        p.paginate = lambda **kw: iter(pages(**kw))
        return p

    def create_tags(self, Resources, Tags):
        for r in Resources:
            self.s.instances[r]["Tags"] = self.s.instances[r]["Tags"] + Tags

    def delete_tags(self, Resources, Tags):
        keys = {t["Key"] for t in Tags}
        for r in Resources:
            self.s.instances[r]["Tags"] = [t for t in self.s.instances[r]["Tags"] if t["Key"] not in keys]

    def stop_instances(self, InstanceIds):
        self.s.calls.append(("stop", tuple(InstanceIds)))
        for i in InstanceIds:
            self.s.instances[i]["State"] = "stopped"

    def start_instances(self, InstanceIds):
        self.s.calls.append(("start", tuple(InstanceIds)))
        for i in InstanceIds:
            self.s.instances[i]["State"] = "running"


class Lambda(Svc):
    def _by_arn(self, arn):
        if arn.startswith("arn:esm:"):
            return self.s.mappings[arn.split(":")[-1]]
        return next(f for f in self.s.functions.values() if f["arn"] == arn)

    def get_paginator(self, name):
        if name == "list_event_source_mappings":
            return Paginator([{"EventSourceMappings": [
                {"UUID": u, "EventSourceMappingArn": f"arn:esm:{u}", "State": m["state"],
                 "FunctionArn": f"arn:aws:lambda:us-east-1:111111111111:function:{m['fn']}"}
                for u, m in self.s.mappings.items()
            ]}])
        return Paginator([{"Functions": [{"FunctionName": n, "FunctionArn": f["arn"]} for n, f in self.s.functions.items()]}])

    def update_event_source_mapping(self, UUID, Enabled):
        self.s.mappings[UUID]["state"] = "Enabled" if Enabled else "Disabled"

    def list_tags(self, Resource):
        return {"Tags": dict(self._by_arn(Resource)["tags"])}

    def tag_resource(self, Resource, Tags):
        self._by_arn(Resource)["tags"].update(Tags)

    def untag_resource(self, Resource, TagKeys):
        for k in TagKeys:
            self._by_arn(Resource)["tags"].pop(k, None)

    def get_function_concurrency(self, FunctionName):
        c = self.s.functions[FunctionName]["concurrency"]
        return {} if c is None else {"ReservedConcurrentExecutions": c}

    def put_function_concurrency(self, FunctionName, ReservedConcurrentExecutions):
        self.s.functions[FunctionName]["concurrency"] = ReservedConcurrentExecutions

    def delete_function_concurrency(self, FunctionName):
        self.s.functions[FunctionName]["concurrency"] = None


class ECS(Svc):
    def get_paginator(self, name):
        if name == "list_clusters":
            return Paginator([{"clusterArns": ["arn:cluster:main"]}])
        return Paginator([{"serviceArns": list(self.s.services)}])

    def describe_services(self, cluster, services, include):
        return {"services": [
            {"serviceArn": a, "desiredCount": self.s.services[a]["desiredCount"],
             "tags": [{"key": k, "value": v} for k, v in self.s.services[a]["tags"].items()]}
            for a in services
        ]}

    def tag_resource(self, resourceArn, tags):
        self.s.services[resourceArn]["tags"].update({t["key"]: t["value"] for t in tags})

    def untag_resource(self, resourceArn, tagKeys):
        for k in tagKeys:
            self.s.services[resourceArn]["tags"].pop(k, None)

    def update_service(self, cluster, service, desiredCount):
        self.s.services[service]["desiredCount"] = desiredCount


class RDS(Svc):
    def get_paginator(self, name):
        if name == "describe_db_clusters":
            return Paginator([{"DBClusters": [
                {"DBClusterIdentifier": k, "DBClusterArn": f"arn:cluster:{k}", "Status": c["status"],
                 "TagList": [{"Key": a, "Value": b} for a, b in c["tags"].items()]}
                for k, c in self.s.clusters.items()
            ]}])
        return Paginator([{"DBInstances": [
            {"DBInstanceIdentifier": k, "DBInstanceArn": f"arn:db:{k}", "DBInstanceStatus": d["status"],
             "TagList": [{"Key": a, "Value": b} for a, b in d["tags"].items()]}
            for k, d in self.s.dbs.items()
        ]}])

    def _store(self, arn):
        return self.s.clusters if arn.startswith("arn:cluster:") else self.s.dbs

    def add_tags_to_resource(self, ResourceName, Tags):
        self._store(ResourceName)[ResourceName.split(":")[-1]]["tags"].update({t["Key"]: t["Value"] for t in Tags})

    def remove_tags_from_resource(self, ResourceName, TagKeys):
        for k in TagKeys:
            self._store(ResourceName)[ResourceName.split(":")[-1]]["tags"].pop(k, None)

    def stop_db_cluster(self, DBClusterIdentifier):
        self.s.clusters[DBClusterIdentifier]["status"] = "stopped"

    def start_db_cluster(self, DBClusterIdentifier):
        self.s.clusters[DBClusterIdentifier]["status"] = "available"

    def stop_db_instance(self, DBInstanceIdentifier):
        self.s.dbs[DBInstanceIdentifier]["status"] = "stopped"

    def start_db_instance(self, DBInstanceIdentifier):
        self.s.dbs[DBInstanceIdentifier]["status"] = "available"


class SES(Svc):
    def get_account(self):
        return {"SendingEnabled": self.s.ses_enabled}

    def put_account_sending_attributes(self, SendingEnabled):
        self.s.ses_enabled = SendingEnabled


class ASG(Svc):
    def get_paginator(self, _):
        return Paginator([{"AutoScalingGroups": [
            {"AutoScalingGroupName": n, "MinSize": g["size"][0], "MaxSize": g["size"][1], "DesiredCapacity": g["size"][2],
             "Tags": [{"Key": k, "Value": v} for k, v in g["tags"].items()]}
            for n, g in self.s.groups.items()
        ]}])

    def create_or_update_tags(self, Tags):
        for t in Tags:
            self.s.groups[t["ResourceId"]]["tags"][t["Key"]] = t["Value"]

    def delete_tags(self, Tags):
        for t in Tags:
            self.s.groups[t["ResourceId"]]["tags"].pop(t["Key"], None)

    def update_auto_scaling_group(self, AutoScalingGroupName, MinSize, MaxSize, DesiredCapacity):
        self.s.groups[AutoScalingGroupName]["size"] = (MinSize, MaxSize, DesiredCapacity)


class SageMaker(Svc):
    def get_paginator(self, _):
        return Paginator([{"Endpoints": [{"EndpointName": n, "EndpointStatus": st} for n, st in self.s.endpoints.items()]}])


class NoSuchEntityException(Exception):
    pass


class IAM(Svc):
    def get_paginator(self, name):
        if name == "list_roles":
            return Paginator([{"Roles": [{"RoleName": r} for r in self.s.roles]}])
        return Paginator([{"Users": [{"UserName": u} for u in self.s.users]}])

    def list_role_tags(self, RoleName):
        return {"Tags": [{"Key": k, "Value": v} for k, v in self.s.roles[RoleName].items()]}

    def list_user_tags(self, UserName):
        return {"Tags": [{"Key": k, "Value": v} for k, v in self.s.users[UserName].items()]}

    def list_role_policies(self, RoleName):
        return {"PolicyNames": ["spend-guard-deny"] if ("role", RoleName) in self.s.inline else []}

    def list_user_policies(self, UserName):
        return {"PolicyNames": ["spend-guard-deny"] if ("user", UserName) in self.s.inline else []}

    def put_role_policy(self, RoleName, PolicyName, PolicyDocument):
        self.s.inline[("role", RoleName)] = PolicyDocument

    def put_user_policy(self, UserName, PolicyName, PolicyDocument):
        self.s.inline[("user", UserName)] = PolicyDocument

    def delete_role_policy(self, RoleName, PolicyName):
        if ("role", RoleName) not in self.s.inline:
            raise NoSuchEntityException("NoSuchEntity")
        del self.s.inline[("role", RoleName)]

    def delete_user_policy(self, UserName, PolicyName):
        if ("user", UserName) not in self.s.inline:
            raise NoSuchEntityException("NoSuchEntity")
        del self.s.inline[("user", UserName)]


def run(aws, event, dry_run=False):
    return handler.handle(event, ACCOUNTS, dry_run, lambda _acct: aws.factory, self_function="spend-kill-switch")


def test_budget_accounts_matches_whole_names_only():
    msg = "You requested that we alert you when the ACTUAL Cost associated with your monthly-shared-infra budget ..."
    assert handler.budget_accounts(msg, ACCOUNTS) == ["shared-infra"]
    assert handler.budget_accounts("monthly-apps-old budget", ACCOUNTS) == []
    assert handler.budget_accounts("Budget Name: monthly-apps\n", ACCOUNTS) == ["apps"]


def test_kill_from_sns_stops_everything_not_exempt():
    aws = FakeAWS()
    out = run(aws, {"Records": [{"Sns": {"Message": "Budget Name: monthly-apps"}}]})
    assert out["action"] == "kill" and list(out["accounts"]) == ["apps"]
    assert aws.instances["i-run"]["State"] == "stopped"
    assert aws.instances["i-exempt"]["State"] == "running"
    assert aws.functions["api"]["concurrency"] == 0
    assert aws.functions["worker"]["concurrency"] == 0
    assert aws.functions["spend-kill-switch"]["concurrency"] is None, "never throttles itself"
    assert aws.services["arn:svc:web"]["desiredCount"] == 0
    assert aws.dbs["db1"]["status"] == "stopped"
    assert aws.ses_enabled is False
    assert set(aws.inline) == {("role", "app-llm"), ("user", "transitional-worker")}
    assert "aws-external-anthropic:*" in aws.inline[("role", "app-llm")]


def test_resume_restores_previous_state():
    aws = FakeAWS()
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "resume", "account": "apps"})
    assert aws.instances["i-run"]["State"] == "running"
    assert aws.instances["i-off"]["State"] == "stopped", "only starts what the switch stopped"
    assert aws.functions["api"]["concurrency"] is None
    assert aws.functions["worker"]["concurrency"] == 5
    assert aws.functions["api"]["tags"] == {}
    assert aws.services["arn:svc:web"]["desiredCount"] == 2
    assert aws.dbs["db1"]["status"] == "available" and aws.dbs["db1"]["tags"] == {}
    assert aws.ses_enabled is True
    assert aws.inline == {}


def test_kill_twice_keeps_original_values():
    aws = FakeAWS()
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "resume", "account": "apps"})
    assert aws.functions["worker"]["concurrency"] == 5


def test_dry_run_changes_nothing_but_reports():
    aws = FakeAWS()
    out = run(aws, {"action": "kill", "account": "apps"}, dry_run=True)
    assert aws.instances["i-run"]["State"] == "running"
    assert aws.ses_enabled is True and aws.inline == {}
    assert any("ec2 stop" in a for a in out["accounts"]["apps"])
    assert out["dry_run"] is True


def test_one_failing_service_does_not_stop_the_rest():
    aws = FakeAWS()

    def broken(name):
        if name == "ecs":
            raise RuntimeError("ecs down")
        return aws.factory(name)

    out = handler.handle({"action": "kill", "account": "apps"}, ACCOUNTS, False, lambda _a: broken)
    assert aws.instances["i-run"]["State"] == "stopped"
    assert any(a.startswith("ERROR scale_ecs_down") for a in out["accounts"]["apps"])


def test_resume_without_kill_is_a_no_op():
    aws = FakeAWS()
    out = run(aws, {"action": "resume", "account": "apps"})
    assert out["accounts"]["apps"] == []


@pytest.mark.parametrize("event", [{"action": "nuke", "account": "apps"}, {"action": "kill", "account": "nope"}])
def test_rejects_unknown_action_or_account(event):
    with pytest.raises(ValueError):
        run(FakeAWS(), event)


# --- Added with the anomaly / per-account / multi-region follow-up ---------


def test_kill_covers_asg_event_sources_aurora_and_reports_what_it_cannot_stop():
    aws = FakeAWS()
    aws.instances["i-spot"] = {"InstanceId": "i-spot", "State": "running", "Tags": [], "spot": True}
    out = run(aws, {"action": "kill", "account": "apps"})
    assert aws.groups["web-asg"]["size"] == (0, 0, 0)
    assert aws.mappings["m1"]["state"] == "Disabled"
    assert aws.clusters["aurora"]["status"] == "stopped"
    assert aws.instances["i-spot"]["State"] == "running", "spot instances are reported, never terminated"
    reports = [a for a in out["accounts"]["apps"] if a.startswith("REPORT")]
    assert any("i-spot" in r for r in reports) and any("sagemaker endpoint ep" in r for r in reports)


def test_resume_restores_asg_event_sources_and_aurora():
    aws = FakeAWS()
    aws.mappings["m-off"] = {"state": "Disabled", "fn": "api", "tags": {}}
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "resume", "account": "apps"})
    assert aws.groups["web-asg"]["size"] == (1, 4, 2) and aws.groups["web-asg"]["tags"] == {}
    assert aws.mappings["m1"]["state"] == "Enabled" and aws.mappings["m1"]["tags"] == {}
    assert aws.mappings["m-off"]["state"] == "Disabled", "only re-enables what the switch disabled"
    assert aws.clusters["aurora"]["status"] == "available" and aws.clusters["aurora"]["tags"] == {}


def test_kill_twice_keeps_original_asg_size():
    aws = FakeAWS()
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "kill", "account": "apps"})
    run(aws, {"action": "resume", "account": "apps"})
    assert aws.groups["web-asg"]["size"] == (1, 4, 2)


def test_exempt_asg_and_event_source_left_alone():
    aws = FakeAWS()
    aws.groups["web-asg"]["tags"] = {"spend-guard": "exempt"}
    aws.mappings["m1"]["tags"] = {"spend-guard": "exempt"}
    run(aws, {"action": "kill", "account": "apps"})
    assert aws.groups["web-asg"]["size"] == (1, 4, 2)
    assert aws.mappings["m1"]["state"] == "Enabled"


def test_budget_only_stops_kill_switch_accounts():
    aws = FakeAWS()
    msg = {"Records": [{"Sns": {"Message": "Budget Name: monthly-shared-infra"}}]}
    out = handler.handle(msg, ACCOUNTS, False, lambda _a: aws.factory, kill_on_budget=["apps", "sandbox"])
    assert out["accounts"] == {} and out["alert_only"] == ["shared-infra"]
    assert aws.instances["i-run"]["State"] == "running" and aws.calls == []


def test_manual_invocation_can_stop_an_alert_only_account():
    aws = FakeAWS()
    out = handler.handle({"action": "kill", "account": "shared-infra"}, ACCOUNTS, False, lambda _a: aws.factory,
                         kill_on_budget=["apps"])
    assert "shared-infra" in out["accounts"] and aws.instances["i-run"]["State"] == "stopped"


def test_every_region_swept_and_iam_runs_once():
    per_region = {"us-east-1": FakeAWS(), "us-west-2": FakeAWS()}
    iam_calls = []

    def factory(name, region):
        if name == "iam":
            iam_calls.append(region)
        return per_region[region].factory(name)

    out = handler.handle({"action": "kill", "account": "apps"}, ACCOUNTS, False, lambda _a: factory,
                         self_function="spend-kill-switch", regions=["us-east-1", "us-west-2"])
    for region, aws in per_region.items():
        assert aws.instances["i-run"]["State"] == "stopped", region
        assert aws.groups["web-asg"]["size"] == (0, 0, 0), region
    assert set(iam_calls) == {"us-east-1"}, "IAM is global: only the first region touches it"
    assert any(a.startswith("us-west-2 ec2 stop") for a in out["accounts"]["apps"])


def test_never_deletes_or_terminates():
    src = pathlib.Path(handler.__file__).read_text(encoding="utf-8")
    for verb in ("terminate_instances", "delete_db_", "delete_service", "delete_function(", "delete_auto_scaling_group",
                 "delete_endpoint", "delete_bucket", "delete_object", "delete_event_source_mapping"):
        assert verb not in src, verb
