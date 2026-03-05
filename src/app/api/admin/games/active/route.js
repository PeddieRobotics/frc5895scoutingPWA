import { NextResponse } from 'next/server';
import { getActiveGame, initializeGameConfigsTable } from '../../../../../lib/game-config';
import { sanitizeScoutLeadsTableName } from '../../../../../lib/schema-generator';

export const revalidate = 0;

/**
 * GET /api/admin/games/active
 * Get the currently active game's configuration
 * This endpoint does NOT require authentication as it's needed by the form
 */
export async function GET(request) {
  try {
    // Initialize table if needed (for first-time setup)
    await initializeGameConfigsTable();

    // Get the active game
    const activeGame = await getActiveGame();

    if (!activeGame) {
      return NextResponse.json(
        {
          success: false,
          message: 'No active game configured',
          activeGame: null,
        },
        {
          status: 200, // Return 200 so frontend can handle gracefully
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        gameId: activeGame.id,
        gameName: activeGame.game_name,
        displayName: activeGame.display_name,
        tableName: activeGame.table_name,
        scoutLeadsTableName: sanitizeScoutLeadsTableName(activeGame.game_name),
        config: activeGame.config_json,
        updatedAt: activeGame.updated_at,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('[Games API] Error getting active game:', error);
    return NextResponse.json(
      { message: 'Failed to get active game', error: error.message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}
