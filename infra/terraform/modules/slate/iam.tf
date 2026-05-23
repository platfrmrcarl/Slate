resource "google_service_account" "runtime" {
  account_id   = "slate-runtime"
  display_name = "Slate runtime SA"
}

resource "google_service_account" "tasks_invoker" {
  account_id   = "slate-tasks-invoker"
  display_name = "Slate Cloud Tasks invoker"
}

resource "google_project_iam_member" "runtime_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_secret" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service_iam_member" "tasks_can_invoke" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.tasks_invoker.email}"
}

# Public invoker for the Cloud Run service so the external HTTPS LB can route
# requests through to the container. With ingress=internal-and-cloud-load-balancing
# on the service itself, the *.run.app URL is still locked down — only requests
# coming via the LB (or internal sources) are accepted.
resource "google_cloud_run_v2_service_iam_member" "public_can_invoke" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_account_email" {
  value = google_service_account.runtime.email
}
