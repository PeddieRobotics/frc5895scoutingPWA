import { NextResponse } from "next/server";
import { pool } from "../../../lib/auth";
import { validateAuthToken } from "../../../lib/auth";
import { getActiveGame } from "../../../lib/game-config";
import { extractFieldsFromConfig, getNumericFields, getBooleanFields } from "../../../lib/schema-generator";

// Default fields for backward compatibility with njbe2025 table
const LEGACY_FIELD_DEFAULTS = {
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
  algaelowreefintake: false,
  defense: false,
  breakdown: false
};

const LEGACY_NUMERIC_FIELDS = [
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

const LEGACY_BOOLEAN_FIELDS = [
  'noshow', 'leave', 'coralgrndintake',
  'coralstationintake', 'lollipop', 'algaegrndintake',
  'algaehighreefintake', 'algaelowreefintake', 'defense', 'breakdown'
];

export async function POST(req) {
  try {
    // Validate auth token
    const { isValid, teamName: authTeamName, error } = await validateAuthToken(req);

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

    let body = await req.json();

    // Try to get active game config
    let activeGame = null;
    try {
      activeGame = await getActiveGame();
    } catch (e) {
      console.log("[add-match-data] No active game found, using legacy table");
    }

    // If there's an active game, use dynamic insertion
    if (activeGame && activeGame.table_name) {
      return await handleDynamicInsert(body, activeGame);
    }

    // Fall back to legacy njbe2025 table
    return await handleLegacyInsert(body);

  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { message: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle dynamic insert using active game config
 */
async function handleDynamicInsert(body, activeGame) {
  const { table_name: tableName, config_json: config } = activeGame;

  // Extract fields from config
  const fields = extractFieldsFromConfig(config);
  const numericFields = getNumericFields(fields);
  const booleanFields = getBooleanFields(fields);

  // Build defaults from config
  const fieldDefaults = {};
  fields.forEach(f => {
    if (f.default !== undefined) {
      fieldDefaults[f.name] = f.default;
    } else if (f.type === 'BOOLEAN') {
      fieldDefaults[f.name] = false;
    } else if (f.type === 'INTEGER') {
      fieldDefaults[f.name] = null;
    } else {
      fieldDefaults[f.name] = null;
    }
  });

  // Merge defaults with provided data
  const processedData = { ...fieldDefaults, ...body };

  // Convert numeric fields
  numericFields.forEach(fieldName => {
    const value = processedData[fieldName];
    if (value !== null && value !== undefined && value !== '') {
      processedData[fieldName] = Number(value);
      if (Number.isNaN(processedData[fieldName])) {
        processedData[fieldName] = null;
      }
    } else {
      processedData[fieldName] = null;
    }
  });

  // Convert boolean fields
  booleanFields.forEach(fieldName => {
    processedData[fieldName] = Boolean(processedData[fieldName]);
  });

  // Validate required fields
  if (
    !processedData.scoutname ||
    processedData.team === null ||
    processedData.match === null
  ) {
    return NextResponse.json(
      { message: "Missing required fields (scoutname, team, match)" },
      { status: 400 }
    );
  }

  // Handle match number adjustment based on matchType
  const matchType = parseInt(processedData.matchtype || processedData.matchType || 2);
  let adjustedMatch = parseInt(processedData.match);
  switch (matchType) {
    case 0: adjustedMatch -= 100; break;
    case 1: adjustedMatch -= 50; break;
    case 3: adjustedMatch += 100; break;
  }
  processedData.match = adjustedMatch;
  processedData.matchtype = matchType;

  // Get column names that exist in the config (excluding 'id' and 'timestamp')
  const columnNames = fields
    .map(f => f.name)
    .filter(name => name !== 'id' && name !== 'timestamp' && processedData[name] !== undefined);

  // Build the INSERT query dynamically
  const columns = columnNames.join(', ');
  const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
  const values = columnNames.map(name => processedData[name]);

  const client = await pool.connect();
  try {
    // Handle no-show case - only insert minimal data
    if (processedData.noshow) {
      const noShowColumns = ['scoutname', 'scoutteam', 'team', 'match', 'matchtype', 'noshow'];
      const noShowPlaceholders = noShowColumns.map((_, i) => `$${i + 1}`).join(', ');
      const noShowValues = noShowColumns.map(name => processedData[name]);

      await client.query(
        `INSERT INTO ${tableName} (${noShowColumns.join(', ')}) VALUES (${noShowPlaceholders})`,
        noShowValues
      );
      return NextResponse.json({ message: "No-show recorded", table: tableName });
    }

    // Insert full data
    await client.query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
      values
    );

    return NextResponse.json({ message: "Data recorded successfully", table: tableName });
  } finally {
    client.release();
  }
}

/**
 * Handle legacy insert to njbe2025 table (backward compatibility)
 */
async function handleLegacyInsert(body) {
  // Merge defaults
  body = { ...LEGACY_FIELD_DEFAULTS, ...body };
  const processedData = { ...LEGACY_FIELD_DEFAULTS, ...body };

  // Convert numeric fields
  LEGACY_NUMERIC_FIELDS.forEach(field => {
    const value = processedData[field];
    processedData[field] = value !== null && value !== '' ? Number(value) : null;
    if (Number.isNaN(processedData[field])) {
      processedData[field] = null;
    }
  });

  // Validate required fields
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
  LEGACY_BOOLEAN_FIELDS.forEach(field => {
    body[field] = Boolean(body[field]);
  });

  // Handle match number adjustment
  const matchType = parseInt(body.matchType || 2);
  let adjustedMatch = processedData.match;
  switch (processedData.matchType) {
    case 0: adjustedMatch -= 100; break;
    case 1: adjustedMatch -= 50; break;
    case 3: adjustedMatch += 100; break;
  }

  const client = await pool.connect();
  try {
    // Handle no-show case
    if (body.noshow) {
      await client.query(`
        INSERT INTO njbe2025 (scoutname, scoutteam, team, match, matchtype, noshow)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [body.scoutname, body.scoutteam, body.team, adjustedMatch, matchType, body.noshow]);
      return NextResponse.json({ message: "No-show recorded" });
    }

    // Insert full data
    await client.query(`
      INSERT INTO njbe2025 (
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
        generalcomments, breakdowncomments, defensecomments, defense, breakdown
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41,
        $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56
      )
    `, [
      body.scoutname, body.scoutteam, body.team, adjustedMatch, matchType,
      body.noshow, body.leave,
      body.autol1success, body.autol1fail, body.autol2success, body.autol2fail,
      body.autol3success, body.autol3fail, body.autol4success, body.autol4fail,
      body.autoalgaeremoved, body.autoprocessorsuccess, body.autoprocessorfail,
      body.autonetsuccess, body.autonetfail, body.telel1success, body.telel1fail,
      body.telel2success, body.telel2fail, body.telel3success, body.telel3fail,
      body.telel4success, body.telel4fail, body.telealgaeremoved,
      body.teleprocessorsuccess, body.teleprocessorfail, body.telenetsuccess,
      body.telenetfail, body.hpsuccess, body.hpfail, body.endlocation,
      body.coralspeed, body.processorspeed, body.netspeed, body.algaeremovalspeed,
      body.climbspeed, body.maneuverability, body.defenseplayed, body.defenseevasion,
      body.aggression, body.cagehazard, body.coralgrndintake, body.coralstationintake,
      body.lollipop, body.algaegrndintake, body.algaehighreefintake, body.algaelowreefintake,
      body.generalcomments, body.breakdowncomments, body.defensecomments, body.defense, body.breakdown
    ]);

    return NextResponse.json({ message: "Data recorded successfully" });
  } finally {
    client.release();
  }
}
