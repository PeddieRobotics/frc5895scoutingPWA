import _ from 'lodash';
import { sql } from "@vercel/postgres";
import { NextResponse } from 'next/server';

export async function POST(request) {
  const res = await request.json();
  const { id, password } = res;

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({error: "Invalid password"}, {status: 401});
  }
  if (!_.isInteger(id)) {
    return NextResponse.json({error: "Invalid id"}, {status: 400});
  }

  await sql`DELETE FROM mrcmp2025 WHERE id = ${id};`;

  return NextResponse.json({ message: "Row deleted successfully" }, {status: 200});
}
