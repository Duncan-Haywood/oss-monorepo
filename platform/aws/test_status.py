"""Tests for status.sh against a fake `aws` CLI (no AWS account needed).

The fake reads responses keyed by "<service> <operation>" from a JSON file; a
missing key makes the call fail like the real CLI, with the key's "!error"
text if given.
"""
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "status.sh"

FAKE_AWS = r'''#!/usr/bin/env python3
import json, os, sys
args = [a for a in sys.argv[1:]]
key = " ".join(args[:2])
with open(os.environ["FAKE_AWS_RESPONSES"]) as f:
    resp = json.load(f)
with open(os.environ["FAKE_AWS_LOG"], "a") as f:
    f.write(" ".join(args) + "\n")
if key in resp:
    out = resp[key]
    # emulate --query for the few shapes status.sh asks for
    if "--query" in args:
        q = args[args.index("--query") + 1]
        out = resp.get(key + " ?" + q, out)
    print(json.dumps(out)); sys.exit(0)
err = resp.get("!error " + key, "An error occurred (AccessDenied) when calling " + key)
print(err, file=sys.stderr); sys.exit(254)
'''


def run(tmp_path, responses, *extra):
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")
    bindir = tmp_path / "bin"
    bindir.mkdir()
    fake = bindir / "aws"
    fake.write_text(FAKE_AWS)
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    resp_file = tmp_path / "resp.json"
    resp_file.write_text(json.dumps(responses))
    log = tmp_path / "calls.log"
    log.write_text("")
    env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}",
               FAKE_AWS_RESPONSES=str(resp_file), FAKE_AWS_LOG=str(log))
    p = subprocess.run(["bash", str(SCRIPT), "--no-github", *extra],
                       capture_output=True, text=True, env=env, timeout=60)
    return p, log.read_text().splitlines()


ACCOUNTS = ["log-archive", "security", "shared-infra", "apps", "payments", "sandbox"]


def org_midway():
    """Roughly where the move stood on 2026-11-27: org applied, baseline failing."""
    return {
        "sts get-caller-identity": {"Account": "111122223333",
                                     "Arn": "arn:aws:sts::111122223333:assumed-role/AWSReservedSSO_OwnerAdmin_x/owner"},
        "cloudformation describe-stacks": {"Stacks": [{"StackStatus": "CREATE_COMPLETE",
                                                        "Outputs": [{"OutputKey": "AccountMode", "OutputValue": "organization"}]}]},
        "s3api list-objects-v2": [["org/terraform.tfstate", "2026-11-27T03:00:00Z"]],
        "organizations describe-organization": {"Organization": {"Id": "o-abc", "MasterAccountId": "111122223333"}},
        "organizations list-roots": {"Roots": [{"PolicyTypes": [
            {"Type": "SERVICE_CONTROL_POLICY", "Status": "ENABLED"},
            {"Type": "RESOURCE_CONTROL_POLICY", "Status": "ENABLED"}]}]},
        "organizations list-accounts": {"Accounts": [
            {"Name": n, "Id": str(100000000000 + i), "Status": "ACTIVE"} for i, n in enumerate(ACCOUNTS)]},
        "organizations list-delegated-administrators": ["security"],
        "securityhub describe-hub": {"HubArn": "arn"},
        "sns list-subscriptions": [],
        "sso-admin list-instances": {"Instances": []},
        "sts assume-role": {"Credentials": {"AccessKeyId": "AKIAFAKE", "SecretAccessKey": "x", "SessionToken": "y"}},
        "guardduty list-detectors": ["d-1"],
        "securityhub describe-organization-configuration": {
            "OrganizationConfiguration": {"ConfigurationType": "LOCAL"}},
        "securityhub list-configuration-policies": [],
        "sesv2 get-account": {"ProductionAccessEnabled": False},
        "sesv2 list-email-identities": [],
    }


def test_midway_reports_progress_and_never_writes(tmp_path):
    p, calls = run(tmp_path, org_midway())
    assert p.returncode == 0, p.stderr
    out = p.stdout
    assert "OK    org applied" in out
    assert "WAIT  baseline: no state yet" in out
    assert "account apps (100000000003) ACTIVE" in out
    assert "Security Hub central configuration not on yet (LOCAL)" in out
    assert "enable IAM Identity Center" in out
    assert "SES still in the sandbox" in out
    # read-only: every call is a describe/list/get (or the assume-role for reading members)
    verbs = {c.split()[1] for c in calls}
    allowed = ("describe-", "list-", "get-", "assume-role")
    assert all(v.startswith(allowed) for v in verbs), verbs


def test_root_skips_member_checks(tmp_path):
    r = org_midway()
    r["sts get-caller-identity"]["Arn"] = "arn:aws:iam::111122223333:root"
    p, calls = run(tmp_path, r)
    assert p.returncode == 0, p.stderr
    assert "signed in as root" in p.stdout
    assert not any(c.startswith("sts assume-role") for c in calls)


def test_fresh_account_points_at_the_runbook(tmp_path):
    r = {
        "sts get-caller-identity": {"Account": "111122223333", "Arn": "arn:aws:iam::111122223333:root"},
        "!error organizations describe-organization":
            "An error occurred (AWSOrganizationsNotInUseException) when calling DescribeOrganization: AWSOrganizationsNotInUse",
    }
    p, _ = run(tmp_path, r)
    assert p.returncode == 0, p.stderr
    assert "TODO  github-bootstrap not found" in p.stdout
    assert "no Organization yet" in p.stdout


def test_central_config_enabled(tmp_path):
    r = org_midway()
    r["securityhub describe-organization-configuration"] = {
        "OrganizationConfiguration": {"ConfigurationType": "CENTRAL", "Status": "ENABLED"}}
    r["securityhub list-configuration-policies"] = ["baseline"]
    r["sesv2 list-email-identities"] = [["marisstella.app", "SUCCESS"]]
    p, _ = run(tmp_path, r)
    assert "OK    Security Hub central configuration ENABLED" in p.stdout
    assert "OK    Security Hub 'baseline' policy" in p.stdout
    assert "SES identity marisstella.app verified" in p.stdout
