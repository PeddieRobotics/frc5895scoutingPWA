import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { cookies } from "next/headers";

export const revalidate = 0; // Disable cache to ensure fresh data

export async function GET(request) {
    // Use cookies() properly in an async context
    const cookieStore = await cookies();
    const authCookie = cookieStore.has('auth_credentials') ? 
                       { value: cookieStore.get('auth_credentials').value } : 
                       null;
    
    const url = new URL(request.url);
    const allData = url.searchParams.get('all') === 'true';
    const adminPassword = request.headers.get('Admin-Password');
    const isAdmin = adminPassword === process.env.ADMIN_PASSWORD;
    
    console.log(`GET /api/get-data called with allData=${allData}, isAdmin=${isAdmin}`);
    console.log(`Admin password header present: ${!!adminPassword}, matches env: ${isAdmin}`);
    
    // Extract user team from cookie if available
    let userTeam = null;
    if (authCookie && authCookie.value) {
        try {
            const credentials = atob(authCookie.value);
            console.log(`Decoded credentials: ${credentials}`);
            const [team] = credentials.split(':');
            if (team && !isNaN(parseInt(team))) {
                userTeam = parseInt(team);
                console.log(`Identified userTeam: ${userTeam}`);
            }
        } catch (error) {
            console.error("Error decoding auth cookie:", error);
        }
    }
    
    // If all data was requested and admin password was provided, fetch everything
    if (allData && isAdmin) {
        console.log("Admin access granted - fetching all data");
        const data = await sql`SELECT * FROM cmptx2025;`;
        console.log(`Returning all ${data.rows.length} rows as admin`);
        return NextResponse.json({ 
            rows: data.rows, 
            userTeam,
            adminMode: true 
        }, { 
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    }
    
    // Otherwise, filter by user's team (if available)
    if (userTeam) {
        // Check if the team exists in the database
        console.log(`Checking if team ${userTeam} exists in the database`);
        const teamCheck = await sql`SELECT DISTINCT scoutteam FROM cmptx2025 WHERE scoutteam = ${userTeam};`;
        
        if (teamCheck.rows.length === 0) {
            console.log(`Team ${userTeam} not found in database`);
            return NextResponse.json({ 
                rows: [], 
                userTeam,
                error: `Team ${userTeam} has no data in the database.`,
                adminMode: false
            }, { 
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        }
        
        // Filter data by the scoutteam field
        console.log(`Filtering data for team ${userTeam}`);
        const data = await sql`SELECT * FROM cmptx2025 WHERE scoutteam = ${userTeam};`;
        console.log(`Found ${data.rows.length} rows for team ${userTeam}`);
        return NextResponse.json({ 
            rows: data.rows, 
            userTeam,
            adminMode: false 
        }, { 
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    } else {
        // If no team identified, return empty dataset instead of all data for security
        console.log("No team identified, returning empty dataset");
        return NextResponse.json({ 
            rows: [], 
            error: "No team identified. Please login with a valid team account.",
            adminMode: false
        }, { 
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    }
}