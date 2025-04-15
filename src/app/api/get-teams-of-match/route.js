import { NextResponse } from "next/server";
import _ from 'lodash';

export const revalidate = 60; // caches for 60 seconds

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const matchNumber = searchParams.get("match");
  
  // Validate match number
  if (_.isNumber(+matchNumber) === false) {
    return NextResponse.json(
      { message: "Invalid match number" },
      { status: 400 }
    );
  }
  
  try {
    const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/2025cmptx/matches/simple`,       {
        headers: {
          "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { message: "Failed to fetch match data" },
        { status: response.status }
      );
    }

    const matches = await response.json();
    console.log("Fetched Matches:", matches);
    // Filter for qualification matches and the specific match number
    const matchArr = matches.filter(match => 
      match.comp_level === "qm" && // qm = qualification match
      match.match_number === parseInt(matchNumber)
    );

    if (matchArr.length === 1) {
      const match = matchArr[0];
      // Make sure we have alliances data before trying to access it
      if (match.alliances && match.alliances.blue && match.alliances.red) {
        return NextResponse.json({
          // Blue alliance lists teams with "frc" prefix, so we remove it
          team1: parseInt(match.alliances.blue.team_keys[0].replace('frc', '')),
          team2: parseInt(match.alliances.blue.team_keys[1].replace('frc', '')),
          team3: parseInt(match.alliances.blue.team_keys[2].replace('frc', '')),
          team4: parseInt(match.alliances.red.team_keys[0].replace('frc', '')),
          team5: parseInt(match.alliances.red.team_keys[1].replace('frc', '')),
          team6: parseInt(match.alliances.red.team_keys[2].replace('frc', '')),
        }, { status: 200 });
      } else {
        return NextResponse.json(
          { message: "Match found but alliance data is incomplete" },
          { status: 200 }
        );
      }
    } else {
      return NextResponse.json(
        { message: "Failed to find match" },
        { status: 200 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error", error: error.message },
      { status: 500 }
    );
  }
}