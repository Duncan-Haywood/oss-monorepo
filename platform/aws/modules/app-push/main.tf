# SNS mobile push platform applications for one product. Credentials are read from Secrets
# Manager by name (put there by the owner; never in this tree). SNS needs the credential as a
# resource argument, so the value also lands in OpenTofu state, which is KMS-encrypted in the
# state bucket and readable only by the apply role.
#
#   APNs (token auth) secret JSON: {"key_id":"...","team_id":"...","bundle_id":"...","signing_key":"-----BEGIN PRIVATE KEY-----..."}
#   FCM (HTTP v1)     secret: the Firebase service-account JSON, as is.

data "aws_secretsmanager_secret_version" "apns" {
  count     = var.apns_secret_name == null ? 0 : 1
  secret_id = var.apns_secret_name
}

data "aws_secretsmanager_secret_version" "fcm" {
  count     = var.fcm_secret_name == null ? 0 : 1
  secret_id = var.fcm_secret_name
}

locals {
  apns = var.apns_secret_name == null ? null : jsondecode(data.aws_secretsmanager_secret_version.apns[0].secret_string)
}

resource "aws_sns_platform_application" "apns" {
  count                    = var.apns_secret_name == null ? 0 : 1
  name                     = "${var.name}-${var.apns_sandbox ? "apns-sandbox" : "apns"}"
  platform                 = var.apns_sandbox ? "APNS_SANDBOX" : "APNS"
  platform_credential      = local.apns.signing_key
  platform_principal       = local.apns.key_id
  apple_platform_team_id   = local.apns.team_id
  apple_platform_bundle_id = local.apns.bundle_id
}

resource "aws_sns_platform_application" "fcm" {
  count               = var.fcm_secret_name == null ? 0 : 1
  name                = "${var.name}-fcm"
  platform            = "GCM"
  platform_credential = data.aws_secretsmanager_secret_version.fcm[0].secret_string
}
