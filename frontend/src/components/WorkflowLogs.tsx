"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { ansiToHtml } from "@/lib/utils/ansi-to-html";

interface WorkflowLogsProps {
  logs: string[];
  status: "idle" | "running" | "success" | "error";
  duration?: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function WorkflowLogs({ logs, status, duration, isExpanded, onToggle }: WorkflowLogsProps) {
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

  if (logs.length === 0 && status === "idle") {
    return null;
  }

  return (
    <div className="bg-[#0a0a0a] border border-[#333333] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#121212] transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`w-4 h-4 text-gray-600 transition-transform ${
              isExpanded ? "rotate-0" : "-rotate-90"
            }`}
          />
          <span className="text-sm font-medium text-gray-300">
            Workflow Logs
          </span>
          {logs.length > 0 && (
            <span className="text-xs text-gray-700">
              {logs.length} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {duration && (
            <span className="text-xs text-gray-500 font-mono">
              {duration}
            </span>
          )}
          {getStatusBadge(status)}
        </div>
      </button>

      {isExpanded && logs.length > 0 && (
        <div className="border-t border-[#333333] p-4 max-h-96 overflow-y-auto bg-black">
          <div className="font-mono text-[13px] text-[#fafafa] space-y-0.5 leading-relaxed">
            {logs.map((log, index) => (
              <div
                key={index}
                dangerouslySetInnerHTML={{ __html: ansiToHtml(log) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
