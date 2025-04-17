import { NextResponse } from "next/server";
import { validateAuthToken } from "../../../../lib/auth";

// Set cache control headers to prevent caching
const headers = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export async function GET(request) {
  console.log("AUTH CHECK: Received authentication check request");
  
  // Check if this is a request that requires authentication
  const requireAuth = request.headers.get('X-Require-Auth') === 'true';
  const sourcePage = request.headers.get('X-Source-Page') || '';
  
  console.log(`AUTH CHECK: Request details - requireAuth: ${requireAuth}, sourcePage: ${sourcePage}`);
  
  // Validate the authentication token
  const { isValid, teamName, error } = await validateAuthToken(request);
  
  console.log(`AUTH CHECK: Validation result - isValid: ${isValid}, teamName: ${teamName || 'none'}`);
  
  if (!isValid) {
    console.log(`AUTH CHECK: Authentication failed - ${error || 'No error details'}`);
    return NextResponse.json({ 
      authenticated: false,
      error: error || "Authentication required",
    }, { 
      status: 401,
      headers
    });
  }
  
  console.log(`AUTH CHECK: Authentication successful for team: ${teamName}`);
  
  // Parse team name to get team number
  let userTeam = teamName;
  try {
    if (teamName) {
      const teamNumber = parseInt(teamName);
      if (!isNaN(teamNumber)) {
        userTeam = teamNumber;
      }
    }
  } catch (error) {
    console.error("Error parsing team name:", error);
  }
  
  return NextResponse.json({ 
    authenticated: true,
    userTeam
  }, { 
    status: 200,
    headers
  });
} 