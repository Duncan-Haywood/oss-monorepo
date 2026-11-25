output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "issuer" {
  description = "JWT issuer for the API Gateway authorizer and for clients."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "native_client_id" {
  value = try(aws_cognito_user_pool_client.native[0].id, null)
}

output "client_ids" {
  description = "Accepted JWT audiences."
  value       = compact([aws_cognito_user_pool_client.web.id, try(aws_cognito_user_pool_client.native[0].id, "")])
}

output "hosted_domain" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "mfa_configuration" {
  value = aws_cognito_user_pool.this.mfa_configuration
}

output "admin_create_user_only" {
  description = "true: no self sign-up; accounts are made by an admin."
  value       = aws_cognito_user_pool.this.admin_create_user_config[0].allow_admin_create_user_only
}
