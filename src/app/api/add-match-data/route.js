import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import _ from "lodash";

const FIELD_DEFAULTS = {
  // Pre-Match
  scoutname: null,
  scoutteam: null,
  team: null,
  match: null,
  matchType: 2,
  noshow: false,
  
  // Auto
  leave: false,
  autol1success: null,
  autol1fail: null,
  autol2success: null,
  autol2fail: null,
  autol3success: null,
  autol3fail: null,
  autol4success: null,
  autol4fail: null,
  autoprocessorsuccess: null,
  autoprocessorfail: null,
  autoalgaeremoved: null,
  autonetsuccess: null,
  autonetfail: null,
  
  // Tele
  telel1success: null,
  telel1fail: null,
  telel2success: null,
  telel2fail: null,
  telel3success: null,
  telel3fail: null,
  telel4success: null,
  telel4fail: null,
  teleprocessorsuccess: null,
  teleprocessorfail: null,
  telealgaeremoved: null,
  telenetsuccess: null,
  telenetfail: null,
  
  // Qualitative
  coralspeed: null,
  processorspeed: null,
  netspeed: null,
  algaeremovalspeed: null,
  climbspeed: null,
  maneuverability: null,
  defenseplayed: null,
  defenseevasion: null,
  aggression: null,
  cagehazard: null,
  
  // Comments
  breakdowncomments: null,
  defensecomments: null,
  generalcomments: null,
  
  // Other
  hpsuccess: null,
  hpfail: null,
  endlocation: null,
  coralgrndintake: false,
  coralstationintake: false,
  lollipop: false,
  algaegrndintake: false,
  algaehighreefintake: false,
  algaelowreefintake: false
};

export async function POST(req) {
  try {
    let body = await req.json();
    body = { ...FIELD_DEFAULTS, ...body };
    const processedData = { ...FIELD_DEFAULTS, ...body };


    // Convert numeric fields
    const NUMERIC_FIELDS = [
      'scoutteam', 'team', 'match', 'matchType',
      'autol1success', 'autol1fail', 'autol2success', 'autol2fail',
      'autol3success', 'autol3fail', 'autol4success', 'autol4fail',
      'autoalgaeremoved', 'autoprocessorsuccess', 'autoprocessorfail',
      'autonetsuccess', 'autonetfail', 'telel1success', 'telel1fail',
      'telel2success', 'telel2fail', 'telel3success', 'telel3fail',
      'telel4success', 'telel4fail', 'telealgaeremoved',
      'teleprocessorsuccess', 'teleprocessorfail', 'telenetsuccess',
      'telenetfail', 'hpsuccess', 'hpfail', 'endlocation',
      'coralspeed', 'processorspeed', 'netspeed', 'algaeremovalspeed',
      'climbspeed', 'maneuverability', 'defenseplayed', 'defenseevasion',
      'aggression', 'cagehazard'
    ];

    NUMERIC_FIELDS.forEach(field => {
      const value = processedData[field];
      processedData[field] = value !== null ? Number(value) : null;
      
      // Convert NaN to null for database compatibility
      if (Number.isNaN(processedData[field])) {
        processedData[field] = null;
      }
    });

    if (
      !processedData.scoutname ||
      processedData.scoutteam === null ||
      processedData.team === null ||
      processedData.match === null
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }
    if (Number.isNaN(processedData.match)) {
      return NextResponse.json(
        { message: "Invalid match number" },
        { status: 400 }
      );
    }

    // Convert boolean fields
    const booleanFields = [
      'noshow', 'leave', 'coralgrndintake',
      'coralstationintake', 'lollipop', 'algaegrndintake',
      'algaehighreefintake', 'algaelowreefintake'
    ];

    booleanFields.forEach(field => {
      body[field] = Boolean(body[field]);
    });

    // Handle match number adjustment
    const matchType = parseInt(body.matchType);
    let adjustedMatch = processedData.match;
    switch (processedData.matchType) {
      case 0: adjustedMatch -= 100; break;
      case 1: adjustedMatch -= 50; break;
      case 3: adjustedMatch += 100; break;
    }

    const numericValues = NUMERIC_FIELDS.map(f => processedData[f]);
    if (numericValues.some(Number.isNaN)) {
      return NextResponse.json(
        { message: "Invalid numeric values detected" },
        { status: 400 }
      );
    }

   

    // Handle no-show case
    if (body.noshow) {
      await sql`
        INSERT INTO cmptx2025 (scoutname, scoutteam, team, match, matchtype, noshow)
        VALUES (${body.scoutname}, ${body.scoutteam}, ${body.team}, 
                ${adjustedMatch}, ${matchType}, ${body.noshow})
      `;
      return NextResponse.json({ message: "No-show recorded" });
    }

    // Insert full data
    await sql`
      INSERT INTO cmptx2025 (
        scoutname, scoutteam, team, match, matchtype, noshow, leave,
        autol1success, autol1fail, autol2success, autol2fail,
        autol3success, autol3fail, autol4success, autol4fail,
        autoalgaeremoved, autoprocessorsuccess, autoprocessorfail,
        autonetsuccess, autonetfail, telel1success, telel1fail,
        telel2success, telel2fail, telel3success, telel3fail,
        telel4success, telel4fail, telealgaeremoved,
        teleprocessorsuccess, teleprocessorfail, telenetsuccess,
        telenetfail, hpsuccess, hpfail, endlocation,
        coralspeed, processorspeed, netspeed, algaeremovalspeed,
        climbspeed, maneuverability, defenseplayed, defenseevasion,
        aggression, cagehazard, coralgrndintake, coralstationintake,
        lollipop, algaegrndintake, algaehighreefintake, algaelowreefintake,
        generalcomments, breakdowncomments, defensecomments
      ) VALUES (
        ${body.scoutname}, ${body.scoutteam}, ${body.team}, ${adjustedMatch}, ${matchType},
        ${body.noshow}, ${body.leave},
        ${body.autol1success}, ${body.autol1fail}, ${body.autol2success}, ${body.autol2fail},
        ${body.autol3success}, ${body.autol3fail}, ${body.autol4success}, ${body.autol4fail},
        ${body.autoalgaeremoved}, ${body.autoprocessorsuccess}, ${body.autoprocessorfail},
        ${body.autonetsuccess}, ${body.autonetfail}, ${body.telel1success}, ${body.telel1fail},
        ${body.telel2success}, ${body.telel2fail}, ${body.telel3success}, ${body.telel3fail},
        ${body.telel4success}, ${body.telel4fail}, ${body.telealgaeremoved},
        ${body.teleprocessorsuccess}, ${body.teleprocessorfail}, ${body.telenetsuccess},
        ${body.telenetfail}, ${body.hpsuccess}, ${body.hpfail}, ${body.endlocation},
        ${body.coralspeed}, ${body.processorspeed}, ${body.netspeed}, ${body.algaeremovalspeed},
        ${body.climbspeed}, ${body.maneuverability}, ${body.defenseplayed}, ${body.defenseevasion},
        ${body.aggression}, ${body.cagehazard}, ${body.coralgrndintake}, ${body.coralstationintake},
        ${body.lollipop}, ${body.algaegrndintake}, ${body.algaehighreefintake}, ${body.algaelowreefintake},
        ${body.generalcomments}, ${body.breakdowncomments}, ${body.defensecomments}
      )
    `;

    return NextResponse.json({ message: "Data recorded successfully" });

  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
