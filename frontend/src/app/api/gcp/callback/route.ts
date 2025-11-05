import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  
  // Use production URL for redirects
  const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || request.nextUrl.origin;

  // Handle OAuth error
  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/?gcp_error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/?gcp_error=invalid_callback", baseUrl)
    );
  }

  // Get Clerk session token
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    return NextResponse.redirect(
      new URL("/?gcp_error=not_authenticated", baseUrl)
    );
  }

  // Forward to backend with auth token
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  
  try {
    const response = await fetch(
      `${backendUrl}/api/v1/gcp/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      
      // Try to get redirect path from cookie
      const cookies = request.cookies;
      const returnPath = cookies.get('oauth_return_path')?.value;
      
      let redirectPath = "/";
      if (returnPath) {
        redirectPath = `${returnPath}?gcp_connected=true&project_id=${data.project_id}`;
      } else {
        // Fallback: redirect to home
        redirectPath = `/?gcp_connected=true&project_id=${data.project_id}`;
      }
      
      const response_redirect = NextResponse.redirect(new URL(redirectPath, baseUrl));
      // Clear the cookie
      response_redirect.cookies.delete('oauth_return_path');
      return response_redirect;
    } else {
      const errorData = await response.json();
      return NextResponse.redirect(
        new URL(`/?gcp_error=${encodeURIComponent(errorData.detail || "connection_failed")}`, baseUrl)
      );
    }
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/?gcp_error=connection_error", baseUrl)
    );
  }
}
