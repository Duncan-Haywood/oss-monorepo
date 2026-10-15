terraform {
  required_version = "= 1.8.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 5.82.2"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.6.3"
    }
  }
}
