import { NextResponse } from "next/server";
import { pool } from '../../../lib/auth';
import _ from 'lodash';
import { tidy, mutate, mean, select, summarizeAll, groupBy, summarize, first, n, median, total, arrange, asc, slice } from '@tidyjs/tidy';
import { calcEPA, calcAuto, calcTele, calcEnd } from "../../../util/calculations.js";
import { validateAuthToken } from "../../../lib/auth";
import { getActiveGame } from "../../../lib/game-config";
import { createCalculationFunctions } from "../../../lib/calculation-engine";

export const revalidate = 0; // Disable cache to ensure fresh data

export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const team = searchParams.get('team');
  const includeRows = searchParams.get('includeRows') === 'true';

  if (!_.isNumber(+team)) {
    return NextResponse.json({ message: "ERROR: Invalid team number" }, { status: 400 });
  }

  // Get active game - required
  let activeGame = null;
  let gameConfig = null;
  let calculationFunctions = null;

  try {
    activeGame = await getActiveGame();
  } catch (e) {
    console.error("[get-team-data] Error getting active game:", e);
  }

  if (!activeGame || !activeGame.table_name) {
    return NextResponse.json({
      message: "No active game configured. Please go to /admin/games to create and activate a game.",
      error: "NO_ACTIVE_GAME"
    }, { status: 400 });
  }

  const tableName = activeGame.table_name;
  gameConfig = activeGame.config_json;
  calculationFunctions = createCalculationFunctions(gameConfig);

  // Fetch team data from database
  const client = await pool.connect();
  let rows;
  try {
    const result = await client.query(`SELECT * FROM ${tableName} WHERE team = $1`, [team]);
    rows = result.rows;
  } finally {
    client.release();
  }

  if (rows.length === 0) {
    return NextResponse.json({ message: `ERROR: No data for team ${team}` }, { status: 404 });
  }

  function byAveragingNumbers(index) {
    if (['noshow', 'leave', 'breakdown', 'defense', 'cageattempt'].includes(index)) {
      return arr => arr.some(row => row[index] === true);
    }
    if (['scoutname', 'generalcomments', 'breakdowncomments', 'defensecomments'].includes(index)) {
      return arr => arr.map(row => row[index]).filter(a => a != null).join(" - ") || null;
    }
    if (['coralspeed', 'processorspeed', 'netspeed', 'algaeremovalspeed', 'climbspeed', 'maneuverability', 'defenseplayed', 'defenseevasion', 'aggression', 'cagehazard'].includes(index)) {
      return arr => {
        let filtered = arr.filter(row => row[index] != -1 && row[index] != null).map(row => row[index]);
        return filtered.length === 0 ? -1 : mean(filtered);
      };
    }
    return mean(index);
  }

  // Use dynamic calculation functions if available, otherwise fall back to legacy
  const autoCalc = calculationFunctions?.calcAuto || calcAuto;
  const teleCalc = calculationFunctions?.calcTele || calcTele;
  const endCalc = calculationFunctions?.calcEnd || calcEnd;
  const epaCalc = calculationFunctions?.calcEPA || calcEPA;

  let teamTable = tidy(rows, mutate({
    auto: rec => autoCalc(rec),
    tele: rec => teleCalc(rec),
    end: rec => endCalc(rec),
    epa: rec => epaCalc(rec) // Ensure EPA is using the correct calculation
}));


  function rowsToArray(x, index) {
    return x.map(row => row[index]).filter(val => val != null);
  }

  function percentValue(arr, index, value) {
    return arr.filter(e => e[index] === value).length / arr.length;
  }

  // fetch team name from blue alliance api, commented our for now while testing getting from the backend
  const teamName = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/simple`, {
    headers: {
      "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY,
      "Accept": "application/json"
    },
  })
  .then(resp => {
    if (resp.status !== 200) {
      console.error(`TBA API Error: Received status ${resp.status}`);
      return null;  // Return null if the request fails
    }
    return resp.json();
  })
  .then(data => {
    if (!data || !data.nickname) { 
      console.warn(`TBA API Warning: No nickname found for team ${team}`);
      return "";  // Provide a default fallback
    }
    return data.nickname;
  });
    const matchesScouted = new Set(teamTable.map(row => row.match)).size;

    function standardDeviation(arr, key) {
      const values = arr.map(row => row[key]).filter(v => typeof v === 'number' && !isNaN(v));
    
      if (values.length === 0) return 0;
      const sum = values.reduce((acc, val) => acc + val, 0);
      const avg = sum / values.length;
      const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
    
      console.log(`📏 Manual StdDev Debug → values: [${values.join(', ')}] | Mean: ${avg} | Variance: ${variance} | StdDev: ${stdDev}`);
    
      return stdDev;
    }
    
    let returnObject = tidy(teamTable, 
      summarize({
        team: first('team'),
        name: () => teamName,
        
        // Fixed avgEpa calculation that averages by match first
        avgEpa: arr => {
          // Get unique matches and their average EPA
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.epa;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgEpa: data.sum / data.count
          }));
          
          if (matchAverages.length === 0) return 0;
          return matchAverages.reduce((sum, m) => sum + m.avgEpa, 0) / matchAverages.length;
        },
        
        // Fixed avgAuto calculation that averages by match first
        avgAuto: arr => {
          // Get unique matches and their average Auto
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.auto;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgAuto: data.sum / data.count
          }));
          
          if (matchAverages.length === 0) return 0;
          return matchAverages.reduce((sum, m) => sum + m.avgAuto, 0) / matchAverages.length;
        },
        
        // Fixed avgTele calculation that averages by match first
        avgTele: arr => {
          // Get unique matches and their average Tele
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.tele;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgTele: data.sum / data.count
          }));
          
          if (matchAverages.length === 0) return 0;
          return matchAverages.reduce((sum, m) => sum + m.avgTele, 0) / matchAverages.length;
        },
        
        // Fixed avgEnd calculation that averages by match first
        avgEnd: arr => {
          // Get unique matches and their average End
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.end;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgEnd: data.sum / data.count
          }));
          
          if (matchAverages.length === 0) return 0;
          return matchAverages.reduce((sum, m) => sum + m.avgEnd, 0) / matchAverages.length;
        },
    
        // Last 3 averages - keeping your existing functions
        last3Epa: arr => {
          // Get unique matches and their average EPA
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.epa;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgEpa: data.sum / data.count
          }));
          
          // Sort by match number (descending) and take last 3
          const latest3Matches = matchAverages.sort((a, b) => b.match - a.match).slice(0, 3);
          
          if (latest3Matches.length === 0) return 0;
          return latest3Matches.reduce((sum, m) => sum + m.avgEpa, 0) / latest3Matches.length;
        },
    
        last3Auto: arr => {
          // Get unique matches and their average Auto
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.auto;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgAuto: data.sum / data.count
          }));
          
          // Sort by match number (descending) and take last 3
          const latest3Matches = matchAverages.sort((a, b) => b.match - a.match).slice(0, 3);
          
          if (latest3Matches.length === 0) return 0;
          return latest3Matches.reduce((sum, m) => sum + m.avgAuto, 0) / latest3Matches.length;
        },
    
        last3Tele: arr => {
          // Get unique matches and their average Tele
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.tele;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgTele: data.sum / data.count
          }));
          
          // Sort by match number (descending) and take last 3
          const latest3Matches = matchAverages.sort((a, b) => b.match - a.match).slice(0, 3);
          
          if (latest3Matches.length === 0) return 0;
          return latest3Matches.reduce((sum, m) => sum + m.avgTele, 0) / latest3Matches.length;
        },
    
        last3End: arr => {
          // Get unique matches and their average End
          const matchGroups = {};
          arr.forEach(row => {
            if (!matchGroups[row.match]) {
              matchGroups[row.match] = { sum: 0, count: 0 };
            }
            matchGroups[row.match].sum += row.end;
            matchGroups[row.match].count += 1;
          });
          
          // Convert to array of match averages
          const matchAverages = Object.entries(matchGroups).map(([match, data]) => ({
            match: parseInt(match),
            avgEnd: data.sum / data.count
          }));
          
          // Sort by match number (descending) and take last 3
          const latest3Matches = matchAverages.sort((a, b) => b.match - a.match).slice(0, 3);
          
          if (latest3Matches.length === 0) return 0;
          return latest3Matches.reduce((sum, m) => sum + m.avgEnd, 0) / latest3Matches.length;
        },
        
        // Extract match and performance metrics
        epaOverTime: arr => tidy(arr, select(['epa', 'match'])),
        autoOverTime: arr => tidy(arr, select(['match', 'auto'])),
        teleOverTime: arr => tidy(arr, select(['match', 'tele'])),
      
        // Consistency calculation
        consistency: arr => {
          const uniqueMatches = new Set(arr.map(row => row.match));
          const uniqueBreakdownCount = Array.from(uniqueMatches).filter(match =>
            arr.some(row => row.match === match && row.breakdowncomments !== null)
          ).length;
          const breakdownRate = (uniqueBreakdownCount / uniqueMatches.size) * 100;
        
          const epaStdDev = standardDeviation(arr, 'epa');
          return 100 - (breakdownRate + epaStdDev);
        },
    
        lastBreakdown: arr => arr.filter(e => e.breakdowncomments !== null).reduce((a, b) => b.match, "N/A"),
        noShow: arr => percentValue(arr, 'noshow', true),
    
        breakdown: arr => {
          const uniqueMatches = new Set(arr.map(row => row.match));
          const uniqueBreakdownCount = Array.from(uniqueMatches).filter(match =>
            arr.some(row => row.match === match && row.breakdowncomments !== null)
          ).length;
          return (uniqueBreakdownCount / uniqueMatches.size) * 100;
        },
    
        defense: arr => {
          const uniqueMatches = new Set(arr.map(row => row.match));
          const uniqueDefenseCount = Array.from(uniqueMatches).filter(match =>
            arr.some(row => row.match === match && row.defensecomments !== null)
          ).length;
          return (uniqueDefenseCount / uniqueMatches.size) * 100;
        },
    
        matchesScouted: () => matchesScouted,
        scouts: arr => {
          const scoutsByMatch = {};
          arr.forEach(row => {
            if (row.scoutname && row.scoutname.trim()) {
              if (!scoutsByMatch[row.match]) {
                scoutsByMatch[row.match] = [];
              }
              if (!scoutsByMatch[row.match].includes(row.scoutname)) {
                scoutsByMatch[row.match].push(row.scoutname);
              }
            }
          });
          
          const result = Object.entries(scoutsByMatch).map(([match, scouts]) => 
            ` *Match ${match}: ${scouts.join(', ')}*`
          );
          
          return result.length > 0 ? result : [];
        },
        generalComments: arr => {
          const commentsByMatch = {};
          arr.forEach(row => {
            if (row.generalcomments && row.generalcomments.trim()) {
              if (!commentsByMatch[row.match]) {
                commentsByMatch[row.match] = [];
              }
              commentsByMatch[row.match].push(row.generalcomments);
            }
          });
          
          const result = Object.entries(commentsByMatch).map(([match, comments]) => 
            ` *Match ${match}: ${comments.join(' -- ')}*`
          );
          
          return result.length > 0 ? result : [];
        },
        
        breakdownComments: arr => {
          const commentsByMatch = {};
          arr.forEach(row => {
            if (row.breakdowncomments && row.breakdowncomments.trim()) {
              if (!commentsByMatch[row.match]) {
                commentsByMatch[row.match] = [];
              }
              commentsByMatch[row.match].push(row.breakdowncomments);
            }
          });
          
          const result = Object.entries(commentsByMatch).map(([match, comments]) => 
            ` *Match ${match}: ${comments.join(' -- ')}*`
          );
          
          return result.length > 0 ? result : [];
        },
      
    defenseComments: arr => {
      const commentsByMatch = {};
      arr.forEach(row => {
        if (row.defensecomments && row.defensecomments.trim()) {
          if (!commentsByMatch[row.match]) {
            commentsByMatch[row.match] = [];
          }
          commentsByMatch[row.match].push(row.defensecomments);
        }
      });
      
      const result = Object.entries(commentsByMatch).map(([match, comments]) => 
        ` *Match ${match}: ${comments.join(' -- ')}*`
      );
      
      return result.length > 0 ? result : [];
    },
    autoOverTime: arr => tidy(arr, select(['match', 'auto'])),
    teleOverTime: arr => tidy(arr, select(['match', 'tele'])),
    leave: arr => {
      const uniqueLeaveMatches = new Set(arr.filter(e => e.leave === true).map(e => e.match));
      return uniqueLeaveMatches.size / new Set(arr.map(e => e.match)).size || 0;
    },

    auto: arr => ({
      coral: {

      total: (() => {
        const totalSuccess = rows.reduce((sum, row) => 
            sum + (row.autol1success || 0) +
                   (row.autol2success || 0) +
                   (row.autol3success || 0) +
                   (row.autol4success || 0), 
        0);
        return totalSuccess / rows.length;
    })(),
    
        success: (() => {
          const totalSuccess = rows.reduce((sum, row) => sum + ((row.autol1success || 0) + (row.autol2success || 0) + (row.autol3success || 0) + (row.autol4success || 0)), 0);
          const totalAttempts = rows.reduce((sum, row) => sum + ((row.autol1success || 0) + (row.autol2success || 0) + (row.autol3success || 0) + (row.autol4success || 0) + (row.autol1fail || 0) + (row.autol2fail || 0) + (row.autol3fail || 0) + (row.autol4fail || 0)), 0);
          return totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;
        })(),
        avgL1: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autol1success || 0), 0) / rows.length : 0)(),
        avgL2: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autol2success || 0), 0) / rows.length : 0)(),
        avgL3: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autol3success || 0), 0) / rows.length : 0)(),
        avgL4: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autol4success || 0), 0) / rows.length : 0)(),


        successL1: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autol1success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autol1fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
    
        successL2: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autol2success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autol2fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
    
        successL3: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autol3success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autol3fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
    
        successL4: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autol4success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autol4fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),

        
      },
      algae: {
        removed: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autoalgaeremoved || 0), 0) / rows.length : 0)(),
        avgProcessor: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autoprocessorsuccess || 0), 0) / rows.length : 0)(),
        avgNet: (() => rows.length ? rows.reduce((sum, row) => sum + (row.autonetsuccess || 0), 0) / rows.length : 0)(),
      
        successProcessor: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autoprocessorsuccess || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autoprocessorfail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
      
        successNet: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.autonetsuccess || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.autonetfail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
      },
      
    }),

    tele: arr => ({
      coral: {
        total: (() => {
          const totalSuccess = rows.reduce((sum, row) => 
              sum + (row.telel1success || 0) +
                     (row.telel2success || 0) +
                     (row.telel3success || 0) +
                     (row.telel4success || 0), 
          0);
          return totalSuccess / rows.length;
      })(),
      
    
    success: (() => {
          const totalSuccess = rows.reduce((sum, row) => sum + ((row.telel1success || 0) + (row.telel2success || 0) + (row.telel3success || 0) + (row.telel4success || 0)), 0);
          const totalAttempts = rows.reduce((sum, row) => sum + ((row.telel1success || 0) + (row.telel2success || 0) + (row.telel3success || 0) + (row.telel4success || 0) + (row.telel1fail || 0) + (row.telel2fail || 0) + (row.telel3fail || 0) + (row.telel4fail || 0)), 0);
          return totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;
        })(),
        
        avgL1: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telel1success || 0), 0) / rows.length : 0)(),
        avgL2: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telel2success || 0), 0) / rows.length : 0)(),
        avgL3: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telel3success || 0), 0) / rows.length : 0)(),
        avgL4: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telel4success || 0), 0) / rows.length : 0)(),

        successL1: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.telel1success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.telel1fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),

        successL2: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.telel2success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.telel2fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),

        successL3: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.telel3success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.telel3fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),

        successL4: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.telel4success || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.telel4fail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),

        
      },
      algae: {
        removed: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telealgaeremoved || 0), 0) / rows.length : 0)(),
        avgProcessor: (() => rows.length ? rows.reduce((sum, row) => sum + (row.teleprocessorsuccess || 0), 0) / rows.length : 0)(),
        avgNet: (() => rows.length ? rows.reduce((sum, row) => sum + (row.telenetsuccess || 0), 0) / rows.length : 0)(),
      
        successProcessor: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.teleprocessorsuccess || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.teleprocessorfail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
      
        successNet: (() => {
          const successes = rows.reduce((sum, row) => sum + (row.telenetsuccess || 0), 0);
          const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.telenetfail || 0), 0);
          return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
        })(),
      },
      
      avgHp: (() => {
        const validRows = rows.filter(row => row.hpsuccess !== null);
        return validRows.length ? validRows.reduce((sum, row) => sum + row.hpsuccess, 0) / validRows.length : 0;
      })(),
      successHp: (() => {
        const successes = rows.reduce((sum, row) => sum + (row.hpsuccess || 0), 0);
        const totalAttempts = successes + rows.reduce((sum, row) => sum + (row.hpfail || 0), 0);
        return totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0;
      })(),


    }),

// This appears to be inside a function that returns something via NextResponse
  // I'm providing the fixed version of the code snippet you shared
  
  // Assuming this is inside a function where 'rows' is defined

  // The endPlacement, attemptCage, successCage functions are likely inside a map or some object construction
  // which appears to be closed with "))" and then the result is assigned to returnObject[0]
  
  // First part of your object definition with fixed endPlacement
  endPlacement: (rows) => {
    console.log("Total number of rows:", rows.length);
    
    // Group data by match number instead of matchid
    const matchGroups = {};
    rows.forEach(row => {
      const matchId = row.match; // Use match number as the identifier
      if (matchId === undefined || matchId === null) {
        console.log("Row missing match number:", row);
        return; // Skip rows without match
      }
      
      // Create a unique key combining match number and match type (if available)
      const matchKey = row.matchtype ? `${matchId}-${row.matchtype}` : `${matchId}`;
      
      if (!matchGroups[matchKey]) {
        matchGroups[matchKey] = [];
      }
      matchGroups[matchKey].push(row);
    });
    
    console.log("Match groups created:", Object.keys(matchGroups).length);
    
    // Count matches by their most common endlocation
    const endLocationCounts = {
      0: 0, // none
      1: 0, // park
      2: 0, // parkandFail
      3: 0, // shallow
      4: 0  // deep
    };
    
    // For each match, find the most common endlocation
    Object.entries(matchGroups).forEach(([matchKey, matchRows]) => {
      // Count occurrences of each endlocation value in this match
      const locationFrequency = {};
      
      matchRows.forEach(row => {
        if (!('endlocation' in row)) {
          console.log(`Row missing endlocation in match ${matchKey}:`, row);
          return; // Skip rows without endlocation
        }
        
        const endLoc = Number(row.endlocation);
        if (!isNaN(endLoc) && endLoc >= 0 && endLoc <= 4) {
          locationFrequency[endLoc] = (locationFrequency[endLoc] || 0) + 1;
        } else {
          console.log(`Invalid endlocation value in match ${matchKey}:`, row.endlocation);
        }
      });
      
      console.log(`Match ${matchKey} location frequencies:`, locationFrequency);
      
      // Find the most frequent endlocation for this match
      let mostFrequentLocation = null;
      let highestCount = 0;
      
      Object.entries(locationFrequency).forEach(([location, count]) => {
        if (count > highestCount) {
          highestCount = count;
          mostFrequentLocation = Number(location);
        }
      });
      
      console.log(`Match ${matchKey} most frequent location:`, mostFrequentLocation);
      
      // Increment the count for this endlocation if valid
      if (mostFrequentLocation !== null && mostFrequentLocation in endLocationCounts) {
        endLocationCounts[mostFrequentLocation]++;
      }
    });
    
    console.log("Final endlocation counts:", endLocationCounts);
    
    // Calculate total matches with valid endlocations
    const totalMatches = Object.values(endLocationCounts).reduce((sum, count) => sum + count, 0);
    console.log("Total matches with valid endlocations:", totalMatches);
    
    // If no matches, return zeros
    if (totalMatches === 0) {
      console.log("No valid matches found, returning zeros");
      return { none: 0, park: 0, parkandFail: 0, shallow: 0, deep: 0 };
    }
    
    // Calculate percentages
    const percentages = {
      none: (endLocationCounts[0] / totalMatches) * 100,
      park: (endLocationCounts[1] / totalMatches) * 100,
      parkandFail: (endLocationCounts[2] / totalMatches) * 100,
      shallow: (endLocationCounts[3] / totalMatches) * 100,
      deep: (endLocationCounts[4] / totalMatches) * 100
    };
    
    console.log("Final percentages:", percentages);
    return percentages;
  
  },

  attemptCage: (rows) => {
    // Group data by match (not match ID)
    const matchGroups = {};
    rows.forEach(row => {
      const match = row.match; // Use match instead of matchid
      if (!matchGroups[match]) {
        matchGroups[match] = [];
      }
      matchGroups[match].push(row);
    });
    
    // Count matches where the modal endlocation value indicates a cage attempt
    const matchesWithAttempt = Object.values(matchGroups).filter(matchRows => {
      // Find the most common endlocation for this match
      const counts = {};
      matchRows.forEach(row => {
        const endLoc = row.endlocation;
        counts[endLoc] = (counts[endLoc] || 0) + 1;
      });
      
      let mode = null;
      let maxCount = 0;
      Object.entries(counts).forEach(([value, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mode = parseInt(value);
        }
      });
      
      // Return true if the modal value indicates a cage attempt
      return [2, 3, 4].includes(mode);
    }).length;
    
    const totalMatches = Object.keys(matchGroups).length;
    return totalMatches > 0 ? (matchesWithAttempt / totalMatches) * 100 : 0;
  },
  
  successCage: (rows) => {
    // Group data by match (not match ID)
    const matchGroups = {};
    rows.forEach(row => {
      const match = row.match; // Use match instead of matchid
      if (!matchGroups[match]) {
        matchGroups[match] = [];
      }
      matchGroups[match].push(row);
    });
    
    // Process each match to find its modal endlocation
    const matchesWithModalEndlocation = Object.values(matchGroups).map(matchRows => {
      // Find the most common endlocation for this match
      const counts = {};
      matchRows.forEach(row => {
        const endLoc = row.endlocation;
        counts[endLoc] = (counts[endLoc] || 0) + 1;
      });
      
      let mode = null;
      let maxCount = 0;
      Object.entries(counts).forEach(([value, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mode = parseInt(value);
        }
      });
      
      return mode;
    });
    
    // Count matches where an attempt was made (endlocation 2, 3, or 4)
    const attemptedMatches = matchesWithModalEndlocation.filter(mode => 
      [2, 3, 4].includes(mode)
    ).length;
    
    // Count successful matches (endlocation 3 or 4, based on your criteria)
    const successfulMatches = matchesWithModalEndlocation.filter(mode => 
      [3, 4].includes(mode)
    ).length;
    
    // Calculate success rate among attempted matches only
    return attemptedMatches > 0 ? (successfulMatches / attemptedMatches) * 100 : 0;
  },
  
  qualitative: arr => [
    { name: "Coral Speed", rating: rows.length ? rows.reduce((sum, row) => sum + (row.coralspeed || 0), 0) / rows.length : 0 },
    { name: "Processor Speed", rating: rows.length ? rows.reduce((sum, row) => sum + (row.processorspeed || 0), 0) / rows.length : 0 },
    { name: "Net Speed", rating: rows.length ? rows.reduce((sum, row) => sum + (row.netspeed || 0), 0) / rows.length : 0 },
    { name: "Algae Removal Speed", rating: rows.length ? rows.reduce((sum, row) => sum + (row.algaeremovalspeed || 0), 0) / rows.length : 0 },
    { name: "Climb Speed", rating: rows.length ? rows.reduce((sum, row) => sum + (row.climbspeed || 0), 0) / rows.length : 0 },
    { name: "Maneuverability", rating: rows.length ? rows.reduce((sum, row) => sum + (row.maneuverability || 0), 0) / rows.length : 0 },
    { name: "Defense Played", rating: rows.length ? rows.reduce((sum, row) => sum + (row.defenseplayed || 0), 0) / rows.length : 0 },
    { name: "Defense Evasion", rating: rows.length ? rows.reduce((sum, row) => sum + (row.defenseevasion || 0), 0) / rows.length : 0 },
    { name: "Aggression*", rating: rows.length ? 5 - (rows.reduce((sum, row) => sum + (row.aggression || 0), 0) / rows.length) : 0 },
    { name: "Cage Hazard*", rating: rows.length ? 5 - (rows.reduce((sum, row) => sum + (row.cagehazard || 0), 0) / rows.length) : 0 },
  ],
}));  // This appears to close the object and function call that contains these properties

// The rest of your code seems fine and doesn't need modification for your current issue
returnObject[0] = {
  ...returnObject[0],
  coralGroundIntake: rows.some(row => row.coralgrndintake === true),
  coralStationIntake: rows.some(row => row.coralstationintake === true),
  algaeGroundIntake: rows.some(row => row.algaegrndintake === true),
  algaeLowReefIntake: rows.some(row => row.algaelowreefintake === true),
  algaeHighReefIntake: rows.some(row => row.algaehighreefintake === true),
  lollipop: rows.some(row => row.lollipop === true),
};


// Aggregate function definition
function aggregateByMatch(dataArray) {
  return tidy(
    dataArray,
    groupBy("match", [
      summarize({
        epa: mean("epa"),
        auto: mean("auto"),
        tele: mean("tele"),
      }),
    ]),
    mutate({
      epa: d => Math.round(d.epa * 100) / 100,
      auto: d => Math.round(d.auto * 100) / 100,
      tele: d => Math.round(d.tele * 100) / 100,
    }),
    arrange([asc("match")])
  );
}

// Apply the aggregation and sorting
let processedEPAOverTime = aggregateByMatch(returnObject[0].epaOverTime);
let processedAutoOverTime = aggregateByMatch(returnObject[0].autoOverTime);
let processedTeleOverTime = aggregateByMatch(returnObject[0].teleOverTime);

returnObject[0].epaOverTime = processedEPAOverTime;
returnObject[0].autoOverTime = processedAutoOverTime;
returnObject[0].teleOverTime = processedTeleOverTime;

// Add debugging logs
console.log("Backend End Placement:", returnObject[0].endPlacement);

// Include the raw rows if requested
if (includeRows) {
  returnObject[0].rows = rows;
}

// Add game config metadata
returnObject[0].tableName = tableName;
if (gameConfig) {
  returnObject[0].gameName = gameConfig.gameName;
  returnObject[0].displayName = gameConfig.displayName;
}

// Just one return statement
return NextResponse.json(returnObject[0], { status: 200 });

}
