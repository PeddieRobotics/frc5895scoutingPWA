import { NextResponse } from 'next/server';
import { getActiveGame, initializeGameConfigsTable } from '../../../../../lib/game-config';

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
        { status: 200 } // Return 200 so frontend can handle gracefully
      );
    }

    return NextResponse.json({
      success: true,
      gameId: activeGame.id,
      gameName: activeGame.game_name,
      displayName: activeGame.display_name,
      tableName: activeGame.table_name,
      config: activeGame.config_json,
      updatedAt: activeGame.updated_at,
    });
  } catch (error) {
    console.error('[Games API] Error getting active game:', error);
    return NextResponse.json(
      { message: 'Failed to get active game', error: error.message },
      { status: 500 }
    );
  }
}
