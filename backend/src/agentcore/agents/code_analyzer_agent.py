"""
Repository Code Analyzer Agent.
Analyzes GitHub repositories to detect framework, dependencies, and deployment config.
"""

import json
import logging
from typing import Dict, Optional
from pydantic import BaseModel, Field

from src.agentcore.agents.base_agent import BaseAgent
from src.agentcore.models import RawRepositoryData


class AnalysisResult(BaseModel):
    """Structured output from repository analysis."""
    language: str = Field(..., description="Primary language (e.g., 'Python', 'JavaScript', 'TypeScript')")
    framework: Optional[str] = Field(None, description="Web framework (e.g., 'FastAPI', 'Express', 'Next.js')")
    runtime_version: Optional[str] = Field(None, description="Runtime version (e.g., 'python-3.11', 'nodejs-20')")
    package_manager: str = Field(..., description="Package manager (e.g., 'pip', 'npm', 'yarn', 'pnpm')")
    dependencies: Dict[str, str] = Field(default_factory=dict, description="Key dependencies as dict {name: version}")
    exposed_port: Optional[int] = Field(None, description="Application port (e.g., 3000, 8000, 8080)")
    environment_variables: list[str] = Field(default_factory=list, description="Required env var names as simple strings")
    health_check_path: str = Field(default="/", description="Health check endpoint")
    build_command: Optional[str] = Field(None, description="Build command if needed")
    start_command: str = Field(..., description="Production start command")


