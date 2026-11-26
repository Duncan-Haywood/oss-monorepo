output "targets" {
  description = "Where each switchable hostname is served from after this apply."
  value       = local.target
}

output "exported" {
  value = try(local.inventory.exported, false)
}
