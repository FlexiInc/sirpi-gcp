"use client";

import { useState, useEffect } from "react";
import { Upload, Plus, X, Eye, EyeOff, Save, FileText } from "lucide-react";

interface EnvVar {
  key: string;
  value: string;
  is_secret: boolean;
  description?: string;
}

interface EnvironmentVariablesProps {
  projectId: string;
}

export function EnvironmentVariables({ projectId }: EnvironmentVariablesProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [rawEnvInput, setRawEnvInput] = useState("");
  const [showRawInput, setShowRawInput] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadEnvVars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadEnvVars = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/env-vars`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const vars = data.map(
          (v: {
            key: string;
            value?: string;
            is_secret: boolean;
            description?: string;
          }) => ({
            key: v.key,
            value: v.value || "", // Empty for secrets
            is_secret: v.is_secret,
            description: v.description,
          })
        );
        setEnvVars(vars);
        // Auto-expand if there are env vars
        if (vars.length > 0) {
          setIsExpanded(true);
        }
      }
    } catch (error) {
      console.error("Failed to load env vars:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseEnvFile = (content: string): EnvVar[] => {
    const vars: EnvVar[] = [];

    content.split("\n").forEach((line) => {
      line = line.trim();

      // Skip comments and empty lines
      if (!line || line.startsWith("#")) return;

      // Parse KEY=value
      if (line.includes("=")) {
        const [key, ...valueParts] = line.split("=");
        let value = valueParts.join("=").trim();

        // Remove quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        vars.push({
          key: key.trim(),
          value,
          is_secret: true,
        });
      }
    });

    return vars;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const parsed = parseEnvFile(content);
    setEnvVars((prev) => [...prev, ...parsed]);
  };

  const handleRawInput = () => {
    if (rawEnvInput.trim()) {
      const parsed = parseEnvFile(rawEnvInput);
      setEnvVars((prev) => [...prev, ...parsed]);
      setRawEnvInput("");
      setShowRawInput(false);
    }
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "", is_secret: true }]);
  };

  const updateEnvVar = (
    index: number,
    field: keyof EnvVar,
    value: string | boolean
  ) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], [field]: value };
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const saveEnvVars = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/env-vars`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          env_vars: envVars.filter((v) => v.key && v.value),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save environment variables");
      }

      // Reload to get masked values
      await loadEnvVars();

      alert("Environment variables saved successfully!");
    } catch (error) {
      console.error("Failed to save env vars:", error);
      alert("Failed to save environment variables. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleShowValue = (key: string) => {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-[#333333] bg-[#0a0a0a] p-4">
        <div className="animate-pulse">
          <div className="h-12 bg-[#1a1a1a] rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#333333] bg-[#0a0a0a]">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1a1a1a] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-gray-400" />
          <div className="text-left">
            <h3 className="text-base font-semibold text-white">
              Environment Variables
            </h3>
            <p className="text-sm text-gray-400">
              {envVars.length > 0
                ? `${envVars.length} variable${
                    envVars.length !== 1 ? "s" : ""
                  } configured`
                : "Optional - Configure runtime environment variables"}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              Add or update environment variables for your application
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  id="env-file-upload"
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg text-sm transition-colors border border-[#333333]">
                  <Upload size={16} />
                  Upload .env
                </div>
              </label>

              <button
                onClick={() => setShowRawInput(!showRawInput)}
                className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg text-sm transition-colors border border-[#333333]"
              >
                <FileText size={16} />
                Paste .env
              </button>
            </div>
          </div>

          {showRawInput && (
            <div className="mb-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
              <textarea
                value={rawEnvInput}
                onChange={(e) => setRawEnvInput(e.target.value)}
                placeholder="Paste your .env file contents here&#10;&#10;KEY=value&#10;ANOTHER_KEY=another_value"
                className="w-full h-32 bg-black text-white rounded px-3 py-2 text-sm font-mono border border-[#333333] focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleRawInput}
                  className="px-3 py-1.5 bg-white text-black hover:bg-gray-100 rounded text-sm font-medium"
                >
                  Parse & Add
                </button>
                <button
                  onClick={() => {
                    setRawEnvInput("");
                    setShowRawInput(false);
                  }}
                  className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded text-sm border border-[#333333]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {envVars.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>No environment variables configured</p>
                <p className="text-sm mt-1">
                  Upload a .env file or add variables manually
                </p>
              </div>
            ) : (
              envVars.map((envVar, index) => (
                <div
                  key={index}
                  className="flex gap-2 items-start p-3 bg-[#1a1a1a] rounded-lg border border-[#333333]"
                >
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="KEY"
                      value={envVar.key}
                      onChange={(e) =>
                        updateEnvVar(index, "key", e.target.value)
                      }
                      className="bg-black text-white rounded px-3 py-2 text-sm font-mono border border-[#333333] focus:border-blue-500 focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={
                          envVar.is_secret && !showValues[envVar.key]
                            ? "password"
                            : "text"
                        }
                        placeholder={
                          envVar.is_secret && !envVar.value
                            ? "••••••••"
                            : "value"
                        }
                        value={envVar.value}
                        onChange={(e) =>
                          updateEnvVar(index, "value", e.target.value)
                        }
                        className="w-full bg-black text-white rounded px-3 py-2 pr-10 text-sm font-mono border border-[#333333] focus:border-blue-500 focus:outline-none"
                      />
                      {envVar.is_secret && envVar.value && (
                        <button
                          onClick={() => toggleShowValue(envVar.key)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          {showValues[envVar.key] ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeEnvVar(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={addEnvVar}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg text-sm transition-colors border border-[#333333]"
            >
              <Plus size={16} />
              Add Variable
            </button>
            {envVars.length > 0 && (
              <button
                onClick={saveEnvVars}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-gray-100 disabled:bg-[#1a1a1a] disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save All"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
