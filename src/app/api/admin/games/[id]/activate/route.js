import { NextResponse } from 'next/server';
import { validateAuthToken } from '../../../../../../lib/auth';
import { activateGame, getGameById } from '../../../../../../lib/game-config';

export const revalidate = 0;

/**
 * POST /api/admin/games/[id]/activate
 * Set this game as the active game
 */
export async function POST(request, { params }) {
  // Validate auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return NextResponse.json(
        { message: 'Invalid game ID' },
        { status: 400 }
      );
    }

    // Verify game exists
    const game = await getGameById(gameId);
    if (!game) {
      return NextResponse.json(
        { message: 'Game not found' },
        { status: 404 }
      );
    }

    // Activate the game
    const activatedGame = await activateGame(gameId);

    return NextResponse.json({
      success: true,
      message: `Game "${activatedGame.display_name}" is now active`,
      activeGame: {
        id: activatedGame.id,
        gameName: activatedGame.game_name,
        displayName: activatedGame.display_name,
        tableName: activatedGame.table_name,
      },
    });
  } catch (error) {
    console.error('[Games API] Error activating game:', error);
    return NextResponse.json(
      { message: 'Failed to activate game', error: error.message },
      { status: 500 }
    );
  }
}
