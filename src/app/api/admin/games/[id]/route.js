import { NextResponse } from 'next/server';
import { validateAuthToken } from '../../../../../lib/auth';
import {
  getGameById,
  updateGame,
  deleteGame,
  getGameDataCount,
  getTableColumns,
} from '../../../../../lib/game-config';
import { validateConfig } from '../../../../../lib/config-validator';

export const revalidate = 0;

/**
 * GET /api/admin/games/[id]
 * Get a specific game configuration
 */
export async function GET(request, { params }) {
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

    const game = await getGameById(gameId);

    if (!game) {
      return NextResponse.json(
        { message: 'Game not found' },
        { status: 404 }
      );
    }

    // Get additional info
    const dataCount = await getGameDataCount(game.table_name);
    const columns = await getTableColumns(game.table_name);

    return NextResponse.json({
      success: true,
      game: {
        id: game.id,
        gameName: game.game_name,
        displayName: game.display_name,
        tableName: game.table_name,
        config: game.config_json,
        isActive: game.is_active,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
        createdBy: game.created_by,
        dataCount,
        columns,
      },
    });
  } catch (error) {
    console.error('[Games API] Error getting game:', error);
    return NextResponse.json(
      { message: 'Failed to get game', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/games/[id]
 * Update a game configuration
 */
export async function PUT(request, { params }) {
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

    const body = await request.json();
    const { displayName, configJson } = body;

    // Validate configJson if provided
    if (configJson) {
      let config = configJson;
      if (typeof configJson === 'string') {
        try {
          config = JSON.parse(configJson);
        } catch (e) {
          return NextResponse.json(
            { message: 'Invalid JSON configuration', error: e.message },
            { status: 400 }
          );
        }
      }

      const validationResult = validateConfig(config);
      if (!validationResult.valid) {
        return NextResponse.json(
          {
            message: 'Configuration validation failed',
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          },
          { status: 400 }
        );
      }
    }

    // Get current game to check if config is changing
    const currentGame = await getGameById(gameId);
    if (!currentGame) {
      return NextResponse.json(
        { message: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if there's data and config is changing
    if (configJson) {
      const dataCount = await getGameDataCount(currentGame.table_name);
      if (dataCount > 0) {
        return NextResponse.json(
          {
            message: 'Cannot update configuration when data exists. This could cause data loss.',
            dataCount,
            warning: 'If you need to update the config, either delete all data first or create a new game.',
          },
          { status: 400 }
        );
      }
    }

    // Update the game
    const game = await updateGame(gameId, {
      displayName,
      configJson: configJson ? (typeof configJson === 'string' ? JSON.parse(configJson) : configJson) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Game updated successfully',
      game: {
        id: game.id,
        gameName: game.game_name,
        displayName: game.display_name,
        tableName: game.table_name,
        isActive: game.is_active,
        updatedAt: game.updated_at,
      },
    });
  } catch (error) {
    console.error('[Games API] Error updating game:', error);
    return NextResponse.json(
      { message: 'Failed to update game', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/games/[id]
 * Delete a game configuration
 */
export async function DELETE(request, { params }) {
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

    // Check for dropTable query param
    const { searchParams } = new URL(request.url);
    const dropTable = searchParams.get('dropTable') === 'true';

    // Delete the game
    const result = await deleteGame(gameId, dropTable);

    return NextResponse.json({
      success: true,
      message: `Game "${result.display_name}" deleted successfully`,
      tableDropped: result.tableDropped,
      tableName: result.table_name,
    });
  } catch (error) {
    console.error('[Games API] Error deleting game:', error);
    return NextResponse.json(
      { message: 'Failed to delete game', error: error.message },
      { status: 500 }
    );
  }
}
