import _ from 'lodash';
import { sql } from "@vercel/postgres";
import { NextResponse } from 'next/server';
import { cookies } from "next/headers";

// Process data before saving to ensure text formatting is preserved
const processDataForSave = (data) => {
  const processedData = { ...data };
  
  // Process text fields that might contain line breaks
  const textFields = [
    'generalcomments', 'breakdowncomments', 'defensecomments'
  ];
  
  textFields.forEach(field => {
    if (typeof processedData[field] === 'string') {
      // Ensure line breaks are normalized but preserved
      processedData[field] = processedData[field].replace(/\r\n/g, '\n');
    }
  });
  
  return processedData;
};

export async function POST(request) {
  const res = await request.json();
  const { id, data, password } = res;
  const cookieStore = cookies();
  const authCookie = cookieStore.get('auth_credentials');
  
  // Extract user team from cookie if available
  let userTeam = null;
  if (authCookie && authCookie.value) {
    try {
      const credentials = atob(authCookie.value);
      const [team] = credentials.split(':');
      if (team && !isNaN(parseInt(team))) {
        userTeam = parseInt(team);
      }
    } catch (error) {
      console.error("Error decoding auth cookie:", error);
    }
  }
  
  // Validate ID
  if (!_.isInteger(id)) {
    return NextResponse.json({error: "Invalid id"}, {status: 400});
  }
  
  // Validate data
  if (!data || typeof data !== 'object') {
    return NextResponse.json({error: "Invalid data"}, {status: 400});
  }
  
  // Process data to preserve formatting
  const processedData = processDataForSave(data);
  
  // Check if user is allowed to edit this row
  const row = await sql`SELECT * FROM njbe2025 WHERE id = ${id};`;
  
  if (row.rows.length === 0) {
    return NextResponse.json({error: "Row not found"}, {status: 404});
  }
  
  const rowData = row.rows[0];
  
  // Admin can edit any row with correct password
  const isAdmin = password === process.env.ADMIN_PASSWORD;
  
  // Normal users can only edit rows from their team
  if (!isAdmin && userTeam && rowData.scoutteam !== userTeam) {
    return NextResponse.json({error: "You can only edit data from your own team"}, {status: 403});
  }
  
  // Build update query based on the provided data fields
  // Only allow updating specific fields
  const allowedFields = [
    'scoutname', 'team', 'match', 'scoutteam', 'noshow', 'leave',
    'autol1success', 'autol1fail', 'autol2success', 'autol2fail',
    'autol3success', 'autol3fail', 'autol4success', 'autol4fail',
    'autoalgaeremoved', 'autoprocessorsuccess', 'autoprocessorfail',
    'autonetsuccess', 'autonetfail', 'telel1success', 'telel1fail',
    'telel2success', 'telel2fail', 'telel3success', 'telel3fail',
    'telel4success', 'telel4fail', 'telealgaeremoved', 'teleprocessorsuccess',
    'teleprocessorfail', 'telenetsuccess', 'telenetfail', 'hpsuccess',
    'hpfail', 'endlocation', 'coralspeed', 'processorspeed', 'netspeed',
    'algaeremovalspeed', 'climbspeed', 'maneuverability', 'defenseplayed',
    'defenseevasion', 'aggression', 'cagehazard', 'coralgrndintake',
    'coralstationintake', 'lollipop', 'algaegrndintake', 'algaelowreefintake',
    'algaehighreefintake', 'generalcomments', 'breakdowncomments', 'defensecomments'
  ];
  
  const updates = [];
  const values = [];
  let paramIndex = 1;
  
  for (const field of allowedFields) {
    if (processedData[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(processedData[field]);
      paramIndex++;
    }
  }
  
  if (updates.length === 0) {
    return NextResponse.json({error: "No valid fields to update"}, {status: 400});
  }
  
  const query = `UPDATE njbe2025 SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
  values.push(id);
  
  try {
    console.log(`Updating row ${id} with fields: ${updates.join(', ')}`);
    await sql.query(query, values);
    return NextResponse.json({ message: "Row updated successfully" }, {status: 200});
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({error: "Database error"}, {status: 500});
  }
} 