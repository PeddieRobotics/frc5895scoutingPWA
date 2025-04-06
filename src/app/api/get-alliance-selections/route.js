import { NextResponse } from "next/server";

export const revalidate = 60; // Cache for 1 minute

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventCode = searchParams.get("eventCode");
  
  console.log(`Fetching alliance selections for event: ${eventCode}`);
  
  // Validate required parameters
  if (!eventCode) {
    return NextResponse.json(
      { error: "Missing required eventCode parameter" },
      { status: 400 }
    );
  }
  
  try {
    const apiUrl = `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`;
    console.log(`Requesting data from: ${apiUrl}`);
    
    // Check if the auth key exists
    if (!process.env.TBA_AUTH_KEY) {
      console.error("TBA_AUTH_KEY environment variable is not set");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }
    
    // Fetch alliance selections from The Blue Alliance API
    const response = await fetch(
      apiUrl,
      {
        headers: {
          "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY,
          "Accept": "application/json"
        }
      }
    );

    console.log(`TBA API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`TBA API Error (${response.status}):`, errorText);
      
      return NextResponse.json(
        { 
          error: `TBA API returned ${response.status}`,
          details: errorText
        },
        { status: response.status }
      );
    }

    const responseText = await response.text();
    console.log(`TBA API raw response: ${responseText.substring(0, 200)}...`);
    
    // Handle empty response
    if (!responseText || responseText.trim() === '') {
      console.error("TBA API returned empty response");
      return NextResponse.json(
        { 
          error: "Empty response from TBA API",
          message: "The event may not have alliance selections data available yet"
        },
        { status: 404 }
      );
    }
    
    try {
      const alliances = JSON.parse(responseText);
      
      // Check if alliances is an array
      if (!Array.isArray(alliances)) {
        console.error("TBA API returned non-array response:", alliances);
        return NextResponse.json(
          { 
            error: "Invalid alliance data format",
            message: "Expected an array of alliances"
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { 
          eventCode,
          alliances
        },
        { status: 200 }
      );
    } catch (parseError) {
      console.error("Error parsing TBA API response:", parseError);
      return NextResponse.json(
        { 
          error: "Failed to parse TBA API response",
          message: parseError.message,
          rawResponse: responseText.substring(0, 500) // First 500 chars for debugging
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("TBA API Request Error:", error);
    return NextResponse.json(
      { 
        error: "Error fetching alliance data",
        message: error.message
      },
      { status: 500 }
    );
  }
} 