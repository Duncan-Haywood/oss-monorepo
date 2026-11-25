# Findings export, files first: high and critical Security Hub findings (which
# include GuardDuty, Config, Access Analyzer and Inspector findings) land in
# an SQS queue in the security account. A scheduled job assumes
# gha-oss-monorepo-findings-read (github-oidc) and writes each message as a
# file into the security-alerts queue branch that
# .github/workflows/priv-security-alert-queue.yml already keeps; that job is
# a control-plane draft at platform/aws/baseline/ci/.

resource "aws_sqs_queue" "findings" {
  provider                  = aws.security
  name                      = "${var.name_prefix}-security-findings"
  message_retention_seconds = 1209600 # 14 days: a missed week still drains
  sqs_managed_sse_enabled   = true
}

resource "aws_cloudwatch_event_rule" "findings" {
  provider    = aws.security
  name        = "${var.name_prefix}-security-findings"
  description = "High and critical Security Hub findings to the findings queue"
  event_pattern = jsonencode({
    source        = ["aws.securityhub"]
    "detail-type" = ["Security Hub Findings - Imported"]
    detail = {
      findings = {
        Severity    = { Label = var.findings_min_severity }
        Workflow    = { Status = ["NEW"] }
        RecordState = ["ACTIVE"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "findings" {
  provider = aws.security
  rule     = aws_cloudwatch_event_rule.findings.name
  arn      = aws_sqs_queue.findings.arn
}

resource "aws_sqs_queue_policy" "findings" {
  provider  = aws.security
  queue_url = aws_sqs_queue.findings.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EventBridgeSends"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.findings.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.findings.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.findings.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}
