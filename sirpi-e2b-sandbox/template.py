"""
E2B Template for Sirpi - Cloud Deployment Sandbox
Pre-configured with Docker, Terraform, gcloud, and AWS CLI
"""

from e2b import Template

# Create template from Dockerfile
# E2B base image already has proper start command, no need to override
template = Template().from_dockerfile("./Dockerfile")
