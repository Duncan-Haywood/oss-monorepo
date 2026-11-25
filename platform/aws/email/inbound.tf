# SES inbound for support@, hello@ and accounts@ (from
# platform/pages/cloudflare/email-routing.json), replacing Cloudflare Email
# Routing. Each message is written to the edge-api inbox bucket, then the
# edge-api function stores a capped copy in its table, exactly as the
# Worker's email() handler does today. Nothing is forwarded anywhere.

resource "aws_ses_receipt_rule_set" "support" {
  rule_set_name = "support"
}

resource "aws_ses_active_receipt_rule_set" "support" {
  rule_set_name = aws_ses_receipt_rule_set.support.rule_set_name
}

resource "aws_lambda_permission" "ses_invokes_edge" {
  statement_id   = "SesInboundSupport"
  action         = "lambda:InvokeFunction"
  function_name  = local.edge.function_name
  principal      = "ses.amazonaws.com"
  source_account = local.account_id
  source_arn     = "arn:${local.partition}:ses:${local.region}:${local.account_id}:receipt-rule-set/${aws_ses_receipt_rule_set.support.rule_set_name}:receipt-rule/support-inbox"
}

resource "aws_ses_receipt_rule" "support" {
  name          = "support-inbox"
  rule_set_name = aws_ses_receipt_rule_set.support.rule_set_name
  recipients    = local.support_addresses
  enabled       = true
  scan_enabled  = true # spam and virus verdicts; the function drops FAIL
  tls_policy    = "Require"

  s3_action {
    bucket_name       = local.edge.inbox_bucket_name
    object_key_prefix = local.edge.inbox_prefix
    position          = 1
  }

  lambda_action {
    function_arn    = local.edge.function_arn
    invocation_type = "Event"
    position        = 2
  }

  depends_on = [aws_lambda_permission.ses_invokes_edge]
}

# The cutover: off until receive_mail = true. While it is off, Cloudflare's
# MX records keep delivering to the Worker. The aws-route53-zone stack must
# leave the apex MX to this resource.
resource "aws_route53_record" "inbound_mx" {
  count   = var.receive_mail ? 1 : 0
  zone_id = var.zone_id
  name    = local.routing.zone
  type    = "MX"
  ttl     = 300
  records = ["10 inbound-smtp.${local.region}.amazonaws.com"]
}
