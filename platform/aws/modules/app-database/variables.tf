variable "name" {
  description = "Instance identifier and name prefix."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets in at least two AZs."
  type        = list(string)
}

variable "db_security_group_id" {
  type = string
}

variable "app_security_group_id" {
  description = "Security group for db-admin (the app group, which may reach the DB and endpoints)."
  type        = string
}

variable "kms_key_arn" {
  description = "Encrypts storage, snapshots, the master secret, logs and Lambda environment."
  type        = string
}

variable "engine_major" {
  type    = string
  default = "16"
}

variable "instance_class" {
  description = "db.t4g.micro (2 vCPU burst, 1 GiB) is the cheapest that runs Postgres 16 well; about $11.68/month on demand in us-east-1."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling (GiB)."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Standby in a second AZ. Doubles the instance cost; turn on once revenue covers it."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "monitoring_interval" {
  description = "Enhanced monitoring seconds (0 = off)."
  type        = number
  default     = 0
}

variable "performance_insights" {
  type    = bool
  default = false
}

variable "enable_proxy" {
  description = "Put RDS Proxy (IAM auth end to end) in front. See main.tf for when."
  type        = bool
  default     = false
}

variable "admin_source_dir" {
  description = "Built db-admin bundle (runtime/dist/db-admin)."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 365
}
