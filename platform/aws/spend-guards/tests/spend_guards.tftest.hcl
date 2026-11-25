# Security and safety invariants of the spend-guards stack, against mocked
# providers (no AWS account needed): tofu test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "000000000000" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_organizations_organization" {
    defaults = { id = "o-exampleorg" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::000000000000:role/mock" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:000000000000:spend-guards-kill-switch" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:000000000000:key/mock" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:000000000000:spend-guards-kill-switch-dlq" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:000000000000:log-group:/aws/lambda/spend-guards-kill-switch" }
  }
  mock_resource "aws_ce_anomaly_monitor" {
    defaults = { arn = "arn:aws:ce::000000000000:anomalymonitor/mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:000000000000:function:spend-guards-kill-switch" }
  }
  mock_resource "aws_budgets_budget" {
    defaults = { arn = "arn:aws:budgets::000000000000:budget/mock" }
  }
  mock_resource "aws_organizations_policy" {
    defaults = {
      id  = "p-mockdeny"
      arn = "arn:aws:organizations::000000000000:policy/o-exampleorg/service_control_policy/p-mockdeny"
    }
  }
}

mock_provider "archive" {}

variables {
  deploy_role_arn = "arn:aws:iam::000000000000:role/gha-oss-monorepo-spend-guards-plan"
  alert_emails    = ["alerts@example.invalid"]
  accounts = {
    apps         = { id = "111111111111", monthly_limit_usd = 40 }
    shared-infra = { id = "222222222222", monthly_limit_usd = 25, kill_switch = false }
    payments     = { id = "333333333333", monthly_limit_usd = 10, hard_action = "none", kill_switch = false }
  }
}

run "budget_per_account_plus_org" {
  command = plan

  assert {
    condition     = keys(module.account_budget) == ["apps", "payments", "shared-infra"]
    error_message = "Every account must get a budget."
  }
  assert {
    condition     = module.org_budget.budget_name == "spend-org-monthly"
    error_message = "The whole bill needs a budget."
  }
}

run "deny_scp_denies_spend_and_exempts_only_kill_role" {
  command = plan

  assert {
    condition     = jsondecode(aws_organizations_policy.deny_new_spend.content).Statement[0].Effect == "Deny"
    error_message = "The hard-line SCP must deny."
  }
  assert {
    condition = alltrue([for a in ["ec2:RunInstances", "ecs:UpdateService", "lambda:CreateFunction", "bedrock:InvokeModel", "ses:SendRawEmail", "sagemaker:Create*"] :
    contains(jsondecode(aws_organizations_policy.deny_new_spend.content).Statement[0].Action, a)])
    error_message = "The SCP must deny the main ways to start spending."
  }
  assert {
    condition     = jsondecode(aws_organizations_policy.deny_new_spend.content).Statement[0].Condition.ArnNotLike["aws:PrincipalArn"] == ["arn:aws:iam::*:role/spend-kill-switch"]
    error_message = "Only the kill-switch role may be exempt."
  }
  assert {
    condition = length([for a in jsondecode(aws_organizations_policy.deny_new_spend.content).Statement[0].Action :
    a if can(regex("^(s3:|logs:|cloudtrail:|route53:|kms:|iam:|dynamodb:(Get|Put|Query)|route53domains:RenewDomain)", a))]) == 0
    error_message = "The SCP must not touch storage, logs, DNS, keys or domain renewals."
  }
}

run "budget_actions_role_is_least_privilege" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role.budget_actions.assume_role_policy).Statement[0].Principal == { Service = "budgets.amazonaws.com" }
    error_message = "Only AWS Budgets may assume the budget-actions role."
  }
  assert {
    condition     = jsondecode(aws_iam_role.budget_actions.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "000000000000"
    error_message = "Confused-deputy guard missing."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.budget_actions.policy).Statement :
    s.Resource != "*" if contains(s.Action, "organizations:AttachPolicy")])
    error_message = "Attach/detach must be scoped to the SCP and accounts."
  }
  assert {
    # apps and shared-infra opted in to the SCP; payments did not.
    condition = toset(jsondecode(aws_iam_role_policy.budget_actions.policy).Statement[0].Resource) == toset([
      "arn:aws:organizations::000000000000:policy/o-exampleorg/service_control_policy/p-mockdeny",
      "arn:aws:organizations::000000000000:account/o-exampleorg/111111111111",
      "arn:aws:organizations::000000000000:account/o-exampleorg/222222222222",
    ])
    error_message = "The SCP may be attached only to accounts whose hard_action is scp."
  }
  assert {
    condition     = alltrue([for s in jsondecode(aws_iam_role_policy.budget_actions.policy).Statement : !contains(flatten([s.Action]), "*")])
    error_message = "No wildcard actions."
  }
}

