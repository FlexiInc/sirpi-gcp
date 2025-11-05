# Sirpi E2B Sandbox Template

Custom E2B sandbox template with pre-installed deployment tools.

## Overview

This sandbox template provides an isolated environment for running Docker builds and Terraform deployments. It includes all necessary tools pre-installed for fast execution.

## Included Tools

- **Docker** - Container runtime for building images
- **Terraform** - Infrastructure as Code provisioning
- **Git** - Version control for repository cloning
- **AWS CLI** - AWS SDK command-line tools (optional)
- **gcloud CLI** - GCP SDK (not used - credentials via OAuth)
- **Python 3.12** - For running scripts
- **Node.js 18** - For JavaScript applications
- **Build tools** - gcc, make, etc.

## Building the Template

### Development Template
```bash
# Build and upload dev template
make build-dev
# or
python build_dev.py
```

### Production Template
```bash
# Build and upload production template
make build-prod
# or
python build_prod.py
```

## Template Configuration

The template is defined in `template.py`:
- Base image
- Installed packages
- Environment setup
- Tool versions

## Dockerfile

The `Dockerfile` defines the sandbox environment:
- Base: Ubuntu 22.04
- Docker-in-Docker setup
- Terraform installation
- Tool installations

## Usage in Sirpi

The template ID is configured in the backend:

```python
# backend/src/core/config.py
E2B_TEMPLATE_ID = "your-template-id"
```

Sirpi creates sandbox instances from this template:

```python
sandbox = Sandbox.create(template="your-template-id")
```

## Benefits

- **Fast Startup** - Tools pre-installed, no runtime installation
- **Consistent Environment** - Same tools/versions across deployments
- **Isolation** - Each deployment runs in its own sandbox
- **Security** - Limited permissions, no access to host system

## Updating the Template

1. Modify `Dockerfile` or `template.py`
2. Build: `make build-prod`
3. Test with a deployment
4. Update `E2B_TEMPLATE_ID` in backend config

## Cost

E2B charges based on:
- Sandbox execution time
- CPU/memory usage
- Storage

See E2B pricing for details.

## Debugging

To test the sandbox locally:

```bash
# Build Docker image
docker build -t sirpi-sandbox .

# Run interactively
docker run -it sirpi-sandbox bash
```

Test commands:
```bash
docker --version
terraform --version
git --version
python --version
```

## Makefile Commands

- `make build-dev` - Build and push development template
- `make build-prod` - Build and push production template
- `make clean` - Clean build artifacts
