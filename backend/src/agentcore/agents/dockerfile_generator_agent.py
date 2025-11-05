"""
Dockerfile Generator Agent.
Generates production-hardened, multi-stage Dockerfiles.
"""

import logging
import re
import json
from pydantic import BaseModel, Field

from src.agentcore.agents.base_agent import BaseAgent
from .code_analyzer_agent import AnalysisResult


class DockerfileOutput(BaseModel):
    """Structured Dockerfile output."""

    content: str = Field(..., description="Raw Dockerfile content")


class DockerfileGeneratorAgent(BaseAgent):
    """Generates production-grade, security-hardened Dockerfiles."""

    def __init__(self):
        super().__init__(model="gemini-2.5-flash", temperature=0.2)

    def get_system_instruction(self) -> str:
        """Comprehensive system instruction for secure Dockerfile generation."""
        return """You are a senior DevOps/Security engineer who creates production-hardened Docker images.

CRITICAL OUTPUT FORMAT:
- Output ONLY the raw Dockerfile content
- Start with FROM instruction  
- NO markdown (no ```, no ```dockerfile)
- NO explanations before or after the Dockerfile
- Raw text that can be saved directly as "Dockerfile"

MANDATORY SECURITY REQUIREMENTS:
1. **Multi-stage build**: Separate builder and runtime stages to minimize attack surface
2. **Non-root user**: Create and switch to non-root user (UID 1001) before CMD
3. **Minimal base**: Use slim/alpine variants (node:20-alpine, python:3.11-slim)
4. **No secrets**: Never hardcode credentials, tokens, or API keys
5. **Explicit versions**: Tag all base images (NEVER :latest)

PERFORMANCE REQUIREMENTS:
1. **Layer caching**: COPY package files before source code
2. **Multi-stage**: Only copy production artifacts to runtime stage
3. **Production deps**: Install only production dependencies
4. **Clean cache**: Remove package manager caches

PRODUCTION REQUIREMENTS:
1. **HEALTHCHECK**: Required for container orchestration
2. **EXPOSE**: Document container port
3. **CMD exec form**: Use ["exec", "form"] not shell form
4. **WORKDIR**: Set working directory explicitly

FRAMEWORK-SPECIFIC PATTERNS:

**Node.js/Express/Next.js:**
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001 && \\
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
CMD ["node", "server.js"]

**Python/FastAPI:**
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
RUN useradd -m -u 1001 appuser && \\
    chown -R appuser:appuser /app
ENV PATH=/root/.local/bin:$PATH
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

Generate a Dockerfile following these exact patterns and security requirements.

CRITICAL: Your Dockerfile MUST include:
1. Multi-stage build (builder and runtime stages)
2. RUN command with adduser/addgroup
3. USER directive
4. EXPOSE directive
5. HEALTHCHECK directive
6. CMD directive with exec form ["command", "args"]

DO NOT generate incomplete Dockerfiles. Include ALL sections.
"""

    async def generate(self, analysis: AnalysisResult) -> str:
        """Generate production-hardened Dockerfile."""
        self._log_execution(
            "START", f"Generating Dockerfile for {analysis.framework or analysis.language}"
        )

        # Build prompt
        deps_str = "\n".join(f"- {k}: {v}" for k, v in list(analysis.dependencies.items())[:10])
        env_vars = (
            ", ".join(analysis.environment_variables) if analysis.environment_variables else "None"
        )

        prompt = f"""Generate a production Dockerfile for this application:

**Application Details:**
Language: {analysis.language}
Framework: {analysis.framework or "Generic " + analysis.language}
Runtime Version: {analysis.runtime_version or "latest stable"}
Package Manager: {analysis.package_manager}
Exposed Port: {analysis.exposed_port or 8080}
Start Command: {analysis.start_command}
Build Command: {analysis.build_command or "None required"}
Health Check Path: {analysis.health_check_path}

**Key Dependencies:**
{deps_str}

**Required Environment Variables:**
{env_vars}

Generate a COMPLETE, secure, production-ready Dockerfile following the patterns in your instructions.
MUST include: multi-stage build, non-root user, HEALTHCHECK, EXPOSE, and CMD directives.

IMPORTANT: The CMD directive is MANDATORY. Do not generate an incomplete Dockerfile.

OUTPUT ONLY THE COMPLETE DOCKERFILE - NO MARKDOWN, NO EXPLANATIONS."""

        try:
            # Generate raw text (not structured output)
            dockerfile = await self._generate_text(prompt=prompt)

            # Aggressive markdown cleanup
            dockerfile = self._cleanup_markdown(dockerfile)

            # Validate critical directives
            if len(dockerfile) < 300:
                raise ValueError(f"Dockerfile too short ({len(dockerfile)} chars)")

            dockerfile_upper = dockerfile.upper()
            if "FROM" not in dockerfile_upper:
                raise ValueError("Dockerfile missing FROM instruction")

            if "CMD" not in dockerfile_upper and "ENTRYPOINT" not in dockerfile_upper:
                self.logger.warning("Dockerfile missing CMD/ENTRYPOINT, adding default CMD")
                # Add a default CMD based on language
                if analysis.language.lower() == "python":
                    dockerfile += f'\nCMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "{analysis.exposed_port or 8080}"]'
                elif analysis.language.lower() in ["javascript", "typescript"]:
                    cmd = analysis.start_command or "node server.js"
                    dockerfile += f"\nCMD {json.dumps(cmd.split())}"
                else:
                    dockerfile += f'\nCMD ["/bin/sh", "-c", "{analysis.start_command or "echo No start command defined"}"]'

            # Log success
            has_user = "USER" in dockerfile_upper
            has_healthcheck = "HEALTHCHECK" in dockerfile_upper
            has_cmd = "CMD" in dockerfile_upper or "ENTRYPOINT" in dockerfile_upper
            self._log_execution(
                "COMPLETE",
                f"Generated {len(dockerfile)} chars (user: {has_user}, healthcheck: {has_healthcheck}, cmd: {has_cmd})",
            )

            return dockerfile

        except Exception as e:
            self.logger.error(f"Dockerfile generation failed: {e}", exc_info=True)
            raise ValueError(f"Failed to generate Dockerfile: {str(e)}")

    def _cleanup_markdown(self, dockerfile: str) -> str:
        """Remove markdown formatting from Dockerfile."""
        # Remove code blocks
        if "```" in dockerfile:
            match = re.search(r"```(?:dockerfile)?\s*\n(.+?)```", dockerfile, re.DOTALL)
            if match:
                dockerfile = match.group(1).strip()
            else:
                dockerfile = dockerfile.replace("```dockerfile", "").replace("```", "").strip()

        # Find and extract from FROM instruction
        lines = dockerfile.split("\n")
        from_index = None
        for i, line in enumerate(lines):
            if line.strip().startswith("FROM") or line.strip().startswith("ARG"):
                from_index = i
                break

        if from_index is not None and from_index > 0:
            dockerfile = "\n".join(lines[from_index:])

        return dockerfile.strip()
