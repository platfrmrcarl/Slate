resource "random_password" "preview_token_secret" {
  length  = 48
  special = false
}

resource "random_password" "internal_job_secret" {
  length  = 48
  special = false
}

locals {
  # Map of secret name -> initial value. DATABASE_URL is populated by the
  # cloudsql resource once the instance is up; we seed an empty placeholder
  # here so the secret exists for the Cloud Run service to mount.
  #
  # PREVIEW_TOKEN_SECRET and INTERNAL_JOB_SECRET are runtime-only — the
  # operator doesn't need to supply them, so we generate them.
  secrets = {
    DATABASE_URL               = ""
    AUTH_SECRET                = var.auth_secret
    PREVIEW_TOKEN_SECRET       = random_password.preview_token_secret.result
    INTERNAL_JOB_SECRET        = random_password.internal_job_secret.result
    ANTHROPIC_API_KEY          = var.anthropic_api_key
    RESEND_API_KEY             = var.resend_api_key
    GOOGLE_OAUTH_CLIENT_ID     = try(var.google_oauth.client_id, "")
    GOOGLE_OAUTH_CLIENT_SECRET = try(var.google_oauth.client_secret, "")
    GITHUB_OAUTH_CLIENT_ID     = try(var.github_oauth.client_id, "")
    GITHUB_OAUTH_CLIENT_SECRET = try(var.github_oauth.client_secret, "")
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "versions" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = each.value == "" ? "PLACEHOLDER_TO_BE_SET" : each.value
}
