mock_provider "aws" {
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:333333333333:security-findings", id = "https://sqs.us-east-1.amazonaws.com/333333333333/security-findings" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:333333333333:rule/security-findings" }
  }
}

variables {
  security_account_id = "333333333333"
}

run "high_findings_reach_an_encrypted_queue" {
  command = plan

  assert {
    condition     = contains(jsondecode(aws_cloudwatch_event_rule.findings.event_pattern).detail.findings.Severity.Label, "CRITICAL")
    error_message = "Critical findings are exported."
  }

  assert {
    condition     = aws_sqs_queue.findings.sqs_managed_sse_enabled
    error_message = "The queue is encrypted."
  }

  assert {
    condition     = aws_sqs_queue.findings.name == "security-findings"
    error_message = "The name matches the reader role's grant in stacks/github-oidc."
  }
}

# Single-account mode: the same queue and rule; the provider assumes nothing.
run "single_account" {
  command = plan

  variables {
    account_mode = "single"
  }

  assert {
    condition     = aws_sqs_queue.findings.name == "security-findings" && var.region == "us-east-2"
    error_message = "single-account mode plans the same export in the home region"
  }
}
