import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getActiveGame } from "../../../lib/game-config";

export const revalidate = 0; // Disable cache to ensure fresh data

export async function GET(request) {
    console.log("GET-DATA: Request received");
    
    // Check if the request is coming from the picklist page
    const referer = request.headers.get('referer') || '';
    const sourcePage = request.headers.get('X-Source-Page') || '';
    const isFromPicklist = referer.includes('/picklist') || sourcePage === 'picklist';
    
    console.log(`GET-DATA: Request sources - referer: ${referer}, sourcePage: ${sourcePage}, isFromPicklist: ${isFromPicklist}`);
    
    // Try to validate the authentication token regardless of source
    const { isValid, teamName, error } = await validateAuthToken(request);
    
    console.log(`GET-DATA: Auth validation result - isValid: ${isValid}, teamName: ${teamName || 'none'}`);
    
    // CRITICAL FIX: Require valid authentication for ALL requests including picklist
    if (!isValid) {
        console.log(`GET-DATA: Authentication required for request, isFromPicklist=${isFromPicklist}`);
        return NextResponse.json({
            rows: [],
            error: error || "Authentication required",
        }, {
            status: 401,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    }

    // Get active game for dynamic table name
    let activeGame;
    try {
        activeGame = await getActiveGame();
    } catch (e) {
        console.error("[get-data] Error getting active game:", e);
    }

    if (!activeGame || !activeGame.table_name) {
        return NextResponse.json({
            rows: [],
            error: "No active game configured. Please go to /admin/games to create and activate a game."
        }, { status: 400 });
    }

    const tableName = activeGame.table_name;

    // Special handling for picklist requests - now requires auth
    if (isFromPicklist) {
        console.log("GET-DATA: Processing authenticated picklist request");

        const client = await pool.connect();
        try {
            // Use a simplified query for the scatter plot
            const data = await client.query(`SELECT * FROM ${tableName} LIMIT 1000`);
            
            console.log(`GET-DATA: Picklist query successful, returning ${data.rows.length} rows`);
            
            // Parse team name to get team number
            let userTeam = teamName;
            try {
                const teamNumber = parseInt(teamName);
                if (!isNaN(teamNumber)) {
                    userTeam = teamNumber;
                }
            } catch (error) {
                console.error("Error parsing team name:", error);
            }
            
            const responseData = {
                rows: data.rows,
                userTeam: userTeam,
                adminMode: false
            };
            
            console.log(`GET-DATA: Including authenticated user team in response: ${userTeam}`);
            
            return NextResponse.json(responseData, { 
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        } catch (error) {
            console.error("GET-DATA: Error in picklist SQL query:", error);
            return NextResponse.json({
                rows: [],
                error: "Database error: " + error.message
            }, {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        } finally {
            client.release();
        }
    }

    // Standard data request processing for authenticated users
    const url = new URL(request.url);
    const allData = url.searchParams.get('all') === 'true';
    const adminPassword = request.headers.get('Admin-Password');
    const isAdmin = adminPassword === process.env.ADMIN_PASSWORD;

    console.log(`GET-DATA: Authenticated request with allData=${allData}, isAdmin=${isAdmin}`);

    // Parse team name to get team number
    let userTeam = null;
    try {
        if (teamName) {
            const teamNumber = parseInt(teamName);
            if (!isNaN(teamNumber)) {
                userTeam = teamNumber;
                console.log(`GET-DATA: Identified userTeam: ${userTeam}`);
            } else {
                userTeam = teamName;
                console.log(`GET-DATA: Identified userTeam (non-numeric): ${userTeam}`);
            }
        }
    } catch (error) {
        console.error("GET-DATA: Error parsing team name:", error);
    }

    const client = await pool.connect();
    try {
        // If all data was requested and admin password was provided, fetch everything
        if (allData && isAdmin) {
            console.log("GET-DATA: Admin access granted - fetching all data");
            const data = await client.query(`SELECT * FROM ${tableName}`);
            console.log(`GET-DATA: Returning all ${data.rows.length} rows as admin`);
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
            console.log(`GET-DATA: Checking if team ${userTeam} exists in the database`);
            const teamCheck = await client.query(`SELECT DISTINCT scoutteam FROM ${tableName} WHERE scoutteam = $1`, [userTeam]);

            if (teamCheck.rows.length === 0) {
                console.log(`GET-DATA: Team ${userTeam} not found in database`);
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

            console.log(`GET-DATA: Filtering data for team ${userTeam}`);
            const data = await client.query(`SELECT * FROM ${tableName} WHERE scoutteam = $1`, [userTeam]);
            console.log(`GET-DATA: Found ${data.rows.length} rows for team ${userTeam}`);
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
            console.log("GET-DATA: No team identified, returning empty dataset");
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
    } finally {
        client.release();
    }
}