locals {
  queues = [
    "wpk-revalidate",
    "wpk-media",
    "wpk-ai",
    "wpk-email",
    "wpk-webhooks",
    "wpk-imports",
    "wpk-exports",
  ]
}

resource "google_cloud_tasks_queue" "queues" {
  for_each = toset(local.queues)
  name     = each.key
  location = var.region

  retry_config {
    max_attempts  = 5
    min_backoff   = "1s"
    max_backoff   = "300s"
    max_doublings = 5
  }
}
