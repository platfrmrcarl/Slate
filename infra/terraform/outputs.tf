output "lb_ip" {
  value = module.wpkiller.lb_ip
}

output "cloud_run_url" {
  value = module.wpkiller.cloud_run_url
}

output "media_bucket" {
  value = module.wpkiller.media_bucket
}

output "service_account" {
  value = module.wpkiller.service_account_email
}
