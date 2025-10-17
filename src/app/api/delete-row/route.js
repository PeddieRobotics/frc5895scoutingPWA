import _ from 'lodash';
import { sql } from "@vercel/postgres";
import { NextResponse } from 'next/server';
import { cookies } from "next/headers";

export async function POST(request) {
  const res = await request.json();
  const { id, password } = res;
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
  
  // Check if the row exists and belongs to the user's team
  const row = await sql`SELECT * FROM njbe2025 WHERE id = ${id};`;
  
  if (row.rows.length === 0) {
    return NextResponse.json({error: "Row not found"}, {status: 404});
  }
  
  const rowData = row.rows[0];
  
  // Admin can delete any row with correct password
  const isAdmin = password === process.env.ADMIN_PASSWORD;
  
  // Normal users can only delete rows from their team
  if (!isAdmin && userTeam && rowData.scoutteam !== userTeam) {
    return NextResponse.json({error: "You can only delete data from your own team"}, {status: 403});
  }

  await sql`DELETE FROM njbe2025 WHERE id = ${id};`;

  return NextResponse.json({ message: "Row deleted successfully" }, {status: 200});
}
