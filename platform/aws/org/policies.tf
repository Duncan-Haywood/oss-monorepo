# Service control policies (what principals in member accounts may never do)
# and resource control policies (who may ever reach resources in them).
# SCPs do not apply to the management account or to service-linked roles.
# AWS allows five SCPs per target and FullAWSAccess holds one: the root has
# three of ours, leaving one slot free.

locals {
  # The only principal allowed to change security services and the CI roles
  # in member accounts: the role the management account's foundation apply
  # chains into (baseline/account, github-oidc).
  baseline_principals = ["arn:aws:iam::*:role/OrganizationAccountAccessRole"]

  # Global or non-regional services that must keep working whatever region a
  # request names (AWS's region-deny example, plus billing and identity).
  global_actions = [
    "a4b:*", "access-analyzer:*", "account:*", "acm:*", "aws-marketplace-management:*",
    "aws-marketplace:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*",
    "chime:*", "cloudfront:*", "config:*", "consolidatedbilling:*", "cur:*",
    "directconnect:*", "ec2:DescribeRegions", "ec2:DescribeTransitGateways",
    "ec2:DescribeVpnGateways", "fms:*", "freetier:*", "globalaccelerator:*",
    "health:*", "iam:*", "identitystore:*", "importexport:*", "invoicing:*",
    "kms:*", "networkmanager:*", "notifications:*", "organizations:*",
    "payments:*", "pricing:*", "route53-recovery-cluster:*",
    "route53-recovery-control-config:*", "route53-recovery-readiness:*",
    "route53:*", "route53domains:*", "s3:CreateMultiRegionAccessPoint",
    "s3:GetAccountPublic*", "s3:ListAllMyBuckets", "s3:ListMultiRegionAccessPoints",
    "s3:PutAccountPublic*", "savingsplans:*", "shield:*", "sso:*", "sts:*",
    "support:*", "supportplans:*", "tax:*", "trustedadvisor:*", "waf-regional:*",
    "waf:*", "wafv2:*", "wellarchitected:*",
  ]

  scps = {
    protect-security-baseline = {
      description = "Nobody but the baseline role turns off CloudTrail, GuardDuty, Config, Security Hub, Access Analyzer, account Block Public Access or default EBS encryption, or touches the CI roles."
      target      = "root"
      policy      = {
        Version   = "2012-10-17"
        Statement = [
          {
            Sid    = "ProtectSecurityServices"
            Effect = "Deny"
            Action = [
              "access-analyzer:DeleteAnalyzer",
              "cloudtrail:DeleteTrail",
              "cloudtrail:PutEventSelectors",
              "cloudtrail:StopLogging",
              "cloudtrail:UpdateTrail",
              "config:DeleteConfigurationRecorder",
              "config:DeleteDeliveryChannel",
              "config:DeleteRetentionConfiguration",
              "config:StopConfigurationRecorder",
              "ec2:DisableEbsEncryptionByDefault",
              "ec2:ModifyEbsDefaultKmsKeyId",
              "ec2:ResetEbsDefaultKmsKeyId",
              "guardduty:CreateFilter",
              "guardduty:DeleteDetector",
              "guardduty:DeleteMembers",
              "guardduty:DisassociateFromAdministratorAccount",
              "guardduty:DisassociateFromMasterAccount",
              "guardduty:StopMonitoringMembers",
              "guardduty:UpdateDetector",
              "s3:DeleteAccountPublicAccessBlock",
              "s3:PutAccountPublicAccessBlock",
              "securityhub:BatchDisableStandards",
              "securityhub:DeleteMembers",
              "securityhub:DisableSecurityHub",
              "securityhub:DisassociateFromAdministratorAccount",
              "securityhub:DisassociateFromMasterAccount",
              "securityhub:DisassociateMembers",
            ]
            Resource  = "*"
            Condition = { ArnNotLike = { "aws:PrincipalArn" = local.baseline_principals } }
          },
          {
            Sid    = "ProtectCIAndAccessRoles"
            Effect = "Deny"
            Action = [
              "iam:AttachRolePolicy",
              "iam:CreateRole",
              "iam:DeleteRole",
              "iam:DeleteRolePermissionsBoundary",
              "iam:DeleteRolePolicy",
              "iam:DetachRolePolicy",
              "iam:PutRolePermissionsBoundary",
              "iam:PutRolePolicy",
              "iam:UpdateAssumeRolePolicy",
              "iam:UpdateRole",
            ]
            Resource = [
              "arn:aws:iam::*:role/gha-*",
              "arn:aws:iam::*:role/OrganizationAccountAccessRole",
            ]
            Condition = { ArnNotLike = { "aws:PrincipalArn" = local.baseline_principals } }
          },
          {
            Sid    = "ProtectOidcProviders"
            Effect = "Deny"
            Action = [
              "iam:AddClientIDToOpenIDConnectProvider",
              "iam:CreateOpenIDConnectProvider",
              "iam:DeleteOpenIDConnectProvider",
              "iam:UpdateOpenIDConnectProviderThumbprint",
            ]
            Resource  = "*"
            Condition = { ArnNotLike = { "aws:PrincipalArn" = local.baseline_principals } }
          },
        ]
      }
    }

    deny-unapproved-regions = {
      description = "Regional services only in the approved regions."
      target      = "root"
      policy      = {
        Version   = "2012-10-17"
        Statement = [{
          Sid       = "DenyOutsideApprovedRegions"
          Effect    = "Deny"
          NotAction = local.global_actions
          Resource  = "*"
          Condition = { StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions } }
        }]
      }
    }

    deny-exit-root-and-long-lived-keys = {
      description = "Member accounts cannot leave the organization, act as root, or create IAM users or access keys: people use Identity Center, machines use roles."
      target      = "root"
      policy      = {
        Version   = "2012-10-17"
        Statement = [
          {
            Sid      = "DenyLeaveOrganization"
            Effect   = "Deny"
            Action   = ["organizations:LeaveOrganization"]
            Resource = "*"
          },
          {
            Sid       = "DenyRootUser"
            Effect    = "Deny"
            Action    = "*"
            Resource  = "*"
            Condition = { ArnLike = { "aws:PrincipalArn" = ["arn:aws:iam::*:root"] } }
          },
          {
            Sid    = "DenyLongLivedCredentials"
            Effect = "Deny"
            Action = [
              "iam:CreateAccessKey",
              "iam:CreateLoginProfile",
              "iam:CreateServiceSpecificCredential",
              "iam:CreateUser",
              "iam:UpdateLoginProfile",
            ]
            Resource = "*"
          },
        ]
      }
    }

    protect-log-archive = {
      description = "Log and security accounts: nobody shortens object-lock retention or edits a log bucket's lock or policy outside the baseline role."
      target      = "security"
      policy      = {
        Version   = "2012-10-17"
        Statement = [{
          Sid    = "ProtectWriteOnceLogs"
          Effect = "Deny"
          Action = [
            "s3:BypassGovernanceRetention",
            "s3:DeleteBucket",
            "s3:DeleteBucketPolicy",
            "s3:PutBucketObjectLockConfiguration",
            "s3:PutBucketPolicy",
            "s3:PutBucketVersioning",
            "s3:PutLifecycleConfiguration",
            "s3:PutObjectLegalHold",
            "s3:PutObjectRetention",
          ]
          Resource  = "*"
          Condition = { ArnNotLike = { "aws:PrincipalArn" = local.baseline_principals } }
        }]
      }
    }
  }

  rcps = merge(
    {
      payments-no-public-repo = {
        description = "Defence in depth: no GitHub Actions token from the public repository is accepted by any role in the payments account (the trust policies already refuse it)."
        target      = "payments"
        policy      = {
          Version   = "2012-10-17"
          Statement = [{
            Sid       = "DenyPublicRepoWebIdentity"
            Effect    = "Deny"
            Principal = "*"
            Action    = "sts:AssumeRoleWithWebIdentity"
            Resource  = "*"
            Condition = {
              StringLike = { "token.actions.githubusercontent.com:sub" = ["repo:${var.public_repository}:*"] }
            }
          }]
        }
      }
    },
    var.enable_data_perimeter_rcp ? {
      data-perimeter = {
        description = "S3, KMS, Secrets Manager and SQS answer only principals of this organization and AWS services acting for it."
        target      = "root"
        policy      = {
          Version   = "2012-10-17"
          Statement = [{
            Sid       = "EnforceOrgIdentities"
            Effect    = "Deny"
            Principal = "*"
            Action    = ["s3:*", "kms:*", "secretsmanager:*", "sqs:*"]
            Resource  = "*"
            Condition = {
              StringNotEqualsIfExists = { "aws:PrincipalOrgID" = aws_organizations_organization.this.id }
              BoolIfExists            = { "aws:PrincipalIsAWSService" = "false" }
            }
          }]
        }
      }
    } : {}
  )

  policy_targets = merge(
    { root = local.root_id },
    { for k, ou in aws_organizations_organizational_unit.this : k => ou.id }
  )
}

resource "aws_organizations_policy" "scp" {
  for_each    = local.scps
  name        = each.key
  description = each.value.description
  type        = "SERVICE_CONTROL_POLICY"
  content     = jsonencode(each.value.policy)
}

resource "aws_organizations_policy_attachment" "scp" {
  for_each  = local.scps
  policy_id = aws_organizations_policy.scp[each.key].id
  target_id = local.policy_targets[each.value.target]
}

resource "aws_organizations_policy" "rcp" {
  for_each    = local.rcps
  name        = each.key
  description = each.value.description
  type        = "RESOURCE_CONTROL_POLICY"
  content     = jsonencode(each.value.policy)
}

resource "aws_organizations_policy_attachment" "rcp" {
  for_each  = local.rcps
  policy_id = aws_organizations_policy.rcp[each.key].id
  target_id = local.policy_targets[each.value.target]
}
