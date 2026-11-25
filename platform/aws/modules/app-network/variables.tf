variable "name" {
  description = "Name prefix for every resource."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR. Private subnets are /20s carved from it."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Private subnets to create. RDS needs subnets in at least 2 AZs even when single-AZ."
  type        = number
  default     = 2
  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "interface_endpoints" {
  description = "Interface endpoints (service suffixes). secretsmanager: app secrets and db-admin; sns: mobile push. Fargate jobs also need ecr.api, ecr.dkr and logs."
  type        = list(string)
  default     = ["secretsmanager", "sns"]
}

variable "endpoint_az_count" {
  description = "AZs the interface endpoints live in. 1 halves their cost; an AZ outage then cuts AWS API access until it recovers."
  type        = number
  default     = 1
  validation {
    condition     = var.endpoint_az_count >= 1 && var.endpoint_az_count <= 3
    error_message = "endpoint_az_count must be 1 to 3."
  }
}

variable "kms_key_arn" {
  description = "KMS key that encrypts the flow-log group."
  type        = string
}

variable "log_retention_days" {
  description = "Flow-log retention."
  type        = number
  default     = 365
}
