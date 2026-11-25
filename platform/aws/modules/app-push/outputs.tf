output "platform_apps" {
  description = "Map the runtime reads as PUSH_PLATFORM_APPS: { apns | apns_sandbox | fcm = ARN }."
  value = merge(
    var.apns_secret_name == null ? {} : { (var.apns_sandbox ? "apns_sandbox" : "apns") = aws_sns_platform_application.apns[0].arn },
    var.fcm_secret_name == null ? {} : { fcm = aws_sns_platform_application.fcm[0].arn },
  )
}

output "platform_app_names" {
  description = "For IAM: endpoint ARNs are arn:aws:sns:<region>:<account>:endpoint/<platform>/<app name>/<id>."
  value = compact([
    try(aws_sns_platform_application.apns[0].name, ""),
    try(aws_sns_platform_application.fcm[0].name, ""),
  ])
}
