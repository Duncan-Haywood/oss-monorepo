# `tofu test` with a mocked AWS provider: no credentials, no AWS calls.
# Checks the plan's shape, not AWS's acceptance of it.

variables {
  state_bucket = "000000000000-tofu-state-us-east-1"
}

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_organizations_organization" {
    defaults = {
      roots = [{ id = "r-abcd", arn = "arn:aws:organizations::000000000000:root/o-abcdefghij/r-abcd", name = "Root", policy_types = [] }]
    }
  }

  mock_resource "aws_organizations_policy" {
    defaults = {
      id = "p-abcdefgh"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn = "arn:aws:ses:us-east-1:000000000000:identity/mock"
    }
  }

  mock_data "aws_sesv2_email_identity" {
    defaults = {
      dkim_signing_attributes = [{
        current_signing_key_length    = "RSA_2048_BIT"
        domain_signing_private_key    = ""
        domain_signing_selector       = ""
        last_key_generation_timestamp = ""
        next_signing_key_length       = "RSA_2048_BIT"
        signing_attributes_origin     = "AWS_SES"
        status                        = "PENDING"
        tokens                        = ["tok1", "tok2", "tok3"]
      }]
    }
  }

  mock_resource "aws_securityhub_configuration_policy" {
    defaults = {
      id = "00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/mock"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::000000000000:policy/mock"
    }
  }

  mock_resource "aws_iam_user" {
    defaults = {
      arn = "arn:aws:iam::000000000000:user/mock"
    }
  }

  mock_resource "aws_iam_service_linked_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:000000000000:mock"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:000000000000:function:mock"
    }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:us-east-1:000000000000:secret:mock"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:000000000000:log-group:mock"
    }
  }

  mock_resource "aws_ce_anomaly_monitor" {
    defaults = {
      arn = "arn:aws:ce::000000000000:anomalymonitor/mock"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::mock"
    }
  }
}

# Distinct topic ARNs, so the tests can tell the kill topic from the alerts topic.
override_resource {
  target = aws_sns_topic.alerts
  values = { arn = "arn:aws:sns:us-east-1:000000000000:budget-alerts" }
}

override_resource {
  target = aws_sns_topic.kill
  values = { arn = "arn:aws:sns:us-east-1:000000000000:budget-kill" }
}

override_data {
  target = data.terraform_remote_state.org
  values = {
    outputs = {
      organization_id       = "o-abcdefghij"
      management_account_id = "000000000000"
      region                = "us-east-1"
      ou_ids                = {}
      account_ids = {
        log-archive  = "111111111111"
        security     = "222222222222"
        shared-infra = "333333333333"
        apps         = "444444444444"
        payments     = "555555555555"
        sandbox      = "666666666666"
      }
    }
  }
}

run "spend_shape" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.account) == 7
    error_message = "a budget per account, management included"
  }

  assert {
    condition     = length(aws_budgets_budget_action.freeze) == 6
    error_message = "a freeze action per member account (SCPs never bind the management account)"
  }

  assert {
    condition     = aws_lambda_function.kill_switch.environment[0].variables.DRY_RUN == "1"
    error_message = "the kill switch ships in dry-run mode"
  }

  assert {
    condition     = strcontains(aws_organizations_policy.freeze.content, "aws-external-anthropic:CreateInference")
    error_message = "the freeze SCP stops Claude calls"
  }
}

run "per_account_kill_switch_and_alerts" {
  command = plan

  assert {
    condition = alltrue([for k, b in aws_budgets_budget.account :
      contains([for n in b.notification : n.threshold if n.notification_type == "ACTUAL"], 50)
    ])
    error_message = "every account budget alerts at 50%"
  }

  assert {
    # The hard-line notification of shared-infra (site, DNS) and payments
    # (Paddle webhooks) must not reach the kill topic.
    condition = alltrue([for k in ["shared-infra", "payments", "log-archive", "security", "management"] :
      alltrue([for n in aws_budgets_budget.account[k].notification : !contains(n.subscriber_sns_topic_arns, aws_sns_topic.kill.arn)])
    ])
    error_message = "only kill_switch_accounts may notify the kill topic"
  }

  assert {
    condition = alltrue([for k in ["apps", "sandbox"] :
      length([for n in aws_budgets_budget.account[k].notification : n if contains(n.subscriber_sns_topic_arns, aws_sns_topic.kill.arn)]) == 1
    ])
    error_message = "apps and sandbox wake the kill switch at the hard line, once"
  }

  assert {
    condition     = jsondecode(aws_lambda_function.kill_switch.environment[0].variables.KILL_ON_BUDGET) == ["apps", "sandbox"]
    error_message = "the function itself must refuse budget kills elsewhere (belt and braces)"
  }

  assert {
    condition     = aws_lambda_function.kill_switch.environment[0].variables.REGIONS == "us-east-1,us-west-2"
    error_message = "the kill switch sweeps both allowed regions"
  }
}

run "freeze_scp_leaves_data_logs_and_dns_alone" {
  command = plan

  assert {
    condition = length([for a in jsondecode(aws_organizations_policy.freeze.content).Statement[0].Action :
    a if can(regex("^(s3|logs|cloudtrail|route53|route53domains|kms|dynamodb|secretsmanager|guardduty|securityhub|config):", a))]) == 0
    error_message = "the freeze must never touch storage, logs, audit, DNS, domains or keys"
  }

  assert {
    condition = alltrue([for a in ["autoscaling:UpdateAutoScalingGroup", "lambda:UpdateEventSourceMapping", "ec2:RequestSpotInstances"] :
    contains(jsondecode(aws_organizations_policy.freeze.content).Statement[0].Action, a)])
    error_message = "the freeze stops the kill switch's work from being undone"
  }
}

run "anomaly_detection" {
  command = plan

  assert {
    condition     = length(aws_ce_anomaly_monitor.services) == 1
    error_message = "a per-service monitor by default"
  }

  assert {
    condition     = length(jsondecode(aws_ce_anomaly_monitor.accounts.monitor_specification).Dimensions.Values) == 7
    error_message = "the account monitor covers every account, management included"
  }

  assert {
    condition     = one(aws_ce_anomaly_subscription.alerts.subscriber).address == aws_sns_topic.alerts.arn
    error_message = "anomalies go to the alerts topic"
  }
}

run "unknown_kill_switch_account_is_refused" {
  command = plan

  variables {
    kill_switch_accounts = ["apps", "nope"]
  }

  expect_failures = [aws_budgets_budget.account]
}

run "alert_emails_are_sensitive_but_subscribed" {
  command = plan

  variables {
    alert_emails = ["one@example.invalid", "two@example.invalid"]
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alert_email) == 2
    error_message = "one email subscription per address (count, so the addresses never become printed keys)"
  }
}