class CodeAnalyzerAgent(BaseAgent):
    """
    Repository analysis agent using Gemini.
    Detects tech stack and deployment requirements from GitHub API data.
    """
    
    def __init__(self):
        """Initialize analyzer with low temperature for deterministic output."""
        super().__init__(model="gemini-2.5-flash", temperature=0.1)
    
    def get_system_instruction(self) -> str:
        """System instruction for code analysis."""
        schema = AnalysisResult.model_json_schema()
        schema_str = json.dumps(schema, indent=2)
        
        return f"""You are an expert DevOps engineer specializing in application deployment.

Your task is to analyze a GitHub repository's structure and contents to determine its deployment requirements.

You will receive:
1. A list of files in the repository
2. Contents of key configuration files (package.json, requirements.txt, etc.)
3. Existing Dockerfile content (if present)

You MUST respond with ONLY a valid JSON object that EXACTLY matches this schema:

{schema_str}

CRITICAL RULES:
- Respond with ONLY valid JSON matching the schema above
- No markdown, no explanations, no code blocks, no extra text
- Use production-ready runtime versions (e.g., "python-3.11", "nodejs-20")
- Infer port from framework defaults (FastAPI: 8000, Express: 3000, Next.js: 3000, Flask: 5000)
- Extract env vars from .env.example or config files - output as simple string array
- dependencies MUST be a dict like {{"express": "4.18.0", "react": "18.2.0"}}
- environment_variables MUST be a list of strings like ["VAR1", "VAR2"]
- Provide complete, working start commands (e.g., "npm start", "uvicorn main:app --host 0.0.0.0 --port 8000")
- If you see an existing Dockerfile, respect its exposed port and commands

EXAMPLE OUTPUT:
{{
  "language": "JavaScript",
  "framework": "Express",
  "runtime_version": "nodejs-20",
  "package_manager": "npm",
  "dependencies": {{"express": "^4.18.0", "mongoose": "^7.0.0"}},
  "exposed_port": 3000,
  "environment_variables": ["PORT", "DB_URI", "JWT_SECRET"],
  "health_check_path": "/health",
  "build_command": null,
  "start_command": "node server.js"
}}
"""
    
    def _build_analysis_prompt(self, repo_data: RawRepositoryData) -> str:
        """Build analysis prompt with repository data."""
        files_sample = repo_data.files[:100] if len(repo_data.files) > 100 else repo_data.files
        
        package_files_str = json.dumps(repo_data.package_files, indent=2) if repo_data.package_files else "{}"
        config_files_str = json.dumps(repo_data.config_files, indent=2) if repo_data.config_files else "{}"
        
        dockerfile_section = ""
        if repo_data.existing_dockerfile:
            dockerfile_section = f"""
**Existing Dockerfile:**
```
{repo_data.existing_dockerfile[:1000]}
```
"""
        
        return f"""Analyze this GitHub repository and extract deployment requirements.

**Repository:** {repo_data.owner}/{repo_data.repo}

**File Structure (sample of {len(files_sample)}/{len(repo_data.files)} files):**
{json.dumps([f['path'] for f in files_sample], indent=2)}

**Package Manager Files:**
{package_files_str}

**Configuration Files:**
{config_files_str}

{dockerfile_section}

**Detected Language:** {repo_data.detected_language or "Not detected - please infer from files"}

Provide your analysis as a JSON object matching the schema in your instructions.
"""
    
    async def analyze(self, repo_data: RawRepositoryData) -> AnalysisResult:
        """
        Analyze repository data and return structured deployment requirements.
        
        Args:
            repo_data: RawRepositoryData fetched via GitHub API
            
        Returns:
            AnalysisResult with detected framework, dependencies, etc.
        """
        prompt = self._build_analysis_prompt(repo_data)
        
        self._log_execution("START", f"Analyzing {repo_data.owner}/{repo_data.repo}")
        
        try:
            # Use BaseAgent's structured generation
            result = await self._generate_structured(
                prompt=prompt,
                response_schema=AnalysisResult
            )
            
            # Post-process for common AI mistakes
            result_dict = result.model_dump()
            result_dict = self._post_process(result_dict, repo_data)
            
            # Reconstruct validated result
            analysis_result = AnalysisResult(**result_dict)
            
            self._log_execution("COMPLETE", f"Detected {analysis_result.framework or analysis_result.language}")
            return analysis_result
            
        except Exception as e:
            self.logger.error(f"Analysis failed: {e}", exc_info=True)
            raise ValueError(f"Failed to analyze repository: {str(e)}")
    
    def _post_process(self, result_json: dict, repo_data: RawRepositoryData) -> dict:
        """Fix common AI mistakes in analysis output."""
        # Handle nested structures Gemini sometimes creates
        if "language" not in result_json and "runtime" in result_json:
            runtime = result_json.get("runtime", {})
            if isinstance(runtime, dict):
                if "language" in runtime:
                    result_json["language"] = runtime["language"]
                if "version" in runtime and "runtime_version" not in result_json:
                    result_json["runtime_version"] = runtime["version"]
        
        # Fallback to detected language from repo_data
        if "language" not in result_json and repo_data.detected_language:
            result_json["language"] = repo_data.detected_language
        
        # Infer package_manager if missing
        if "package_manager" not in result_json:
            lang = result_json.get("language", "").lower()
            if "javascript" in lang or "typescript" in lang or "node" in lang:
                if "yarn.lock" in str(repo_data.package_files):
                    result_json["package_manager"] = "yarn"
                elif "pnpm-lock.yaml" in str(repo_data.package_files):
                    result_json["package_manager"] = "pnpm"
                else:
                    result_json["package_manager"] = "npm"
            elif "python" in lang:
                if "pyproject.toml" in repo_data.package_files:
                    result_json["package_manager"] = "uv"
                elif "Pipfile" in repo_data.package_files:
                    result_json["package_manager"] = "pipenv"
                else:
                    result_json["package_manager"] = "pip"
            elif "go" in lang:
                result_json["package_manager"] = "go mod"
            elif "java" in lang:
                result_json["package_manager"] = "maven"
            else:
                result_json["package_manager"] = "unknown"
        
        # Map common field variations
        if "port" in result_json and "exposed_port" not in result_json:
            result_json["exposed_port"] = result_json["port"]
        
        # Convert string port to int
        if "exposed_port" in result_json and isinstance(result_json["exposed_port"], str):
            try:
                result_json["exposed_port"] = int(result_json["exposed_port"])
            except (ValueError, TypeError):
                result_json["exposed_port"] = None
        
        # Flatten nested dependencies
        if "dependencies" in result_json and isinstance(result_json["dependencies"], dict):
            deps = result_json["dependencies"]
            needs_flattening = any(key in deps for key in ["production", "development", "production_dependencies", "dev_dependencies", "development_dependencies"])
            
            if needs_flattening:
                flat_deps = {}
                for key in ["production", "production_dependencies", "development", "dev_dependencies", "development_dependencies"]:
                    if key in deps and isinstance(deps[key], dict):
                        flat_deps.update(deps[key])
                result_json["dependencies"] = flat_deps
            
            if "package_manager" in deps and not isinstance(deps.get("package_manager"), dict):
                if "package_manager" not in result_json:
                    result_json["package_manager"] = deps["package_manager"]
        
        # Handle health_check variations
        if "health_check" in result_json and "health_check_path" not in result_json:
            health_check = result_json.get("health_check", {})
            if isinstance(health_check, dict):
                result_json["health_check_path"] = health_check.get("endpoint", "/")
            else:
                result_json["health_check_path"] = "/"
        
        # Remove extra fields
        allowed_fields = set(AnalysisResult.model_fields.keys())
        return {k: v for k, v in result_json.items() if k in allowed_fields}
