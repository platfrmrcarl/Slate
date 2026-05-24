locals {
  # Always-mounted secrets. PREVIEW_TOKEN_SECRET and INTERNAL_JOB_SECRET are
  # required by env.ts and are auto-generated in secrets.tf.
  env_secrets_required = {
    DATABASE_URL         = google_secret_manager_secret.secrets["DATABASE_URL"].secret_id
    AUTH_SECRET          = google_secret_manager_secret.secrets["AUTH_SECRET"].secret_id
    PREVIEW_TOKEN_SECRET = google_secret_manager_secret.secrets["PREVIEW_TOKEN_SECRET"].secret_id
    INTERNAL_JOB_SECRET  = google_secret_manager_secret.secrets["INTERNAL_JOB_SECRET"].secret_id
  }
  # Optional secrets — only mount when the operator has provided a real value.
  # env.ts validates these with a regex when present (e.g. "sk-ant-" prefix),
  # so binding an empty / placeholder value would fail Zod validation at boot.
  env_secrets_optional = merge(
    var.anthropic_api_key != "" ? {
      ANTHROPIC_API_KEY = google_secret_manager_secret.secrets["ANTHROPIC_API_KEY"].secret_id
    } : {},
    var.resend_api_key != "" ? {
      RESEND_API_KEY = google_secret_manager_secret.secrets["RESEND_API_KEY"].secret_id
    } : {},
  )
  env_secrets = merge(local.env_secrets_required, local.env_secrets_optional)
}

resource "google_cloud_run_v2_service" "app" {
  name     = "slate"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.app_image
      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "OTEL_ENABLED"
        value = "true"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "APP_URL"
        value = "https://${var.domain}"
      }
      env {
        name  = "GCS_BUCKET_MEDIA"
        value = google_storage_bucket.media.name
      }
      env {
        name  = "GCS_BUCKET_THEMES"
        value = google_storage_bucket.themes.name
      }
      env {
        name  = "CLOUD_TASKS_INVOKER_SA"
        value = google_service_account.tasks_invoker.email
      }

      dynamic "env" {
        for_each = local.env_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }

    vpc_access {
      network_interfaces {
        network = google_compute_network.vpc.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }
  }
}

resource "google_cloud_run_v2_job" "migrate" {
  name     = "slate-migrate"
  location = var.region

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0

      containers {
        image = var.migration_image

        env {
          name  = "NODE_ENV"
          value = "production"
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["DATABASE_URL"].secret_id
              version = "latest"
            }
          }
        }
      }

      vpc_access {
        network_interfaces {
          network = google_compute_network.vpc.name
        }
        egress = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.app.uri
}
