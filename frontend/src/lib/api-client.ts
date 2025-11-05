/**
 * API Client Helper - Gets Clerk Supabase token for all API calls
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || "/api/v1";

/**
 * Get Clerk Supabase JWT token for authentication
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // Client-side only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk;
  
  // Wait for Clerk to load and have a session (simpler check)
  for (let i = 0; i < 50; i++) {
    if (clerk?.session) {
      try {
        // Try supabase template first, fallback to default
        let token;
        try {
          token = await clerk.session.getToken({ template: "supabase" });
        } catch {
          // Fallback to default session token if template doesn't exist
          token = await clerk.session.getToken();
        }
        return token;
      } catch (error) {
        console.error("Failed to get Clerk token:", error);
        return null;
      }
    }
    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.warn("Clerk session not available after waiting");
  return null;
}

/**
 * Authenticated API call helper
 */
export async function apiCall(endpoint: string, options?: RequestInit) {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${API_PREFIX}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });
}
