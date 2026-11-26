output "role_arns" {
  description = "Set nothing from these: priv-cutover.yml builds the ARNs from AWS_ACCOUNT_ID and the fixed names."
  value = {
    plan = aws_iam_role.github["plan"].arn
    run  = aws_iam_role.github["run"].arn
    # Null in single-account mode: the GitHub roles hold these policies.
    shared_infra_read    = try(aws_iam_role.shared_infra_read[0].arn, null)
    apps_read            = try(aws_iam_role.apps_read[0].arn, null)
    apps_operate         = try(aws_iam_role.apps_operate[0].arn, null)
    cutover_secrets_glob = local.secrets_arn
  }
}
