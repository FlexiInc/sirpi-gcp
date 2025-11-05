"use client";

import React, { useEffect, useRef } from "react";
import { useAgentLogs, AgentLog } from "@/hooks/useAgentLogs";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";

interface AgentThinkingLogsProps {
  sessionId: string | null;
  isVisible?: boolean;
}

/**
 * Displays real-time agent thinking logs from Google ADK session state.
 * Professional UI without emojis for production use.
 */
export default function AgentThinkingLogs({
  sessionId,
  isVisible = true,
}: AgentThinkingLogsProps) {
  const { logs, isConnected, error } = useAgentLogs({
    sessionId,
    enabled: isVisible && !!sessionId,
  });

  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isExpanded) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isExpanded]);

  if (!isVisible || !sessionId) {
    return null;
  }

  const getAgentColor = (agent: string) => {
    const colorMap: Record<string, string> = {
      orchestrator: "text-blue-400",
      github_analyzer: "text-purple-400",
      code_analyzer: "text-green-400",
      dockerfile_generator: "text-cyan-400",
      terraform_generator: "text-orange-400",
      cicd_generator: "text-pink-400",
    };
    return colorMap[agent] || "text-gray-400";
  };

  const getStageColor = (stage: string) => {
    if (stage === "completed") return "bg-green-500/20 text-green-300 border-green-500/30";
    if (stage === "failed") return "bg-red-500/20 text-red-300 border-red-500/30";
    if (stage.includes("generating") || stage.includes("analyzing")) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  };

  return (
    <div className="border border-gray-800 rounded-lg bg-black/50 backdrop-blur overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-800 cursor-pointer hover:bg-gray-900/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-gray-400" />
          <h3 className="font-medium text-white">Agent Activity Logs</h3>
          
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-500">Live</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-gray-600 rounded-full" />
                <span className="text-xs text-gray-500">Disconnected</span>
              </>
            )}
          </div>
          
          {logs.length > 0 && (
            <span className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-800">
              {logs.length} events
            </span>
          )}
        </div>
        
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Logs Container */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 bg-red-900/20 border-b border-red-800/50 text-red-400 text-sm">
              {error}
            </div>
          )}

          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              {isConnected
                ? "Waiting for agent activity..."
                : "No logs available"}
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {logs.map((log, index) => (
                <AgentLogEntry key={index} log={log} />
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Individual log entry component
 */
function AgentLogEntry({ log }: { log: AgentLog }) {
  const getAgentColor = (agent: string) => {
    const colorMap: Record<string, string> = {
      orchestrator: "text-blue-400",
      github_analyzer: "text-purple-400",
      code_analyzer: "text-green-400",
      dockerfile_generator: "text-cyan-400",
      terraform_generator: "text-orange-400",
      cicd_generator: "text-pink-400",
    };
    return colorMap[agent] || "text-gray-400";
  };

  const getStageColor = (stage: string) => {
    if (stage === "completed") return "bg-green-500/20 text-green-300 border-green-500/30";
    if (stage === "failed") return "bg-red-500/20 text-red-300 border-red-500/30";
    if (stage.includes("generating") || stage.includes("analyzing")) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    return "bg-gray-700/30 text-gray-400 border-gray-600/30";
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="px-4 py-3 hover:bg-gray-900/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <span className="text-xs text-gray-600 font-mono">
            {formatTimestamp(log.timestamp)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-medium ${getAgentColor(log.agent)}`}>
              {log.agent}
            </span>
            {log.stage && (
              <span className={`text-xs px-2 py-0.5 rounded border ${getStageColor(log.stage)}`}>
                {log.stage}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            {log.content}
          </p>
        </div>
      </div>
    </div>
  );
}
