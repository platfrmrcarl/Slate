variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "domain" {
  type        = string
  description = "Public hostname served by the LB (e.g. www.example.com)"
}

variable "app_image" {
  type        = string
  description = "Fully-qualified image ref for the Cloud Run service"
}

variable "migration_image" {
  type        = string
  description = "Fully-qualified image ref for the migration Cloud Run job"
}

variable "db_tier" {
  type    = string
  default = "db-custom-2-7680"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
}

variable "resend_api_key" {
  type      = string
  sensitive = true
}

variable "auth_secret" {
  type      = string
  sensitive = true
}

variable "google_oauth" {
  type = object({
    client_id     = string
    client_secret = string
  })
  sensitive = true
  default   = null
}

variable "github_oauth" {
  type = object({
    client_id     = string
    client_secret = string
  })
  sensitive = true
  default   = null
}
