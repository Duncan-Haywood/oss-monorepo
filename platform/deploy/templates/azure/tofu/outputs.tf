output "url" {
  description = "Where the site is live."
  value       = azurerm_storage_account.site.primary_web_endpoint
}
