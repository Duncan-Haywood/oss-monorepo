# The apps-account platform every paid product runs on. Shared, fixed-cost pieces live here
# (network, one Postgres, the entitlement queue); each product is one module call in
# products.tf. Billing's public edge (the Paddle webhook) is in ./payments, another account.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name      = "saas-starter" # every IAM name starts with the stack name (stacks/github-oidc)
  build_dir = coalesce(var.build_dir, "${path.module}/runtime/dist")
}

# One key for the platform's data at rest: logs, RDS storage + master secret, S3, Lambda env.
resource "aws_kms_key" "platform" {
  description         = "saas-starter platform data"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Account", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
      {
        Sid       = "Logs", Effect = "Allow", Principal = { Service = "logs.${data.aws_region.current.region}.amazonaws.com" },
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"], Resource = "*",
        Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:*" } }
      },
    ]
  })
}

resource "aws_kms_alias" "platform" {
  name          = "alias/saas-starter-platform"
  target_key_id = aws_kms_key.platform.key_id
}

module "network" {
  permissions_boundary_arn = var.permissions_boundary_arn
  source                   = "../../modules/app-network"
  name                     = local.name
  kms_key_arn              = aws_kms_key.platform.arn
  interface_endpoints      = var.interface_endpoints
  enable_nat               = var.enable_nat
}

module "database" {
  permissions_boundary_arn = var.permissions_boundary_arn
  source                   = "../../modules/app-database"
  name                     = local.name
  subnet_ids               = module.network.private_subnet_ids
  db_security_group_id     = module.network.db_security_group_id
  app_security_group_id    = module.network.app_security_group_id
  kms_key_arn              = aws_kms_key.platform.arn
  instance_class           = var.db_instance_class
  multi_az                 = var.db_multi_az
  enable_proxy             = var.db_enable_proxy
  admin_source_dir         = "${local.build_dir}/db-admin"
}

module "entitlements" {
  permissions_boundary_arn = var.permissions_boundary_arn
  source                   = "../../modules/app-entitlements"
  name                     = local.name
  payments_account_id      = var.payments_account_id
  source_dir               = "${local.build_dir}/entitlement-consumer"
  subnet_ids               = module.network.private_subnet_ids
  app_security_group_id    = module.network.app_security_group_id
  db_host                  = module.database.host
  db_port                  = module.database.port
  db_connect_arn_prefix    = module.database.connect_arn_prefix
  kms_key_arn              = aws_kms_key.platform.arn
  alarm_topic_arn          = var.alarm_topic_arn
  sender_role_name         = var.payments_sender_role_name
}

# Optional outbound internet (NAT) for products that call APIs outside AWS's private network,
# including Claude Platform on AWS (stacks/llm), Paddle's API or a grants database.
# Everything a product module needs, in one value.
locals {
  platform = {
    subnet_ids               = module.network.private_subnet_ids
    app_security_group_id    = module.network.app_security_group_id
    db_host                  = module.database.host
    db_port                  = module.database.port
    db_connect_arn_prefix    = module.database.connect_arn_prefix
    db_admin_function_name   = module.database.admin_function_name
    kms_key_arn              = aws_kms_key.platform.arn
    name_prefix              = local.name
    permissions_boundary_arn = var.permissions_boundary_arn
  }
}
