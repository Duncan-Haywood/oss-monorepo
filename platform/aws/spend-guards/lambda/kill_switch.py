"""Spend kill switch: stop, scale to zero or detach what is costing money.

Runs in the management account. AWS Budgets publishes to an SNS topic when an
account crosses its hard line; this function reads which account from the
budget name (`spend-<account>-monthly`), assumes the `spend-kill-switch` role
in that account, and in every allowed region:

  EC2 instances            stop (EBS volumes and data are kept)
  Auto Scaling groups      min = max = desired = 0
  ECS services             desiredCount = 0
  Lambda functions         reserved concurrency 0, event source mappings disabled
  RDS instances, clusters  stop (AWS starts them again after 7 days: see README)
  SageMaker endpoints      reported only (the only way to stop one deletes it)

What it never touches: S3, DynamoDB, CloudWatch Logs, KMS, Route 53,
CloudFront, IAM, Secrets Manager, Terraform state. Stopping is reversible;
deleting is not, so nothing here deletes.

Anything tagged `spend_guard = keep` is skipped. A manual invocation can narrow
the sweep to resources whose `stack` tag is in a list. Before changing
capacity, the previous value is written to a `spend_guard_prev` tag, and the
`resume` operation restores from it.

Manual invocation payload (JSON):
    {"operation": "stop" | "resume", "account": "apps",
     "stacks": ["saas-starter"], "dry_run": true}

The module has no import-time dependency on boto3, so the unit tests run with
no network and no AWS SDK: `python3 -m unittest discover -s lambda`.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

LOG = logging.getLogger("kill_switch")
LOG.setLevel(logging.INFO)

KEEP_TAG = "spend_guard"
KEEP_VALUE = "keep"
PREV_TAG = "spend_guard_prev"
STACK_TAG = "stack"
TRIPPED_VALUE = "tripped"

BUDGET_NAME = re.compile(r"\bspend-([a-z0-9][a-z0-9-]*?)-monthly\b")

ClientFactory = Callable[[str, str], Any]  # (service, region) -> client


# --------------------------------------------------------------------------
# Configuration and event parsing
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Config:
    accounts: dict[str, dict[str, Any]]  # name -> {"id": ..., "kill_switch": bool}
    regions: tuple[str, ...]
    role_name: str
    dry_run: bool

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Config":
        env = dict(os.environ if env is None else env)
        accounts = json.loads(env.get("ACCOUNTS", "{}"))
        regions = tuple(r for r in env.get("REGIONS", "us-east-1").split(",") if r)
        if not regions:
            raise ValueError("REGIONS is empty")
        mode = env.get("MODE", "enforce")
        if mode not in ("enforce", "dry_run"):
            raise ValueError(f"MODE must be enforce or dry_run, not {mode!r}")
        return cls(
            accounts=accounts,
            regions=regions,
            role_name=env.get("ROLE_NAME", "spend-kill-switch"),
            dry_run=mode == "dry_run",
        )


@dataclass
class Request:
    operation: str
    account: str
    stacks: tuple[str, ...] = ()
    dry_run: bool | None = None  # None: use the configured mode
    source: str = "manual"


def parse_event(event: dict[str, Any]) -> list[Request]:
    """Turn an SNS delivery or a manual payload into requests.

    An SNS message is either the plain-text notification AWS Budgets writes,
    or a JSON manual payload published by a person. Unrecognised messages are
    ignored (returned as no requests) rather than guessed at.
    """
    if "Records" in event:
        out: list[Request] = []
        for record in event["Records"]:
            message = (record.get("Sns") or {}).get("Message", "")
            out.extend(_parse_message(message))
        return out
    return [_manual(event)]


def _parse_message(message: str) -> list[Request]:
    stripped = message.strip()
    if stripped.startswith("{"):
        try:
            return [_manual(json.loads(stripped))]
        except (ValueError, KeyError):
            LOG.warning("ignoring malformed JSON message")
            return []
    # Prefer the explicit "Budget Name:" line; fall back to any budget name.
    line = re.search(r"Budget Name:\s*(\S+)", message)
    match = BUDGET_NAME.search(line.group(1) if line else message)
    if not match:
        LOG.warning("no spend-<account>-monthly budget name in message; ignoring")
        return []
    return [Request(operation="stop", account=match.group(1), source="budget")]


def _manual(payload: dict[str, Any]) -> Request:
    operation = payload.get("operation", "stop")
    if operation not in ("stop", "resume"):
        raise ValueError(f"operation must be stop or resume, not {operation!r}")
    account = payload["account"]
    stacks = payload.get("stacks") or ()
    if isinstance(stacks, str):
        stacks = (stacks,)
    dry_run = payload.get("dry_run")
    if dry_run is not None and not isinstance(dry_run, bool):
        raise ValueError("dry_run must be true or false")
    return Request(operation=operation, account=account, stacks=tuple(stacks), dry_run=dry_run)


# --------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------


def tags_to_dict(tags: Iterable[dict[str, str]] | dict[str, str] | None) -> dict[str, str]:
    """Normalise the three tag shapes AWS APIs return."""
    if not tags:
        return {}
    if isinstance(tags, dict):
        return dict(tags)
    out = {}
    for t in tags:
        key = t.get("Key", t.get("key"))
        value = t.get("Value", t.get("value", ""))
        if key is not None:
            out[key] = value
    return out


def selected(tags: dict[str, str], stacks: tuple[str, ...]) -> bool:
    """True when a resource is in scope for this sweep.

    `spend_guard = keep` always opts out. With no stack filter (the budget
    case) everything else is in scope, untagged resources included: a leaked
    key's crypto miner carries no tags, and it is exactly what must stop.
    """
    if tags.get(KEEP_TAG) == KEEP_VALUE:
        return False
    if stacks:
        return tags.get(STACK_TAG) in stacks
    return True


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------


@dataclass
class Report:
    account: str
    operation: str
    dry_run: bool
    actions: list[dict[str, str]] = field(default_factory=list)
    reported: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)

    def act(self, region: str, kind: str, ident: str, what: str) -> None:
        self.actions.append({"region": region, "kind": kind, "id": ident, "action": what})

    def note(self, region: str, kind: str, ident: str, why: str) -> None:
        self.reported.append({"region": region, "kind": kind, "id": ident, "note": why})

    def fail(self, region: str, kind: str, ident: str, err: Exception) -> None:
        self.errors.append({"region": region, "kind": kind, "id": ident, "error": f"{type(err).__name__}: {err}"})

    def as_dict(self) -> dict[str, Any]:
        return {
            "account": self.account,
            "operation": self.operation,
            "dry_run": self.dry_run,
            "actions": self.actions,
            "reported": self.reported,
            "errors": self.errors,
        }


# --------------------------------------------------------------------------
# Per-service sweeps. Each takes a client and mutates only when not dry_run.
# One failing resource never stops the sweep: errors go in the report.
# --------------------------------------------------------------------------


def _pages(client: Any, op: str, key: str, **kwargs: Any) -> Iterable[Any]:
    paginator = client.get_paginator(op)
    for page in paginator.paginate(**kwargs):
        yield from page.get(key, [])


def sweep_ec2(ec2: Any, region: str, req: Request, rep: Report) -> None:
    if req.operation == "stop":
        states = ["pending", "running"]
    else:
        states = ["stopped"]
    for reservation in _pages(ec2, "describe_instances", "Reservations",
                              Filters=[{"Name": "instance-state-name", "Values": states}]):
        for inst in reservation.get("Instances", []):
            iid = inst["InstanceId"]
            tags = tags_to_dict(inst.get("Tags"))
            if not selected(tags, req.stacks):
                continue
            if inst.get("InstanceLifecycle") == "spot" and req.operation == "stop":
                # A one-time spot instance cannot be stopped; terminating it
                # would delete it, which this function never does.
                rep.note(region, "ec2:instance", iid, "spot instance: not stopped, terminate by hand if needed")
                continue
            if req.operation == "resume" and tags.get(PREV_TAG) != TRIPPED_VALUE:
                continue  # only start what the kill switch stopped
            try:
                if req.operation == "stop":
                    if not rep.dry_run:
                        ec2.create_tags(Resources=[iid], Tags=[{"Key": PREV_TAG, "Value": TRIPPED_VALUE}])
                        ec2.stop_instances(InstanceIds=[iid])
                    rep.act(region, "ec2:instance", iid, "stop")
                else:
                    if not rep.dry_run:
                        ec2.start_instances(InstanceIds=[iid])
                        ec2.delete_tags(Resources=[iid], Tags=[{"Key": PREV_TAG}])
                    rep.act(region, "ec2:instance", iid, "start")
            except Exception as err:  # noqa: BLE001 - recorded, sweep continues
                rep.fail(region, "ec2:instance", iid, err)


def sweep_autoscaling(asg: Any, region: str, req: Request, rep: Report) -> None:
    for group in _pages(asg, "describe_auto_scaling_groups", "AutoScalingGroups"):
        name = group["AutoScalingGroupName"]
        tags = tags_to_dict(group.get("Tags"))
        if not selected(tags, req.stacks):
            continue
        try:
            if req.operation == "stop":
                if group["MaxSize"] == 0 and group["DesiredCapacity"] == 0:
                    continue
                prev = f'{group["MinSize"]}/{group["MaxSize"]}/{group["DesiredCapacity"]}'
                if not rep.dry_run:
                    asg.create_or_update_tags(Tags=[{
                        "ResourceId": name, "ResourceType": "auto-scaling-group",
                        "Key": PREV_TAG, "Value": prev, "PropagateAtLaunch": False,
                    }])
                    asg.update_auto_scaling_group(AutoScalingGroupName=name, MinSize=0, MaxSize=0, DesiredCapacity=0)
                rep.act(region, "autoscaling:group", name, f"scale 0 (was {prev})")
            else:
                prev = tags.get(PREV_TAG)
                if not prev:
                    continue
                lo, hi, want = (int(x) for x in prev.split("/"))
                if not rep.dry_run:
                    asg.update_auto_scaling_group(AutoScalingGroupName=name, MinSize=lo, MaxSize=hi, DesiredCapacity=want)
                    asg.delete_tags(Tags=[{"ResourceId": name, "ResourceType": "auto-scaling-group", "Key": PREV_TAG}])
                rep.act(region, "autoscaling:group", name, f"restore {prev}")
        except Exception as err:  # noqa: BLE001
            rep.fail(region, "autoscaling:group", name, err)


def sweep_ecs(ecs: Any, region: str, req: Request, rep: Report) -> None:
    for cluster in _pages(ecs, "list_clusters", "clusterArns"):
        arns = list(_pages(ecs, "list_services", "serviceArns", cluster=cluster))
        for i in range(0, len(arns), 10):  # describe_services takes 10 at a time
            described = ecs.describe_services(cluster=cluster, services=arns[i:i + 10], include=["TAGS"])
            for svc in described.get("services", []):
                arn = svc["serviceArn"]
                tags = tags_to_dict(svc.get("tags"))
                if not selected(tags, req.stacks):
                    continue
                try:
                    if req.operation == "stop":
                        if svc.get("desiredCount", 0) == 0:
                            continue
                        prev = str(svc["desiredCount"])
                        if not rep.dry_run:
                            ecs.tag_resource(resourceArn=arn, tags=[{"key": PREV_TAG, "value": prev}])
                            ecs.update_service(cluster=cluster, service=arn, desiredCount=0)
                        rep.act(region, "ecs:service", arn, f"desired 0 (was {prev})")
                    else:
                        prev = tags.get(PREV_TAG)
                        if not prev:
                            continue
                        if not rep.dry_run:
                            ecs.update_service(cluster=cluster, service=arn, desiredCount=int(prev))
                            ecs.untag_resource(resourceArn=arn, tagKeys=[PREV_TAG])
                        rep.act(region, "ecs:service", arn, f"desired {prev}")
                except Exception as err:  # noqa: BLE001
                    rep.fail(region, "ecs:service", arn, err)


def sweep_lambda(lam: Any, region: str, req: Request, rep: Report, self_arn: str | None) -> None:
    for fn in _pages(lam, "list_functions", "Functions"):
        arn = fn["FunctionArn"]
        if self_arn and arn == self_arn:
            continue  # never throttle ourselves (we run in another account anyway)
        try:
            tags = tags_to_dict(lam.list_tags(Resource=arn).get("Tags"))
        except Exception as err:  # noqa: BLE001
            rep.fail(region, "lambda:function", arn, err)
            continue
        if not selected(tags, req.stacks):
            continue
        try:
            if req.operation == "stop":
                current = lam.get_function_concurrency(FunctionName=arn).get("ReservedConcurrentExecutions")
                if current == 0:
                    continue
                prev = "none" if current is None else str(current)
                if not rep.dry_run:
                    lam.tag_resource(Resource=arn, Tags={PREV_TAG: prev})
                    lam.put_function_concurrency(FunctionName=arn, ReservedConcurrentExecutions=0)
                rep.act(region, "lambda:function", arn, f"concurrency 0 (was {prev})")
                for mapping in _pages(lam, "list_event_source_mappings", "EventSourceMappings", FunctionName=arn):
                    if mapping.get("State") in ("Enabled", "Enabling", "Updating"):
                        if not rep.dry_run:
                            lam.update_event_source_mapping(UUID=mapping["UUID"], Enabled=False)
                        rep.act(region, "lambda:event-source-mapping", mapping["UUID"], "disable")
            else:
                prev = tags.get(PREV_TAG)
                if not prev:
                    continue
                if not rep.dry_run:
                    if prev == "none":
                        lam.delete_function_concurrency(FunctionName=arn)
                    else:
                        lam.put_function_concurrency(FunctionName=arn, ReservedConcurrentExecutions=int(prev))
                    lam.untag_resource(Resource=arn, TagKeys=[PREV_TAG])
                rep.act(region, "lambda:function", arn, f"concurrency {prev}")
                for mapping in _pages(lam, "list_event_source_mappings", "EventSourceMappings", FunctionName=arn):
                    if mapping.get("State") == "Disabled":
                        if not rep.dry_run:
                            lam.update_event_source_mapping(UUID=mapping["UUID"], Enabled=True)
                        rep.act(region, "lambda:event-source-mapping", mapping["UUID"], "enable")
        except Exception as err:  # noqa: BLE001
            rep.fail(region, "lambda:function", arn, err)


def sweep_rds(rds: Any, region: str, req: Request, rep: Report) -> None:
    want_state = "available" if req.operation == "stop" else "stopped"
    clustered: set[str] = set()
    for cluster in _pages(rds, "describe_db_clusters", "DBClusters"):
        cid = cluster["DBClusterIdentifier"]
        for member in cluster.get("DBClusterMembers", []):
            clustered.add(member["DBInstanceIdentifier"])
        tags = tags_to_dict(cluster.get("TagList"))
        if cluster.get("Status") != want_state or not selected(tags, req.stacks):
            continue
        if req.operation == "resume" and tags.get(PREV_TAG) != TRIPPED_VALUE:
            continue
        try:
            if req.operation == "stop":
                if not rep.dry_run:
                    rds.add_tags_to_resource(ResourceName=cluster["DBClusterArn"], Tags=[{"Key": PREV_TAG, "Value": TRIPPED_VALUE}])
                    rds.stop_db_cluster(DBClusterIdentifier=cid)
                rep.act(region, "rds:cluster", cid, "stop")
            else:
                if not rep.dry_run:
                    rds.start_db_cluster(DBClusterIdentifier=cid)
                    rds.remove_tags_from_resource(ResourceName=cluster["DBClusterArn"], TagKeys=[PREV_TAG])
                rep.act(region, "rds:cluster", cid, "start")
        except Exception as err:  # noqa: BLE001
            rep.fail(region, "rds:cluster", cid, err)

    for inst in _pages(rds, "describe_db_instances", "DBInstances"):
        iid = inst["DBInstanceIdentifier"]
        if iid in clustered:
            continue  # stopped with its cluster
        tags = tags_to_dict(inst.get("TagList"))
        if inst.get("DBInstanceStatus") != want_state or not selected(tags, req.stacks):
            continue
        if req.operation == "resume" and tags.get(PREV_TAG) != TRIPPED_VALUE:
            continue
        try:
            if req.operation == "stop":
                if not rep.dry_run:
                    rds.add_tags_to_resource(ResourceName=inst["DBInstanceArn"], Tags=[{"Key": PREV_TAG, "Value": TRIPPED_VALUE}])
                    rds.stop_db_instance(DBInstanceIdentifier=iid)
                rep.act(region, "rds:instance", iid, "stop")
            else:
                if not rep.dry_run:
                    rds.start_db_instance(DBInstanceIdentifier=iid)
                    rds.remove_tags_from_resource(ResourceName=inst["DBInstanceArn"], TagKeys=[PREV_TAG])
                rep.act(region, "rds:instance", iid, "start")
        except Exception as err:  # noqa: BLE001
            rep.fail(region, "rds:instance", iid, err)


def sweep_sagemaker(sm: Any, region: str, req: Request, rep: Report) -> None:
    if req.operation != "stop":
        return
    for ep in _pages(sm, "list_endpoints", "Endpoints"):
        if ep.get("EndpointStatus") in ("InService", "Creating", "Updating"):
            rep.note(region, "sagemaker:endpoint", ep["EndpointName"],
                     "still billing: stopping an endpoint means deleting it, which needs a person")


SWEEPS: list[tuple[str, Callable[..., None]]] = [
    ("ec2", sweep_ec2),
    ("autoscaling", sweep_autoscaling),
    ("ecs", sweep_ecs),
    ("lambda", sweep_lambda),
    ("rds", sweep_rds),
    ("sagemaker", sweep_sagemaker),
]


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


def run(req: Request, cfg: Config, clients_for: Callable[[str], ClientFactory], self_arn: str | None = None) -> Report:
    """Run one request. `clients_for(account_id)` returns a (service, region) factory."""
    dry_run = cfg.dry_run if req.dry_run is None else req.dry_run
    rep = Report(account=req.account, operation=req.operation, dry_run=dry_run)
    account = cfg.accounts.get(req.account)
    if account is None:
        rep.note("-", "account", req.account, "not in ACCOUNTS: nothing done")
        return rep
    if req.source == "budget" and not account.get("kill_switch", False):
        rep.note("-", "account", req.account, "kill_switch is off for this account: alert only")
        return rep
    factory = clients_for(str(account["id"]))
    for region in cfg.regions:
        for service, sweep in SWEEPS:
            try:
                client = factory(service, region)
                if service == "lambda":
                    sweep(client, region, req, rep, self_arn)
                else:
                    sweep(client, region, req, rep)
            except Exception as err:  # noqa: BLE001 - one service failing must not stop the rest
                rep.fail(region, service, "*", err)
    return rep


def boto_clients_for(role_name: str) -> Callable[[str], ClientFactory]:  # pragma: no cover - needs AWS
    import boto3  # imported here so tests need no SDK

    sts = boto3.client("sts")

    def for_account(account_id: str) -> ClientFactory:
        partition = boto3.session.Session().get_partition_for_region(sts.meta.region_name)
        creds = sts.assume_role(
            RoleArn=f"arn:{partition}:iam::{account_id}:role/{role_name}",
            RoleSessionName="spend-kill-switch",
            DurationSeconds=900,
        )["Credentials"]
        session = boto3.session.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )
        return lambda service, region: session.client(service, region_name=region)

    return for_account


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:  # pragma: no cover - thin AWS glue
    cfg = Config.from_env()
    clients_for = boto_clients_for(cfg.role_name)
    self_arn = getattr(context, "invoked_function_arn", None)
    reports = [run(req, cfg, clients_for, self_arn).as_dict() for req in parse_event(event)]
    LOG.info(json.dumps({"kill_switch": reports}))
    if any(r["errors"] for r in reports):
        # Fail the invocation so SNS retries and the DLQ keeps the event.
        raise RuntimeError(json.dumps({"kill_switch_errors": [r["errors"] for r in reports]}))
    return {"reports": reports}
