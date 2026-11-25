"""Unit tests for the transitional key rotator (no AWS, no boto3).

    python3 -m pytest platform/aws/stacks/app-identity/rotator -q
"""

from __future__ import annotations

import itertools
import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import rotate  # noqa: E402

ARN = "arn:aws:secretsmanager:us-east-1:111111111111:secret:transitional/worker-aws-credentials"
USER = "transitional-worker"


class ResourceNotFoundException(Exception):
    pass


class FakeIAM:
    def __init__(self):
        self.keys: dict[str, str] = {}
        self.ids = (f"AKIA{n:016d}" for n in itertools.count())

    def list_access_keys(self, UserName):
        return {"AccessKeyMetadata": [{"AccessKeyId": k} for k in self.keys]}

    def delete_access_key(self, UserName, AccessKeyId):
        del self.keys[AccessKeyId]

    def create_access_key(self, UserName):
        if len(self.keys) >= 2:
            raise RuntimeError("LimitExceeded: two keys already")
        kid = next(self.ids)
        self.keys[kid] = f"secret-{kid}"
        return {"AccessKey": {"AccessKeyId": kid, "SecretAccessKey": self.keys[kid]}}


class FakeSM:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.stages: dict[str, set[str]] = {}

    def describe_secret(self, SecretId):
        return {"VersionIdsToStages": {v: sorted(s) for v, s in self.stages.items()}}

    def get_secret_value(self, SecretId, VersionId=None, VersionStage=None):
        for v, stages in self.stages.items():
            if (VersionId is None or v == VersionId) and (VersionStage is None or VersionStage in stages) and v in self.values:
                return {"SecretString": self.values[v]}
        raise ResourceNotFoundException("ResourceNotFound")

    def put_secret_value(self, SecretId, ClientRequestToken, SecretString, VersionStages):
        self.values[ClientRequestToken] = SecretString
        self.stages.setdefault(ClientRequestToken, set()).update(VersionStages)

    def update_secret_version_stage(self, SecretId, VersionStage, MoveToVersionId, RemoveFromVersionId=None):
        for v, stages in self.stages.items():
            stages.discard("AWSPREVIOUS") if VersionStage == "AWSCURRENT" else None
        if RemoveFromVersionId:
            self.stages[RemoveFromVersionId].discard(VersionStage)
            self.stages[RemoveFromVersionId].add("AWSPREVIOUS")
        self.stages[MoveToVersionId].discard("AWSPENDING")
        self.stages[MoveToVersionId].add(VersionStage)

    def start(self, token):
        """What Secrets Manager does before calling createSecret."""
        self.stages.setdefault(token, set()).add("AWSPENDING")

    def current(self):
        v = next(v for v, s in self.stages.items() if "AWSCURRENT" in s)
        return json.loads(self.values[v])


class FakeSTS:
    def __init__(self, iam, fail_first=0):
        self.iam, self.fail_first, self.calls = iam, fail_first, 0

    def __call__(self, key_id, secret):
        outer = self

        class Client:
            def get_caller_identity(self):
                outer.calls += 1
                if outer.calls <= outer.fail_first:
                    raise RuntimeError_("InvalidClientTokenId")
                if outer.iam.keys.get(key_id) != secret:
                    raise RuntimeError_("InvalidClientTokenId")
                return {"Arn": f"arn:aws:iam::111111111111:user/transitional/{USER}"}

        return Client()


class RuntimeError_(Exception):
    """A non-RuntimeError, as botocore's ClientError is."""


def rotate_once(r, sm, token):
    sm.start(token)
    for step in ("createSecret", "setSecret", "testSecret", "finishSecret"):
        r.handle({"SecretId": ARN, "ClientRequestToken": token, "Step": step})


def make(fail_first=0):
    iam, sm = FakeIAM(), FakeSM()
    sts = FakeSTS(iam, fail_first)
    return rotate.Rotator(sm, iam, USER, sts, sleep=lambda _s: None), sm, iam, sts


def test_first_rotation_creates_the_first_key():
    r, sm, iam, _ = make()
    rotate_once(r, sm, "v1")
    cur = sm.current()
    assert cur["user"] == USER and cur["access_key_id"] in iam.keys
    assert len(iam.keys) == 1


def test_previous_key_stays_valid_until_next_rotation():
    r, sm, iam, _ = make()
    rotate_once(r, sm, "v1")
    first = sm.current()["access_key_id"]
    rotate_once(r, sm, "v2")
    second = sm.current()["access_key_id"]
    assert first != second and set(iam.keys) == {first, second}
    rotate_once(r, sm, "v3")
    assert first not in iam.keys, "the key from two rotations ago is deleted"
    assert len(iam.keys) == 2


def test_create_is_idempotent():
    r, sm, iam, _ = make()
    sm.start("v1")
    r.handle({"SecretId": ARN, "ClientRequestToken": "v1", "Step": "createSecret"})
    r.handle({"SecretId": ARN, "ClientRequestToken": "v1", "Step": "createSecret"})
    assert len(iam.keys) == 1


def test_test_step_waits_for_propagation():
    r, sm, _, sts = make(fail_first=3)
    rotate_once(r, sm, "v1")
    assert sts.calls == 4


def test_test_step_gives_up_and_finish_never_runs():
    r, sm, iam, _ = make(fail_first=100)
    sm.start("v1")
    r.handle({"SecretId": ARN, "ClientRequestToken": "v1", "Step": "createSecret"})
    with pytest.raises(RuntimeError):
        r.handle({"SecretId": ARN, "ClientRequestToken": "v1", "Step": "testSecret"})
    assert not any("AWSCURRENT" in s for s in sm.stages.values())


def test_rejects_unstaged_version_and_unknown_step():
    r, sm, _, _ = make()
    with pytest.raises(ValueError):
        r.handle({"SecretId": ARN, "ClientRequestToken": "nope", "Step": "createSecret"})
    sm.start("v1")
    with pytest.raises(ValueError):
        r.handle({"SecretId": ARN, "ClientRequestToken": "v1", "Step": "dance"})
