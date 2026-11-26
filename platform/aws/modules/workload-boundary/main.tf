# The permissions boundary every role a stack creates carries (README.md,
# "Single-account mode", for what each statement stands in for).
#
# Organization mode (stacks/github-oidc/account-roles, one per workload
# account): the four statements below `single_account`; the Organization's
# SCPs and RCPs do the rest.
#
# Single-account mode (stacks/org, once for the one account): there are no
# SCPs, so the boundary also carries what they denied: leaving audit and
# detection alone, only the allowed regions, no purchases or commitments,
# Marketplace subscriptions only by the owner's role, and no writes to the
# management stacks' state or changes to the CI roles.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

locals {
  arn = "arn:aws:iam::${var.account_id}:policy/workload-boundary"

  common = [
    {
      Sid      = "AllowWithinAccount"
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    },
    {
      Sid    = "DenyIdentityAndOrgChanges"
      Effect = "Deny"
      Action = [
        "account:*", "iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:CreateUser",
        "iam:CreateOpenIDConnectProvider", "iam:CreateSAMLProvider",
        "iam:DeleteRolePermissionsBoundary", "organizations:*", "sso:*",
      ]
      Resource = "*"
    },
    {
      Sid      = "DenyTouchingCIRolesAndBoundary"
      Effect   = "Deny"
      Action   = "iam:*"
      Resource = concat(["arn:aws:iam::${var.account_id}:role/gha-*", local.arn], var.single_account ? ["arn:aws:iam::${var.account_id}:role/github/*"] : [])
    },
    {
      Sid      = "DenyGovernanceBypass"
      Effect   = "Deny"
      Action   = ["s3:BypassGovernanceRetention", "kms:ScheduleKeyDeletion", "kms:DisableKey"]
      Resource = "*"
    },
  ]

  # stacks/org/scps.tf "KeepAuditAndDetection", word for word.
  single = [
    {
      Sid    = "KeepAuditAndDetection"
      Effect = "Deny"
      Action = [
        "cloudtrail:DeleteTrail", "cloudtrail:StopLogging", "cloudtrail:UpdateTrail", "cloudtrail:PutEventSelectors",
        "guardduty:DeleteDetector", "guardduty:DisassociateFromAdministratorAccount",
        "guardduty:DisassociateFromMasterAccount", "guardduty:StopMonitoringMembers",
        "config:DeleteConfigurationRecorder", "config:DeleteDeliveryChannel", "config:StopConfigurationRecorder",
        "securityhub:DisableSecurityHub", "securityhub:DisassociateFromAdministratorAccount",
        "access-analyzer:DeleteAnalyzer", "s3:PutAccountPublicAccessBlock", "ec2:DisableEbsEncryptionByDefault",
      ]
      Resource = "*"
    },
    {
      # stacks/org/scps.tf "DenyUnapprovedRegions": the same global-service list.
      Sid       = "DenyUnapprovedRegions"
      Effect    = "Deny"
      NotAction = var.global_service_actions
      Resource  = "*"
      Condition = { StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions } }
    },
    {
      Sid    = "NoCommitments"
      Effect = "Deny"
      Action = [
        "savingsplans:CreateSavingsPlan", "ec2:PurchaseReservedInstancesOffering", "ec2:PurchaseHostReservation",
        "rds:PurchaseReservedDBInstancesOffering", "elasticache:PurchaseReservedCacheNodesOffering",
        "route53domains:RegisterDomain", "route53domains:TransferDomain", "shield:CreateSubscription",
        # No role carrying this boundary is the owner's, so no Marketplace
        # subscription (the SCP's owner exception has no subject here).
        "aws-marketplace:Subscribe", "aws-marketplace:AcceptAgreementRequest",
      ]
      Resource = "*"
    },
    {
      # The management stacks' state sits in the same account as every
      # workload in this mode: nothing with this boundary may rewrite it.
      Sid      = "KeepManagementState"
      Effect   = "Deny"
      Action   = ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration"]
      Resource = concat(["arn:aws:s3:::${var.management_state_bucket}"], [for s in var.management_stacks : "arn:aws:s3:::${var.management_state_bucket}/${s}/*"])
    },
  ]

  policy = {
    Version   = "2012-10-17"
    Statement = concat(local.common, slice(local.single, 0, var.single_account ? length(local.single) : 0))
  }
}

resource "aws_iam_policy" "this" {
  # checkov:skip=CKV_AWS_62:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_63:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_286:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_287:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_288:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_289:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_290:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV_AWS_355:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  # checkov:skip=CKV2_AWS_40:A permissions boundary grants nothing; its Allow * is the ceiling and its Deny statements are the point.
  name        = "workload-boundary"
  description = "Permissions boundary every role created by a workload stack must carry"
  policy      = jsonencode(local.policy)
}
