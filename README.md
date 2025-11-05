# Sirpi

**AI-Native DevOps Automation Platform**

Sirpi is an intelligent cloud deployment platform that automatically generates and deploys cloud infrastructure from your GitHub repositories. Built with Google's Gemini AI, it provides seamless deployments to AWS and GCP with zero infrastructure configuration required.

## Features

- 🤖 **AI-Powered Infrastructure Generation** - Analyzes your codebase and generates optimized Dockerfile and Terraform configurations
- ☁️ **Multi-Cloud Support** - Deploy to AWS (ECS Fargate) or GCP (Cloud Run)
- 🔄 **GitHub Integration** - Connect repositories and deploy with a single click
- 📊 **Real-time Deployment Logs** - Stream logs during build, plan, and deployment phases
- 🔒 **Secure Credential Management** - OAuth-based authentication for cloud providers
- 🗄️ **State Management** - Automatic Terraform state management in cloud storage
- 🔐 **Environment Variables** - Encrypted storage and secure injection of secrets

## Architecture

```
sirpi-google-devpost/
├── backend/          # FastAPI backend with AI orchestration
├── frontend/         # Next.js frontend application
├── infrastructure/   # AWS CDK for Bedrock agents (optional)
└── sirpi-e2b-sandbox/ # E2B sandbox template for isolated deployments
```

## Technology Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **Google Gemini** - AI model for infrastructure generation
- **E2B** - Sandboxed execution environment for Docker/Terraform
- **Supabase** - PostgreSQL database and authentication
- **Python 3.12+**

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Clerk** - User authentication

### Cloud Integrations
- **AWS** - ECS Fargate, ECR, CloudFormation
- **GCP** - Cloud Run, Artifact Registry, Cloud Storage
- **GitHub** - Repository access and webhooks

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- uv (Python package manager)
- Supabase account
- Clerk account
- E2B API key

### Backend Setup

```bash
cd backend

# Install dependencies
uv sync

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
# (Apply migrations in database/migrations/ to your Supabase instance)

# Start the server
uv run uvicorn src.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Start the development server
npm run dev
```

### E2B Sandbox Template

```bash
cd sirpi-e2b-sandbox

# Build and deploy the sandbox template
make build-prod
```

## Environment Variables

### Backend (.env)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Supabase service role key
- `CLERK_SECRET_KEY` - Clerk authentication key
- `GEMINI_API_KEY` - Google Gemini API key
- `E2B_API_KEY` - E2B sandbox API key
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_PRIVATE_KEY` - GitHub App private key
- `GCP_OAUTH_CLIENT_ID` - GCP OAuth client ID
- `GCP_OAUTH_CLIENT_SECRET` - GCP OAuth client secret
- `ENCRYPTION_KEY` - 32-byte encryption key for secrets

### Frontend (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend API URL (http://localhost:8000)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

## Deployment Workflow

1. **Connect Repository** - Link your GitHub repository to Sirpi
2. **AI Analysis** - Gemini analyzes your code and generates infrastructure
3. **Build Image** - Docker image is built and pushed to container registry
4. **Plan Infrastructure** - Terraform generates deployment plan
5. **Deploy** - Infrastructure is provisioned and application is deployed
6. **Monitor** - Real-time logs and deployment status

## API Endpoints

- `POST /api/v1/projects` - Create a new project
- `GET /api/v1/projects/{id}` - Get project details
- `POST /api/v1/gcp/deployment/projects/{id}/build_image` - Build Docker image
- `POST /api/v1/gcp/deployment/projects/{id}/plan` - Generate Terraform plan
- `POST /api/v1/gcp/deployment/projects/{id}/apply` - Deploy infrastructure
- `POST /api/v1/gcp/deployment/projects/{id}/destroy` - Destroy infrastructure
- `GET /api/v1/gcp/deployment/projects/{id}/logs/stream` - Stream deployment logs (SSE)

## Database Schema

See `backend/database/schema_complete.sql` for the complete database schema.

Key tables:
- `projects` - User projects and deployment status
- `generations` - AI-generated infrastructure files
- `deployment_logs` - Historical deployment logs
- `gcp_credentials` - OAuth credentials for GCP
- `aws_credentials` - IAM role credentials for AWS
- `env_vars` - Encrypted environment variables

## Contributing

This is a DevPost submission project. For questions or issues, please open a GitHub issue.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with Google's Gemini AI
- Powered by E2B sandboxes for secure execution
- Infrastructure as Code with Terraform
- Cloud platforms: AWS and Google Cloud Platform
