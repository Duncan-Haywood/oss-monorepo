"""Rotate the transitional Worker's IAM access key (Secrets Manager rotation).

TRANSITIONAL: deleted with stacks/app-identity once products run on AWS.

Secrets Manager calls this Lambda four times per rotation, with
`Step` = createSecret, setSecret, testSecret, finishSecret, the secret's ARN
and a `ClientRequestToken` naming the new version.

  createSecret  delete the user's key that is not the current one (the key
                from two rotations ago), create a new key, store it as
                AWSPENDING;
  setSecret     nothing: the Worker pulls the key (priv-aws-worker-secret-sync.yml);
  testSecret    call sts:GetCallerIdentity with the new key and check it is
                the user, retrying while IAM propagates the key;
  finishSecret  move AWSCURRENT to the new version (the old one becomes
                AWSPREVIOUS and its key stays valid until the next rotation,
                so the daily Worker sync has a whole period to catch up).

At most two keys exist at any time (IAM's limit is two per user).
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Callable

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)


class Rotator:
    def __init__(self, sm: Any, iam: Any, user: str, sts_for: Callable[[str, str], Any],
                 sleep: Callable[[float], None] = time.sleep, attempts: int = 10):
        self.sm, self.iam, self.user = sm, iam, user
        self.sts_for, self.sleep, self.attempts = sts_for, sleep, attempts

    def _stage_version(self, arn: str, stage: str) -> str | None:
        versions = self.sm.describe_secret(SecretId=arn).get("VersionIdsToStages", {})
        return next((v for v, stages in versions.items() if stage in stages), None)

    def _value(self, arn: str, **kw) -> dict | None:
        try:
            return json.loads(self.sm.get_secret_value(SecretId=arn, **kw)["SecretString"])
        except Exception as exc:  # ResourceNotFoundException: no such version yet
            if "ResourceNotFound" in type(exc).__name__ + str(exc):
                return None
            raise

    def create(self, arn: str, token: str) -> None:
        if self._value(arn, VersionId=token, VersionStage="AWSPENDING"):
            LOG.info("createSecret: pending version exists")
            return
        current = self._value(arn, VersionStage="AWSCURRENT") or {}
        keys = self.iam.list_access_keys(UserName=self.user).get("AccessKeyMetadata", [])
        for k in keys:
            if k["AccessKeyId"] != current.get("access_key_id"):
                LOG.info("createSecret: deleting older key %s", k["AccessKeyId"][-4:])
                self.iam.delete_access_key(UserName=self.user, AccessKeyId=k["AccessKeyId"])
        new = self.iam.create_access_key(UserName=self.user)["AccessKey"]
        self.sm.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            SecretString=json.dumps({
                "user": self.user,
                "access_key_id": new["AccessKeyId"],
                "secret_access_key": new["SecretAccessKey"],
            }),
            VersionStages=["AWSPENDING"],
        )
        LOG.info("createSecret: new key %s stored as AWSPENDING", new["AccessKeyId"][-4:])

    def test(self, arn: str, token: str) -> None:
        pending = self._value(arn, VersionId=token, VersionStage="AWSPENDING")
        if not pending:
            raise RuntimeError("testSecret: no AWSPENDING value")
        last: Exception | None = None
        for attempt in range(self.attempts):
            try:
                who = self.sts_for(pending["access_key_id"], pending["secret_access_key"]).get_caller_identity()
                if not who["Arn"].endswith(f"/{self.user}"):
                    raise RuntimeError(f"testSecret: key belongs to {who['Arn']}, not {self.user}")
                LOG.info("testSecret: key works")
                return
            except RuntimeError:
                raise
            except Exception as exc:  # InvalidClientTokenId while IAM propagates
                last = exc
                self.sleep(min(2 ** attempt, 10))
        raise RuntimeError(f"testSecret: new key never worked: {last}")

    def finish(self, arn: str, token: str) -> None:
        current = self._stage_version(arn, "AWSCURRENT")
        if current == token:
            LOG.info("finishSecret: already current")
            return
        self.sm.update_secret_version_stage(
            SecretId=arn, VersionStage="AWSCURRENT", MoveToVersionId=token, RemoveFromVersionId=current
        )
        LOG.info("finishSecret: %s is AWSCURRENT", token)

    def handle(self, event: dict) -> None:
        arn, token, step = event["SecretId"], event["ClientRequestToken"], event["Step"]
        stages = self.sm.describe_secret(SecretId=arn).get("VersionIdsToStages", {})
        if token not in stages:
            raise ValueError(f"version {token} is not staged for rotation")
        if "AWSCURRENT" in stages[token] and step != "finishSecret":
            LOG.info("%s: version already current", step)
            return
        if step == "createSecret":
            self.create(arn, token)
        elif step == "setSecret":
            LOG.info("setSecret: nothing to set; the Worker pulls the key")
        elif step == "testSecret":
            self.test(arn, token)
        elif step == "finishSecret":
            self.finish(arn, token)
        else:
            raise ValueError(f"unknown step {step!r}")


def lambda_handler(event, context):  # pragma: no cover - thin AWS wrapper
    import boto3

    def sts_for(key_id: str, secret: str):
        return boto3.client("sts", aws_access_key_id=key_id, aws_secret_access_key=secret)

    Rotator(boto3.client("secretsmanager"), boto3.client("iam"), os.environ["USER_NAME"], sts_for).handle(event)
