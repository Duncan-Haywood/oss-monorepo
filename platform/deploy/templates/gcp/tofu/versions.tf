terraform {
  required_version = "= 1.8.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 6.14.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.6.3"
    }
  }
}
