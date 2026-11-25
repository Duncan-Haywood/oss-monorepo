# Cognito user pool for one product: email sign-in, hosted sign-in pages, and two public OAuth
# clients using authorization code + PKCE (no client secret ships in a browser or an app):
#   web    -> https callback(s) on the product's site
#   native -> custom-scheme or universal-link callback(s) for iOS/Android apps
# The Lite tier is free up to 10,000 monthly active users.

data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name                     = var.name
  user_pool_tier           = var.tier
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = var.mfa

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 3
    password_history_size            = var.tier == "LITE" ? null : 5
  }

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = !var.self_sign_up
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  dynamic "email_configuration" {
    for_each = var.ses_identity_arn == null ? [] : [1]
    content {
      email_sending_account = "DEVELOPER"
      source_arn            = var.ses_identity_arn
      from_email_address    = var.from_email
    }
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

locals {
  oauth = {
    allowed_oauth_flows                  = ["code"]
    allowed_oauth_scopes                 = ["openid", "email", "profile"]
    allowed_oauth_flows_user_pool_client = true
    supported_identity_providers         = ["COGNITO"]
    explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.name}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  callback_urls                        = var.web_callback_urls
  logout_urls                          = var.web_logout_urls
  allowed_oauth_flows                  = local.oauth.allowed_oauth_flows
  allowed_oauth_scopes                 = local.oauth.allowed_oauth_scopes
  allowed_oauth_flows_user_pool_client = local.oauth.allowed_oauth_flows_user_pool_client
  supported_identity_providers         = local.oauth.supported_identity_providers
  explicit_auth_flows                  = local.oauth.explicit_auth_flows
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_client" "native" {
  count                                = length(var.native_callback_urls) > 0 ? 1 : 0
  name                                 = "${var.name}-native"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  callback_urls                        = var.native_callback_urls
  logout_urls                          = var.native_logout_urls
  allowed_oauth_flows                  = local.oauth.allowed_oauth_flows
  allowed_oauth_scopes                 = local.oauth.allowed_oauth_scopes
  allowed_oauth_flows_user_pool_client = local.oauth.allowed_oauth_flows_user_pool_client
  supported_identity_providers         = local.oauth.supported_identity_providers
  explicit_auth_flows                  = local.oauth.explicit_auth_flows
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 90
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
