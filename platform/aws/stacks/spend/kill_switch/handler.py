"""Spend kill switch: stop what is running in an account whose budget fired.

Deployed by platform/aws/stacks/spend (kill_switch.tf) in the management
account and subscribed to the `budget-kill` SNS topic. For the account named
in the budget notification it assumes `spend-guard/spend-kill-switch-target`
(modules/account-baseline) and, in the home region:

  * EC2: stops running instances;
  * Lambda: sets reserved concurrency to 0 (the function stays, calls are
    throttled);
  * ECS: scales services to 0 tasks;
  * RDS: stops available DB instances;
  * SES: pauses sending for the whole account;
  * IAM: puts a deny policy (Claude Platform on AWS, Bedrock, SES sending) on
    roles and users tagged `spend-guard=deny-on-budget`.

Every change is tagged with what it replaced, so `resume` puts it back. A
resource tagged `spend-guard=exempt` is left alone, and so is this function.
Nothing is deleted: data, buckets, queues and DNS keep working.

Invoke directly to act by hand:
    {"action": "kill",   "account": "apps"}
    {"action": "resume", "account": "apps"}
With DRY_RUN=1 (the default the stack ships with) it only logs.

Budget notification text is not a documented format, so the account is found
by looking for a known budget name (`monthly-<account>`) anywhere in the SNS
message, not by parsing a fixed layout.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)

TAG = "spend-guard"
EXEMPT = "exempt"
DENY_ON_BUDGET = "deny-on-budget"
STOPPED_TAG = "spend-guard:stopped"
PREV_CONCURRENCY_TAG = "spend-guard:previous-concurrency"
PREV_DESIRED_TAG = "spend-guard:previous-desired"
DENY_POLICY_NAME = "spend-guard-deny"
DENY_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "SpendGuardDeny",
            "Effect": "Deny",
            "Action": [
                "aws-external-anthropic:*",
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
                "ses:SendEmail",
                "ses:SendRawEmail",
                "ses:SendBulkEmail",
            ],
            "Resource": "*",
        }
    ],
}

ClientFactory = Callable[[str], Any]


def budget_accounts(message: str, accounts: dict[str, str]) -> list[str]:
    """Account keys whose budget (`monthly-<key>`) the message names."""
    found = []
    for key in sorted(accounts, key=len, reverse=True):
        if re.search(rf"(?<![\w-])monthly-{re.escape(key)}(?![\w-])", message) and key not in found:
            found.append(key)
    return sorted(found)


def _tags_to_dict(tags: Any) -> dict[str, str]:
    if isinstance(tags, dict):
        return dict(tags)
    return {t["Key"]: t["Value"] for t in tags or []}


class Account:
    """The stop/resume actions for one account, given a boto3-like client factory."""

    def __init__(self, client: ClientFactory, dry_run: bool, self_function: str = ""):
        self.client = client
        self.dry_run = dry_run
        self.self_function = self_function
        self.actions: list[str] = []

    def _do(self, what: str, fn: Callable[[], Any]) -> None:
        self.actions.append(what)
        if self.dry_run:
            LOG.info("DRY RUN: %s", what)
            return
        LOG.info("%s", what)
        fn()

    # --- EC2 -------------------------------------------------------------
    def _instances(self, state: str) -> list[dict]:
        ec2 = self.client("ec2")
        out = []
        for page in ec2.get_paginator("describe_instances").paginate(
            Filters=[{"Name": "instance-state-name", "Values": [state]}]
        ):
            for res in page.get("Reservations", []):
                out.extend(res.get("Instances", []))
        return out

    def stop_ec2(self) -> None:
        ec2 = self.client("ec2")
        ids = [
            i["InstanceId"]
            for i in self._instances("running")
            if _tags_to_dict(i.get("Tags")).get(TAG) != EXEMPT
        ]
        if ids:
            self._do(f"ec2 stop {ids}", lambda: (
                ec2.create_tags(Resources=ids, Tags=[{"Key": STOPPED_TAG, "Value": "kill-switch"}]),
                ec2.stop_instances(InstanceIds=ids),
            ))

    def start_ec2(self) -> None:
        ec2 = self.client("ec2")
        ids = [
            i["InstanceId"]
            for i in self._instances("stopped")
            if _tags_to_dict(i.get("Tags")).get(STOPPED_TAG) == "kill-switch"
        ]
        if ids:
            self._do(f"ec2 start {ids}", lambda: (
                ec2.start_instances(InstanceIds=ids),
                ec2.delete_tags(Resources=ids, Tags=[{"Key": STOPPED_TAG}]),
            ))

    # --- Lambda ----------------------------------------------------------
    def _functions(self) -> list[dict]:
        lam = self.client("lambda")
        out = []
        for page in lam.get_paginator("list_functions").paginate():
            out.extend(page.get("Functions", []))
        return out

    def throttle_lambda(self) -> None:
        lam = self.client("lambda")
        for fn in self._functions():
            name, arn = fn["FunctionName"], fn["FunctionArn"]
            if name == self.self_function:
                continue
            tags = lam.list_tags(Resource=arn).get("Tags", {})
            if tags.get(TAG) == EXEMPT or PREV_CONCURRENCY_TAG in tags:
                continue
            current = lam.get_function_concurrency(FunctionName=name).get("ReservedConcurrentExecutions")
            if current == 0:
                continue
            prev = "none" if current is None else str(current)
            self._do(f"lambda {name} concurrency {prev} -> 0", lambda n=name, a=arn, p=prev: (
                lam.tag_resource(Resource=a, Tags={PREV_CONCURRENCY_TAG: p}),
                lam.put_function_concurrency(FunctionName=n, ReservedConcurrentExecutions=0),
            ))

    def restore_lambda(self) -> None:
        lam = self.client("lambda")
        for fn in self._functions():
            name, arn = fn["FunctionName"], fn["FunctionArn"]
            prev = lam.list_tags(Resource=arn).get("Tags", {}).get(PREV_CONCURRENCY_TAG)
            if prev is None:
                continue

            def restore(n=name, a=arn, p=prev):
                if p == "none":
                    lam.delete_function_concurrency(FunctionName=n)
                else:
                    lam.put_function_concurrency(FunctionName=n, ReservedConcurrentExecutions=int(p))
                lam.untag_resource(Resource=a, TagKeys=[PREV_CONCURRENCY_TAG])

            self._do(f"lambda {name} concurrency 0 -> {prev}", restore)

    # --- ECS -------------------------------------------------------------
    def _services(self) -> list[tuple[str, dict]]:
        ecs = self.client("ecs")
        out = []
        for cpage in ecs.get_paginator("list_clusters").paginate():
            for cluster in cpage.get("clusterArns", []):
                arns = []
                for spage in ecs.get_paginator("list_services").paginate(cluster=cluster):
                    arns.extend(spage.get("serviceArns", []))
                for i in range(0, len(arns), 10):
                    desc = ecs.describe_services(cluster=cluster, services=arns[i:i + 10], include=["TAGS"])
                    out.extend((cluster, s) for s in desc.get("services", []))
        return out

    def scale_ecs_down(self) -> None:
        ecs = self.client("ecs")
        for cluster, svc in self._services():
            tags = {t["key"]: t["value"] for t in svc.get("tags", [])}
            if tags.get(TAG) == EXEMPT or svc.get("desiredCount", 0) == 0:
                continue
            n, arn = svc["desiredCount"], svc["serviceArn"]
            self._do(f"ecs {arn} desired {n} -> 0", lambda c=cluster, a=arn, d=n: (
                ecs.tag_resource(resourceArn=a, tags=[{"key": PREV_DESIRED_TAG, "value": str(d)}]),
                ecs.update_service(cluster=c, service=a, desiredCount=0),
            ))

    def scale_ecs_up(self) -> None:
        ecs = self.client("ecs")
        for cluster, svc in self._services():
            tags = {t["key"]: t["value"] for t in svc.get("tags", [])}
            prev = tags.get(PREV_DESIRED_TAG)
            if prev is None:
                continue
            arn = svc["serviceArn"]
            self._do(f"ecs {arn} desired 0 -> {prev}", lambda c=cluster, a=arn, d=int(prev): (
                ecs.update_service(cluster=c, service=a, desiredCount=d),
                ecs.untag_resource(resourceArn=a, tagKeys=[PREV_DESIRED_TAG]),
            ))

    # --- RDS -------------------------------------------------------------
    def _db_instances(self) -> list[dict]:
        rds = self.client("rds")
        out = []
        for page in rds.get_paginator("describe_db_instances").paginate():
            out.extend(page.get("DBInstances", []))
        return out

    def stop_rds(self) -> None:
        rds = self.client("rds")
        for db in self._db_instances():
            tags = _tags_to_dict(db.get("TagList"))
            if db.get("DBInstanceStatus") != "available" or tags.get(TAG) == EXEMPT or db.get("DBClusterIdentifier"):
                continue
            ident, arn = db["DBInstanceIdentifier"], db["DBInstanceArn"]
            self._do(f"rds stop {ident}", lambda i=ident, a=arn: (
                rds.add_tags_to_resource(ResourceName=a, Tags=[{"Key": STOPPED_TAG, "Value": "kill-switch"}]),
                rds.stop_db_instance(DBInstanceIdentifier=i),
            ))

    def start_rds(self) -> None:
        rds = self.client("rds")
        for db in self._db_instances():
            if _tags_to_dict(db.get("TagList")).get(STOPPED_TAG) != "kill-switch":
                continue
            ident, arn = db["DBInstanceIdentifier"], db["DBInstanceArn"]
            self._do(f"rds start {ident}", lambda i=ident, a=arn: (
                rds.start_db_instance(DBInstanceIdentifier=i),
                rds.remove_tags_from_resource(ResourceName=a, TagKeys=[STOPPED_TAG]),
            ))

    # --- SES -------------------------------------------------------------
    def pause_ses(self) -> None:
        ses = self.client("sesv2")
        if ses.get_account().get("SendingEnabled", False):
            self._do("ses pause account sending", lambda: ses.put_account_sending_attributes(SendingEnabled=False))

    def resume_ses(self) -> None:
        ses = self.client("sesv2")
        if not ses.get_account().get("SendingEnabled", True):
            self._do("ses resume account sending", lambda: ses.put_account_sending_attributes(SendingEnabled=True))

    # --- IAM: cut LLM and email on opted-in principals -------------------
    def _tagged_principals(self) -> list[tuple[str, str]]:
        iam = self.client("iam")
        out = []
        for page in iam.get_paginator("list_roles").paginate():
            for role in page.get("Roles", []):
                tags = _tags_to_dict(iam.list_role_tags(RoleName=role["RoleName"]).get("Tags"))
                if tags.get(TAG) == DENY_ON_BUDGET:
                    out.append(("role", role["RoleName"]))
        for page in iam.get_paginator("list_users").paginate():
            for user in page.get("Users", []):
                tags = _tags_to_dict(iam.list_user_tags(UserName=user["UserName"]).get("Tags"))
                if tags.get(TAG) == DENY_ON_BUDGET:
                    out.append(("user", user["UserName"]))
        return out

    def deny_principals(self) -> None:
        iam = self.client("iam")
        doc = json.dumps(DENY_POLICY)
        for kind, name in self._tagged_principals():
            if kind == "role":
                self._do(f"iam deny role {name}", lambda n=name: iam.put_role_policy(
                    RoleName=n, PolicyName=DENY_POLICY_NAME, PolicyDocument=doc))
            else:
                self._do(f"iam deny user {name}", lambda n=name: iam.put_user_policy(
                    UserName=n, PolicyName=DENY_POLICY_NAME, PolicyDocument=doc))

    def allow_principals(self) -> None:
        iam = self.client("iam")
        for kind, name in self._tagged_principals():
            if kind == "role":
                if DENY_POLICY_NAME in iam.list_role_policies(RoleName=name).get("PolicyNames", []):
                    self._do(f"iam allow role {name}", lambda n=name: iam.delete_role_policy(
                        RoleName=n, PolicyName=DENY_POLICY_NAME))
            elif DENY_POLICY_NAME in iam.list_user_policies(UserName=name).get("PolicyNames", []):
                self._do(f"iam allow user {name}", lambda n=name: iam.delete_user_policy(
                    UserName=n, PolicyName=DENY_POLICY_NAME))

    # --- Orchestration ---------------------------------------------------
    def kill(self) -> list[str]:
        return self._run([self.deny_principals, self.pause_ses, self.throttle_lambda,
                          self.scale_ecs_down, self.stop_ec2, self.stop_rds])

    def resume(self) -> list[str]:
        return self._run([self.start_rds, self.start_ec2, self.scale_ecs_up,
                          self.restore_lambda, self.resume_ses, self.allow_principals])

    def _run(self, steps: list[Callable[[], None]]) -> list[str]:
        errors = []
        for step in steps:
            try:
                step()
            except Exception as exc:  # one failing service must not stop the rest
                LOG.exception("%s failed", step.__name__)
                errors.append(f"{step.__name__}: {exc}")
        if errors:
            self.actions.extend(f"ERROR {e}" for e in errors)
        return self.actions


def session_for(account_id: str, role: str):  # pragma: no cover - needs AWS
    import boto3

    creds = boto3.client("sts").assume_role(
        RoleArn=f"arn:aws:iam::{account_id}:role/{role}",
        RoleSessionName="spend-kill-switch",
    )["Credentials"]
    sess = boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=os.environ.get("AWS_REGION"),
    )
    return sess.client


def handle(event: dict, accounts: dict[str, str], dry_run: bool, factory_for: Callable[[str], ClientFactory],
           self_function: str = "") -> dict:
    """Pure entry point: work out (action, accounts) from the event and run it."""
    if "Records" in event:
        action = "kill"
        keys: list[str] = []
        for rec in event["Records"]:
            keys += [k for k in budget_accounts(rec.get("Sns", {}).get("Message", ""), accounts) if k not in keys]
    else:
        action = event.get("action", "")
        keys = [event.get("account", "")]
    if action not in ("kill", "resume"):
        raise ValueError(f"unknown action {action!r}")
    unknown = [k for k in keys if k not in accounts]
    if unknown:
        raise ValueError(f"unknown account(s) {unknown}; known: {sorted(accounts)}")
    result = {"action": action, "dry_run": dry_run, "accounts": {}}
    for key in keys:
        acct = Account(factory_for(accounts[key]), dry_run=dry_run, self_function=self_function)
        result["accounts"][key] = acct.kill() if action == "kill" else acct.resume()
    LOG.info("%s", json.dumps(result))
    return result


def lambda_handler(event, context):  # pragma: no cover - thin AWS wrapper
    accounts = json.loads(os.environ["ACCOUNTS"])
    role = os.environ.get("TARGET_ROLE", "spend-guard/spend-kill-switch-target")
    dry_run = os.environ.get("DRY_RUN", "1") != "0"
    return handle(event, accounts, dry_run, lambda acct: session_for(acct, role),
                  self_function=os.environ.get("AWS_LAMBDA_FUNCTION_NAME", ""))
