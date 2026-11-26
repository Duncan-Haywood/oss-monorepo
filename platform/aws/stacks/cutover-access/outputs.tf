output "role_arns" {
  description = "Set nothing from these: priv-cutover.yml builds the ARNs from AWS_ACCOUNT_ID and the fixed names."
  value = {
    plan                 = aws_iam_role.github["plan"].arn
    run                  = aws_iam_role.github["run"].arn
    shared_infra_read    = aws_iam_role.shared_infra_read.arn
    apps_read            = aws_iam_role.apps_read.arn
    apps_operate         = aws_iam_role.apps_operate.arn
    cutover_secrets_glob = local.secrets_arn
  }
}
