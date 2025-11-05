/**
 * Hook for streaming deployment logs via Server-Sent Events (SSE)
 */

import { useEffect, useState } from "react";

interface LogEvent {
  type: "connected" | "log" | "error" | "timeout" | "complete";
  message: string;
}

export function useDeploymentLogs(
  projectId: string | null,
  enabled: boolean = false,
  cloudProvider: "gcp" | "aws" = "gcp"
) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !enabled) {
      return;
    }

    // Connect to SSE endpoint (cloud-specific)
    const endpoint =
      cloudProvider === "gcp"
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/gcp/deployment/projects/${projectId}/logs/stream`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/deployment/projects/${projectId}/logs/stream`;

    const eventSource = new EventSource(endpoint);

    eventSource.onopen = () => {
      console.log("SSE connected");
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: LogEvent = JSON.parse(event.data);

        if (data.type === "log") {
          setLogs((prev) => [...prev, data.message]);

          // Check if this is a completion message
          const isComplete =
            data.message.includes("Build complete!") ||
            data.message.includes("Image pushed successfully") ||
            data.message.includes("Terraform plan generated successfully") ||
            data.message.includes("Deployment completed successfully");

          if (isComplete) {
            console.log("[SSE] Build completion detected:", data.message);
            setIsComplete(true);
            // Close connection after completion
            setTimeout(() => {
              console.log("[SSE] Closing connection");
              eventSource.close();
              setIsConnected(false);
            }, 2000); // Give 2s for any final messages
          }
        } else if (data.type === "error") {
          setError(data.message);
          eventSource.close();
        } else if (data.type === "complete") {
          console.log("[SSE] Completion event received");
          setIsComplete(true);
          setTimeout(() => {
            eventSource.close();
            setIsConnected(false);
          }, 1000);
        } else if (data.type === "connected") {
          console.log("Log stream connected");
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      setIsConnected(false);
      setError("Connection lost");
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
      setIsConnected(false);
    };
  }, [projectId, enabled, cloudProvider]);

  return {
    logs,
    isConnected,
    isComplete,
    error,
    clearLogs: () => setLogs([]),
  };
}
