output "lb_ip" {
  value = module.slate.lb_ip
}

output "cloud_run_url" {
  value = module.slate.cloud_run_url
}

output "media_bucket" {
  value = module.slate.media_bucket
}

output "service_account" {
  value = module.slate.service_account_email
}
