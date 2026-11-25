output "api_endpoint" {
  value = aws_apigatewayv2_api.this.api_endpoint
}

output "api_domain_target" {
  description = "For the DNS stack's alias record when custom_domain is set: { name, zone_id }."
  value = var.custom_domain == null ? null : {
    name    = aws_apigatewayv2_domain_name.this[0].domain_name_configuration[0].target_domain_name
    zone_id = aws_apigatewayv2_domain_name.this[0].domain_name_configuration[0].hosted_zone_id
  }
}

output "function_name" {
  value = aws_lambda_function.app.function_name
}

output "role_arn" {
  value = aws_iam_role.app.arn
}

output "role_name" {
  description = "Attach extra statements here (e.g. bedrock:InvokeModel on one model) from the product's own file."
  value       = aws_iam_role.app.name
}

output "bucket" {
  value = aws_s3_bucket.app.bucket
}

output "auth" {
  description = "What web and native clients need to sign in (all public values)."
  value = {
    issuer           = module.auth.issuer
    hosted_domain    = module.auth.hosted_domain
    user_pool_id     = module.auth.user_pool_id
    web_client_id    = module.auth.web_client_id
    native_client_id = module.auth.native_client_id
  }
}

output "db" {
  value = { name = var.name, user = local.db_user }
}

output "policy" {
  description = "The app role's inline policy, decoded (for tests and review)."
  value       = local.app_policy
}
