"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useDeploymentLogs } from "@/hooks/useDeploymentLogs";
import { useGCPCredentialStatus } from "@/hooks/useGCPCredentialStatus";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { ansiToHtml } from "@/lib/utils/ansi-to-html";
import { shouldShowLogToUser } from "@/lib/utils/log-filters";
import {
  XCircleIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";
import {
  Project,
  getUserProjectNamespace,
  projectsApi,
} from "@/lib/api/projects";
import toast from "react-hot-toast";
import AWSSetupFlow from "@/components/AWSSetupFlow";
import GCPSetupFlow from "@/components/GCPSetupFlow";
import SirpiAssistant from "@/components/SirpiAssistant";
import { apiCall } from "@/lib/api-client";
import { EnvironmentVariables } from "@/components/deploy/EnvironmentVariables";

type DeploymentStep =
  | "not_started"
  | "building"
  | "built"
  | "planning"
  | "planned"
  | "deploying"
  | "deployed"
  | "failed";

interface DeploymentState {
  currentStep: DeploymentStep;
  imagePushed: boolean;
  planGenerated: boolean;
  deployed: boolean;
  isStreaming: boolean;
  error: string | null;
}

interface CollapsibleSection {
  id: string;
  title: string;
  logs: string[];
  status: "idle" | "running" | "success" | "error";
  duration?: string;
  isExpanded: boolean;
}

interface LogRecord {
  operation_type: string;
  logs?: string[];
  status: string;
  duration_seconds?: number;
}

interface ClerkWindow {
  Clerk?: {
    session?: {
      getToken: () => Promise<string>;
    };
  };
}

export default function DeployPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const userProjects = params.userProjects as string;
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuildingImage, setIsBuildingImage] = useState(false);
  const [isPlanningDeployment, setIsPlanningDeployment] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDestroyingInfra, setIsDestroyingInfra] = useState(false);

  const [deploymentState, setDeploymentState] = useState<DeploymentState>({
    currentStep: "not_started",
    imagePushed: false,
    planGenerated: false,
    deployed: false,
    isStreaming: false,
    error: null,
  });

  const [sections, setSections] = useState<CollapsibleSection[]>([
    {
      id: "build",
      title: "Build Logs",
      logs: [],
      status: "idle",
      isExpanded: false,
    },
    {
      id: "plan",
      title: "Deployment Summary",
      logs: [],
      status: "idle",
      isExpanded: false,
    },
    {
      id: "deploy",
      title: "Deployment Logs",
      logs: [],
      status: "idle",
      isExpanded: false,
    },
  ]);

  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [showAWSSetup, setShowAWSSetup] = useState(false);
  const [gcpCredentials, setGcpCredentials] = useState<any[]>([]);
  const [isLoadingGcpCreds, setIsLoadingGcpCreds] = useState(true);

  // Check GCP credential status (for validation)
  const {
    credentialStatus,
    isChecking: isCheckingCreds,
    recheckCredentials,
  } = useGCPCredentialStatus();

  // Debug: Log credential status changes
  useEffect(() => {
    console.log("[Deploy Page] isCheckingCreds:", isCheckingCreds);
  }, [credentialStatus, isCheckingCreds, project?.cloud_provider]);

  // SSE log streaming for build
  const {
    logs: buildLogs,
    isConnected: buildConnected,
    isComplete: buildComplete,
  } = useDeploymentLogs(
    project?.id || null,
    isBuildingImage,
    project?.cloud_provider === "aws" ? "aws" : "gcp"
  );

  // SSE log streaming for plan
  const {
    logs: planLogs,
    isConnected: planConnected,
    isComplete: planComplete,
  } = useDeploymentLogs(
    project?.id || null,
    isPlanningDeployment,
    project?.cloud_provider === "aws" ? "aws" : "gcp"
  );

  // SSE log streaming for deploy
  const {
    logs: deployLogs,
    isConnected: deployConnected,
    isComplete: deployComplete,
  } = useDeploymentLogs(
    project?.id || null,
    isDeploying,
    project?.cloud_provider === "aws" ? "aws" : "gcp"
  );

  // SSE log streaming for destroy
  const {
    logs: destroyLogs,
    isConnected: destroyConnected,
    isComplete: destroyComplete,
  } = useDeploymentLogs(
    project?.id || null,
    isDestroyingInfra,
    project?.cloud_provider === "aws" ? "aws" : "gcp"
  );

  // Refs for tracking
  const sectionLogRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const operationStartTime = useRef<number | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // When build SSE logs arrive
  useEffect(() => {
    if (buildConnected && buildLogs.length > 0) {
      const latestLog = buildLogs[buildLogs.length - 1];
      if (shouldShowLogToUser(latestLog)) {
        addLogToSection("build", latestLog);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildLogs.length, buildConnected]);

  // When plan SSE logs arrive
  useEffect(() => {
    if (planConnected && planLogs.length > 0) {
      const latestLog = planLogs[planLogs.length - 1];
      if (shouldShowLogToUser(latestLog)) {
        addLogToSection("plan", latestLog);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLogs.length, planConnected]);

  // When deploy SSE logs arrive
  useEffect(() => {
    if (deployConnected && deployLogs.length > 0) {
      const latestLog = deployLogs[deployLogs.length - 1];
      if (shouldShowLogToUser(latestLog)) {
        addLogToSection("deploy", latestLog);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployLogs.length, deployConnected]);

  // When destroy SSE logs arrive
  useEffect(() => {
    if (destroyConnected && destroyLogs.length > 0) {
      const latestLog = destroyLogs[destroyLogs.length - 1];
      if (shouldShowLogToUser(latestLog)) {
        addLogToSection("destroy", latestLog);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destroyLogs.length, destroyConnected]);

  // When build completes via SSE
  useEffect(() => {
    if (buildComplete && isBuildingImage) {
      const duration = operationStartTime.current
        ? `${Math.round((Date.now() - operationStartTime.current) / 1000)}s`
        : undefined;

      updateSectionStatus("build", "success", duration);

      setDeploymentState((prev) => ({
        ...prev,
        currentStep: "built",
        imagePushed: true,
        isStreaming: false,
      }));

      setIsBuildingImage(false);
      setActiveSectionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildComplete]);

  // When plan completes via SSE
  useEffect(() => {
    if (planComplete && isPlanningDeployment) {
      const duration = operationStartTime.current
        ? `${Math.round((Date.now() - operationStartTime.current) / 1000)}s`
        : undefined;

      updateSectionStatus("plan", "success", duration);

      setDeploymentState((prev) => ({
        ...prev,
        currentStep: "planned",
        planGenerated: true,
        isStreaming: false,
      }));

      setIsPlanningDeployment(false);
      setActiveSectionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planComplete]);

  // When deploy completes via SSE
  useEffect(() => {
    if (deployComplete && isDeploying) {
      console.log("[Deploy] Deployment completed, refetching project...");

      const duration = operationStartTime.current
        ? `${Math.round((Date.now() - operationStartTime.current) / 1000)}s`
        : undefined;

      updateSectionStatus("deploy", "success", duration);

      setDeploymentState((prev) => ({
        ...prev,
        currentStep: "deployed",
        deployed: true,
        isStreaming: false,
      }));

      // Refetch project to get application URL
      setTimeout(async () => {
        if (project?.id) {
          console.log(
            "[Deploy] Fetching updated project with application URL..."
          );
          const updatedProject = await projectsApi.getProjectById(project.id);
          if (updatedProject) {
            console.log("[Deploy] Updated project:", {
              id: updatedProject.id,
              application_url: updatedProject.application_url,
              deployment_status: updatedProject.deployment_status,
            });
            setProject(updatedProject);
          }
        }
      }, 3000);

      setIsDeploying(false);
      setActiveSectionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployComplete]);

  // When destroy completes via SSE
  useEffect(() => {
    if (destroyComplete && isDestroyingInfra) {
      const duration = operationStartTime.current
        ? `${Math.round((Date.now() - operationStartTime.current) / 1000)}s`
        : undefined;

      updateSectionStatus("destroy", "success", duration);

      toast.success("Infrastructure destroyed successfully");

      // Refetch project to clear URLs and status
      setTimeout(async () => {
        if (project?.id) {
          const updatedProject = await projectsApi.getProjectById(project.id);
          if (updatedProject) {
            setProject(updatedProject);

            // Reset deployment state
            setDeploymentState({
              currentStep: "not_started",
              imagePushed: false,
              planGenerated: false,
              deployed: false,
              isStreaming: false,
              error: null,
            });

            // Reset section statuses to idle (clear green checkmarks)
            setSections((prev) =>
              prev.map((section) => {
                if (
                  section.id === "build" ||
                  section.id === "plan" ||
                  section.id === "deploy"
                ) {
                  return {
                    ...section,
                    status: "idle" as const,
                    logs: [],
                    duration: undefined,
                  };
                }
                return section;
              })
            );
          }
        }
      }, 2000);

      setIsDestroyingInfra(false);
      setIsDestroying(false);
      setActiveSectionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destroyComplete]);

  // Auto-scroll within the active section's log container only
  useEffect(() => {
    if (activeSectionId && sectionLogRefs.current[activeSectionId]) {
      const logContainer = sectionLogRefs.current[activeSectionId];
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.flatMap((s) => s.logs).length, activeSectionId]);

  useEffect(() => {
    if (user) {
      const expectedNamespace = getUserProjectNamespace(
        user as { username?: string; firstName?: string; id: string }
      );
      if (userProjects !== expectedNamespace) {
        router.replace(`/${expectedNamespace}/${projectSlug}/deploy`);
        return;
      }
    }
  }, [user, userProjects, projectSlug, router]);

  const loadProject = useCallback(async () => {
    try {
      setIsLoading(true);
      const overview = await projectsApi.getUserOverview();
      if (overview) {
        const userOverview = overview as { projects: { items: Project[] } };
        const foundProject = userOverview.projects.items.find(
          (p) =>
            p.slug === projectSlug ||
            p.name.toLowerCase().replace(/[^a-z0-9]/g, "-") === projectSlug
        );

        if (foundProject) {
          setProject(foundProject);

          // Load GCP credentials if GCP project
          if (foundProject.cloud_provider === "gcp") {
            try {
              const gcpResponse = await apiCall("/gcp/credentials");
              if (gcpResponse.ok) {
                const gcpData = await gcpResponse.json();
                setGcpCredentials(gcpData.credentials || []);
              }
            } catch (error) {
              console.error("Failed to load GCP credentials:", error);
            } finally {
              setIsLoadingGcpCreds(false);
            }
          } else {
            setIsLoadingGcpCreds(false);
          }

          // Set deployment state based on project status
          if (foundProject.deployment_status === "deployed") {
            setDeploymentState((prev) => ({
              ...prev,
              currentStep: "deployed",
              imagePushed: true,
              planGenerated: true,
              deployed: true,
            }));
          } else if (foundProject.deployment_status === "destroyed") {
            // Reset state after destruction
            setDeploymentState({
              currentStep: "not_started",
              imagePushed: false,
              planGenerated: false,
              deployed: false,
              isStreaming: false,
              error: null,
            });
          }

          // Load previous deployment logs from database
          // Only load logs if infrastructure is actively deployed
          if (foundProject.deployment_status === "deployed") {
            try {
              const token = await (
                window as unknown as ClerkWindow
              ).Clerk?.session?.getToken();

              // Use cloud-specific endpoint
              const logsEndpoint =
                foundProject.cloud_provider === "gcp"
                  ? `/gcp/deployment/projects/${foundProject.id}/logs`
                  : `/deployment/projects/${foundProject.id}/logs`;

              const logsResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/v1${logsEndpoint}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (logsResponse.ok) {
                const logsData = await logsResponse.json();
                if (logsData.success && logsData.data.logs.length > 0) {
                  const sectionMap: Record<string, string> = {
                    build_image: "build",
                    plan: "plan",
                    apply: "deploy",
                    destroy: "destroy",
                  };

                  const initialSections: CollapsibleSection[] = [
                    {
                      id: "build",
                      title: "Build Logs",
                      logs: [],
                      status: "idle",
                      isExpanded: false,
                    },
                    {
                      id: "plan",
                      title: "Deployment Summary",
                      logs: [],
                      status: "idle",
                      isExpanded: false,
                    },
                    {
                      id: "deploy",
                      title: "Deployment Logs",
                      logs: [],
                      status: "idle",
                      isExpanded: false,
                    },
                  ];

                  const restoredSections = [...initialSections];

                  logsData.data.logs.forEach((logRecord: LogRecord) => {
                    const sectionId = sectionMap[logRecord.operation_type];
                    if (sectionId) {
                      const sectionIndex = restoredSections.findIndex(
                        (s) => s.id === sectionId
                      );
                      if (sectionIndex >= 0) {
                        restoredSections[sectionIndex] = {
                          ...restoredSections[sectionIndex],
                          logs: logRecord.logs || [],
                          status:
                            logRecord.status === "success"
                              ? "success"
                              : logRecord.status === "error"
                              ? "error"
                              : "idle",
                          duration: logRecord.duration_seconds
                            ? `${logRecord.duration_seconds}s`
                            : undefined,
                          isExpanded: false,
                        };
                      }
                    }
                  });

                  setSections(restoredSections);

                  const hasCompletedBuild = logsData.data.logs.some(
                    (l: LogRecord) =>
                      l.operation_type === "build_image" &&
                      l.status === "success"
                  );
                  const hasCompletedPlan = logsData.data.logs.some(
                    (l: LogRecord) =>
                      l.operation_type === "plan" && l.status === "success"
                  );
                  const hasCompletedDeploy = logsData.data.logs.some(
                    (l: LogRecord) =>
                      l.operation_type === "apply" && l.status === "success"
                  );

                  if (hasCompletedDeploy) {
                    setDeploymentState((prev) => ({
                      ...prev,
                      currentStep: "deployed",
                      imagePushed: true,
                      planGenerated: true,
                      deployed: true,
                    }));
                  } else if (hasCompletedPlan) {
                    setDeploymentState((prev) => ({
                      ...prev,
                      currentStep: "planned",
                      imagePushed: true,
                      planGenerated: true,
                    }));
                  } else if (hasCompletedBuild) {
                    setDeploymentState((prev) => ({
                      ...prev,
                      currentStep: "built",
                      imagePushed: true,
                    }));
                  }
                }
              }
            } catch (logError) {
              console.error("Failed to load deployment logs:", logError);
            }
          }

          const canDeploy =
            foundProject.cloud_provider === "gcp" ||
            foundProject.deployment_status === "aws_verified" ||
            foundProject.deployment_status === "deployed" ||
            foundProject.deployment_status === "completed" ||
            foundProject.status === "pr_merged";

          if (!canDeploy) {
            router.push(`/${userProjects}/${projectSlug}`);
            return;
          }
        } else {
          router.push(`/${userProjects}`);
        }
      }
    } catch {
      router.push(`/${userProjects}`);
    } finally {
      setIsLoading(false);
    }
  }, [projectSlug, userProjects, router]);

  useEffect(() => {
    if (projectSlug && userProjects) {
      loadProject();
    }
  }, [loadProject, projectSlug, userProjects]);

  // Handle OAuth callback redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const gcpConnected = urlParams.get("gcp_connected");

      if (gcpConnected === "true") {
        // GCP just connected - recheck credentials
        toast.success("GCP connected successfully!");
        recheckCredentials();

        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [recheckCredentials]);

  const toggleSection = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, isExpanded: !s.isExpanded } : s
      )
    );
  };

  const addLogToSection = (sectionId: string, message: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              logs: [...s.logs, message],
              status: "running" as const,
              isExpanded: true,
            }
          : s
      )
    );
  };

  const updateSectionStatus = (
    sectionId: string,
    status: "idle" | "running" | "success" | "error",
    duration?: string
  ) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, status, duration } : s))
    );
  };

  const startOperation = async (
    operation: "build_image" | "plan" | "apply"
  ) => {
    if (!project) return;

    const sectionMap = {
      build_image: "build",
      plan: "plan",
      apply: "deploy",
    };
    const sectionId = sectionMap[operation];

    const stepMap = {
      build_image: "building",
      plan: "planning",
      apply: "deploying",
    } as const;

    // Clear previous logs and start new operation
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, logs: [], status: "running" as const, isExpanded: true }
          : s
      )
    );

    setDeploymentState((prev) => ({
      ...prev,
      currentStep: stepMap[operation],
      isStreaming: true,
      error: null,
    }));

    operationStartTime.current = Date.now();
    setActiveSectionId(sectionId);

    // Enable SSE streaming based on operation
    if (operation === "build_image") {
      setIsBuildingImage(true);
    } else if (operation === "plan") {
      setIsPlanningDeployment(true);
    } else if (operation === "apply") {
      setIsDeploying(true);
    }

    try {
      const token = await (
        window as unknown as ClerkWindow
      ).Clerk?.session?.getToken();

      // Use cloud-specific endpoint
      const endpoint =
        project.cloud_provider === "gcp"
          ? `/api/v1/gcp/deployment/projects/${project.id}/${operation}`
          : `/api/v1/deployment/projects/${project.id}/${operation}`;

      // For long operations (apply/destroy), don't wait for HTTP response - rely on SSE
      const isLongOperation = operation === "apply";

      if (isLongOperation) {
        // Fire and forget - SSE will handle all updates
        fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }).catch((err) => {
          // Ignore network timeouts - SSE stream is already handling the operation
          console.log(
            `[Deploy] HTTP request for ${operation} timed out (expected for long operations), relying on SSE stream`
          );
        });

        // SSE stream will handle all logging and completion
        return;
      }

      // For short operations (build, plan), wait for response
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Check HTTP status first
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Check if it's a credential expiration error
        if (
          response.status === 401 &&
          errorData.errors?.[0]?.detail?.error === "gcp_credentials_expired"
        ) {
          toast.error(errorData.errors[0].detail.message);
          await recheckCredentials();
          return;
        }

        throw new Error(
          errorData.detail ||
            errorData.errors?.[0] ||
            `${operation} failed with status ${response.status}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.errors?.[0] || `Failed to start ${operation}`);
      }

      // SSE stream will handle logging and completion
    } catch (error) {
      setDeploymentState((prev) => ({
        ...prev,
        currentStep: "failed",
        error: String(error),
        isStreaming: false,
      }));
      updateSectionStatus(sectionId, "error");
      toast.error(`Failed to start ${operation}`);

      // Reset streaming flags
      setIsBuildingImage(false);
      setIsPlanningDeployment(false);
      setIsDeploying(false);
      setActiveSectionId(null);
    }
  };

  const handleDestroy = async () => {
    if (!project) return;

    setIsDestroying(true);
    setShowDestroyConfirm(false);

    // Add destroy section if it doesn't exist
    setSections((prev) => {
      const hasDestroy = prev.some((s) => s.id === "destroy");
      if (hasDestroy) {
        // Reset existing destroy section
        return prev.map((s) =>
          s.id === "destroy"
            ? { ...s, logs: [], status: "running" as const, isExpanded: true }
            : s
        );
      } else {
        // Add new destroy section
        return [
          ...prev,
          {
            id: "destroy",
            title: "Destroy Logs",
            logs: [],
            status: "running" as const,
            isExpanded: true,
          },
        ];
      }
    });

    operationStartTime.current = Date.now();
    setActiveSectionId("destroy");

    // Enable SSE streaming for destroy
    setIsDestroyingInfra(true);

    try {
      const token = await (
        window as unknown as ClerkWindow
      ).Clerk?.session?.getToken();

      const endpoint =
        project.cloud_provider === "gcp"
          ? `/api/v1/gcp/deployment/projects/${project.id}/destroy`
          : `/api/v1/deployment/projects/${project.id}/destroy`;

      // Fire and forget - SSE will handle all updates (destroy can take >100 seconds)
      fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }).catch((err) => {
        // Ignore network timeouts - SSE stream is already handling the operation
        console.log(
          `[Destroy] HTTP request timed out (expected for long operations), relying on SSE stream`
        );
      });

      // SSE will handle all logging and completion
    } catch (error) {
      toast.error(`Failed to destroy: ${error}`);
      updateSectionStatus("destroy", "error");
      setIsDestroying(false);
      setIsDestroyingInfra(false);
      setActiveSectionId(null);
    }
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
          toast.success("AWS connected! You can now deploy.");
        }
      }
    } catch {
      toast.error("Failed to connect AWS");
    }
  };

  const getStatusBadge = (status: "idle" | "running" | "success" | "error") => {
    switch (status) {
      case "running":
        return (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Running</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-green-300"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-green-300">Success</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-red-400">Failed</span>
          </div>
        );
      default:
        return <span className="text-xs text-gray-600">Idle</span>;
    }
  };

  if (!user || isLoading) {
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
            className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isCloudProviderReady =
    (project.cloud_provider === "gcp" &&
      !isLoadingGcpCreds &&
      !isCheckingCreds &&
      credentialStatus?.status_code === "valid") ||
    (project.cloud_provider === "aws" &&
      (project.deployment_status === "aws_verified" ||
        project.deployment_status === "deployed" ||
        project.deployment_status === "completed"));

  const steps = [
    {
      id: "build",
      title: "Build",
      subtitle: "Container Image",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
      status: deploymentState.imagePushed
        ? "completed"
        : deploymentState.currentStep === "building"
        ? "active"
        : "pending",
      action: () => startOperation("build_image"),
      disabled: deploymentState.isStreaming || deploymentState.imagePushed,
    },
    {
      id: "plan",
      title: "Plan",
      subtitle: "Infrastructure",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      status: deploymentState.planGenerated
        ? "completed"
        : deploymentState.currentStep === "planning"
        ? "active"
        : !deploymentState.imagePushed
        ? "disabled"
        : "pending",
      action: () => startOperation("plan"),
      disabled:
        deploymentState.isStreaming ||
        !deploymentState.imagePushed ||
        deploymentState.planGenerated,
    },
    {
      id: "deploy",
      title: "Deploy",
      subtitle: "to Production",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
      ),
      status: deploymentState.deployed
        ? "completed"
        : deploymentState.currentStep === "deploying"
        ? "active"
        : !deploymentState.planGenerated
        ? "disabled"
        : "pending",
      action: () => startOperation("apply"),
      // disabled:
      //   deploymentState.isStreaming ||
      //   !deploymentState.planGenerated ||
      //   deploymentState.deployed,
    },
  ];

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">
                  {project.name}
                </h1>
                {deploymentState.deployed && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-300 rounded-full text-xs font-medium">
                    <div className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
                    <span>Production</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>{project.repository_name}</span>
              </div>
            </div>
            <button
              onClick={() => setShowDestroyConfirm(true)}
              disabled={isDestroying || deploymentState.isStreaming}
              className="px-4 py-2 text-sm text-gray-400 hover:text-red-400 border border-[#333333] hover:border-red-500/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDestroying ? "Destroying..." : "Destroy Infrastructure"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Template</div>
              <div className="text-sm font-medium text-gray-200">
                {project.cloud_provider === "gcp" ? "Cloud Run" : "ECS Fargate"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Serverless containers
              </div>
            </div>

            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Region</div>
              <div className="text-sm font-medium text-gray-200">
                {project.cloud_provider === "gcp" ? "us-central1" : "us-west-2"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {project.cloud_provider === "gcp"
                  ? "US Central (Iowa)"
                  : "US West (Oregon)"}
              </div>
            </div>

            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Status</div>
              <div className="text-sm font-medium text-gray-200">
                {deploymentState.deployed
                  ? "Deployed"
                  : deploymentState.planGenerated
                  ? "Ready to Deploy"
                  : deploymentState.imagePushed
                  ? "Image Built"
                  : isCloudProviderReady
                  ? "Ready"
                  : project.cloud_provider === "aws"
                  ? "AWS Setup Required"
                  : "GCP Connection Required"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {deploymentState.deployed
                  ? "Infrastructure live"
                  : isCloudProviderReady
                  ? "Ready for deployment"
                  : project.cloud_provider === "aws"
                  ? "Connect AWS account"
                  : "Connect GCP account"}
              </div>
            </div>
          </div>

          {(deploymentState.deployed || deploymentState.planGenerated) && (
            <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-6 mb-8">
              <h3 className="text-sm font-semibold text-gray-200 mb-4">
                Infrastructure Resources
              </h3>

              {/* GCP Resources */}
              {project.cloud_provider === "gcp" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-gray-500 mb-3">Compute</div>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Cloud Run Service
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {project.name}
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Container Registry
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Artifact Registry
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-3">Network</div>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            HTTPS Endpoint
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Auto-provisioned
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Auto-scaling
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            0 to 10 instances
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AWS Resources */}
              {project.cloud_provider === "aws" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-gray-500 mb-3">Compute</div>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            ECS Cluster
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {project.name}-cluster
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            ECS Service
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {project.name}-service
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Task Definition
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Fargate 0.5 vCPU / 1GB RAM
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-3">Network</div>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Application Load Balancer
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {project.name}-alb
                          </div>
                        </div>
                        {deploymentState.deployed && (
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5" />
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">VPC</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            3 AZs with public subnets
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-gray-300">
                            Security Group
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            HTTP/HTTPS ingress
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {deploymentState.deployed && (
                <div className="mt-6 pt-6 border-t border-[#333333]">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1">
                        Application URL
                      </div>
                      {project.application_url ? (
                        <div className="text-sm text-gray-300 font-mono">
                          {project.application_url}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 italic">
                          Deploy your infrastructure to get the application URL
                        </div>
                      )}
                    </div>
                    {project.application_url && (
                      <a
                        href={`${project.application_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-md hover:bg-gray-100 transition-colors text-xs font-medium"
                      >
                        <span>Visit</span>
                        <ExternalLinkIcon className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* GCP Initial Connection Banner (First Time - No Credentials) */}
        {project.cloud_provider === "gcp" &&
          !isLoadingGcpCreds &&
          !isCheckingCreds &&
          credentialStatus?.status_code === "missing" && (
            <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-300 mb-2">
                    Connect Your Google Cloud Account
                  </h3>
                  <p className="text-sm text-gray-400 mb-1">
                    One-click OAuth to deploy infrastructure to your GCP project
                  </p>
                  <div className="mt-4 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-md">
                    <p className="text-xs text-gray-400">
                      <strong className="text-blue-400">Pro tip:</strong> Just
                      click Allow on Google OAuth - no CLI needed!
                    </p>
                  </div>
                </div>
                <div className="ml-6">
                  <GCPSetupFlow onReconnect={recheckCredentials} />
                </div>
              </div>
            </div>
          )}

        {/* GCP Reconnection Banner (Refresh Token Invalid - Rare!) */}
        {project.cloud_provider === "gcp" &&
          !isLoadingGcpCreds &&
          !isCheckingCreds &&
          credentialStatus?.status_code === "expired_not_refreshable" && (
            <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <svg
                      className="w-5 h-5 text-yellow-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <h3 className="text-lg font-semibold text-yellow-300">
                      GCP Reconnection Required
                    </h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-1">
                    {credentialStatus.message}
                  </p>
                  <div className="mt-4 px-4 py-3 bg-yellow-500/5 border border-yellow-500/10 rounded-md">
                    <p className="text-xs text-gray-400">
                      <strong className="text-yellow-400">Note:</strong> Your
                      OAuth refresh token has expired. Click below to reconnect
                      - it only takes a few seconds!
                    </p>
                  </div>
                </div>
                <div className="ml-6">
                  <GCPSetupFlow onReconnect={recheckCredentials} />
                </div>
              </div>
            </div>
          )}

        {!isCloudProviderReady && project.cloud_provider === "aws" && (
          <div className="bg-orange-500/10 border border-orange-400/30 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-orange-300 mb-2">
                  AWS Account Setup Required
                </h3>
                <p className="text-sm text-gray-400 mb-1">
                  Connect your AWS account to enable deployment operations:
                </p>
                <ul className="text-xs text-gray-500 space-y-0.5 ml-4 mt-2">
                  <li>• Build and push Docker images to ECR</li>
                  <li>• Generate Terraform deployment plans</li>
                  <li>• Deploy infrastructure to your AWS account</li>
                </ul>
              </div>
              <button
                onClick={() => setShowAWSSetup(true)}
                className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                Connect AWS
              </button>
            </div>
          </div>
        )}

        {/* Environment Variables Section - Show after cloud setup */}
        {isCloudProviderReady && (
          <div className="mb-8">
            <EnvironmentVariables projectId={project.id} />
          </div>
        )}

        {isCloudProviderReady && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {steps.map((step, index) => (
              <div key={step.id} className="relative">
                {index < steps.length - 1 && (
                  <div className="absolute top-7 left-full w-3 h-px bg-[#1a1a1a] z-0">
                    {step.status === "completed" && (
                      <div className="h-full w-full bg-green-500" />
                    )}
                  </div>
                )}

                <button
                  onClick={step.action}
                  disabled={
                    step.disabled ||
                    (project.cloud_provider === "gcp" &&
                      credentialStatus?.needs_reconnect)
                  }
                  className={`relative w-full text-left p-4 rounded-lg border transition-all ${
                    step.status === "completed"
                      ? "bg-green-500/15 border-green-400/40 hover:bg-green-500/20"
                      : step.status === "active"
                      ? "bg-[#0a0a0a] border-gray-500 shadow-lg"
                      : step.status === "disabled"
                      ? "bg-[#0d0d0d] border-[#3a3a3a] opacity-70"
                      : "bg-[#0a0a0a] border-[#3a3a3a] hover:border-gray-600"
                  }`}
                  style={{ zIndex: 1 }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`p-2 rounded-md ${
                        step.status === "completed"
                          ? "bg-green-500/25 text-green-300"
                          : step.status === "active"
                          ? "bg-gray-900 text-gray-300"
                          : step.status === "disabled"
                          ? "bg-[#1a1a1a] text-gray-600"
                          : "bg-gray-950 text-gray-500"
                      }`}
                    >
                      {step.icon}
                    </div>
                    {step.status === "completed" && (
                      <svg
                        className="w-4 h-4 text-green-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {step.status === "active" && (
                      <div className="w-4 h-4 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm mb-0.5 text-gray-200">
                      {step.title}
                    </h3>
                    <p className="text-xs text-gray-600">{step.subtitle}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-px mb-6">
          {sections
            .filter((s) => s.logs.length > 0 || s.status !== "idle")
            .map((section) => (
              <div
                key={section.id}
                className="bg-[#0a0a0a] border border-[#333333] rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#121212] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDownIcon
                      className={`w-4 h-4 text-gray-600 transition-transform ${
                        section.isExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-300">
                      {section.title}
                    </span>
                    {section.logs.length > 0 && (
                      <span className="text-xs text-gray-700">
                        {section.logs.length} lines
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {section.duration && (
                      <span className="text-xs text-gray-500 font-mono">
                        {section.duration}
                      </span>
                    )}
                    {/* Show Live indicator when SSE is connected */}
                    {((buildConnected &&
                      section.id === "build" &&
                      isBuildingImage) ||
                      (planConnected &&
                        section.id === "plan" &&
                        isPlanningDeployment) ||
                      (deployConnected &&
                        section.id === "deploy" &&
                        isDeploying) ||
                      (destroyConnected &&
                        section.id === "destroy" &&
                        isDestroyingInfra)) &&
                      section.status === "running" && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                          <span className="text-xs text-green-400">Live</span>
                        </div>
                      )}
                    {getStatusBadge(section.status)}
                  </div>
                </button>

                {section.isExpanded && section.logs.length > 0 && (
                  <div
                    ref={(el) => {
                      sectionLogRefs.current[section.id] = el;
                    }}
                    className="border-t border-[#333333] p-4 max-h-96 overflow-y-auto bg-black"
                  >
                    <div className="font-mono text-[13px] text-[#fafafa] space-y-0.5 leading-relaxed">
                      {section.logs.map((log, index) => (
                        <div
                          key={index}
                          dangerouslySetInnerHTML={{ __html: ansiToHtml(log) }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>

        {deploymentState.currentStep === "failed" && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <XCircleIcon className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-medium text-red-400">
                Operation Failed
              </h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {deploymentState.error || "An error occurred during deployment"}
            </p>
            <button
              onClick={() =>
                setDeploymentState((prev) => ({
                  ...prev,
                  currentStep: prev.imagePushed ? "built" : "not_started",
                  error: null,
                }))
              }
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <SirpiAssistant projectId={project?.id} />

      <AWSSetupFlow
        isVisible={showAWSSetup}
        onComplete={handleAWSSetupComplete}
        onClose={() => setShowAWSSetup(false)}
        projectId={project?.id}
      />

      {showDestroyConfirm && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowDestroyConfirm(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-[#333333] rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/10 rounded-lg">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-200">
                  Destroy Infrastructure
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                This will permanently delete all{" "}
                {project.cloud_provider === "gcp" ? "GCP" : "AWS"} resources.
                This cannot be undone.
              </p>
              <div className="bg-red-500/5 border border-red-500/20 rounded-md p-3 mb-5">
                <p className="text-xs text-red-400">
                  <strong>Resources:</strong>{" "}
                  {project.cloud_provider === "gcp"
                    ? "Cloud Run Service, Artifact Registry, HTTPS endpoint"
                    : "VPC, Subnets, ECS, Load Balancer, Security Groups"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDestroy}
                  disabled={isDestroying}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium text-sm"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowDestroyConfirm(false)}
                  className="flex-1 px-4 py-2 border border-[#333333] text-gray-400 rounded-md hover:bg-[#0d0d0d] transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
