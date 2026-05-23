variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "domain" {
  type = string
}

variable "app_image" {
  type = string
}

variable "migration_image" {
  type = string
}

variable "db_tier" {
  type = string
}

variable "min_instances" {
  type = number
}

variable "max_instances" {
  type = number
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