run "kill_switch_lambda_is_locked_down" {
  command = plan

  assert {
    condition     = alltrue([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement : !contains(flatten([s.Action]), "*") && !contains(flatten([s.Action]), "sts:*")])
    error_message = "No wildcard actions on the Lambda role."
  }
  assert {
    condition = jsondecode(aws_iam_role_policy.kill_switch.policy).Statement[0].Resource == [
      "arn:aws:iam::111111111111:role/spend-kill-switch",
      "arn:aws:iam::222222222222:role/spend-kill-switch",
      "arn:aws:iam::333333333333:role/spend-kill-switch",
    ]
    error_message = "The Lambda may assume only spend-kill-switch in known accounts."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement :
    s.Resource != "*" if s.Sid != "Tracing"])
    error_message = "Only X-Ray (no resource-level permissions) may use Resource *."
  }
  assert {
    condition     = aws_lambda_function.kill_switch.kms_key_arn != null && aws_lambda_function.kill_switch.tracing_config[0].mode == "Active"
    error_message = "Environment must be KMS-encrypted and traced."
  }
  assert {
    condition     = aws_lambda_function.kill_switch.reserved_concurrent_executions > 0 && aws_lambda_function.kill_switch.reserved_concurrent_executions <= 5
    error_message = "Concurrency must be reserved and small."
  }
  assert {
    condition     = jsondecode(aws_lambda_function.kill_switch.environment[0].variables.ACCOUNTS).apps.kill_switch == true && jsondecode(aws_lambda_function.kill_switch.environment[0].variables.ACCOUNTS)["shared-infra"].kill_switch == false
    error_message = "Per-account kill_switch flags must reach the function."
  }
  assert {
    condition     = aws_lambda_function.kill_switch.environment[0].variables.MODE == "enforce"
    error_message = "Default mode is enforce."
  }
}

run "everything_at_rest_is_encrypted" {
  command = plan

  assert {
    condition     = aws_kms_key.spend_guards.enable_key_rotation
    error_message = "KMS rotation must be on."
  }
  assert {
    condition     = aws_sns_topic.kill_switch.kms_master_key_id != null && aws_sqs_queue.kill_switch_dlq.kms_master_key_id != null
    error_message = "Topic and DLQ must be KMS-encrypted."
  }
  assert {
    condition     = aws_cloudwatch_log_group.kill_switch.kms_key_id != null && aws_cloudwatch_log_group.kill_switch.retention_in_days >= 365
    error_message = "Logs must be encrypted and kept a year."
  }
}

run "topic_only_accepts_budgets_and_tls" {
  command = plan

  assert {
    condition     = jsondecode(aws_sns_topic_policy.kill_switch.policy).Statement[0].Principal == { Service = "budgets.amazonaws.com" }
    error_message = "The topic's publisher is AWS Budgets."
  }
  assert {
    condition     = jsondecode(aws_sns_topic_policy.kill_switch.policy).Statement[2].Effect == "Deny" && jsondecode(aws_sns_topic_policy.kill_switch.policy).Statement[2].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Non-TLS publishes must be denied."
  }
  assert {
    condition     = length([for s in jsondecode(aws_sns_topic_policy.kill_switch.policy).Statement : s if s.Effect == "Allow" && s.Principal == "*"]) == 0
    error_message = "No public Allow on the topic."
  }
}

run "anomaly_detection_watches_services_and_accounts" {
  command = plan

  assert {
    condition     = length(aws_ce_anomaly_monitor.services) == 1 && length(aws_ce_anomaly_monitor.accounts) == 1
    error_message = "Both monitors must exist."
  }
  assert {
    condition     = jsondecode(aws_ce_anomaly_monitor.accounts[0].monitor_specification).Dimensions.Values == ["111111111111", "222222222222", "333333333333"]
    error_message = "The account monitor must cover every account."
  }
}

run "management_is_refused" {
  command = plan

  variables {
    accounts = { management = { id = "000000000000", monthly_limit_usd = 10 } }
  }

  expect_failures = [var.accounts]
}

run "bad_account_id_is_refused" {
  command = plan

  variables {
    accounts = { apps = { id = "123", monthly_limit_usd = 10 } }
  }

  expect_failures = [var.accounts]
}

run "missing_id_fails_the_plan" {
  command = plan

  variables {
    accounts = { apps = { monthly_limit_usd = 10 } }
  }

  expect_failures = [terraform_data.account_ids_known]
}

run "dry_run_mode_passes_through" {
  command = plan

  variables {
    kill_switch_mode = "dry_run"
  }

  assert {
    condition     = aws_lambda_function.kill_switch.environment[0].variables.MODE == "dry_run"
    error_message = "dry_run must reach the function."
  }
}
