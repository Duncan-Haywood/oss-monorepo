"""bootstrap.yaml: the single-account denies on github-apply match the tofu
code they stand in for, and organization mode is unchanged.

Plain YAML parsing (CloudFormation tags read as lists/maps); no AWS calls.
"""
import pathlib
import re

import yaml

AWS = pathlib.Path(__file__).resolve().parent.parent
HERE = AWS / "bootstrap"


class _Loader(yaml.SafeLoader):
    pass


def _tag(loader, suffix, node):
    if isinstance(node, yaml.SequenceNode):
        return {"!" + suffix: loader.construct_sequence(node, deep=True)}
    if isinstance(node, yaml.MappingNode):
        return {"!" + suffix: loader.construct_mapping(node, deep=True)}
    return {"!" + suffix: loader.construct_scalar(node)}


_Loader.add_multi_constructor("!", _tag)


def _apply_statements():
    doc = yaml.load((HERE / "bootstrap.yaml").read_text(), Loader=_Loader)
    return doc, doc["Resources"]["GitHubApplyRole"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]


def _mode(statements, single):
    """The statements CloudFormation would render for one AccountMode."""
    out = []
    for s in statements:
        if isinstance(s, dict) and "!If" in s:
            cond, yes, no = s["!If"]
            assert cond == "SingleAccount"
            pick = yes if single else no
            if pick != {"!Ref": "AWS::NoValue"}:
                out.append(pick)
        else:
            out.append(s)
    return out


def _tf_list(path, name):
    text = (AWS / path).read_text()
    block = text[text.index(f"{name} = ["):]
    return re.findall(r'"([^"]+)"', block[: block.index("]")])


def test_account_mode_parameter_and_condition():
    doc, _ = _apply_statements()
    assert doc["Parameters"]["AccountMode"]["AllowedValues"] == ["organization", "single"]
    assert doc["Parameters"]["AccountMode"]["Default"] == "organization"
    assert doc["Conditions"]["SingleAccount"] == {"!Equals": [{"!Ref": "AccountMode"}, "single"]}


def test_organization_mode_keeps_every_guardrail():
    _, st = _apply_statements()
    org = _mode(st, single=False)
    sids = [s["Sid"] for s in org]
    assert sids == ["KeepTheBootstrap", "KeepTheOidcProvider", "KeepTheBootstrapStack", "KeepTheState",
                    "KeepTheStateKey", "OwnerOnlyMoneyAndExits", "NoLongLivedKeysInManagement"]
    keys = org[-1]
    assert keys["Resource"] == "*" and sorted(keys["Action"]) == ["iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:CreateUser"]


def test_single_mode_adds_what_the_scps_denied():
    _, st = _apply_statements()
    single = {s["Sid"]: s for s in _mode(st, single=True)}
    for sid in ["KeepTheBootstrap", "KeepTheState", "OwnerOnlyMoneyAndExits", "NoLongLivedKeysInManagement",
                "SingleNoKeysOrPasswordsEvenTransitional", "SingleKeepAuditAndDetection",
                "SingleDenyUnapprovedRegions", "SingleNoCommitments"]:
        assert sid in single, sid
    # Users only under /transitional/; keys and passwords never.
    assert single["NoLongLivedKeysInManagement"]["NotResource"]["!Sub"].endswith(":user/transitional/*")
    assert {"iam:CreateAccessKey", "iam:CreateLoginProfile"} <= set(single["SingleNoKeysOrPasswordsEvenTransitional"]["Action"])
    assert single["SingleNoKeysOrPasswordsEvenTransitional"]["Resource"] == "*"
    # Never stop or delete audit and detection.
    for a in ["cloudtrail:DeleteTrail", "cloudtrail:StopLogging", "guardduty:DeleteDetector",
              "config:StopConfigurationRecorder", "securityhub:DisableSecurityHub", "access-analyzer:DeleteAnalyzer"]:
        assert a in single["SingleKeepAuditAndDetection"]["Action"], a


def test_region_list_matches_the_scp_and_the_boundary():
    _, st = _apply_statements()
    single = {s["Sid"]: s for s in _mode(st, single=True)}
    assert single["SingleDenyUnapprovedRegions"]["NotAction"] == _tf_list("stacks/org/scps.tf", "NotAction")
    assert single["SingleDenyUnapprovedRegions"]["Condition"]["StringNotEquals"]["aws:RequestedRegion"] == {"!Ref": "AllowedRegions"}


def test_commitments_together_cover_the_scp():
    _, st = _apply_statements()
    single = {s["Sid"]: s for s in _mode(st, single=True)}
    have = set(single["SingleNoCommitments"]["Action"]) | set(single["OwnerOnlyMoneyAndExits"]["Action"])
    text = (AWS / "stacks/org/scps.tf").read_text()
    block = text[text.index('Sid    = "NoCommitments"'):]
    scp = re.findall(r'"([a-z0-9-]+:[A-Za-z]+)"', block[: block.index("]")])
    assert scp and set(scp) <= have, set(scp) - have
