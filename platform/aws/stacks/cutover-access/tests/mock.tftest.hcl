# `tofu test` with a mocked AWS provider: the roles' trust and reach, as planned.
variables {
  state_bucket = "000000000000-tofu-state-us-east-1"
}

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "000000000000"
    }
  }
  mock_data "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
    }
  }
  mock_data "aws_kms_alias" {
    defaults = {
      target_key_arn = "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/cutover/mock"
    }
  }
}

mock_provider "aws" {
  alias = "shared_infra"
}

mock_provider "aws" {
  alias = "apps"
}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = {
      account_ids = { "shared-infra" = "111111111111", "apps" = "222222222222" }
    }
  }
}

run "trust_is_one_environment_each" {
  command = plan

  assert {
    condition = alltrue([
      for k, env in { plan = "cutover-plan", run = "cutover" } :
      join(",", flatten([for c in one(data.aws_iam_policy_document.trust[k].statement).condition : tolist(c.values) if c.variable == "token.actions.githubusercontent.com:sub"])) == "repo:Duncan-Haywood/oss-monorepo:environment:${env}"
    ])
    error_message = "Each GitHub role trusts exactly one environment of this repository."
  }
  assert {
    condition     = aws_iam_role.github["run"].path == "/cutover/" && aws_iam_role.github["run"].max_session_duration == 3600
    error_message = "Outside /github/ (the bootstrap's), one-hour sessions."
  }
}

run "plan_role_cannot_write_or_delete" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.github["plan"].statement :
      length(setintersection(toset(s.actions), toset(["secretsmanager:DeleteSecret", "s3:PutObject", "s3:DeleteObject", "kms:Encrypt", "kms:GenerateDataKey", "lambda:InvokeFunction"]))) == 0
    ])
    error_message = "The plan role reads; it never writes state, deletes secrets or invokes the copy."
  }
  assert {
    condition     = !anytrue([for s in data.aws_iam_policy_document.github["plan"].statement : contains(s.resources, "arn:aws:iam::222222222222:role/cutover/cutover-operate")])
    error_message = "The plan role cannot reach the operate role."
  }
}

run "secrets_and_state_are_scoped" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for k in ["plan", "run"] : [
        for s in data.aws_iam_policy_document.github[k].statement :
        alltrue([for r in s.resources : r == "arn:aws:secretsmanager:us-east-1:000000000000:secret:cutover/*"])
        if anytrue([for a in s.actions : startswith(a, "secretsmanager:")])
      ]
    ]))
    error_message = "Secret access is limited to cutover/* in the management account."
  }
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.github["run"].statement :
      alltrue([for r in s.resources : startswith(r, "arn:aws:s3:::000000000000-tofu-state-us-east-1/cloudflare/") || r == "arn:aws:s3:::000000000000-tofu-state-us-east-1"])
      if anytrue([for a in s.actions : startswith(a, "s3:")])
    ])
    error_message = "State access is limited to the cloudflare/ prefix."
  }
}

run "operate_is_db_admin_and_the_simulator" {
  command = plan

  assert {
    condition     = join(",", tolist(one([for s in data.aws_iam_policy_document.operate.statement : s.resources if s.sid == "CopyThroughDbAdmin"]))) == "arn:aws:lambda:us-east-1:222222222222:function:saas-starter-db-admin"
    error_message = "The copy can invoke db-admin and nothing else."
  }
  assert {
    condition = alltrue([
      for c in one([for s in data.aws_iam_policy_document.operate.statement : s.condition if s.sid == "SendToTheSimulatorOnly"]) :
      (c.variable == "ses:Recipients")
    ])
    error_message = "Sending is conditioned on the recipients."
  }
}
