"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import {
  GitHubIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";
import { githubApi, GitHubRepository } from "@/lib/api/github";
import { projectsApi, getUserProjectNamespace } from "@/lib/api/projects";
import { Notification } from "@/components/ui/notification";
import { Upload, Plus, X, Eye, EyeOff, FileText } from "lucide-react";
import { apiCall } from "@/lib/api-client";

export default function ImportRepoPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const userProjects = params.userProjects as string;
  const repoFullName = decodeURIComponent(params.repo as string);
  const [isClient, setIsClient] = useState(false);

  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: "success" | "error";
    title: string;
    message: string;
  }>({ show: false, type: "success", title: "", message: "" });

  // Environment Variables state
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [envVars, setEnvVars] = useState<
    Array<{ key: string; value: string; is_secret: boolean }>
  >([]);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [rawEnvInput, setRawEnvInput] = useState("");
  const [showRawInput, setShowRawInput] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Validate user namespace
  useEffect(() => {
    if (user && isClient) {
      const expectedNamespace = getUserProjectNamespace(
        user as unknown as Record<string, unknown>
      );
      if (userProjects !== expectedNamespace) {
        // Redirect to correct namespace
        router.replace(
          `/${expectedNamespace}/import/${encodeURIComponent(repoFullName)}`
        );
        return;
      }
    }
  }, [user, userProjects, router, isClient, repoFullName]);

  useEffect(() => {
    async function loadRepository() {
      try {
        setIsLoading(true);

        // Get installation
        const installation = await githubApi.getInstallation();
        if (!installation) {
          router.push(`/${userProjects}/import`);
          return;
        }

        setInstallationId(installation.installation_id);

        // Get repos
        const repos = await githubApi.getRepositories(
          installation.installation_id
        );
        const repo = repos.find((r) => r.full_name === repoFullName);

        if (repo) {
          setRepository(repo);
        } else {
          router.push(`/${userProjects}/import`);
        }
      } catch {
        router.push(`/${userProjects}/import`);
      } finally {
        setIsLoading(false);
      }
    }

    if (user && repoFullName) {
      loadRepository();
    }
  }, [user, repoFullName, router, userProjects]);

  // Environment variable helpers
  const parseEnvFile = (content: string) => {
    const vars: Array<{ key: string; value: string; is_secret: boolean }> = [];
    content.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      if (line.includes("=")) {
        const [key, ...valueParts] = line.split("=");
        let value = valueParts.join("=").trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        vars.push({ key: key.trim(), value, is_secret: true });
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
    field: "key" | "value" | "is_secret",
    value: string | boolean
  ) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], [field]: value };
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const toggleShowValue = (key: string) => {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleImport = async () => {
    if (!repository || !installationId || isImporting) return;

    try {
      setIsImporting(true);

      const project = await projectsApi.importRepository(
        repository.full_name,
        installationId
      );

      if (project) {
        // Save environment variables if any
        if (envVars.length > 0) {
          const validEnvVars = envVars.filter((v) => v.key && v.value);
          if (validEnvVars.length > 0) {
            try {
              await apiCall(`/projects/${project.id}/env-vars`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ env_vars: validEnvVars }),
              });
            } catch (error) {
              console.error("Failed to save env vars:", error);
              // Don't fail the import if env vars fail
            }
          }
        }

        setNotification({
          show: true,
          type: "success",
          title: "Project Created",
          message: `${repository.name} has been imported successfully.`,
        });

        // Redirect to projects dashboard
        setTimeout(() => {
          router.push(`/${userProjects}`);
        }, 1500);
      } else {
        setNotification({
          show: true,
          type: "error",
          title: "Import Failed",
          message: "Failed to import repository. Please try again.",
        });
        setIsImporting(false);
      }
    } catch {
      setNotification({
        show: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!repository) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Notification
        type={notification.type}
        title={notification.title}
        message={notification.message}
        show={notification.show}
        onClose={() => setNotification({ ...notification, show: false })}
      />

      <div className="mb-8">
        <button
          onClick={() => router.push(`/${userProjects}/import`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to Import
        </button>

        <h1 className="text-3xl font-bold text-white mb-4">
          Import Repository
        </h1>
      </div>

      <div
        className="bg-black rounded-lg p-8"
        style={{ border: "1px solid #3D3D3D" }}
      >
        {/* Repository Info */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
              <GitHubIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {repository.name}
              </h2>
              <p className="text-sm text-gray-400">{repository.full_name}</p>
            </div>
          </div>

          {repository.description && (
            <p className="text-gray-300 mb-4">{repository.description}</p>
          )}

          <div className="flex gap-4 text-sm text-gray-400">
            {repository.language && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                {repository.language}
              </span>
            )}
            <span>Default branch: {repository.default_branch}</span>
            {repository.private && <span>🔒 Private</span>}
          </div>
        </div>

        {/* Import Info */}
        <div className="mb-8 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-sm text-blue-200">
            This will create a new project that you can deploy and manage
            infrastructure for.
          </p>
        </div>

        {/* Environment Variables Section */}
        <div className="mb-8">
          <button
            onClick={() => setShowEnvVars(!showEnvVars)}
            className="w-full flex items-center justify-between p-4 bg-[#0a0a0a] rounded-lg border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-gray-400" />
              <div className="text-left">
                <h3 className="text-white font-medium">
                  Environment Variables
                </h3>
                <p className="text-sm text-gray-400">
                  {envVars.length > 0
                    ? `${envVars.length} variable${
                        envVars.length !== 1 ? "s" : ""
                      } configured`
                    : "Optional - Add later if needed"}
                </p>
              </div>
            </div>
            <ChevronDownIcon
              className={`w-5 h-5 text-gray-400 transition-transform ${
                showEnvVars ? "rotate-180" : ""
              }`}
            />
          </button>

          {showEnvVars && (
            <div className="mt-4 p-6 bg-[#0a0a0a] rounded-lg border border-[#333333]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  Configure environment variables for your application
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
                    Paste
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
                            placeholder="value"
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

              <button
                onClick={addEnvVar}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg text-sm transition-colors border border-[#333333]"
              >
                <Plus size={16} />
                Add Variable
              </button>
            </div>
          )}
        </div>

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={isImporting}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${
            isImporting
              ? "bg-gray-800 text-gray-400 cursor-not-allowed"
              : "bg-white text-black hover:bg-gray-100"
          }`}
        >
          {isImporting ? "Importing..." : "Import Repository"}
        </button>
      </div>
    </div>
  );
}
