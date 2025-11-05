/**
 * Project Detail Page - Infrastructure Generation
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { apiCall } from "@/lib/api-client";
import {
  GitHubIcon,
  ExternalLinkIcon,
  PlayIcon,
  CheckCircleIcon,
  RefreshIcon,
  XCircleIcon,
} from "@/components/ui/icons";
import {
  Project,
  getUserProjectNamespace,
  projectsApi,
} from "@/lib/api/projects";
import { workflowApi } from "@/lib/api/workflow";
import { githubApi } from "@/lib/api/github";
import { pullRequestsApi } from "@/lib/api/pull-requests";
import { downloadFilesAsZip } from "@/lib/utils/download";
import FilePreviewTabs from "@/components/FilePreviewTabs";
import AWSSetupFlow from "@/components/AWSSetupFlow";
import WorkflowLogs from "@/components/WorkflowLogs";
import toast from "react-hot-toast";

const INFRASTRUCTURE_TEMPLATES = [
  // GCP Templates
  {
    id: "cloud-run",
    name: "Cloud Run",
    description: "Fully managed serverless containers with auto-scaling",
    provider: "GCP",
    features: ["Auto-scaling", "Zero to N scaling", "Pay-per-use", "HTTPS built-in"],
    recommended: true,
  },
  {
    id: "gke-autopilot",
    name: "GKE Autopilot",
    description: "Fully managed Kubernetes with optimized node provisioning",
    provider: "GCP",
    features: ["Kubernetes", "Auto-provisioning", "High availability", "Workload identity"],
    recommended: false,
  },
  // AWS Templates
  {
    id: "ecs-fargate",
    name: "ECS Fargate",
    description: "Serverless container deployment with auto-scaling and load balancer",
    provider: "AWS",
    features: ["Auto-scaling", "Load Balancer", "Container Registry", "VPC"],
    recommended: false,
  },
  {
    id: "lambda",
    name: "Lambda API",
    description: "Serverless REST API with Lambda and API Gateway",
    provider: "AWS",
    features: ["Serverless", "API Gateway", "Pay-per-use", "Zero maintenance"],
    recommended: false,
  },
];

type WorkflowStatus =
  | "not_started"
  | "started"
  | "analyzing"
  | "generating"
  | "completed"
  | "failed";

interface WorkflowFile {
  filename: string;
  content: string;
  type: string;
}

interface AgentLog {
  timestamp: string;
  agent: string;
  message: string;
  level: string;
}

interface WorkflowState {
  status: WorkflowStatus;
  message: string;
  progress: number;
  error?: string;
  logs: AgentLog[];
  files: WorkflowFile[];
  formattedLogs: string[];  // Formatted logs for display
  workflowDuration?: string;
}

export default function ProjectPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const userProjects = params.userProjects as string;
  const projectSlug = params.projectSlug as string;

  const logsEndRef = useRef<HTMLDivElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoringState, setIsRestoringState] = useState(false);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [cloudProvider, setCloudProvider] = useState<"gcp" | "aws">("gcp");
  const [selectedTemplate, setSelectedTemplate] = useState("cloud-run");
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    status: "not_started",
    message: "Ready to generate infrastructure",
    progress: 0,
    logs: [],
    files: [],
    formattedLogs: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLogs, setShowLogs] = useState(true);  // Default expanded
  const [workflowStartTime, setWorkflowStartTime] = useState<number | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [showAWSSetup, setShowAWSSetup] = useState(false);
  const [prInfo, setPrInfo] = useState<{
    pr_number: number;
    pr_url: string;
    branch: string;
  } | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };

  useEffect(() => {
    if (
      workflowState.status === "analyzing" ||
      workflowState.status === "generating" ||
      workflowState.status === "started"
    ) {
      setShowLogs(true);
    }
  }, [workflowState.status]);

  // Auto-scroll logs as they appear
  useEffect(() => {
    if (logsEndRef.current && workflowState.logs.length > 0 && showLogs) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [workflowState.logs.length, showLogs]);

  useEffect(() => {
    if (user) {
      const expectedNamespace = getUserProjectNamespace(
        user as unknown as Record<string, unknown>
      );
      if (userProjects !== expectedNamespace) {
        router.replace(`/${expectedNamespace}/${projectSlug}`);
        return;
      }
    }
  }, [user, userProjects, projectSlug, router]);

  const restoreGenerationState = useCallback(async (projectId: string) => {
    try {
      setIsRestoringState(true);

      const [generation, projectData] = await Promise.all([
        workflowApi.getGenerationByProject(projectId),
        projectsApi.getProjectById(projectId),
      ]);

      if (!projectData) {
        setIsRestoringState(false);
        return;
      }

      setProject(projectData);

      if (generation) {
        setGenerationId(generation.id);

        if (generation.pr_number && generation.pr_url && generation.pr_branch) {
          setPrInfo({
            pr_number: generation.pr_number,
            pr_url: generation.pr_url,
            branch: generation.pr_branch,
          });
        }

        if (generation.status === "completed") {
          const restoredFiles = Array.isArray(generation.files)
            ? generation.files
            : [];
          
          // Restore workflow logs (merge all stages into one)
          let allLogs: string[] = [];
          let totalDuration = 0;
          
          if (generation.workflow_logs && Array.isArray(generation.workflow_logs)) {
            generation.workflow_logs.forEach((wlog: any) => {
              if (wlog.logs && Array.isArray(wlog.logs)) {
                allLogs = [...allLogs, ...wlog.logs];
              }
              if (wlog.duration_seconds) {
                totalDuration += wlog.duration_seconds;
              }
            });
          }
          
          setWorkflowState({
            status: "completed",
            message: "Infrastructure generated successfully!",
            progress: 100,
            logs: [],
            files: restoredFiles,
            formattedLogs: allLogs,
            workflowDuration: totalDuration > 0 ? `${totalDuration}s` : undefined,
          });
        } else if (generation.status === "failed") {
          setWorkflowState({
            status: "failed",
            message: "Previous generation failed",
            progress: 0,
            logs: [],
            files: [],
            formattedLogs: [],
            error: generation.error,
          });
        }
      }
    } finally {
      setIsRestoringState(false);
    }
  }, []);

  const loadProject = useCallback(async () => {
    try {
      setIsLoading(true);

      const [overview, installation] = await Promise.all([
        projectsApi.getUserOverview(),
        githubApi.getInstallation(),
      ]);

      if (installation) {
        setInstallationId(installation.installation_id);
      }

      if (overview) {
        const foundProject = (
          overview as { projects: { items: Project[] } }
        ).projects.items.find((p: Project) => p.slug === projectSlug);

        if (foundProject) {
          setProject(foundProject);
          await restoreGenerationState(foundProject.id);
        } else {
          router.push(`/${userProjects}`);
        }
      }
    } catch {
      router.push(`/${userProjects}`);
    } finally {
      setIsLoading(false);
    }
  }, [projectSlug, userProjects, router, restoreGenerationState]);

  useEffect(() => {
    if (projectSlug && userProjects) {
      loadProject();
    }
  }, [loadProject, projectSlug, userProjects]);

  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  const handleStartGeneration = async () => {
    if (!project || !installationId) {
      toast.error("Please connect your GitHub account");
      return;
    }

    setIsGenerating(true);
    setShowLogs(true);
    setWorkflowStartTime(Date.now());
    setWorkflowState({
      status: "started",
      message: "Starting infrastructure generation...",
      progress: 5,
      logs: [],
      files: [],
      formattedLogs: [],
    });

    try {
      const response = await workflowApi.startWorkflow({
        repository_url: project.repository_url,
        installation_id: installationId,
        template_type: selectedTemplate as "cloud-run" | "gke-autopilot" | "ecs-fargate" | "lambda",
        cloud_provider: cloudProvider,
        project_id: project.id,
      });

      // Store session ID for agent thinking logs
      setSessionId(response.session_id);

      const es = workflowApi.openWorkflowStream(response.session_id);
      setEventSource(es);

      es.addEventListener("status", (event) => {
        const data = JSON.parse(event.data);
        setWorkflowState((prev) => ({
          ...prev,
          status: data.status,
          message: data.message,
        }));
      });

      es.addEventListener("log", (event) => {
        const log = JSON.parse(event.data);
        
        // Format: TIME  [AGENT] Message
        const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        const formatted = `${time}  [${log.agent.toUpperCase()}] ${log.message}`;
        
        setWorkflowState((prev) => ({
          ...prev,
          logs: [...prev.logs, log],
          formattedLogs: [...prev.formattedLogs, formatted],
          progress: getProgressForAgent(log.agent),
        }));
      });

      es.addEventListener("complete", async (event) => {
        const data = JSON.parse(event.data);
        
        // Calculate total workflow duration
        const duration = workflowStartTime 
          ? `${Math.round((Date.now() - workflowStartTime) / 1000)}s`
          : undefined;
        
        setWorkflowState((prev) => ({
          ...prev,
          status: data.status === "completed" ? "completed" : "failed",
          message:
            data.status === "completed"
              ? "Infrastructure generated successfully!"
              : "Generation failed",
          progress: 100,
          files: data.files || [],
          error: data.error,
          workflowDuration: duration,
        }));
        setIsGenerating(false);
        es.close();

        if (data.status === "completed" && project) {
          try {
            const generation = await workflowApi.getGenerationByProject(
              project.id
            );
            if (generation?.id) {
              setGenerationId(generation.id);
            }
          } catch {
            // Continue
          }
        }
      });

      es.onerror = () => {
        setWorkflowState((prev) => ({
          ...prev,
          status: "failed",
          message: "Connection error",
          error: "Lost connection to server",
        }));
        setIsGenerating(false);
        es.close();
      };
    } catch (error) {
      setWorkflowState({
        status: "failed",
        message: "Failed to start generation",
        progress: 0,
        logs: [],
        files: [],
        formattedLogs: [],
        error: error instanceof Error ? error.message : "Unknown error",
      });
      setIsGenerating(false);
    }
  };

  const getProgressForAgent = (agent: string): number => {
    const progressMap: Record<string, number> = {
      orchestrator: 10,
      github_analyzer: 25,
      context_analyzer: 50,
      dockerfile_generator: 75,
      terraform_generator: 90,
    };
    return progressMap[agent] || 50;
  };

  const handleDownloadZip = async () => {
    if (!workflowState.files?.length) return;
    await downloadFilesAsZip(
      workflowState.files,
      `${project?.name || "infrastructure"}-files.zip`
    );
  };

  const handleCreatePR = async () => {
    if (!project || !generationId) {
      toast.error("Cannot create PR: Missing data");
      return;
    }

    if (prInfo) {
      window.open(prInfo.pr_url, "_blank");
      return;
    }

    try {
      setIsCreatingPR(true);
      toast.loading("Creating pull request...", { id: "create-pr" });

      const result = await pullRequestsApi.createPR({
        project_id: project.id,
        generation_id: generationId,
        base_branch: "main",
      });

      setPrInfo({
        pr_number: result.pr_number,
        pr_url: result.pr_url,
        branch: result.branch,
      });

      const updatedProject = await projectsApi.getProjectById(project.id);
      if (updatedProject) {
        setProject(updatedProject);
      }

      toast.success(`Pull request #${result.pr_number} created!`, {
        id: "create-pr",
      });
      window.open(result.pr_url, "_blank");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create PR",
        { id: "create-pr" }
      );
    } finally {
      setIsCreatingPR(false);
    }
  };

  const handleDeploy = () => {
    router.push(`/${params.userProjects}/${params.projectSlug}/deploy`);
  };

  const handleAWSSetupComplete = async (roleArn: string) => {
    setShowAWSSetup(false);

    try {
      if (project?.id) {
        const response = await apiCall(`/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            deployment_status: "aws_verified",
            aws_role_arn: roleArn,
          }),
        });

        if (response.ok) {
          const updatedProject = await projectsApi.getProjectById(project.id);
          if (updatedProject) {
            setProject(updatedProject);
          }
          toast.success("AWS account connected!");
        }
      }
    } catch {
      toast.error("Failed to connect AWS");
    }
  };

  if (!user || isLoading || isRestoringState) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-800 border-t-gray-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-200 mb-4">
            Project Not Found
          </h1>
          <button
            onClick={() => router.push(`/${userProjects}`)}
            className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-100 text-sm font-medium"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const isPRMerged =
    project.status === "pr_merged" || project.deployment_status === "pr_merged";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {project.name}
            </h1>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <GitHubIcon className="w-4 h-4" />
                <span>{project.repository_name}</span>
              </div>
              {project.language && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span>{project.language}</span>
                </div>
              )}
              <span>{new Date(project.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {project.repository_url && (
            <a
              href={project.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-[#333333] text-gray-400 rounded-lg hover:bg-[#0d0d0d] hover:text-white transition-colors text-sm"
            >
              <GitHubIcon className="w-4 h-4" />
              <span>Repository</span>
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Progress Bar - Only show when generating/completed */}
        {workflowState.status !== "not_started" && (
          <div className="mb-8 bg-[#0a0a0a] border border-[#333333] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {workflowState.status === "generating" ||
                workflowState.status === "started" ||
                workflowState.status === "analyzing" ? (
                  <div className="w-5 h-5 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
                ) : workflowState.status === "completed" ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-300" />
                ) : (
                  <XCircleIcon className="w-5 h-5 text-red-500" />
                )}
                <span className="font-medium text-gray-200">
                  {workflowState.message}
                </span>
              </div>
              <span className="text-sm text-gray-400">
                {workflowState.progress}%
              </span>
            </div>
            <div className="w-full bg-[#1a1a1a] rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  workflowState.status === "failed"
                    ? "bg-red-500"
                    : workflowState.status === "completed"
                    ? "bg-green-400"
                    : "bg-blue-500"
                }`}
                style={{ width: `${workflowState.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 2-Column Layout: Main Content + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content (Left - 2/3 width) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Template Selection */}
            {workflowState.status === "not_started" && (
              <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-8">
                <h2 className="text-xl font-semibold text-white mb-3">
                  Choose Infrastructure Template
                </h2>
                <p className="text-gray-400 mb-6">
                  Select your cloud provider and deployment template
                </p>

                {/* Cloud Provider Selector */}
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Cloud Provider
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        setCloudProvider("gcp");
                        setSelectedTemplate("cloud-run");
                      }}
                      className={`p-4 rounded-lg border transition-all text-left ${
                        cloudProvider === "gcp"
                          ? "bg-[#111111] border-blue-500"
                          : "bg-black border-[#333333] hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">☁️</div>
                        <div>
                          <div className="font-medium text-white">Google Cloud</div>
                          <div className="text-xs text-gray-500">GCP</div>
                        </div>
                      </div>
                      {cloudProvider === "gcp" && (
                        <div className="mt-2 text-xs text-blue-400">✓ Selected</div>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setCloudProvider("aws");
                        setSelectedTemplate("ecs-fargate");
                      }}
                      className={`p-4 rounded-lg border transition-all text-left ${
                        cloudProvider === "aws"
                          ? "bg-[#111111] border-orange-500"
                          : "bg-black border-[#333333] hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">🟠</div>
                        <div>
                          <div className="font-medium text-white">Amazon Web Services</div>
                          <div className="text-xs text-gray-500">AWS</div>
                        </div>
                      </div>
                      {cloudProvider === "aws" && (
                        <div className="mt-2 text-xs text-orange-400">✓ Selected</div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Deployment Templates */}
                <div className="space-y-4 mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Deployment Template
                  </label>
                  {INFRASTRUCTURE_TEMPLATES.filter(t => t.provider === cloudProvider.toUpperCase()).map((template) => (
                    <div
                      key={template.id}
                      className={`p-6 rounded-lg cursor-pointer transition-all border ${
                        selectedTemplate === template.id
                          ? "bg-[#111111] border-blue-500"
                          : "bg-black border-[#333333] hover:border-gray-600"
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-medium text-white">
                              {template.name}
                            </h3>
                            {template.recommended && (
                              <span className="px-3 py-1 bg-blue-600 text-white text-xs rounded-full">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mb-3">
                            {template.description}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {template.features.map((feature) => (
                              <span
                                key={feature}
                                className="px-3 py-1 bg-[#1a1a1a] text-gray-300 text-xs rounded border border-[#2a2a2a]"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 ${
                            selectedTemplate === template.id
                              ? "bg-blue-500 border-blue-500"
                              : "border-gray-600"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleStartGeneration}
                  disabled={isGenerating}
                  className="w-full px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-3 font-medium"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Starting Generation...</span>
                    </>
                  ) : (
                    <>
                      <PlayIcon className="w-5 h-5" />
                      <span>Generate Infrastructure</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Failed State */}
            {workflowState.status === "failed" && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <XCircleIcon className="w-6 h-6 text-red-400" />
                  <h3 className="text-lg font-medium text-red-400">
                    Generation Failed
                  </h3>
                </div>
                <p className="text-sm text-gray-300 mb-4">
                  {workflowState.error || "An error occurred"}
                </p>
                <button
                  onClick={() => {
                    setWorkflowState({
                      status: "not_started",
                      message: "Ready to generate infrastructure",
                      progress: 0,
                      logs: [],
                      files: [],
                      formattedLogs: [],
                    });
                    setShowLogs(false);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm font-medium"
                >
                  <RefreshIcon className="w-4 h-4" />
                  <span>Try Again</span>
                </button>
              </div>
            )}

            {/* Generating State - Show immediately with loading */}
            {(workflowState.status === "started" ||
              workflowState.status === "analyzing" ||
              workflowState.status === "generating") &&
              workflowState.logs.length === 0 && (
                <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-12 text-center">
                  <div className="w-12 h-12 border-3 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-200 mb-2">
                    AI Agents Working...
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Analyzing repository and generating infrastructure files
                  </p>
                  <div className="text-xs text-gray-500">
                    This may take 20-30 seconds
                  </div>
                </div>
              )}

            {/* Workflow Logs - ONE Section with Deploy Page Styling */}
            {workflowState.formattedLogs.length > 0 && (
              <WorkflowLogs
                logs={workflowState.formattedLogs}
                status={
                  workflowState.status === "completed" ? "success" :
                  workflowState.status === "failed" ? "error" :
                  workflowState.status === "started" || workflowState.status === "analyzing" || workflowState.status === "generating" ? "running" :
                  "idle"
                }
                duration={workflowState.workflowDuration}
                isExpanded={showLogs}
                onToggle={toggleLogs}
              />
            )}

            {/* Generated Files */}
            {workflowState.files.length > 0 && (
              <FilePreviewTabs
                files={workflowState.files}
                onDownloadAll={handleDownloadZip}
              />
            )}

            {/* Workflow States - Action Cards */}
            {workflowState.files.length > 0 && !prInfo && (
              <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-blue-300 mb-1">
                      Next: Create Pull Request
                    </h3>
                    <p className="text-sm text-gray-400">
                      Push infrastructure files to your repository
                    </p>
                  </div>
                  <button
                    onClick={handleCreatePR}
                    disabled={isCreatingPR}
                    className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isCreatingPR ? "Creating..." : "Create PR"}
                  </button>
                </div>
              </div>
            )}

            {prInfo && !isPRMerged && (
              <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-green-300 mb-1">
                      PR #{prInfo.pr_number} Created
                    </h3>
                    <p className="text-sm text-gray-400">
                      Waiting for merge to proceed with deployment
                    </p>
                  </div>
                  <a
                    href={prInfo.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium inline-flex items-center gap-2"
                  >
                    <span>View PR</span>
                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            {isPRMerged && (
              <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-green-300 mb-1">
                      Ready for Deployment
                    </h3>
                    <p className="text-sm text-gray-400">
                      Infrastructure files are merged. Start the deployment
                      process.
                    </p>
                  </div>
                  <button
                    onClick={handleDeploy}
                    className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium inline-flex items-center gap-2"
                  >
                    <PlayIcon className="w-4 h-4" />
                    <span>Go to Deploy</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar (Right - 1/3 width) */}
          <div className="space-y-6">
            {/* Project Details */}
            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-4">
                Project Details
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Status</p>
                  <p className="text-sm text-gray-200 capitalize">
                    {workflowState.status.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Language</p>
                  <p className="text-sm text-gray-200">
                    {project.language || "Not detected"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Cloud Provider</p>
                  <p className="text-sm text-gray-200 uppercase">
                    {cloudProvider === "gcp" ? "Google Cloud (GCP)" : "Amazon Web Services (AWS)"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Template</p>
                  <p className="text-sm text-gray-200">
                    {INFRASTRUCTURE_TEMPLATES.find(
                      (t) => t.id === selectedTemplate
                    )?.name || "Cloud Run"}
                  </p>
                </div>
              </div>
            </div>

            {/* Selected Template Info */}
            {selectedTemplate && (
              <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-6">
                <h3 className="text-lg font-medium text-white mb-4">
                  Template Info
                </h3>
                {(() => {
                  const template = INFRASTRUCTURE_TEMPLATES.find(
                    (t) => t.id === selectedTemplate
                  );
                  return template ? (
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-200">
                        {template.name}
                      </h4>
                      <p className="text-gray-400 text-sm">
                        {template.description}
                      </p>
                      <div>
                        <p className="text-sm text-gray-500 mb-3">Features:</p>
                        <div className="space-y-2">
                          {template.features.map((feature) => (
                            <div
                              key={feature}
                              className="flex items-center gap-2"
                            >
                              <CheckCircleIcon className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-gray-300">
                                {feature}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <AWSSetupFlow
        isVisible={showAWSSetup}
        onComplete={handleAWSSetupComplete}
        onClose={() => setShowAWSSetup(false)}
        projectId={project?.id}
      />
    </div>
  );
}
