output "invoke_policy_arn" {
  description = "Attach to any principal that calls Claude Platform on AWS (stacks/app-identity does)."
  value       = aws_iam_policy.invoke.arn
}

output "app_role_arn" {
  value = aws_iam_role.app_llm.arn
}

output "ci_role_arn" {
  value = aws_iam_role.ci_llm.arn
}

output "app_environment" {
  description = "What an app needs besides credentials (AnthropicAWS / AnthropicAws reads these)."
  value = {
    LLM_PROVIDER               = "aws"
    AWS_REGION                 = var.region
    ANTHROPIC_AWS_WORKSPACE_ID = length(var.workspace_ids) > 0 ? var.workspace_ids[0] : "(set CLAUDE_AWS_WORKSPACE_ID)"
    base_url                   = "https://aws-external-anthropic.${var.region}.api.aws"
    model                      = "claude-opus-5-5"
  }
}

output "bedrock_policy_arn" {
  value = var.enable_bedrock_alternative ? aws_iam_policy.bedrock[0].arn : null
}
