# One small RDS Postgres instance shared by every product (a database and a role per product,
# created by db-admin). Encrypted with the platform key, IAM auth on, TLS forced, never public.
# The master password is RDS-managed in Secrets Manager; only db-admin can read it.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg${var.engine_major}"
  family = "postgres${var.engine_major}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  parameter {
    name  = "password_encryption"
    value = "scram-sha-256"
  }
}

resource "aws_db_instance" "this" {
  #checkov:skip=CKV_AWS_157:Multi-AZ is var.multi_az (off by default: it doubles the cost; see README cost table)
  #checkov:skip=CKV_AWS_118:Enhanced monitoring is var.monitoring_interval (off by default; CloudWatch basic metrics and postgres logs are on)
  #checkov:skip=CKV_AWS_353:Performance Insights is var.performance_insights (off by default on db.t4g.micro)
  #checkov:skip=CKV2_AWS_30:Query logging is on via log_min_duration_statement and exported postgresql logs
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_major
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  username                            = "rdsmaster"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = var.kms_key_arn
  iam_database_authentication_enabled = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_security_group_id]
  publicly_accessible    = false
  multi_az               = var.multi_az
  parameter_group_name   = aws_db_parameter_group.this.name
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period    = var.backup_retention_days
  backup_window              = "07:00-08:00"
  maintenance_window         = "sun:08:30-sun:09:30"
  copy_tags_to_snapshot      = true
  delete_automated_backups   = false
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name}-final"
  auto_minor_version_upgrade = true
  apply_immediately          = false

  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade", "iam-db-auth-error"]
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = var.monitoring_interval > 0 ? aws_iam_role.monitoring[0].arn : null
  performance_insights_enabled          = var.performance_insights
  performance_insights_kms_key_id       = var.performance_insights ? var.kms_key_arn : null
  performance_insights_retention_period = var.performance_insights ? 7 : null
}

resource "aws_iam_role" "monitoring" {
  count                = var.monitoring_interval > 0 ? 1 : 0
  name                 = "${var.name}-rds-monitoring"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "monitoring.rds.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  count      = var.monitoring_interval > 0 ? 1 : 0
  role       = aws_iam_role.monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# --- optional RDS Proxy (end-to-end IAM auth, no secret) ---------------------------------------
# Off by default: on a 2-vCPU instance it bills the 2-vCPU minimum (about $22/month), more than
# the database. Turn on when Lambda concurrency starts exhausting max_connections (~80 on micro).
resource "aws_iam_role" "proxy" {
  count                = var.enable_proxy ? 1 : 0
  name                 = "${var.name}-rds-proxy"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "rds.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "proxy" {
  count = var.enable_proxy ? 1 : 0
  name  = "connect"
  role  = aws_iam_role.proxy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "rds-db:connect"
      Resource = "arn:aws:rds-db:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.this.resource_id}/*"
    }]
  })
}

resource "aws_db_proxy" "this" {
  count                  = var.enable_proxy ? 1 : 0
  name                   = var.name
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy[0].arn
  vpc_subnet_ids         = var.subnet_ids
  vpc_security_group_ids = [var.db_security_group_id]
  require_tls            = true
  default_auth_scheme    = "IAM_AUTH"
  idle_client_timeout    = 900
}

resource "aws_db_proxy_default_target_group" "this" {
  count         = var.enable_proxy ? 1 : 0
  db_proxy_name = aws_db_proxy.this[0].name
  connection_pool_config {
    max_connections_percent = 90
  }
}

resource "aws_db_proxy_target" "this" {
  count                  = var.enable_proxy ? 1 : 0
  db_proxy_name          = aws_db_proxy.this[0].name
  target_group_name      = aws_db_proxy_default_target_group.this[0].name
  db_instance_identifier = aws_db_instance.this.identifier
}

# --- db-admin: creates per-product databases and roles; the only user of the master secret -----
data "archive_file" "admin" {
  type        = "zip"
  source_dir  = var.admin_source_dir
  output_path = "${path.root}/.build/${var.name}-db-admin.zip"
}

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/aws/lambda/${var.name}-db-admin"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_iam_role" "admin" {
  name                 = "${var.name}-db-admin"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "admin_vpc" {
  role       = aws_iam_role.admin.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "admin" {
  name = "db-admin"
  role = aws_iam_role.admin.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Logs", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.admin.arn}:*" },
      { Sid = "MasterSecret", Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_db_instance.this.master_user_secret[0].secret_arn },
      { Sid = "Decrypt", Effect = "Allow", Action = "kms:Decrypt", Resource = var.kms_key_arn },
    ]
  })
}

resource "aws_lambda_function" "admin" {
  #checkov:skip=CKV_AWS_116:Invoked synchronously by OpenTofu; a DLQ would never receive anything
  #checkov:skip=CKV_AWS_272:Code signing needs a Signer profile per artifact; artifacts are built by CI from this repo and hashed by OpenTofu
  function_name                  = "${var.name}-db-admin"
  role                           = aws_iam_role.admin.arn
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.admin.output_path
  source_code_hash               = data.archive_file.admin.output_base64sha256
  timeout                        = 120
  memory_size                    = 256
  reserved_concurrent_executions = 1
  kms_key_arn                    = var.kms_key_arn

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.app_security_group_id]
  }
  tracing_config {
    mode = "Active"
  }
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.admin.name
  }
  environment {
    variables = {
      DB_HOST             = aws_db_instance.this.address
      DB_PORT             = tostring(aws_db_instance.this.port)
      MASTER_SECRET_ARN   = aws_db_instance.this.master_user_secret[0].secret_arn
      PLATFORM_SQL_DIR    = "/var/task/sql"
      NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
    }
  }
  depends_on = [aws_iam_role_policy.admin, aws_iam_role_policy_attachment.admin_vpc]
}
