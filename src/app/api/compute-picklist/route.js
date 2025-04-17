import { NextResponse } from "next/server";
import { sql } from '@vercel/postgres';
import { tidy, mutate, arrange, desc, mean, select, summarizeAll, max, groupBy } from '@tidyjs/tidy';
import { calcAuto, calcTele, calcEnd, calcEPA } from "@/util/calculations";
import { validateAuthToken } from "../../../lib/auth";

export async function POST(request) {
  // First validate the auth token
  const { isValid, teamName: authTeamName, error } = await validateAuthToken(request);
  
  if (!isValid) {
    return NextResponse.json({ 
      message: error || "Authentication required"
    }, { 
      status: 401,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }

  const requestBody = await request.json(); // Weight inputs

  let data = await sql`SELECT * FROM cmptx2025;`;
  let rows = data.rows;
  console.log(rows)

  // Average numerical fields and handle exceptions
  function averageField(index) {
    if (['breakdown', 'leave', 'noshow'].includes(index)) return arr => arr.some(row => row[index] === true);
    if (['scoutname', 'generalcomments', 'breakdowncomments', 'defensecomments'].includes(index)) return arr => arr.map(row => row[index]).join(', ');
    const validValues = arr => arr.map(row => row[index]).filter(val => val != null && !isNaN(val));
    return arr => validValues(arr).length > 0 
      ? validValues(arr).reduce((sum, v) => sum + v, 0) / validValues(arr).length 
      : 0;    
  }

  let teamTable = tidy(rows, groupBy(['team', 'match'], [summarizeAll(averageField)]));
  teamTable = teamTable.filter(dr => !dr.noshow);

  // Before grouping by team, save the match data to count breakdowns
  let teamMatchData = teamTable;

  // Continue with existing grouping by team
  teamTable = tidy(teamTable, groupBy(['team'], [summarizeAll(averageField)]));

  const calcConsistency = (dr) => {
    // Calculate success rate for auto and tele piece placement
    const autoSuccess = (dr.autol1success || 0) + (dr.autol2success || 0) + (dr.autol3success || 0) + (dr.autol4success || 0);
    const autoAttempts = autoSuccess + (dr.autol1fail || 0) + (dr.autol2fail || 0) + (dr.autol3fail || 0) + (dr.autol4fail || 0);

    const teleSuccess = (dr.telel1success || 0) + (dr.telel2success || 0) + (dr.telel3success || 0) + (dr.telel4success || 0);
    const teleAttempts = teleSuccess + (dr.telel1fail || 0) + (dr.telel2fail || 0) + (dr.telel3fail || 0) + (dr.telel4fail || 0);

    const successRate = (autoAttempts + teleAttempts) > 0 
        ? ((autoSuccess + teleSuccess) / (autoAttempts + teleAttempts)) * 100 
        : 0;

    // Endgame success (shallow or deep dock)
    const endgameSuccess = (dr.endlocation === 2 || dr.endlocation === 3) ? 1 : 0;

    // No-show penalty
    const noShowPenalty = dr.noshow ? 0 : 1;

    // Breakdown penalty based on comments: 20% reduction if breakdown comments exist
    const breakdownPenalty = dr.breakdowncomments && dr.breakdowncomments.trim() !== "" ? 0.8 : 1;

    // Calculate average of success metrics
    const metrics = [successRate, endgameSuccess * 100, noShowPenalty * 100];
    const validMetrics = metrics.filter(val => val >= 0);

    // Calculate final consistency with breakdown penalty
    const baseConsistency = validMetrics.length > 0
        ? validMetrics.reduce((sum, value) => sum + value, 0) / validMetrics.length
        : 0;

    return baseConsistency * breakdownPenalty;
};



  teamTable = tidy(teamTable, mutate({
    auto: d => calcAuto({
      autol1success: d.autol1success || 0,
      autol2success: d.autol2success || 0,
      autol3success: d.autol3success || 0,
      autol4success: d.autol4success || 0,
      autoprocessorsuccess: d.autoprocessorsuccess || 0,
      autonetsuccess: d.autonetsuccess || 0,
      leave: d.leave || false,
    }),
    tele: d => calcTele({
      telel1success: d.telel1success || 0,
      telel2success: d.telel2success || 0,
      telel3success: d.telel3success || 0,
      telel4success: d.telel4success || 0,
      teleprocessorsuccess: d.teleprocessorsuccess || 0,
      telenetsuccess: d.telenetsuccess || 0,
      hpsuccess: d.hpsuccess || 0
    }),    
    end: d => calcEnd({
      endlocation: d.endlocation || 0
    }),
    epa: d => calcEPA({
      autol1success: d.autol1success || 0,
      autol2success: d.autol2success || 0,
      autol3success: d.autol3success || 0,
      autol4success: d.autol4success || 0,
      autoprocessorsuccess: d.autoprocessorsuccess || 0,
      autonetsuccess: d.autonetsuccess || 0,
      leave: d.leave || false,
      telel1success: d.telel1success || 0,
      telel2success: d.telel2success || 0,
      telel3success: d.telel3success || 0,
      telel4success: d.telel4success || 0,
      teleprocessorsuccess: d.teleprocessorsuccess || 0,
      telenetsuccess: d.telenetsuccess || 0,
      hpsuccess: d.hpsuccess || 0,
      endlocation: d.endlocation || 0
    }),    
    cage: d => {
      const roundedEndLocation = Math.round(d.endlocation ?? 0);
      if (roundedEndLocation === 2) return 6;  // Shallow Cage
      if (roundedEndLocation === 3) return 12; // Deep Cage
      return 0;  // No cage success or failed attempt
  },

    // Calculate average coral scored
    avgCoral: d => {
      const autoCoralScored = (d.autol1success || 0) + (d.autol2success || 0) + (d.autol3success || 0) + (d.autol4success || 0);
      const teleCoralScored = (d.telel1success || 0) + (d.telel2success || 0) + (d.telel3success || 0) + (d.telel4success || 0);
      return autoCoralScored + teleCoralScored;
    },
    
    // Calculate average net algae scored
    avgNet: d => {
      return (d.autonetsuccess || 0) + (d.telenetsuccess || 0);
    },
    
    // Calculate average processor algae scored
    avgProcessor: d => {
      return (d.autoprocessorsuccess || 0) + (d.teleprocessorsuccess || 0);
    },

    consistency: d => calcConsistency(d),
    coral: d => {
      const success = (d.autol1success || 0) + (d.autol2success || 0) + (d.autol3success || 0) + (d.autol4success || 0) +
                     (d.telel1success || 0) + (d.telel2success || 0) + (d.telel3success || 0) + (d.telel4success || 0);
      const fail = (d.autol1fail || 0) + (d.autol2fail || 0) + (d.autol3fail || 0) + (d.autol4fail || 0) +
                   (d.telel1fail || 0) + (d.telel2fail || 0) + (d.telel3fail || 0) + (d.telel4fail || 0);
      const totalAttempts = success + fail;
      return totalAttempts > 0 ? (success / totalAttempts) * 100 : 0;
    },
    
    algae: d => {
      const success = (d.autoprocessorsuccess || 0) + (d.teleprocessorsuccess || 0) +
                      (d.autonetsuccess || 0) + (d.telenetsuccess || 0);
      const fail = (d.autoprocessorfail || 0) + (d.teleprocessorfail || 0) +
                   (d.autonetfail || 0) + (d.telenetfail || 0);
      const totalAttempts = success + fail;
      return totalAttempts > 0 ? (success / totalAttempts) * 100 : 0;
  },
  
  
  defense: d => {
    // Get all matches for this team
    const teamMatches = teamMatchData.filter(match => match.team === d.team);
    
    // Helper function to get defense played value from a row
    const getDefensePlayed = (row) => {
      if (!row) return null;
      
      const fieldVariants = ['defenseplayed', 'defensePlayed', 'DEFENSEPLAYED', 'defense_played', 'DefensePlayed'];
      for (const field of fieldVariants) {
        if (row[field] !== undefined && row[field] !== null && row[field] > 0) {
          return row[field];
        }
      }
      return null;
    };
    
    // Filter to only team matches with valid defensePlayed values
    const validDefenseRatings = teamMatches.filter(row => {
      const defenseValue = getDefensePlayed(row);
      return defenseValue !== null;
    });
    
    // If we have valid ratings, calculate the average
    if (validDefenseRatings.length > 0) {
      // Calculate the sum of valid ratings
      const totalSum = validDefenseRatings.reduce((sum, row) => {
        const defenseValue = getDefensePlayed(row);
        return sum + defenseValue;
      }, 0);
      
      // Return the raw average without scaling
      return totalSum / validDefenseRatings.length;
    }
    
    // Fall back to the original behavior if no valid ratings but without scaling
    const defensePlayed = d.defenseplayed || 0;
    return defensePlayed > 0 ? defensePlayed : 0;
  },

  // Calculate breakdown percentage (0 to 1, where 0 is best)
  breakdown: d => {
    // Get all matches for this team
    const teamMatches = teamMatchData.filter(match => match.team === d.team);
    const totalMatches = teamMatches.length;
    
    // Count matches with breakdowns
    const breakdownMatches = teamMatches.filter(match => 
      (match.breakdown === true) || 
      (match.breakdowncomments && match.breakdowncomments.trim() !== "")
    ).length;
    
    // Calculate percentage (0 to 1)
    return totalMatches > 0 ? breakdownMatches / totalMatches : 0;
  },

  // Calculate EPA for last 3 matches
  epa3: d => {
    // Get all matches for this team
    const teamMatches = teamMatchData.filter(match => match.team === d.team);
    
    // Sort by match number (descending) and take last 3
    const latest3Matches = teamMatches.sort((a, b) => b.match - a.match).slice(0, 3);
    
    if (latest3Matches.length === 0) return 0;
    
    // Calculate EPA for each of the last 3 matches
    const epas = latest3Matches.map(match => 
      calcEPA({
        autol1success: match.autol1success || 0,
        autol2success: match.autol2success || 0,
        autol3success: match.autol3success || 0,
        autol4success: match.autol4success || 0,
        autoprocessorsuccess: match.autoprocessorsuccess || 0,
        autonetsuccess: match.autonetsuccess || 0,
        leave: match.leave || false,
        telel1success: match.telel1success || 0,
        telel2success: match.telel2success || 0,
        telel3success: match.telel3success || 0,
        telel4success: match.telel4success || 0,
        teleprocessorsuccess: match.teleprocessorsuccess || 0,
        telenetsuccess: match.telenetsuccess || 0,
        hpsuccess: match.hpsuccess || 0,
        endlocation: match.endlocation || 0
      })
    );
    
    // Return average EPA of last 3 matches
    return epas.reduce((sum, epa) => sum + epa, 0) / epas.length;
  },
}), select(['team', 'auto', 'tele', 'end', 'epa', 'epa3', 'cage', 'consistency', 'coral', 'algae', 'defense', 'breakdown', 'avgCoral', 'avgNet', 'avgProcessor']));



  
 // Fetch TBA Rankings
 async function getTBARankings() {
  try {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/2025mil/rankings`, {
      headers: {
        'X-TBA-Auth-Key': process.env.TBA_AUTH_KEY,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`TBA API Error: ${response.status}`);
      return []; // Return empty array if API fails
    }

    const data = await response.json();
    return data.rankings.map(team => ({
      teamNumber: team.team_key.replace('frc', ''),
      rank: team.rank
    }));
  } catch (error) {
    console.error('Error fetching TBA rankings:', error);
    return [];
  }
}

// Get rankings and add them to team data
try {
  const tbaRankings = await getTBARankings();
  teamTable = teamTable.map(teamData => {
    const rankedData = tbaRankings.find(rankedTeam => 
      rankedTeam.teamNumber == teamData.team
    );
    
    return {
      ...teamData,
      tbaRank: rankedData ? rankedData.rank : -1
    };
  });
} catch (error) {
  console.error('Error updating rankings:', error);
  // Continue without rankings if there's an error
}

  console.log(teamTable)

  const maxes = tidy(teamTable, summarizeAll(max))[0];

  teamTable = tidy(teamTable, mutate({
    auto: d => maxes.auto ? d.auto / maxes.auto : 0,
    tele: d => maxes.tele ? d.tele / maxes.tele : 0,
    end: d => maxes.end ? d.end / maxes.end : 0,
    realEpa: d => d.epa, // Store the real EPA value before normalization
    epa: d => maxes.epa ? d.epa / maxes.epa : 0,
    realEpa3: d => d.epa3, // Store the real Last 3 EPA value before normalization
    epa3: d => maxes.epa3 ? d.epa3 / maxes.epa3 : 0,
    cage: d => maxes.cage ? d.cage / maxes.cage : 0,
    consistency: d => maxes.consistency ? d.consistency / maxes.consistency : 0,
    coral: d => maxes.coral ? d.coral / maxes.coral : 0,
    algae: d => maxes.algae ? d.algae / maxes.algae : 0,
    realDefense: d => d.defense, // Store the raw defense value before normalization
    defense: d => maxes.defense ? d.defense / maxes.defense : 0,
    // No normalization for breakdown since lower is better
    breakdown: d => d.breakdown,
    // Store real values before normalization 
    realAvgCoral: d => d.avgCoral,
    realAvgNet: d => d.avgNet,
    realAvgProcessor: d => d.avgProcessor,
    // Normalize for scoring
    avgCoral: d => maxes.avgCoral ? d.avgCoral / maxes.avgCoral : 0,
    avgNet: d => maxes.avgNet ? d.avgNet / maxes.avgNet : 0,
    avgProcessor: d => maxes.avgProcessor ? d.avgProcessor / maxes.avgProcessor : 0,
    score: d => requestBody.reduce((sum, [key, weight]) => {
      const value = d[key] ?? 0;
      // For breakdown, we invert the value since lower is better
      if (key === 'breakdown') {
        return sum + ((1 - value) * parseFloat(weight));
      }
      return sum + (value * parseFloat(weight));
    }, 0),
      }), arrange(desc('score')));

  console.log(teamTable)


  return NextResponse.json(teamTable, { status: 200 });
}




// // Update team data with rankings
// async function updateTeamRankings(teamTable) {
//   const firstRankings = await getTBARankings;

//   return teamTable.map(teamData => {
//     let firstRanking = -1;
//     let rankedData = firstRankings.filter(rankedTeamData => 
//       rankedTeamData.teamNumber == teamData.team
//     );
    
//     if (rankedData.length == 1) {
//       firstRanking = rankedData[0].rank;
//     }
    
//     return {
//       ...teamData,
//       firstRanking,
//     };
//   });
// }

// const frcAPITeamRankings = await fetch("https://frc-api.firstinspires.org/v3.0/2025/rankings/CURIE", {
//   headers: {
//     'Content-Type': 'application/json',
//     'Authorization': 'Basic ' + process.env.FIRST_AUTH_TOKEN, // Make sure to store the API key in .env
//   }
// }).then(resp => {
//   if (resp.status !== 200) {
//     return { Rankings: [] }; // Return an empty array if the API fails
//   }
//   return resp.json();
// }).then(data => data.Rankings);
// */

// /*
// // Add FRC API Rankings to team data
// teamTable = teamTable.map(teamData => {
//   let firstRanking = -1;
//   let rankedData = frcAPITeamRankings.filter(rankedTeamData => rankedTeamData.teamNumber == teamData.team);
//   if (rankedData.length == 1) {
//     firstRanking = rankedData[0].rank;
//   }
//   return {
//     ...teamData,
//     firstRanking,
//   };
// });