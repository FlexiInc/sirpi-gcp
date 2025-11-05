variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "sirpi-gcp"
}

variable "app_env_vars" {
  description = "Application environment variables"
  type        = map(string)
  default     = null
}
